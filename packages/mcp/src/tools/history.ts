// Drafts and cuts (§3, tools 5–7): list_drafts, compare_drafts, and list_cuts, from the drafts
// folder and the cuts file Drafter writes beside a work (drafts and cuts design §4). Both are
// found by name under the script's own folder and checked as any path is (resolvePath), and every
// file is opened without following a link and only if it is still the file that was checked.
// What the writer's text shows goes through `visible` first, so Drafter's metadata blocks and
// the Contact never reach an answer, and notes and the boneyard only when included.
import { readdir } from 'node:fs/promises';
import { MAX_SCRIPT_BYTES } from '@drafter/archive';
import { Refused, readCapped } from '@drafter/archive/node';
import { diffRows, groupRows, LARGE_GROUP, markdownAnchors } from '@drafter/compare';
import { parse } from '@drafter/fountain';
import {
  besideNames,
  type CutEntry,
  type DraftFacts,
  draftName,
  headingKey,
  MAX_BESIDE_BYTES,
  padDraft,
  readCutsBytes,
  readDraftBytes,
  sceneAnchors,
  type WorkKind,
} from '@drafter/history';
import { paginate } from '@drafter/layout';
import { wordsIn } from '@drafter/markdown';
import { sceneIndex } from '@drafter/outline';
import * as z from 'zod/v4';
import { LoadCache } from '../cache';
import { makeCursor } from '../cursor';
import { ABOUT, type Include, type LeftOut } from '../envelope';
import { type Loaded, load, novelAnchors, templateFor } from '../load';
import { answerBudget, clipText, itemCost, partsOf } from '../paging';
import { type Checked, Missing, Refusal, resolvePath } from '../paths';
import { headingsOf, oneScene, wordsOf } from '../scenes';
import { visible, visibleMarkdown } from '../visible';
import type { ToolContext, ToolDef } from './index';
import {
  characterName,
  cursor,
  include,
  leftOut,
  path,
  restarted,
  sceneRef,
  words,
} from './schemas';
import { castKey, cursorBase, longestCursor, pageWithParts, startOf, TEXT_LIMITS } from './script';

export const NO_DRAFTS =
  'No drafts folder beside this script. If Drafter keeps your drafts in the browser, use Export in the Drafts list.';
export const NO_CUTS = 'No cuts file beside this script.';

/** The most draft files one folder is read for. */
export const MAX_DRAFTS = 999;
/** The most draft files one list_drafts page reads. */
export const DRAFTS_PAGE = 50;
/**
 * The most bytes of drafts one list_drafts page parses for its figures (a draft larger than a
 * script may be is listed without them), and the most it reads: so a page always ends well
 * inside the 10-second limit, and the cursor moves on.
 */
export const PAGE_PARSE_BYTES = MAX_SCRIPT_BYTES;
export const PAGE_READ_BYTES = 2 * MAX_BESIDE_BYTES;
/** The longest draft note shown, JSON-escaped. */
export const NOTE_LIMIT = 500;
/** A cut's text in a list is trimmed to this many characters (`id` brings it whole). */
export const CUT_TRIM = 1_500;
/** The most dates a cut lists, newest first. */
export const CUT_DATES = 50;

const tooBig = () => new Refused('it is too big (over 32 MB)');
const READ = (file: Checked) => ({ noFollow: true, expect: { dev: file.dev, ino: file.ino } });

/** The folder a shown path is in: `Scripts/Signal Hill`. */
const parentOf = (shown: string) => shown.slice(0, shown.lastIndexOf('/'));
const fileNameOf = (shown: string) => shown.slice(shown.lastIndexOf('/') + 1);
const kindOf = (loaded: Loaded): WorkKind => (loaded.kind === 'markdown' ? 'markdown' : 'fountain');
const heading = (text: string) => clipText(text, TEXT_LIMITS.heading).text;

/** What `visible` shows of a work's text: a script's through its parse, a document's metadata cut. */
function shownOf(
  text: string,
  kind: WorkKind,
  include: Include,
): { text: string; leftOut: LeftOut } {
  if (kind === 'markdown')
    return { text: visibleMarkdown(text, 0, text.length), leftOut: { notes: 0, boneyard: 0 } };
  const doc = parse(text);
  return visible(doc, 0, doc.source.length, include);
}

/** The names beside the work, as Drafter writes them; null when its name can't make them. */
const besideOf = (loaded: Loaded) => besideNames(fileNameOf(loaded.file.shown));

// ---------------------------------------------------------------------------------------------
// The drafts folder

interface DraftFile {
  name: string;
  /** The number its name gives. */
  number: number;
  /** Another computer's `(2)`, `(3)`…; 1 for the plain name. */
  copy: number;
  /** The file, checked; null when its path was refused. */
  checked: Checked | null;
}

/** `Signal Hill – 101 – Draft 03.fountain` or `… Draft 03 (2).fountain`: the number and copy. */
const DRAFT_TAIL = /^(\d{2,})(?: \((\d+)\))?$/;

/** The draft files in the work's drafts folder, by number, the plain one before its copies. */
async function draftFiles(loaded: Loaded, ctx: ToolContext): Promise<DraftFile[]> {
  const names = besideOf(loaded);
  if (!names) throw new Refusal(NO_DRAFTS);
  const { roots, platform } = ctx.data;
  let folder: Checked;
  try {
    folder = await resolvePath(
      `${parentOf(loaded.file.shown)}/${names.folder}`,
      roots,
      platform,
      'folder',
    );
  } catch (error) {
    if (error instanceof Missing) throw new Refusal(NO_DRAFTS);
    throw error;
  }
  const prefix = `${names.work} – Draft `;
  const ext = kindOf(loaded) === 'fountain' ? '.fountain' : '.md';
  let entries: string[];
  try {
    entries = await readdir(folder.real);
  } catch {
    throw new Refusal('The drafts folder beside this script can’t be read.');
  }
  const found: Array<Omit<DraftFile, 'checked'>> = [];
  for (const name of entries) {
    if (!name.startsWith(prefix) || !name.endsWith(ext)) continue;
    const tail = DRAFT_TAIL.exec(name.slice(prefix.length, name.length - ext.length));
    if (!tail) continue;
    const number = Number(tail[1]);
    if (!Number.isSafeInteger(number) || number < 1) continue;
    found.push({ name, number, copy: tail[2] === undefined ? 1 : Number(tail[2]) });
  }
  found.sort(
    (a, b) =>
      a.number - b.number || a.copy - b.copy || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  found.length = Math.min(found.length, MAX_DRAFTS);
  const files: DraftFile[] = [];
  for (const each of found) {
    let checked: Checked | null = null;
    try {
      checked = await resolvePath(`${folder.shown}/${each.name}`, roots, platform, 'file');
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
    }
    files.push({ ...each, checked });
  }
  return files;
}

/** A draft file read: its facts, text, and whether it still matches its ID; null when it can't be. */
async function readDraft(
  file: Checked,
  kind: WorkKind,
): Promise<{ facts: DraftFacts; text: string; matches: boolean } | { problem: string }> {
  try {
    const read = await readDraftBytes(
      await readCapped(file.real, MAX_BESIDE_BYTES, tooBig, READ(file)),
      kind,
    );
    if (read.facts === null) return { problem: read.problem };
    return { facts: read.facts, text: read.text, matches: read.matches };
  } catch (error) {
    if (error instanceof Refused) return { problem: error.message };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// list_drafts

const draftsInput = z.strictObject({ script: path, cursor: cursor.optional() });
type DraftsInput = z.infer<typeof draftsInput>;

const draftItem = z.object({
  draft: z.string(),
  number: z.number().int(),
  id: z.string(),
  short_id: z.string(),
  frozen: z.string(),
  note: z.string(),
  /** The note was longer than an answer holds: this is its start. */
  note_cut: z.literal(true).optional(),
  /** Printed pages (a script's; null for a Markdown document, or without figures). */
  pages: z.number().int().nullable(),
  scenes: z.number().int().nullable(),
  words: z.number().int().nullable(),
  /** False when the draft is larger than a script may be (5 MB): listed without its figures. */
  figures: z.literal(false).optional(),
  matches: z.boolean(),
});
type DraftItem = z.infer<typeof draftItem>;

const draftsOutput = z.object({
  drafts: z.array(draftItem),
  /** Draft files on this page that couldn't be read. */
  unreadable: z.number().int().min(0),
  next: z.string().optional(),
  restarted,
});
type DraftsOutput = z.infer<typeof draftsOutput>;

/** What a draft file says of itself, kept while the file is unchanged; null when unreadable. */
type DraftSummary = { item: DraftItem } | null;
const draftSummaries = new LoadCache<DraftSummary>(MAX_DRAFTS);

/** A draft's pages, scenes, and words: from its text, never returned. */
function figures(
  text: string,
  kind: WorkKind,
  novel = false,
): { pages: number | null; scenes: number; words: number } {
  if (kind === 'markdown')
    return {
      pages: null,
      scenes: (novel ? novelAnchors(text) : markdownAnchors(text)).length,
      words: wordsIn(text),
    };
  const doc = parse(text);
  const template = templateFor(doc);
  const layout = paginate(doc, template);
  return {
    pages: layout.pages.filter((page) => page.number > 0).length,
    scenes: sceneIndex(doc, template, layout).scenes.length,
    words: wordsIn(text),
  };
}

/** Whether a draft's summary is kept already (so reading it again costs nothing). */
const summarised = (file: Checked) =>
  draftSummaries.get(file.real, file.size, file.mtimeMs) !== undefined;

async function summaryOf(file: Checked, kind: WorkKind, novel = false): Promise<DraftSummary> {
  const cached = draftSummaries.get(file.real, file.size, file.mtimeMs);
  if (cached !== undefined) return cached;
  const read = await readDraft(file, kind);
  let summary: DraftSummary = null;
  if ('facts' in read) {
    const { facts } = read;
    const note = clipText(facts.note, NOTE_LIMIT);
    summary = {
      item: {
        draft: draftName(facts.draft),
        number: facts.draft,
        id: facts.id,
        short_id: facts.id.slice(0, 7),
        frozen: facts.frozen,
        note: note.text,
        ...(note.cut ? { note_cut: true as const } : {}),
        ...(file.size > MAX_SCRIPT_BYTES
          ? { pages: null, scenes: null, words: null, figures: false as const }
          : figures(read.text, kind, novel)),
        matches: read.matches,
      },
    };
  }
  draftSummaries.set(file.real, file.size, file.mtimeMs, summary);
  return summary;
}

async function listDrafts(args: DraftsInput, ctx: ToolContext): Promise<DraftsOutput> {
  const loaded = await load(args.script, ctx);
  const kind = kindOf(loaded);
  const isNovel = loaded.kind === 'markdown' && loaded.novel !== null;
  const files = await draftFiles(loaded, ctx);
  const now = cursorBase('list_drafts', loaded, {
    script: args.script,
    files: files.map((f) => [f.name, f.checked?.size ?? null, f.checked?.mtimeMs ?? null]),
  });
  const start = startOf(ctx, args.cursor, now, files.length);
  const budget = answerBudget();
  const overhead = JSON.stringify({
    about: ABOUT,
    drafts: [],
    unreadable: MAX_DRAFTS,
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;
  const drafts: DraftItem[] = [];
  let unreadable = 0;
  let used = overhead + 2;
  let read = 0;
  let parsed = 0;
  let i = start.at;
  for (let examined = 0; i < files.length && examined < DRAFTS_PAGE; i++, examined++) {
    const file = files[i] as DraftFile;
    const checked = file.checked;
    // What reading this one costs: nothing when it is kept already.
    const fresh = checked !== null && !summarised(checked);
    const size = fresh ? checked.size : 0;
    const parse = fresh && checked.size <= MAX_SCRIPT_BYTES ? checked.size : 0;
    if (
      examined > 0 &&
      (read + size > PAGE_READ_BYTES || (parsed > 0 && parsed + parse > PAGE_PARSE_BYTES))
    )
      break;
    const summary = checked ? await summaryOf(checked, kind, isNovel) : null;
    read += size;
    parsed += parse;
    if (!summary) {
      unreadable++;
      continue;
    }
    const cost = itemCost(summary.item);
    if (drafts.length > 0 && used + cost - 1 > budget) break;
    drafts.push(summary.item);
    used += cost;
  }
  return {
    drafts,
    unreadable,
    ...(i < files.length ? { next: makeNext(ctx, now, { at: i }) } : {}),
    ...(start.restarted ? { restarted: true as const } : {}),
  };
}

const makeNext = (
  ctx: ToolContext,
  now: ReturnType<typeof cursorBase>,
  at: { at: number; part?: number },
) => makeCursor(ctx.data.key, { ...now, ...at });

export const listDraftsTool: ToolDef<DraftsInput, DraftsOutput> = {
  name: 'list_drafts',
  title: 'List drafts',
  description:
    'The drafts the writer froze of one script, from the drafts folder Drafter keeps beside it: each draft’s number (“Draft 03”), short and full ID, when it was frozen, the writer’s one-line note, its pages, scenes, and words (null, with `figures: false`, for a draft over 5 MB), and whether its text still matches its ID (false when the file was changed outside Drafter). Never a draft’s text: use compare_drafts for what changed. `unreadable` counts the draft files on this page that couldn’t be read. Pass `next` back as `cursor` for more.',
  input: draftsInput,
  output: draftsOutput,
  run: listDrafts,
};

// ---------------------------------------------------------------------------------------------
// compare_drafts

const compareInput = z.strictObject({
  script: path,
  from: z.number().int().min(1).max(99_999),
  to: z.union([z.number().int().min(1).max(99_999), z.literal('now')]),
  scene: sceneRef.optional(),
  include: include.optional(),
  cursor: cursor.optional(),
});
type CompareInput = z.infer<typeof compareInput>;

const groupItem = z.object({
  title: z.string(),
  title_cut: z.literal(true).optional(),
  tag: z.enum(['new', 'deleted', 'renamed', 'changed', 'opening']),
  renamed_from: z.string().nullable(),
  removed: z.array(z.string()),
  added: z.array(z.string()),
  /** A group of more than 400 changed lines: its counts only (name it with `scene` for its lines). */
  summarised: z.object({ removed: z.number().int(), added: z.number().int() }).optional(),
  /**
   * In a group that comes in parts, the entries (by index in this part's lists) that carry on the
   * entry before them: a line too long for one part, cut between parts.
   */
  continues: z
    .object({ removed: z.array(z.number().int()), added: z.array(z.number().int()) })
    .optional(),
  part: z.number().int().optional(),
  parts: z.number().int().optional(),
});
type GroupItem = z.infer<typeof groupItem>;

const compareOutput = z.object({
  from: z.string(),
  to: z.string(),
  totals: z.object({
    scenes_changed: z.number().int(),
    new: z.number().int(),
    deleted: z.number().int(),
    renamed: z.number().int(),
    unchanged: z.number().int(),
    lines_added: z.number().int(),
    lines_removed: z.number().int(),
  }),
  groups: z.array(groupItem),
  left_out: leftOut,
  note: z.string().optional(),
  next: z.string().optional(),
  restarted,
});
type CompareOutput = z.infer<typeof compareOutput>;

/** Draft `n`'s text: its plain file first, then a copy, the first whose facts say it is draft `n`. */
async function draftText(
  files: readonly DraftFile[],
  n: number,
  kind: WorkKind,
): Promise<{ text: string; file: Checked }> {
  const candidates = files.filter((f) => f.number === n);
  if (candidates.length === 0) {
    const numbers = [...new Set(files.map((f) => f.number))];
    const refusal = new Refusal(
      numbers.length === 0
        ? `There’s no ${draftName(n)} beside this script: its drafts folder has no drafts.`
        : `There’s no ${draftName(n)} beside this script. Its drafts are ${numbers.map(padDraft).join(', ')}.`,
    );
    refusal.extra = { drafts: numbers };
    throw refusal;
  }
  let problem = 'it can’t be read';
  for (const each of candidates) {
    if (!each.checked) continue;
    if (each.checked.size > MAX_SCRIPT_BYTES)
      throw new Refusal(`${draftName(n)} is larger than 5 MB, too large to compare.`);
    const read = await readDraft(each.checked, kind);
    if (!('facts' in read)) problem = read.problem.charAt(0).toLowerCase() + read.problem.slice(1);
    else if (read.facts.draft === n) return { text: read.text, file: each.checked };
    else problem = `its file says it is ${draftName(read.facts.draft)}`;
  }
  throw new Refusal(`${draftName(n)} can’t be read: ${problem.replace(/\.$/, '')}.`);
}

/** A group's lines in parts, each within `room`, a line longer than a part cut between parts. */
function groupParts(item: GroupItem, room: number): GroupItem[] {
  const shell = {
    ...item,
    removed: [],
    added: [],
    continues: { removed: [], added: [] },
    part: Number.MAX_SAFE_INTEGER,
    parts: Number.MAX_SAFE_INTEGER,
  };
  const space = Math.max(32, room - itemCost(shell));
  /** An index in `continues`, at most seven digits and a comma. */
  const INDEX = 8;
  const pieceRoom = Math.max(6, space - 4 - INDEX);
  type Part = { removed: string[]; added: string[]; cr: number[]; ca: number[] };
  const fresh = (): Part => ({ removed: [], added: [], cr: [], ca: [] });
  const parts: Part[] = [];
  let part = fresh();
  let used = 0;
  for (const side of ['removed', 'added'] as const) {
    for (const line of item[side]) {
      partsOf(line, pieceRoom).forEach((piece, k) => {
        const cost = itemCost(piece) + (k > 0 ? INDEX : 0);
        if (used > 0 && used + cost > space) {
          parts.push(part);
          part = fresh();
          used = 0;
        }
        if (k > 0) (side === 'removed' ? part.cr : part.ca).push(part[side].length);
        part[side].push(piece);
        used += cost;
      });
    }
  }
  parts.push(part);
  return parts.map((p, i) => ({
    ...item,
    removed: p.removed,
    added: p.added,
    ...(p.cr.length > 0 || p.ca.length > 0 ? { continues: { removed: p.cr, added: p.ca } } : {}),
    part: i + 1,
    parts: parts.length,
  }));
}

interface Grouped {
  item: GroupItem;
  changed: boolean;
  /** The scene's place in the newer version (1-based), or null (deleted, or the opening). */
  newer: number | null;
  /** Its heading, and its older one when renamed: what `scene` words match. */
  names: string[];
}

/** The group `scene` names: by its place in the newer version, or by words from its heading. */
function namedGroup(groups: readonly Grouped[], ref: string, count: number): Grouped {
  const given = ref.trim();
  if (/^\d+$/.test(given)) {
    const found = groups.find((g) => g.newer === Number(given));
    if (found) return found;
    throw new Refusal(
      `There’s no scene ${given} in the newer version. It has ${count} ${count === 1 ? 'scene' : 'scenes'}.`,
    );
  }
  const wanted = wordsOf(given);
  const matches = groups.filter(
    (g) =>
      g.names.length > 0 &&
      wanted.length > 0 &&
      g.names.some((name) => {
        const have = new Set(wordsOf(name));
        return wanted.every((word) => have.has(word));
      }),
  );
  if (matches.length === 1) return matches[0] as Grouped;
  if (matches.length === 0)
    throw new Refusal(`No scene in either version matches “${clipText(given, 200).text}”.`);
  const refusal = new Refusal(
    `More than one scene matches “${clipText(given, 200).text}”. Name one by its number in the newer version.`,
  );
  refusal.extra = {
    matches: matches.slice(0, 20).map((g) => ({ scene: g.newer, heading: g.item.title })),
  };
  throw refusal;
}

async function compareDrafts(args: CompareInput, ctx: ToolContext): Promise<CompareOutput> {
  const loaded = await load(args.script, ctx);
  const kind = kindOf(loaded);
  const include = ctx.include(args);
  const files = await draftFiles(loaded, ctx);
  const older = await draftText(files, args.from, kind);
  const newer = args.to === 'now' ? null : await draftText(files, args.to, kind);

  const left: LeftOut = { notes: 0, boneyard: 0 };
  const shownOld = shownOf(older.text, kind, include);
  const shownNew =
    newer === null && loaded.kind === 'script'
      ? visible(loaded.doc, 0, loaded.doc.source.length, include)
      : shownOf(newer?.text ?? loaded.text, kind, include);
  for (const shown of [shownOld, shownNew]) {
    left.notes += shown.leftOut.notes;
    left.boneyard += shown.leftOut.boneyard;
  }
  // A novel's drafts are numbered by its parts, chapters, and sections, as `read_scene` numbers them.
  const anchorsOf =
    kind !== 'markdown'
      ? sceneAnchors
      : loaded.kind === 'markdown' && loaded.novel !== null
        ? novelAnchors
        : markdownAnchors;
  const oldAnchors = anchorsOf(shownOld.text);
  const newAnchors = anchorsOf(shownNew.text);
  const { rows } = diffRows(shownOld.text, shownNew.text, { old: oldAnchors, new: newAnchors });
  const newOrder = new Map(newAnchors.map((a, i) => [a.line, i + 1]));

  const totals = {
    scenes_changed: 0,
    new: 0,
    deleted: 0,
    renamed: 0,
    unchanged: 0,
    lines_added: 0,
    lines_removed: 0,
  };
  const grouped: Grouped[] = groupRows(rows, oldAnchors, newAnchors).map((g) => {
    const changed = g.added + g.removed > 0;
    const tag: GroupItem['tag'] = g.tag === 'same' ? 'changed' : g.tag;
    const removed: string[] = [];
    const added: string[] = [];
    for (let r = g.from; r < g.to; r++) {
      const row = rows[r] as (typeof rows)[number];
      if (row.kind === 'removed') removed.push(row.text);
      else if (row.kind === 'added') added.push(row.text);
    }
    // The heading's row on the newer side: the first row, or a renamed heading's pair.
    const first = rows[g.from] as (typeof rows)[number];
    const newRow = first.kind === 'removed' && first.pair !== null ? rows[first.pair] : first;
    const newer =
      g.tag === 'opening' || g.tag === 'deleted' || newRow?.new == null
        ? null
        : (newOrder.get(newRow.new) ?? null);
    const title = clipText(g.title, TEXT_LIMITS.heading);
    if (changed) {
      totals.scenes_changed++;
      if (g.tag === 'new') totals.new++;
      else if (g.tag === 'deleted') totals.deleted++;
      else if (g.tag === 'renamed') totals.renamed++;
    } else totals.unchanged++;
    totals.lines_added += g.added;
    totals.lines_removed += g.removed;
    return {
      item: {
        title: title.text,
        ...(title.cut ? { title_cut: true as const } : {}),
        tag,
        renamed_from: g.renamedFrom === null ? null : heading(g.renamedFrom),
        removed,
        added,
      },
      changed,
      newer,
      names: g.tag === 'opening' ? [] : [g.title, ...(g.renamedFrom ? [g.renamedFrom] : [])],
    };
  });

  let items: GroupItem[];
  let note: string | undefined;
  if (args.scene !== undefined) {
    const named = namedGroup(grouped, args.scene, newAnchors.length);
    items = named.changed ? [named.item] : [];
    if (!named.changed) note = 'That scene is the same in both versions.';
  } else {
    items = grouped
      .filter((g) => g.changed)
      .map(({ item }) =>
        item.removed.length + item.added.length > LARGE_GROUP
          ? {
              ...item,
              removed: [],
              added: [],
              summarised: { removed: item.removed.length, added: item.added.length },
            }
          : item,
      );
  }

  const label = { from: draftName(args.from), to: args.to === 'now' ? 'now' : draftName(args.to) };
  const now = cursorBase('compare_drafts', loaded, {
    script: args.script,
    from: args.from,
    to: args.to,
    scene: args.scene ?? null,
    include,
    drafts: [older.file, newer?.file].map((f) => (f ? [f.real, f.size, f.mtimeMs] : null)),
  });
  const start = startOf(ctx, args.cursor, now, items.length);
  const overhead = JSON.stringify({
    about: ABOUT,
    ...label,
    totals,
    groups: [],
    left_out: left,
    ...(note ? { note } : {}),
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;
  const page = pageWithParts(items, start, overhead, groupParts);
  return {
    ...label,
    totals,
    groups: page.page,
    left_out: left,
    ...(note ? { note } : {}),
    ...(page.next === null ? {} : { next: makeNext(ctx, now, page.next) }),
    ...(page.restarted ? { restarted: true as const } : {}),
  };
}

export const compareDraftsTool: ToolDef<CompareInput, CompareOutput> = {
  name: 'compare_drafts',
  title: 'Compare drafts',
  description:
    'What changed between two of a script’s frozen drafts (`from` and `to`, draft numbers), or between a draft and the script as it is now (`to: "now"`), grouped by scene: each new, deleted, renamed, or changed scene with its removed and added lines, and totals (unchanged scenes are only counted). A scene with more than 400 changed lines comes as counts (`summarised`); name it with `scene` (its place in the newer version, or words from its heading) for its lines. Notes and the boneyard are left out unless include asks for them; `left_out` counts them in both versions together. Pass `next` back as `cursor` for more.',
  input: compareInput,
  output: compareOutput,
  run: compareDrafts,
};

// ---------------------------------------------------------------------------------------------
// list_cuts

const cutsInput = z.strictObject({
  script: path,
  group: z.enum(['draft', 'scene', 'newest']).optional(),
  words: words.optional(),
  draft: z.number().int().min(1).max(99_999).optional(),
  act: z.number().int().min(1).max(999).optional(),
  scene: sceneRef.optional(),
  character: characterName.optional(),
  kind: z.enum(['scene', 'passage']).optional(),
  id: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  include: include.optional(),
  cursor: cursor.optional(),
});
type CutsInput = z.infer<typeof cutsInput>;

const cutItem = z.object({
  id: z.string(),
  title: z.string(),
  title_cut: z.literal(true).optional(),
  kind: z.enum(['scene', 'passage']),
  after: z.string().nullable(),
  before: z.string().nullable(),
  within: z.string().nullable(),
  /** Each time it was cut, newest first, and the draft it was cut from. */
  cut: z.array(z.object({ at: z.string(), draft: z.string().nullable() })),
  cut_more: z.number().int().optional(),
  put_back: z.string().nullable(),
  words: z.number().int(),
  text: z.string(),
  /** Its text was cut to 1,500 characters; ask for it by `id` for the whole. */
  trimmed: z.boolean(),
  part: z.number().int().optional(),
  parts: z.number().int().optional(),
});
type CutItem = z.infer<typeof cutItem>;

const cutsOutput = z.object({
  cuts: z.array(cutItem),
  /** Cuts in the file that couldn't be read or didn't check out: never shown. */
  skipped: z.number().int().min(0),
  left_out: leftOut,
  note: z.string().optional(),
  next: z.string().optional(),
  restarted,
});
type CutsOutput = z.infer<typeof cutsOutput>;

/** As Drafter titles a passage: its first eight words. */
function firstWords(text: string, n = 8): string {
  const all = text
    .trim()
    .split(/\s+/u)
    .filter((w) => w !== '');
  return all.length > n ? `${all.slice(0, n).join(' ')}…` : all.join(' ');
}

/** When it was last cut. */
const latest = (entry: CutEntry) =>
  entry.cuts.reduce((max, c) => (c.at > max ? c.at : max), entry.cuts[0]?.at ?? '');

/** The draft it was last cut from (null: before the first draft). */
const latestDraft = (entry: CutEntry) => {
  let best: CutEntry['cuts'][number] | undefined;
  for (const c of entry.cuts) if (!best || c.at > best.at) best = c;
  return best?.draft ?? null;
};

/** A whole scene (or section) or a passage: its `within` says, else whether it starts with a heading. */
function cutKind(entry: CutEntry): 'scene' | 'passage' {
  const within = entry.where.within;
  if (within === null) return 'scene';
  if (within !== undefined) return 'passage';
  const lead = entry.text.length - entry.text.trimStart().length;
  let line = 0;
  for (let i = 0; i < lead; i++) if (entry.text.charCodeAt(i) === 10) line++;
  const anchors =
    entry.kind === 'markdown' ? markdownAnchors(entry.text) : sceneAnchors(entry.text);
  return anchors[0]?.line === line ? 'scene' : 'passage';
}

/** The scenes of the script as it is now that a cut was in or beside (1-based). */
function placesOf(entry: CutEntry, kind: 'scene' | 'passage', loaded: Loaded): number[] {
  // Headings as Drafter matches scenes across versions: case, a locked number, dashes, spaces,
  // and closing punctuation aside.
  const headings = headingsOf(loaded).map((h) => headingKey(h.heading));
  const locate = (name: string | null | undefined, hint: number | undefined): number | null => {
    if (!name) return null;
    const key = headingKey(name);
    let best: number | null = null;
    headings.forEach((h, i) => {
      if (h !== key) return;
      if (best === null || (hint !== undefined && Math.abs(i + 1 - hint) < Math.abs(best - hint)))
        best = i + 1;
    });
    return best;
  };
  const { where } = entry;
  const places =
    kind === 'passage' && where.within
      ? [locate(where.within.heading, where.within.ordinal)]
      : [locate(where.after, where.ordinal), locate(where.before, where.ordinal)];
  return [...new Set(places.filter((p): p is number => p !== null))].sort((a, b) => a - b);
}

async function cutsOf(args: CutsInput, ctx: ToolContext): Promise<CutsOutput> {
  const loaded = await load(args.script, ctx);
  const kind = kindOf(loaded);
  const include = ctx.include(args);
  if (loaded.kind === 'markdown' && args.act !== undefined)
    throw new Refusal('A document has no acts. Use scene to name one of its sections.');
  if (loaded.kind === 'markdown' && args.character !== undefined)
    throw new Refusal(
      'A document has no characters. character reads a screenplay or a stage play.',
    );
  const empty = { cuts: [], skipped: 0, left_out: { notes: 0, boneyard: 0 } };

  const names = besideOf(loaded);
  if (!names) return { ...empty, note: NO_CUTS };
  let file: Checked;
  try {
    file = await resolvePath(
      `${parentOf(loaded.file.shown)}/${names.cuts}`,
      ctx.data.roots,
      ctx.data.platform,
      'file',
    );
  } catch (error) {
    if (error instanceof Missing) return { ...empty, note: NO_CUTS };
    throw error;
  }
  const read = await readCutsBytes(
    await readCapped(file.real, MAX_BESIDE_BYTES, tooBig, READ(file)),
    kind,
  );
  if (read.problem !== null)
    throw new Refusal(`The cuts file beside this script can’t be read: ${read.problem}.`);

  const scene = args.scene === undefined ? null : oneScene(loaded, args.scene);
  const key = args.character === undefined ? null : castKey(args.character);
  const wanted = args.words === undefined ? [] : wordsOf(args.words);
  const byId = args.id !== undefined;

  const left: LeftOut = { notes: 0, boneyard: 0 };
  const kept: Array<{ item: CutItem; entry: CutEntry; places: number[] }> = [];
  for (const entry of read.entries) {
    if (byId && entry.id !== args.id) continue;
    const kindHere = cutKind(entry);
    if (args.kind !== undefined && kindHere !== args.kind) continue;
    if (args.draft !== undefined && !entry.cuts.some((c) => c.draft === args.draft)) continue;
    const places = placesOf(entry, kindHere, loaded);
    if (scene !== null && !places.includes(scene)) continue;
    if (
      args.act !== undefined &&
      loaded.kind === 'script' &&
      !places.some((p) => loaded.map.scenes[p - 1]?.act === args.act)
    )
      continue;
    const shown = shownOf(entry.text, entry.kind, include);
    // Who speaks in what is shown: a cue in a left-out note or boneyard doesn't count.
    if (key !== null) {
      const doc = parse(shown.text);
      if (!doc.blocks.some((b) => b.kind === 'character' && castKey(b.sem.name) === key)) continue;
    }
    if (wanted.length > 0) {
      const have = new Set(wordsOf(shown.text));
      if (!wanted.every((word) => have.has(word))) continue;
    }
    left.notes += shown.leftOut.notes;
    left.boneyard += shown.leftOut.boneyard;

    // A passage is titled by the first words of what is shown of it, never by its stored title,
    // which may hold a note's words.
    const titleText =
      kindHere === 'passage' ? firstWords(shown.text) || 'Untitled cut' : entry.title;
    const title = clipText(titleText, TEXT_LIMITS.heading);
    const dates = [...entry.cuts].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    const text = byId ? { text: shown.text, cut: false } : clipText(shown.text, CUT_TRIM);
    kept.push({
      entry,
      places,
      item: {
        id: entry.id,
        title: title.text,
        ...(title.cut ? { title_cut: true as const } : {}),
        kind: kindHere,
        after: entry.where.after === null ? null : heading(entry.where.after),
        before: entry.where.before === null ? null : heading(entry.where.before),
        within: entry.where.within ? heading(entry.where.within.heading) : null,
        cut: dates
          .slice(0, CUT_DATES)
          .map((c) => ({ at: c.at, draft: c.draft === null ? null : draftName(c.draft) })),
        ...(dates.length > CUT_DATES ? { cut_more: dates.length - CUT_DATES } : {}),
        put_back: entry.putBack ?? null,
        words: wordsIn(shown.text),
        text: text.text,
        trimmed: text.cut,
      },
    });
  }
  if (byId && kept.length === 0)
    throw new Refusal('There’s no cut with that ID in the cuts file beside this script.');

  const group = args.group ?? 'newest';
  const newest = (a: CutEntry, b: CutEntry) => {
    const x = latest(a);
    const y = latest(b);
    return x < y ? 1 : x > y ? -1 : 0;
  };
  kept.sort((a, b) => {
    if (group === 'draft') {
      const x = latestDraft(a.entry) ?? 0;
      const y = latestDraft(b.entry) ?? 0;
      if (x !== y) return y - x;
    } else if (group === 'scene') {
      const x = a.places[0] ?? Number.MAX_SAFE_INTEGER;
      const y = b.places[0] ?? Number.MAX_SAFE_INTEGER;
      if (x !== y) return x - y;
    }
    return newest(a.entry, b.entry);
  });
  const items = kept.map((k) => k.item);

  const { cursor: _cursor, include: _include, ...rest } = args;
  const now = cursorBase('list_cuts', loaded, {
    ...rest,
    include,
    cuts: [file.real, file.size, file.mtimeMs],
  });
  const start = startOf(ctx, args.cursor, now, items.length);
  const overhead = JSON.stringify({
    about: ABOUT,
    cuts: [],
    skipped: read.skipped,
    left_out: left,
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;
  const page = pageWithParts(items, start, overhead, cutParts);
  return {
    cuts: page.page,
    skipped: read.skipped,
    left_out: left,
    ...(page.next === null ? {} : { next: makeNext(ctx, now, page.next) }),
    ...(page.restarted ? { restarted: true as const } : {}),
  };
}

/** A cut's text in parts, each with the cut's facts, `part`, and `parts`. */
function cutParts(item: CutItem, room: number): CutItem[] {
  const shell = {
    ...item,
    text: '',
    part: Number.MAX_SAFE_INTEGER,
    parts: Number.MAX_SAFE_INTEGER,
  };
  const texts = partsOf(item.text, Math.max(6, room - itemCost(shell)));
  return texts.map((text, i) => ({ ...item, text, part: i + 1, parts: texts.length }));
}

export const listCutsTool: ToolDef<CutsInput, CutsOutput> = {
  name: 'list_cuts',
  title: 'List cuts',
  description:
    'What the writer cut from one script, from the cuts file Drafter keeps beside it: each cut’s title, whether it was a whole scene or a passage, where it was (the scenes either side, or the scene it was cut from), every time it was cut and from which draft, when it was put back if it was, its words, and its text (trimmed to 1,500 characters in a list; ask by `id` for the whole). Newest first, or `group` by draft or by scene. Filter by `words` (plain words, every one), `draft`, `act`, `scene` (where it was cut from), `character` (who speaks in it), or `kind`. Notes and the boneyard are left out unless include asks for them. Pass `next` back as `cursor` for more.',
  input: cutsInput,
  output: cutsOutput,
  run: cutsOf,
};
