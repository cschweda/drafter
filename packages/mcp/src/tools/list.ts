// list_scripts (§3, tool 1): the scripts under the writer's folders, each with its kind, title,
// scene count, date, size, and the drafts and cuts beside it, and a manifest: what Drafter found
// inside each file (judged by its bytes as Open judges them, whatever its name says), whether
// that is what its name says, and Open's words for a file it won't read. A refused file stays in
// the list. A title is the title page's Title and nothing else from it, so Contact never shows.
// At most 100 MB is read per call; past that a file is listed as not read.
import { readdir } from 'node:fs/promises';
import { Refused, readCapped } from '@drafter/archive/node';
import { markdownAnchors } from '@drafter/compare';
import { type Doc, parse } from '@drafter/fountain';
import { besideNames, MAX_BESIDE_BYTES, readCutsBytes } from '@drafter/history';
import { markdownTitle } from '@drafter/markdown';
import { bodyEnd, startsScene } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import * as z from 'zod/v4';
import { LoadCache } from '../cache';
import { argsHash, type CursorAt, makeCursor, readCursor } from '../cursor';
import { ABOUT } from '../envelope';
import {
  CANT_OPEN,
  type Content,
  cantRead,
  NAMED,
  NotOpened,
  NotRead,
  readInside,
} from '../inside';
import { answerBudget, clipMessage, clipText, itemCost } from '../paging';
import { resolvePath } from '../paths';
import { type Found, WALK_LIMITS, walk } from '../walk';
import type { ToolContext, ToolDef } from './index';
import { cursor, format, path } from './schemas';
import { TEXT_LIMITS } from './script';

/** The most bytes one call reads to find titles and scene counts (and count cuts). */
export const LIST_READ_LIMIT = 100 * 1024 * 1024;

let readLimitForTests: number | undefined;

/** For tests only: a smaller read budget per call; undefined puts it back. */
export function __setListReadLimitForTests(limit: number | undefined): void {
  readLimitForTests = limit;
}

/** What a listing says was inside a file: what was found, a file it won't read, or one not read. */
const CONTENTS = [
  'fountain',
  'markdown',
  'final draft',
  'highland',
  'fade in',
  'html export',
  'epub export',
  'not a script',
  'not read',
] as const;
type ListedContent = (typeof CONTENTS)[number];

const input = z.strictObject({
  folder: path.optional(),
  recursive: z.boolean().optional(),
  cursor: cursor.optional(),
});
type Input = z.infer<typeof input>;

const listed = z.object({
  path: z.string(),
  format,
  kind: z.enum(['screenplay', 'stage play', 'markdown']).nullable(),
  title: z.string().nullable(),
  /** The title was longer than TEXT_LIMITS.heading, and is its start. */
  title_cut: z.literal(true).optional(),
  scenes: z.number().int().min(0).nullable(),
  modified: z.string(),
  bytes: z.number().int().min(0),
  drafts: z.number().int().min(0).nullable(),
  cuts: z.number().int().min(0).nullable(),
  /** What Drafter found inside, whatever the name says; `not read` past the call's read budget. */
  content: z.enum(CONTENTS),
  /** Whether that is what the file's name says; null when it wasn't read. */
  matches_name: z.boolean().nullable(),
  /** Open's words, when Drafter won't read the file (clipped to MAX_REFUSAL_CHARS). */
  refused: z.string().nullable(),
});
type Listed = z.infer<typeof listed>;

const manifest = z.object({
  files: z.number().int().min(0),
  by_content: z.record(z.string(), z.number().int().min(0)),
  mismatched: z.number().int().min(0),
  refused: z.number().int().min(0),
});
type Manifest = z.infer<typeof manifest>;

const output = z.object({
  files: z.array(listed),
  /** What the files on this page hold, counted. */
  manifest,
  truncated: z.boolean(),
  next: z.string().optional(),
  /** The cursor was for a listing that has changed (or wasn't one), so this starts again. */
  restarted: z.literal(true).optional(),
});
type Output = z.infer<typeof output>;

/** What reading a file says about it: what it holds, or why Drafter won't read it. */
type Summary =
  | {
      content: Content;
      kind: 'screenplay' | 'stage play' | 'markdown';
      title: string | null;
      scenes: number;
    }
  | { content: 'not a script' | 'not read'; refused: string };

/** Summaries by file, as they were: small, so as many as a listing holds are kept. */
const summaries = new LoadCache<Summary>(WALK_LIMITS.files);

const STAGE_PLAY = 'stage-play-standard';
const SCREENPLAY = builtins['us-screenplay'] as Template;

/** The title page's Title, its lines' text joined by spaces, or null. */
function titleOf(doc: Doc): string | null {
  const field = doc.titlePage?.fields.find((f) => f.key.trim().toLowerCase() === 'title');
  if (!field) return null;
  const text = field.runs
    .map((runs) =>
      runs
        .map((run) => run.text)
        .join('')
        .trim(),
    )
    .filter((line) => line !== '')
    .join(' ');
  return text === '' ? null : text;
}

function scriptSummary(content: Content, text: string): Summary {
  const doc = parse(text);
  const named = doc.meta?.template;
  // As the CLI: the file's own template when it is built in, else the US screenplay.
  const template =
    typeof named === 'string' && Object.hasOwn(builtins, named)
      ? (builtins[named] as Template)
      : SCREENPLAY;
  const end = bodyEnd(doc);
  let scenes = 0;
  for (let i = 0; i < end; i++)
    if (startsScene(template, doc.blocks[i] as Doc['blocks'][number])) scenes++;
  return {
    content,
    kind: template.id === STAGE_PLAY ? 'stage play' : 'screenplay',
    title: titleOf(doc),
    scenes,
  };
}

function markdownSummary(content: Content, text: string): Summary {
  return {
    content,
    kind: 'markdown',
    title: markdownTitle(text) ?? null,
    scenes: markdownAnchors(text).length,
  };
}

const tooBig = () => new Refused('it is too big');

/**
 * Reads and summarises a file the walk checked (opened without following a link, and only if it
 * is still that file), judged by what is inside it as `load` judges it: a file Drafter won't read
 * is summarised with Open's words, never thrown.
 */
async function summarize(file: Found): Promise<Summary> {
  const name = file.shown.slice(file.shown.lastIndexOf('/') + 1);
  try {
    const inside = await readInside(file, name);
    return inside.markdown
      ? markdownSummary(inside.content, inside.text)
      : scriptSummary(inside.content, inside.text);
  } catch (error) {
    if (error instanceof NotRead) return { content: 'not read', refused: error.message };
    if (error instanceof NotOpened) return { content: 'not a script', refused: error.message };
    // The reader's own phrase for text Open won't read, as every tool says it.
    if (error instanceof Refused)
      return { content: 'not a script', refused: cantRead(error.message) };
    // Anything else (an importer or the export reader failing in a way it doesn't name): the file
    // is still listed, in a fixed phrase, never the error's own text.
    return { content: 'not a script', refused: CANT_OPEN };
  }
}

/** The folder a listed file is in, as shown: `Scripts/Signal Hill`. */
const parentOf = (shown: string) => shown.slice(0, shown.lastIndexOf('/'));

/** The drafts in the drafts folder beside a work, as Drafter names them; null with no folder. */
async function countDrafts(
  file: Found,
  kind: 'fountain' | 'markdown',
  ctx: ToolContext,
): Promise<number | null> {
  const names = besideNames(file.shown.slice(file.shown.lastIndexOf('/') + 1));
  if (!names) return null;
  const { roots, platform } = ctx.data;
  try {
    const folder = await resolvePath(
      `${parentOf(file.shown)}/${names.folder}`,
      roots,
      platform,
      'folder',
    );
    const ending = kind === 'fountain' ? '.fountain' : '.md';
    const entries = await readdir(folder.real, { withFileTypes: true });
    return entries.filter(
      (entry) =>
        entry.isFile() &&
        entry.name.startsWith(`${names.work} – Draft `) &&
        entry.name.endsWith(ending),
    ).length;
  } catch {
    return null;
  }
}

/** The cuts in the cuts file beside a work (only those whose IDs check out); null with no file. */
async function countCuts(
  file: Found,
  kind: 'fountain' | 'markdown',
  ctx: ToolContext,
  spend: (bytes: number) => boolean,
): Promise<number | null> {
  const names = besideNames(file.shown.slice(file.shown.lastIndexOf('/') + 1));
  if (!names) return null;
  const { roots, platform } = ctx.data;
  try {
    const cuts = await resolvePath(
      `${parentOf(file.shown)}/${names.cuts}`,
      roots,
      platform,
      'file',
    );
    if (!spend(cuts.size)) return null;
    const bytes = await readCapped(cuts.real, MAX_BESIDE_BYTES, tooBig, {
      noFollow: true,
      expect: { dev: cuts.dev, ino: cuts.ino },
    });
    const read = await readCutsBytes(bytes, kind);
    return read.problem === null ? read.entries.length : null;
  } catch {
    return null;
  }
}

/** The files under the folder asked for (or every folder), at most WALK_LIMITS.files. */
export async function filesOf(
  args: { folder?: string; recursive?: boolean },
  ctx: ToolContext,
): Promise<{ found: Found[]; truncated: boolean }> {
  const { roots, platform } = ctx.data;
  const recursive = args.recursive ?? true;
  if (args.folder !== undefined) {
    const folder = await resolvePath(args.folder, roots, platform, 'folder');
    return walk(folder, recursive, platform);
  }
  const found: Found[] = [];
  let truncated = false;
  for (const root of roots) {
    const each = await walk(root, recursive, platform);
    found.push(...each.found);
    truncated ||= each.truncated;
    if (found.length > WALK_LIMITS.files) {
      found.length = WALK_LIMITS.files;
      truncated = true;
      break;
    }
  }
  return { found, truncated };
}

async function run(args: Input, ctx: ToolContext): Promise<Output> {
  const { found, truncated } = await filesOf(args, ctx);
  // The listing as it is now: a cursor made for another listing (a file saved, added, or gone)
  // starts again.
  const now: Omit<CursorAt, 'at' | 'part'> = {
    tool: 'list_scripts',
    path: args.folder ?? '',
    mtimeMs: 0,
    size: found.length,
    args: argsHash({
      folder: args.folder ?? null,
      recursive: args.recursive ?? true,
      files: found.map((file) => [file.shown, file.size, file.mtimeMs]),
    }),
  };
  let at = 0;
  let restarted = false;
  if (args.cursor !== undefined) {
    const position = readCursor(ctx.data.key, args.cursor, now);
    if (position === 'restart' || position.at > found.length) restarted = true;
    else at = position.at;
  }

  let read = 0;
  const limit = readLimitForTests ?? LIST_READ_LIMIT;
  const spend = (bytes: number) => {
    if (read + bytes > limit) return false;
    read += bytes;
    return true;
  };

  // The answer's own characters, with the longest cursor it could carry.
  const budget = answerBudget();
  const most = Number.MAX_SAFE_INTEGER;
  const overhead = JSON.stringify({
    about: ABOUT,
    files: [],
    manifest: {
      files: most,
      by_content: Object.fromEntries(CONTENTS.map((content) => [content, most])),
      mismatched: most,
      refused: most,
    },
    truncated,
    next: makeCursor(ctx.data.key, { ...now, at: found.length }),
    restarted: true,
  }).length;
  const files: Listed[] = [];
  let used = overhead + 2;
  let i = at;
  for (; i < found.length; i++) {
    const entry = await describe(found[i] as Found, ctx, spend);
    const cost = itemCost(entry);
    if (files.length > 0 && used + cost - 1 > budget) break;
    files.push(entry);
    used += cost;
  }

  return {
    files,
    manifest: manifestOf(files),
    truncated,
    ...(i < found.length ? { next: makeCursor(ctx.data.key, { ...now, at: i }) } : {}),
    ...(restarted ? { restarted: true as const } : {}),
  };
}

/** What the files on a page hold, counted. */
function manifestOf(files: Listed[]): Manifest {
  const byContent: Record<string, number> = {};
  for (const file of files) byContent[file.content] = (byContent[file.content] ?? 0) + 1;
  return {
    files: files.length,
    by_content: byContent,
    mismatched: files.filter((file) => file.matches_name === false).length,
    refused: files.filter((file) => file.refused !== null).length,
  };
}

async function describe(
  file: Found,
  ctx: ToolContext,
  spend: (bytes: number) => boolean,
): Promise<Listed> {
  const modified = new Date(file.mtimeMs).toISOString();
  let summary = summaries.get(file.real, file.size, file.mtimeMs);
  if (!summary && spend(file.size)) {
    summary = await summarize(file);
    // A file that couldn't be read at all (gone, a link, permission) may be readable next time.
    if (summary.content !== 'not read') summaries.set(file.real, file.size, file.mtimeMs, summary);
  }
  const content: ListedContent = summary?.content ?? 'not read';
  const read = summary && 'kind' in summary ? summary : undefined;
  // A title or a refusal may be as long as the file: each is clipped, so every entry is small.
  const title = read?.title == null ? null : clipText(read.title, TEXT_LIMITS.heading);
  // An export's drafts and cuts belong to the script it was made from.
  const exported = content === 'html export' || content === 'epub export';
  const nameIsExport = file.format === 'html' || file.format === 'epub';
  const workKind = file.format === 'markdown' ? 'markdown' : 'fountain';
  const beside = !exported && !nameIsExport;
  return {
    path: file.shown,
    format: file.format,
    kind: read?.kind ?? null,
    title: title?.text ?? null,
    ...(title?.cut ? { title_cut: true as const } : {}),
    scenes: read?.scenes ?? null,
    modified,
    bytes: file.size,
    drafts: beside ? await countDrafts(file, workKind, ctx) : null,
    cuts: beside ? await countCuts(file, workKind, ctx, spend) : null,
    content,
    matches_name: content === 'not read' ? null : content === NAMED[file.format],
    refused: summary && 'refused' in summary ? clipMessage(summary.refused) : null,
  };
}

export const listScripts: ToolDef<Input, Output> = {
  name: 'list_scripts',
  title: 'List scripts',
  description:
    'Lists the scripts, plays, and documents in the writer’s folders (or one folder, given as a path that starts with a folder’s name): each file’s path, kind, title, scene count, date, size, and how many drafts and cuts Drafter keeps beside it, with a manifest: what Drafter found inside each file (`content`), whether that matches its name (`matches_name`), and why Drafter won’t read it (`refused`). Pass `next` back as `cursor` for the rest.',
  input,
  output,
  run,
};
