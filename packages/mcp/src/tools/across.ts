// Across files (§3, tools 8–10): search_scripts, story_map, and series_overview. Every file is
// reached through a checked path (a walk's, then load's resolvePath) and read capped, without
// following a link. The writer's text comes back only as §6 allows: a search looks only at what
// `visible` keeps (never the title page, the Contact, or anything from the metadata block on, and
// notes and the boneyard only when included), and finds plain words, never a pattern. Every answer
// stays under the cap (§7.3), and each call bounds its own work (files, bytes read, bytes parsed),
// so it ends well inside the 10-second limit.
import { Refused } from '@drafter/archive/node';
import type { Doc } from '@drafter/fountain';
import { bodyEnd, startsScene } from '@drafter/outline';
import { hooksOf, type StoryMap } from '@drafter/story-map';
import * as z from 'zod/v4';
import { argsHash, type CursorAt, makeCursor, readCursor } from '../cursor';
import { ABOUT, type Include, type LeftOut } from '../envelope';
import { type Loaded, load, mapOf } from '../load';
import { neighbours, readLimits, SEARCH_LIMITS, SERIES_MAX } from '../names';
import { answerBudget, clipText, fitting, itemCost } from '../paging';
import { type Checked, Refusal, resolvePath } from '../paths';
import { visibleIn, visibleMarkdownIn } from '../visible';
import { walk } from '../walk';
import type { ToolContext, ToolDef } from './index';
import { filesOf } from './list';
import { characterName, cursor, include, leftOut, path, restarted, words } from './schemas';
import { castKey, cursorBase, TEXT_LIMITS } from './script';

type Script = Extract<Loaded, { kind: 'script' }>;

const addLeftOut = (into: LeftOut, more: LeftOut) => {
  into.notes += more.notes;
  into.boneyard += more.boneyard;
};

/** A short text within `max` (JSON-escaped), cut at a code point. */
const clip = (text: string, max: number) => clipText(text, max).text;

/** The most names a series compares for spellings (the most-seen first), and pairs it shows. */
export const NEIGHBOUR_NAMES = 1_000;
const MAX_PAIRS = 1_000;

/** An export is a copy of a script: a folder's search or series reads the script, not the copy. */
const isExport = (format: string) => format === 'html' || format === 'epub';

// ---------------------------------------------------------------------------------------------
// search_scripts

const where = z.enum(['dialogue', 'action', 'headings', 'everything']);
type Where = z.infer<typeof where>;
const elementKind = z.enum(['dialogue', 'parenthetical', 'action', 'heading', 'synopsis', 'other']);
type Element = z.infer<typeof elementKind>;

const searchInput = z.strictObject({
  words,
  folder: path.optional(),
  script: path.optional(),
  in: where.optional(),
  character: characterName.optional(),
  include: include.optional(),
  cursor: cursor.optional(),
});
type SearchInput = z.infer<typeof searchInput>;

const hitSchema = z.object({
  path: z.string(),
  scene: z.number().int().nullable(),
  heading: z.string().nullable(),
  element: elementKind,
  who: z.string().nullable(),
  around: z.string(),
});
type Hit = z.infer<typeof hitSchema>;

const searchOutput = z.object({
  hits: z.array(hitSchema),
  files_searched: z.number().int().min(0),
  stopped: z.enum(['hits', 'files', 'bytes']).nullable(),
  left_out: leftOut,
  next: z.string().optional(),
  restarted,
});
type SearchOutput = z.infer<typeof searchOutput>;

/** What a search looks for: its words, case-folded, and where. */
interface Wanted {
  words: string[];
  in: Where;
  /** The cast key of the character asked for, or null. */
  character: string | null;
  include: Include;
}

const fold = (text: string) => text.toLocaleLowerCase('und');

/** Where in `text` the folded text's offset `at` falls (folding can change a text's length). */
function originalOffset(text: string, folded: string, at: number): number {
  if (folded.length === text.length) return at;
  let seen = 0;
  let i = 0;
  while (i < text.length && seen < at) {
    const width = (text.codePointAt(i) as number) > 0xffff ? 2 : 1;
    seen += fold(text.slice(i, i + width)).length;
    i += width;
  }
  return i;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** About SEARCH_LIMITS.around UTF-16 units of `text` centred on the word at `at`, cut at code points. */
export function aroundOf(text: string, at: number, length: number): string {
  const size = SEARCH_LIMITS.around;
  if (text.length <= size) return text;
  let start = Math.max(0, at - Math.floor((size - Math.min(length, size)) / 2));
  let end = Math.min(text.length, start + size);
  start = Math.max(0, end - size);
  // Never half a surrogate pair at either end.
  if (start > 0 && isLow(text.charCodeAt(start))) start++;
  if (end < text.length && isHigh(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

/** A hit for `text` when every word is in it: its `around`. Null when one is missing. */
function match(text: string, wanted: Wanted): string | null {
  if (text === '') return null;
  const folded = fold(text);
  for (const word of wanted.words) if (folded.indexOf(word) < 0) return null;
  const first = wanted.words[0] as string;
  const at = folded.indexOf(first);
  const from = originalOffset(text, folded, at);
  const to = originalOffset(text, folded, at + first.length);
  return aroundOf(text, from, to - from);
}

const ELEMENTS: Record<Where, ReadonlySet<Element>> = {
  dialogue: new Set(['dialogue', 'parenthetical']),
  action: new Set(['action']),
  headings: new Set(['heading']),
  everything: new Set(['dialogue', 'parenthetical', 'action', 'heading', 'synopsis', 'other']),
};

/** The element a block is, for a search; null for what is never searched (cues, page breaks). */
function elementOf(script: Script, block: Doc['blocks'][number]): Element | null {
  if (block.kind === 'scene_heading' || startsScene(script.template, block)) return 'heading';
  switch (block.kind) {
    case 'lyric':
      // Sung lines are spoken lines.
      return 'dialogue';
    case 'dialogue':
    case 'parenthetical':
    case 'action':
    case 'synopsis':
      return block.kind;
    case 'character':
    case 'page_break':
      return null;
    default:
      return 'other';
  }
}

/** The most different words one search looks for. */
export const MAX_WORDS = 20;

/**
 * The words to find, case-folded, in the order given: each once, and none that is part of
 * another (an element with "lighthouse" in it has "light" in it too).
 */
export function wordsToFind(given: string): string[] {
  const unique = [
    ...new Set(
      given
        .trim()
        .split(/\s+/)
        .filter((word) => word !== '')
        .map(fold),
    ),
  ];
  return unique.filter((word) => !unique.some((other) => other !== word && other.includes(word)));
}

/** The hits in a script, in order, at most `limit`; and what it left out. */
function scriptHits(
  script: Script,
  wanted: Wanted,
  limit: number,
): { hits: Hit[]; leftOut: LeftOut } {
  const { doc, index } = script;
  const shown = visibleIn(doc, wanted.include);
  const hits: Hit[] = [];
  const allowed = ELEMENTS[wanted.in];
  const scenes = index.scenes;
  let s = -1;
  let cue: string | null = null;
  const end = bodyEnd(doc);
  for (let b = 0; b < end && hits.length < limit; b++) {
    const block = doc.blocks[b] as Doc['blocks'][number];
    if (block.kind === 'character') {
      cue = block.sem.name;
      continue;
    }
    const inSpeech =
      block.kind === 'dialogue' ||
      block.kind === 'parenthetical' ||
      block.kind === 'lyric' ||
      block.kind === 'note' ||
      block.kind === 'boneyard';
    if (!inSpeech) cue = null;
    while (
      s + 1 < scenes.length &&
      (scenes[s + 1] as (typeof scenes)[number]).span.from <= block.span.from
    )
      s++;
    const element = elementOf(script, block);
    if (element === null || !allowed.has(element)) continue;
    const speaking =
      (block.kind === 'dialogue' || block.kind === 'parenthetical' || block.kind === 'lyric') &&
      cue !== null;
    const who = speaking ? (cue as string) : null;
    if (wanted.character !== null && (who === null || castKey(who) !== wanted.character)) continue;
    const around = match(shown(block.span.from, block.span.to).text, wanted);
    if (around === null) continue;
    const scene = scenes[s];
    const inScene = scene !== undefined && block.span.from < scene.span.to;
    hits.push({
      path: script.file.shown,
      scene: inScene ? s + 1 : null,
      heading: inScene ? clip(scene.heading.trim(), TEXT_LIMITS.heading) : null,
      element,
      who: who === null ? null : clip(who, TEXT_LIMITS.name),
      around,
    });
  }
  return { hits, leftOut: shown(0, doc.source.length).leftOut };
}

/** The hits in a Markdown document: each section's heading line and paragraphs. */
function markdownHits(
  loaded: Extract<Loaded, { kind: 'markdown' }>,
  wanted: Wanted,
  limit: number,
): Hit[] {
  if (wanted.character !== null || (wanted.in !== 'everything' && wanted.in !== 'headings'))
    return [];
  const shown = visibleMarkdownIn(loaded.text);
  const pieces: Array<{ scene: number | null; from: number; to: number }> = [];
  const first = loaded.sections[0]?.from ?? loaded.text.length;
  if (first > 0) pieces.push({ scene: null, from: 0, to: first });
  loaded.sections.forEach((section, i) => {
    pieces.push({ scene: i + 1, from: section.from, to: section.to });
  });
  const hits: Hit[] = [];
  for (const piece of pieces) {
    const text = shown(piece.from, piece.to);
    const heading =
      piece.scene === null
        ? null
        : clip((loaded.sections[piece.scene - 1] as { title: string }).title, TEXT_LIMITS.heading);
    let body = text;
    const elements: Array<{ element: Element; text: string }> = [];
    if (piece.scene !== null) {
      const lineEnd = text.indexOf('\n');
      elements.push({ element: 'heading', text: lineEnd < 0 ? text : text.slice(0, lineEnd) });
      body = lineEnd < 0 ? '' : text.slice(lineEnd + 1);
    }
    if (wanted.in === 'everything')
      for (const paragraph of body.split(/\n[ \t]*\n/))
        elements.push({ element: 'other', text: paragraph.trim() });
    for (const { element, text: each } of elements) {
      if (hits.length >= limit) return hits;
      const around = match(each, wanted);
      if (around !== null)
        hits.push({
          path: loaded.file.shown,
          scene: piece.scene,
          heading,
          element,
          who: null,
          around,
        });
    }
  }
  return hits;
}

/** A file a search reads: as a walk found it, or as a script path checked. */
interface Target {
  shown: string;
  real: string;
  size: number;
  mtimeMs: number;
}

async function targetsOf(
  args: SearchInput,
  ctx: ToolContext,
): Promise<{ targets: Target[]; truncated: boolean }> {
  if (args.script !== undefined) {
    const { roots, platform } = ctx.data;
    const file: Checked = await resolvePath(args.script, roots, platform, 'file');
    return { targets: [file], truncated: false };
  }
  const { found, truncated } = await filesOf({ folder: args.folder, recursive: true }, ctx);
  return { targets: found.filter((file) => !isExport(file.format)), truncated };
}

async function search(args: SearchInput, ctx: ToolContext): Promise<SearchOutput> {
  if (args.folder !== undefined && args.script !== undefined)
    throw new Refusal('Give a folder or a script, not both.');
  // Plain words: split at white space, case-folded; each is found by indexOf.
  const list = wordsToFind(args.words);
  if (list.length === 0) throw new Refusal('Give at least one word to find.');
  if (list.length > MAX_WORDS) throw new Refusal(`Give at most ${MAX_WORDS} words to find.`);
  const include = ctx.include(args);
  const wanted: Wanted = {
    words: list,
    in: args.in ?? 'everything',
    character: args.character === undefined ? null : castKey(args.character),
    include,
  };

  const { targets, truncated } = await targetsOf(args, ctx);
  const now: Omit<CursorAt, 'at' | 'part'> = {
    tool: 'search_scripts',
    path: args.script ?? args.folder ?? '',
    mtimeMs: 0,
    size: targets.length,
    args: argsHash({
      words: list,
      folder: args.folder ?? null,
      script: args.script ?? null,
      in: wanted.in,
      character: wanted.character,
      include,
      files: targets.map((t) => [t.shown, t.size, t.mtimeMs]),
    }),
  };
  let at = 0;
  let skip = 0;
  let total = 0;
  let isRestart = false;
  if (args.cursor !== undefined) {
    const position = readCursor(ctx.data.key, args.cursor, now);
    if (position === 'restart' || position.at >= targets.length) isRestart = true;
    else {
      at = position.at;
      skip = position.part ?? 0;
      total = position.seen ?? 0;
    }
  }
  // Bytes before each file: what the search has read when it reaches it.
  const before: number[] = [0];
  for (const t of targets) before.push((before.at(-1) as number) + t.size);

  const budget = answerBudget();
  const overhead = JSON.stringify({
    about: ABOUT,
    hits: [],
    files_searched: Number.MAX_SAFE_INTEGER,
    stopped: 'bytes',
    left_out: { notes: Number.MAX_SAFE_INTEGER, boneyard: Number.MAX_SAFE_INTEGER },
    next: makeCursor(ctx.data.key, {
      ...now,
      at: Number.MAX_SAFE_INTEGER,
      part: Number.MAX_SAFE_INTEGER,
      seen: Number.MAX_SAFE_INTEGER,
    }),
    restarted: true,
  }).length;

  const hits: Hit[] = [];
  const left: LeftOut = { notes: 0, boneyard: 0 };
  let used = overhead + 2;
  let parsed = 0;
  let searched = at;
  let stopped: SearchOutput['stopped'] = null;
  let next: { at: number; part: number } | null = null;
  let i = at;
  files: for (; i < targets.length; i++, skip = 0) {
    const target = targets[i] as Target;
    if (i >= SEARCH_LIMITS.files) {
      stopped = 'files';
      break;
    }
    if ((before[i + 1] as number) > readLimits().searchBytes) {
      stopped = 'bytes';
      break;
    }
    const cached = ctx.cache.get(target.real, target.size, target.mtimeMs) !== undefined;
    if (!cached && parsed > 0 && parsed + target.size > readLimits().pageParseBytes) {
      // Enough parsing for one call: the next page starts with this file.
      next = { at: i, part: 0 };
      break;
    }
    searched = i + 1;
    let loaded: Loaded;
    try {
      loaded = await load(target.shown, ctx);
    } catch (error) {
      // A script named on its own is refused as any tool refuses it; in a folder, one that
      // can't be read is passed over.
      if (args.script !== undefined) throw error;
      continue;
    }
    if (!cached) parsed += target.size;
    const limit = skip + (SEARCH_LIMITS.total - total) + 1;
    let found: Hit[];
    if (loaded.kind === 'script') {
      const got = scriptHits(loaded, wanted, limit);
      addLeftOut(left, got.leftOut);
      found = got.hits;
    } else found = markdownHits(loaded, wanted, limit);
    for (let k = skip; k < found.length; k++) {
      // There is a hit past the last one a search gives: it stopped for the limit.
      if (total >= SEARCH_LIMITS.total) {
        stopped = 'hits';
        break files;
      }
      const hit = found[k] as Hit;
      const cost = itemCost(hit);
      if (hits.length >= SEARCH_LIMITS.perPage || (hits.length > 0 && used + cost - 1 > budget)) {
        next = { at: i, part: k };
        break files;
      }
      hits.push(hit);
      used += cost;
      total++;
    }
  }
  if (next === null && stopped === null && i >= targets.length && truncated) stopped = 'files';

  return {
    hits,
    files_searched: searched,
    stopped,
    left_out: left,
    ...(next === null
      ? {}
      : { next: makeCursor(ctx.data.key, { ...now, at: next.at, part: next.part, seen: total }) }),
    ...(isRestart ? { restarted: true as const } : {}),
  };
}

export const searchScripts: ToolDef<SearchInput, SearchOutput> = {
  name: 'search_scripts',
  title: 'Search scripts',
  description:
    'Finds plain words (never a pattern) in the writer’s scripts: every word, in any case, in the same line of dialogue, parenthetical, action, heading, or synopsis. Search one script (`script`), one folder (`folder`), or every folder. `in` narrows it to dialogue, action, or headings, and `character` to one character’s lines. Each hit gives the file, the scene, the element, who says it, and about 200 characters around it. The title page and Drafter’s own data are never searched; notes and the boneyard only when include asks for them. 50 hits a page (pass `next` back as `cursor`), 500 in all; a search reads at most 200 files and 100 MB, and `stopped` says when it stopped at a limit.',
  input: searchInput,
  output: searchOutput,
  run: search,
};

// ---------------------------------------------------------------------------------------------
// story_map

const mapInput = z.strictObject({
  script: path,
  status: z.enum(['in-progress', 'finished']).optional(),
  cursor: cursor.optional(),
});
type MapInput = z.infer<typeof mapInput>;

const entry = z.looseObject({});
const mapOutput = z.object({
  kind: z.enum(['screenplay', 'play']).optional(),
  status: z.enum(['in-progress', 'finished']).optional(),
  title: z.string().optional(),
  title_cut: z.literal(true).optional(),
  writer: z.object({ name: z.string(), initials: z.string() }).nullable().optional(),
  greeting: z.string().optional(),
  logline: z.string().nullable().optional(),
  explain: z.string().nullable().optional(),
  draftLabel: z.string().optional(),
  shortId: z.string().optional(),
  updated: z.string().nullable().optional(),
  facts: entry.optional(),
  acts: z.array(entry),
  scenes: z.array(entry),
  axis: z.number().optional(),
  lanes: z.enum(['two', 'one']).optional(),
  split: entry.nullable().optional(),
  pace: z.string().optional(),
  characters: z.array(entry).optional(),
  characters_more: z.number().int().optional(),
  pairs: z.array(entry).optional(),
  places: z.array(entry).optional(),
  placesMore: z.number().int().optional(),
  quotes: z.array(entry).optional(),
  quotes_more: z.number().int().optional(),
  threads: z.array(entry).optional(),
  threads_more: z.number().int().optional(),
  gaps: entry.optional(),
  interval: entry.nullable().optional(),
  /** Never the writer's contact. */
  contact: z.null().optional(),
  next: z.string().optional(),
  restarted,
});
type MapOutput = z.infer<typeof mapOutput>;

/** The longest a short text of the story map may be, JSON-escaped. */
const MAP_TEXT = {
  title: 1_000,
  line: 500,
  name: 200,
  place: 120,
  quote: 200,
  scene: 500,
} as const;
/** The most of a list inside one item: a scene's chips and stage lines, a character's scenes. */
const MAP_ITEMS = { chips: 100, stage: 100, presence: 300 } as const;
/** The share of a page each list on the first page may take; past it, a count of the rest. */
const MAP_SHARES = { characters: 0.25, quotes: 0.15, threads: 0.05, gapList: 0.025 } as const;

/** A text field within `max`, and whether any was cut. */
function clipped(text: string | null, max: number, cut: { any: boolean }): string | null {
  if (text === null) return null;
  const got = clipText(text, max);
  if (got.cut) cut.any = true;
  return got.text;
}

/** A list capped at `max`, with `<name>_more` when it was. */
function capped<T, K extends string>(items: readonly T[], max: number, more: K) {
  return (items.length > max ? { [more]: items.length - max } : {}) as Partial<Record<K, number>>;
}

type MapScene = StoryMap['scenes'][number];

/** A scene within its limits: long texts cut (`cut: true`), long lists capped (`_more`). */
function boundedScene(scene: MapScene): Record<string, unknown> {
  const cut = { any: false };
  const out = {
    ...scene,
    place: clipped(scene.place, MAP_TEXT.scene, cut),
    title: clipped(scene.title, MAP_TEXT.scene, cut),
    time: clipped(scene.time, MAP_TEXT.scene, cut),
    what: clipped(scene.what, MAP_TEXT.scene, cut),
    moves: clipped(scene.moves, MAP_TEXT.scene, cut),
    chips: scene.chips.slice(0, MAP_ITEMS.chips),
    ...capped(scene.chips, MAP_ITEMS.chips, 'chips_more'),
    stage: scene.stage === null ? null : scene.stage.slice(0, MAP_ITEMS.stage),
    ...capped(scene.stage ?? [], MAP_ITEMS.stage, 'stage_more'),
  };
  return cut.any ? { ...out, cut: true } : out;
}

/** A list within its share of a page, and how many were left out (none: no field). */
function share<T, K extends string>(items: readonly T[], part: number, more: K) {
  const kept = fitting(items, answerBudget() * part);
  return {
    kept,
    extra: (kept.length < items.length ? { [more]: items.length - kept.length } : {}) as Partial<
      Record<K, number>
    >,
  };
}

/** Everything but the acts and scenes, within its limits: the first page's. */
function mapHead(map: StoryMap): Record<string, unknown> {
  const cut = { any: false };
  const title = clipped(map.title, MAP_TEXT.title, cut) as string;
  const characters = share(
    map.characters.map((c) => {
      const each = { any: false };
      const out = {
        ...c,
        key: clipped(c.key, MAP_TEXT.name, each) as string,
        name: clipped(c.name, MAP_TEXT.name, each) as string,
        first: clipped(c.first, MAP_TEXT.name, each) as string,
        rest: clipped(c.rest, MAP_TEXT.name, each) as string,
        hook: clipped(c.hook, MAP_TEXT.line, each),
        age: clipped(c.age, MAP_TEXT.name, each),
        presence: c.presence.slice(0, MAP_ITEMS.presence),
        ...capped(c.presence, MAP_ITEMS.presence, 'presence_more'),
      };
      return each.any ? { ...out, cut: true } : out;
    }),
    MAP_SHARES.characters,
    'characters_more',
  );
  const quotes = share(
    map.quotes.map((q) => {
      const got = clipText(q.text, MAP_TEXT.quote);
      return got.cut ? { ...q, text: got.text, cut: true } : q;
    }),
    MAP_SHARES.quotes,
    'quotes_more',
  );
  const threads = share(
    map.threads.map((t) => ({ ...t, label: clip(t.label, MAP_TEXT.name) })),
    MAP_SHARES.threads,
    'threads_more',
  );
  const planned = share(map.gaps.planned, MAP_SHARES.gapList, 'planned_more');
  const todo = share(map.gaps.todo, MAP_SHARES.gapList, 'todo_more');
  const empty = share(map.gaps.emptyActs, MAP_SHARES.gapList, 'emptyActs_more');
  return {
    kind: map.kind,
    status: map.status,
    title,
    ...(cut.any ? { title_cut: true } : {}),
    writer:
      map.writer === null
        ? null
        : { name: clip(map.writer.name, MAP_TEXT.name), initials: clip(map.writer.initials, 40) },
    greeting: map.greeting,
    logline: map.logline === null ? null : clip(map.logline, MAP_TEXT.line),
    explain: map.explain,
    draftLabel: map.draftLabel,
    shortId: map.shortId,
    updated: map.updated,
    facts: map.facts,
    axis: map.axis,
    lanes: map.lanes,
    split: map.split,
    pace: clip(map.pace, MAP_TEXT.line),
    characters: characters.kept,
    ...characters.extra,
    pairs: map.pairs,
    places: map.places.map((p) => ({ ...p, name: clip(p.name, MAP_TEXT.place) })),
    placesMore: map.placesMore,
    quotes: quotes.kept,
    ...quotes.extra,
    threads: threads.kept,
    ...threads.extra,
    gaps: {
      ...map.gaps,
      planned: planned.kept,
      ...planned.extra,
      todo: todo.kept,
      ...todo.extra,
      emptyActs: empty.kept,
      ...empty.extra,
      sentence: clip(map.gaps.sentence, MAP_TEXT.line),
    },
    interval: map.interval,
    contact: null,
  };
}

/** The acts' scenes as pages are made of them: scenes in no act first, then each act's. */
function groupsOf(
  map: StoryMap,
): Array<{ act: StoryMap['acts'][number] | null; scenes: number[] }> {
  const inAct = new Set(map.acts.flatMap((act) => act.scenes));
  const loose = map.scenes.map((_, s) => s).filter((s) => !inAct.has(s));
  return [
    ...(loose.length > 0 || map.acts.length === 0 ? [{ act: null, scenes: loose }] : []),
    ...map.acts.map((act) => ({ act, scenes: act.scenes })),
  ];
}

/** An act on a page: its title cut to a limit, and its scenes on that page. */
function actOn(act: StoryMap['acts'][number], scenes: number[]) {
  const title = clipText(act.title, MAP_TEXT.line);
  return {
    ...act,
    title: title.text,
    ...(title.cut ? { title_cut: true } : {}),
    mood: act.mood === null ? null : clip(act.mood, MAP_TEXT.name),
    scenes,
  };
}

async function storyMapTool(args: MapInput, ctx: ToolContext): Promise<MapOutput> {
  const loaded = await load(args.script, ctx);
  if (loaded.kind === 'markdown')
    throw new Refusal('A story map is for a screenplay or a stage play.');
  const map =
    args.status === undefined || args.status === loaded.map.status
      ? loaded.map
      : mapOf(loaded, args.status, ctx.data.options.wordsPerMinute);

  const groups = groupsOf(map);
  const now = cursorBase('story_map', loaded, { script: args.script, status: args.status ?? null });
  let at = 0;
  let part = 0;
  let isRestart = false;
  if (args.cursor !== undefined) {
    const position = readCursor(ctx.data.key, args.cursor, now);
    const group = position === 'restart' ? undefined : groups[position.at];
    if (position === 'restart' || !group || (position.part ?? 0) > group.scenes.length)
      isRestart = true;
    else {
      at = position.at;
      part = position.part ?? 0;
    }
  }
  const first = at === 0 && part === 0;
  const head = first ? mapHead(map) : {};
  const longest = makeCursor(ctx.data.key, {
    ...now,
    at: Number.MAX_SAFE_INTEGER,
    part: Number.MAX_SAFE_INTEGER,
  });
  const budget = answerBudget();
  let used =
    JSON.stringify({
      about: ABOUT,
      ...head,
      acts: [],
      scenes: [],
      next: longest,
      restarted: true,
    }).length + 4;

  const acts: Array<Record<string, unknown>> = [];
  const scenes: Array<Record<string, unknown>> = [];
  let next: { at: number; part: number } | null = null;
  for (let g = at; g < groups.length; g++) {
    const group = groups[g] as (typeof groups)[number];
    const from = g === at ? part : 0;
    const items = group.scenes.slice(from).map((s) => boundedScene(map.scenes[s] as MapScene));
    const actCost = group.act ? itemCost(actOn(group.act, [])) : 0;
    const whole =
      actCost +
      items.reduce(
        (sum, item, k) => sum + itemCost(item) + String(group.scenes[from + k]).length + 1,
        0,
      );
    // A page holds whole acts; an act too long for a page of its own comes in parts.
    if (acts.length + scenes.length > 0 && used + whole > budget) {
      next = { at: g, part: from };
      break;
    }
    const onPage: number[] = [];
    used += actCost;
    let k = 0;
    for (; k < items.length; k++) {
      const item = items[k] as Record<string, unknown>;
      const cost = itemCost(item) + String(group.scenes[from + k]).length + 1;
      if (scenes.length > 0 && used + cost > budget) break;
      scenes.push(item);
      onPage.push(group.scenes[from + k] as number);
      used += cost;
    }
    if (group.act) acts.push(actOn(group.act, onPage));
    if (k < items.length) {
      next = { at: g, part: from + k };
      break;
    }
  }

  return {
    ...head,
    acts,
    scenes,
    ...(next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, ...next }) }),
    ...(isRestart ? { restarted: true as const } : {}),
  } as MapOutput;
}

export const storyMap: ToolDef<MapInput, MapOutput> = {
  name: 'story_map',
  title: 'Story map',
  description:
    'The Story map of one screenplay or stage play, as data (never the page itself, and never the writer’s contact): its acts, scenes (where and when, what happens, who is in it, planned and to-do marks), characters (screen time, share of the talking, scenes, hooks and ages from their introductions), places, picked lines, setups and payoffs, and what is still to be written. Indexes in it (a scene’s `chips`, a quote’s `character`, a character’s `signature`) count from 0 into its lists; when a list was too long for the page (`characters_more`, `quotes_more`), an index can point past what is shown. `status` finished leaves planned scenes out. A long script comes a few acts a page, an act too long for one page in parts: pass `next` back as `cursor`; everything but the acts and scenes is on the first page.',
  input: mapInput,
  output: mapOutput,
  run: storyMapTool,
};

// ---------------------------------------------------------------------------------------------
// series_overview

const seriesInput = z.strictObject({
  folder: path.optional(),
  scripts: z.array(path).min(1).max(SERIES_MAX).optional(),
});
type SeriesInput = z.infer<typeof seriesInput>;

const seriesOutput = z.object({
  scripts: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      pages: z.number(),
      minutes: z.number(),
      leads: z.array(z.string()),
    }),
  ),
  characters: z.array(
    z.object({
      name: z.string(),
      age: z.string().nullable(),
      appears: z.array(
        z.object({
          script: z.number().int(),
          scenes: z.array(z.number().int()),
          scenes_more: z.number().int().optional(),
        }),
      ),
    }),
  ),
  characters_more: z.number().int().optional(),
  looks_like: z.array(
    z.object({
      a: z.string(),
      b: z.string(),
      a_in: z.array(z.number().int()),
      b_in: z.array(z.number().int()),
    }),
  ),
  looks_like_more: z.number().int().optional(),
  places: z.array(
    z.object({
      name: z.string(),
      appears: z.array(z.object({ script: z.number().int(), scenes: z.number().int() })),
    }),
  ),
  places_more: z.number().int().optional(),
  skipped: z.array(z.object({ path: z.string(), why: z.string() })),
  skipped_more: z.number().int().optional(),
});
type SeriesOutput = z.infer<typeof seriesOutput>;

/** The share of what is left of a page, once the scripts are listed, each list may take. */
const SERIES_SHARES = { characters: 0.5, places: 0.2, looksLike: 0.15, skipped: 0.1 } as const;
/** The most scene numbers one character lists for one script. */
const SERIES_SCENES = 50;

export const TOO_MANY_SCRIPTS = 'That’s more than 30 scripts. Name them with scripts, in order.';
const A_DOCUMENT = 'a document, not a script';
const AN_EXPORT = 'an export; name it in scripts to read it';
const TOO_MUCH = 'past the 20 MB of scripts one call reads';

/** A script a series reads, or why it doesn't. */
type Planned = { path: string; size: number } | { path: string; why: string };

async function planSeries(args: SeriesInput, ctx: ToolContext): Promise<Planned[]> {
  const { roots, platform } = ctx.data;
  if (args.folder !== undefined && args.scripts !== undefined)
    throw new Refusal('Give a folder or a list of scripts, not both.');
  if (args.folder !== undefined) {
    const folder = await resolvePath(args.folder, roots, platform, 'folder');
    const { found } = await walk(folder, false, platform);
    const planned: Planned[] = found.map((file) =>
      file.format === 'markdown'
        ? { path: file.shown, why: A_DOCUMENT }
        : isExport(file.format)
          ? { path: file.shown, why: AN_EXPORT }
          : { path: file.shown, size: file.size },
    );
    if (planned.filter((p) => 'size' in p).length > SERIES_MAX) throw new Refusal(TOO_MANY_SCRIPTS);
    return planned;
  }
  if (args.scripts === undefined) throw new Refusal('Give a folder or a list of scripts.');
  const planned: Planned[] = [];
  // Each path is checked first: one that is wrong refuses the call, as any tool would.
  for (const script of args.scripts) {
    const file = await resolvePath(script, roots, platform, 'file');
    planned.push({ path: file.shown, size: file.size });
  }
  return planned;
}

/** Why a script couldn't be read, in the reader's words (never a path). */
function whyNot(error: unknown): string {
  // The reader's own words: a fixed phrase, or a file's name with what Drafter reads (never a path).
  if (error instanceof Refused) return error.message;
  if (error instanceof Refusal) return error.message;
  return 'Drafter couldn’t read it.';
}

async function series(args: SeriesInput, ctx: ToolContext): Promise<SeriesOutput> {
  const planned = await planSeries(args, ctx);
  const read: Script[] = [];
  const skipped: Array<{ path: string; why: string }> = [];
  let bytes = 0;
  for (const each of planned) {
    if ('why' in each) {
      skipped.push(each);
      continue;
    }
    if (bytes + each.size > readLimits().seriesBytes) {
      skipped.push({ path: each.path, why: TOO_MUCH });
      continue;
    }
    bytes += each.size;
    try {
      const loaded = await load(each.path, ctx);
      if (loaded.kind === 'markdown') skipped.push({ path: each.path, why: A_DOCUMENT });
      else read.push(loaded);
    } catch (error) {
      // Its path was checked already: what is left is a file that can't be read.
      skipped.push({ path: each.path, why: whyNot(error) });
    }
  }

  const name = (text: string) => clip(text, TEXT_LIMITS.name);
  const people = new Map<
    string,
    {
      name: string;
      ages: string[];
      /** Every scene, by script: capped when the answer is made. */
      appears: Array<{ script: number; scenes: number[] }>;
      first: number;
      scenes: number;
    }
  >();
  const places = new Map<
    string,
    {
      name: string;
      appears: Array<{ script: number; scenes: number }>;
      first: number;
      scenes: number;
    }
  >();
  let order = 0;
  const scripts = read.map((script, i) => {
    const n = i + 1;
    const { cast, map } = script;
    const hooks = hooksOf(script.doc, script.index);
    const castName = new Map(cast.characters.map((c) => [c.key, c.name]));
    for (const character of cast.characters) {
      const figures = cast.figures.get(character.key);
      const scenes = (figures?.scenes ?? []).map((p) => p.scene + 1);
      // NFC: É typed as one character or as two is the same name.
      const key = character.key.normalize('NFC');
      let person = people.get(key);
      if (!person) {
        person = { name: name(character.name), ages: [], appears: [], first: order++, scenes: 0 };
        people.set(key, person);
      }
      const found = hooks.get(character.key)?.age;
      const age = found ? clip(found, 50) : null;
      if (age && !person.ages.includes(age)) person.ages.push(age);
      const last = person.appears.at(-1);
      if (last?.script === n)
        // The same name in another Unicode form, in the same script: one character.
        last.scenes = [...new Set([...last.scenes, ...scenes])].sort((a, b) => a - b);
      else person.appears.push({ script: n, scenes });
      person.scenes += scenes.length;
    }
    for (const location of cast.locations.values()) {
      let place = places.get(location.key);
      if (!place) {
        place = { name: name(location.location), appears: [], first: order++, scenes: 0 };
        places.set(location.key, place);
      }
      place.appears.push({ script: n, scenes: location.scenes.length });
      place.scenes += location.scenes.length;
    }
    return {
      path: script.file.shown,
      title: clip(map.title, TEXT_LIMITS.name),
      pages: map.facts.pages,
      minutes: map.facts.minutes,
      leads: map.characters.slice(0, 3).map((c) => name(castName.get(c.key) ?? c.name)),
    };
  });

  // Most scripts first, then most scenes, then first seen.
  const byReach = <T extends { appears: unknown[]; scenes: number; first: number }>(a: T, b: T) =>
    b.appears.length - a.appears.length || b.scenes - a.scenes || a.first - b.first;
  const keyed = [...people.entries()].sort((a, b) => byReach(a[1], b[1]));
  const characters = keyed.map(([, p]) => ({
    name: p.name,
    age: p.ages.length === 0 ? null : p.ages.join(', '),
    appears: p.appears.map(({ script, scenes }) => ({
      script,
      scenes: scenes.slice(0, SERIES_SCENES),
      ...(scenes.length > SERIES_SCENES ? { scenes_more: scenes.length - SERIES_SCENES } : {}),
    })),
  }));
  const compared = keyed.slice(0, NEIGHBOUR_NAMES).map(([key]) => key);
  const pairs = neighbours(compared);
  const looksLike = pairs.slice(0, MAX_PAIRS).map(([a, b]) => {
    const pa = people.get(a) as NonNullable<ReturnType<typeof people.get>>;
    const pb = people.get(b) as NonNullable<ReturnType<typeof people.get>>;
    // The one seen first comes first.
    const [x, y] = pa.first <= pb.first ? [pa, pb] : [pb, pa];
    return {
      a: x.name,
      b: y.name,
      a_in: x.appears.map((s) => s.script),
      b_in: y.appears.map((s) => s.script),
    };
  });
  const placeList = [...places.values()]
    .sort(byReach)
    .map((p) => ({ name: p.name, appears: p.appears }));

  const room = Math.max(0, answerBudget() - JSON.stringify({ about: ABOUT, scripts }).length - 400);
  const kept = <T, K extends string>(
    items: readonly T[],
    part: number,
    more: K,
    all = items.length,
  ) => {
    const list = fitting(items, room * part);
    return {
      list,
      extra: (list.length < all ? { [more]: all - list.length } : {}) as Partial<Record<K, number>>,
    };
  };
  const c = kept(characters, SERIES_SHARES.characters, 'characters_more');
  const l = kept(looksLike, SERIES_SHARES.looksLike, 'looks_like_more', pairs.length);
  const p = kept(placeList, SERIES_SHARES.places, 'places_more');
  const s = kept(skipped, SERIES_SHARES.skipped, 'skipped_more');
  return {
    scripts,
    characters: c.list,
    ...c.extra,
    looks_like: l.list,
    ...l.extra,
    places: p.list,
    ...p.extra,
    skipped: s.list,
    ...s.extra,
  };
}

export const seriesOverview: ToolDef<SeriesInput, SeriesOutput> = {
  name: 'series_overview',
  title: 'Series overview',
  description:
    'Across the scripts of a series (a folder’s, in name order, or `scripts`, a list in the order you give, up to 30): each script’s title, pages, running time, and three leads; every character with the scripts and scenes they are in and their age where an introduction gives one (ages that differ between scripts are all listed, in order); names that look like spellings of each other (`looks_like`, never merged: Dale and Dell); and every place with the scripts it is in. Script numbers count from 1 in `scripts`. A folder’s documents and exports are skipped, and `skipped` says why. A field ending `_more` counts what didn’t fit.',
  input: seriesInput,
  output: seriesOutput,
  run: series,
};
