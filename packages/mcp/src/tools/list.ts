// list_scripts (§3, tool 1): the scripts under the writer's folders, each with its kind, title,
// scene count, date, size, and the drafts and cuts beside it. A title is the title page's Title
// and nothing else from it, so Contact never shows. At most 100 MB is read per call; past that a
// file is listed with no title or scene count, and an HTML or EPUB export is listed without being
// read at all.
import { readdir } from 'node:fs/promises';
import { MAX_SCRIPT_BYTES } from '@drafter/archive';
import { Refused, readCapped, readScriptFile, strictText } from '@drafter/archive/node';
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
import { answerBudget, itemCost } from '../paging';
import { Refusal, resolvePath } from '../paths';
import { type Found, WALK_LIMITS, walk } from '../walk';
import type { ToolContext, ToolDef } from './index';
import { cursor, format, path } from './schemas';

/** The most bytes one call reads to find titles and scene counts (and count cuts). */
export const LIST_READ_LIMIT = 100 * 1024 * 1024;

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
  scenes: z.number().int().min(0).nullable(),
  modified: z.string(),
  bytes: z.number().int().min(0),
  drafts: z.number().int().min(0).nullable(),
  cuts: z.number().int().min(0).nullable(),
});
type Listed = z.infer<typeof listed>;

const output = z.object({
  files: z.array(listed),
  truncated: z.boolean(),
  next: z.string().optional(),
  /** The cursor was for a listing that has changed (or wasn't one), so this starts again. */
  restarted: z.literal(true).optional(),
});
type Output = z.infer<typeof output>;

/** What reading a file says about it. */
interface Summary {
  kind: 'screenplay' | 'stage play' | 'markdown';
  title: string | null;
  scenes: number;
}

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

function scriptSummary(text: string): Summary {
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
    kind: template.id === STAGE_PLAY ? 'stage play' : 'screenplay',
    title: titleOf(doc),
    scenes,
  };
}

function markdownSummary(text: string): Summary {
  return {
    kind: 'markdown',
    title: markdownTitle(text) ?? null,
    scenes: markdownAnchors(text).length,
  };
}

const tooBig = () => new Refused('it is too big');

/** Reads and summarises a file the walk checked: opened without following a link, and only if it is still that file. */
async function summarize(file: Found): Promise<Summary> {
  const options = { noFollow: true, expect: { dev: file.dev, ino: file.ino } };
  if (file.format === 'fountain' || file.format === 'text' || file.format === 'markdown') {
    const text = strictText(await readCapped(file.real, MAX_SCRIPT_BYTES, tooBig, options));
    return file.format === 'markdown' ? markdownSummary(text) : scriptSummary(text);
  }
  const read = await readScriptFile(file.real, 'it isn’t a script', options);
  return read.markdown ? markdownSummary(read.text) : scriptSummary(read.text);
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
async function filesOf(
  args: Input,
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
  const spend = (bytes: number) => {
    if (read + bytes > LIST_READ_LIMIT) return false;
    read += bytes;
    return true;
  };

  // The answer's own characters, with the longest cursor it could carry.
  const budget = answerBudget();
  const overhead = JSON.stringify({
    about: ABOUT,
    files: [],
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
    truncated,
    ...(i < found.length ? { next: makeCursor(ctx.data.key, { ...now, at: i }) } : {}),
    ...(restarted ? { restarted: true as const } : {}),
  };
}

async function describe(
  file: Found,
  ctx: ToolContext,
  spend: (bytes: number) => boolean,
): Promise<Listed> {
  const modified = new Date(file.mtimeMs).toISOString();
  // An export is listed, never read: its drafts and cuts belong to the script it was made from.
  if (file.format === 'html' || file.format === 'epub')
    return {
      path: file.shown,
      format: file.format,
      kind: null,
      title: null,
      scenes: null,
      modified,
      bytes: file.size,
      drafts: null,
      cuts: null,
    };

  let summary = summaries.get(file.real, file.size, file.mtimeMs);
  if (!summary && spend(file.size)) {
    try {
      summary = await summarize(file);
      summaries.set(file.real, file.size, file.mtimeMs, summary);
    } catch (error) {
      // A file that can't be read is still listed; a path problem is a refusal for the call.
      if (error instanceof Refusal) throw error;
    }
  }
  const workKind = file.format === 'markdown' ? 'markdown' : 'fountain';
  return {
    path: file.shown,
    format: file.format,
    kind: summary?.kind ?? (file.format === 'markdown' ? 'markdown' : null),
    title: summary?.title ?? null,
    scenes: summary?.scenes ?? null,
    modified,
    bytes: file.size,
    drafts: await countDrafts(file, workKind, ctx),
    cuts: await countCuts(file, workKind, ctx, spend),
  };
}

export const listScripts: ToolDef<Input, Output> = {
  name: 'list_scripts',
  title: 'List scripts',
  description:
    'Lists the scripts, plays, and documents in the writer’s folders (or one folder, given as a path that starts with a folder’s name): each file’s path, kind, title, scene count, date, size, and how many drafts and cuts Drafter keeps beside it. Pass `next` back as `cursor` for the rest.',
  input,
  output,
  run,
};
