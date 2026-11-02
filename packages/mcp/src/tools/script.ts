// Reading one script (§3, tools 2–4): script_overview, read_scene, and character_lines. The
// writer's text comes back exactly as written, minus what §6 leaves out (visible.ts), and only
// ever inside JSON string values.
import { shares } from '@drafter/cast';
import type { Doc } from '@drafter/fountain';
import { lint } from '@drafter/lint';
import { wordsIn } from '@drafter/markdown';
import { bodyEnd, type Speech, startsScene } from '@drafter/outline';
import { openTodos, topSections } from '@drafter/story-map';
import * as z from 'zod/v4';
import { argsHash, type CursorAt, makeCursor, readCursor } from '../cursor';
import { ABOUT, type Include, type LeftOut } from '../envelope';
import { type Loaded, load, titleField } from '../load';
import { answerBudget, itemCost, pageOf, partsOf } from '../paging';
import { Refusal } from '../paths';
import { oneScene } from '../scenes';
import { visible, visibleMarkdown } from '../visible';
import type { ToolContext, ToolDef } from './index';
import { characterName, cursor, include, leftOut, path, restarted, sceneRef } from './schemas';

type Script = Extract<Loaded, { kind: 'script' }>;
type Markdown = Extract<Loaded, { kind: 'markdown' }>;

/** The scenes in one page of an overview, at most (then the size cap). */
export const OVERVIEW_SCENES = 150;
/** The most scenes one read_scene call reads. */
export const MAX_RUN = 10;

/** Two decimal places: minutes and pages without a float's tail. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const addLeftOut = (into: LeftOut, more: LeftOut) => {
  into.notes += more.notes;
  into.boneyard += more.boneyard;
};

/** Where the page asked for starts, or the beginning (restarted) for a cursor that isn't this call's. */
function startOf(
  ctx: ToolContext,
  given: string | undefined,
  now: Omit<CursorAt, 'at' | 'part'>,
  count: number,
): { at: number; part: number; restarted: boolean } {
  if (given === undefined) return { at: 0, part: 0, restarted: false };
  const position = readCursor(ctx.data.key, given, now);
  if (position === 'restart' || position.at >= count) return { at: 0, part: 0, restarted: true };
  return { at: position.at, part: position.part ?? 0, restarted: false };
}

/** What a cursor for this call is checked against: the tool, the file as it is, and the arguments. */
function cursorBase(tool: string, loaded: Loaded, args: object): Omit<CursorAt, 'at' | 'part'> {
  return {
    tool,
    path: loaded.file.shown,
    mtimeMs: loaded.file.mtimeMs,
    size: loaded.file.size,
    args: argsHash(args),
  };
}

/** The longest cursor an answer could carry, for its size. */
const longestCursor = (ctx: ToolContext, now: Omit<CursorAt, 'at' | 'part'>) =>
  makeCursor(ctx.data.key, { ...now, at: Number.MAX_SAFE_INTEGER, part: Number.MAX_SAFE_INTEGER });

/** A synopsis block's text through `visible`, without its `=`; null when nothing is left. */
function synopsisText(doc: Doc, block: number, include: Include): string | null {
  const span = doc.blocks[block]?.span;
  if (!span) return null;
  const text = visible(doc, span.from, span.to, include)
    .text.replace(/^\s*=\s*/, '')
    .trim();
  return text === '' ? null : text;
}

// ---------------------------------------------------------------------------------------------
// script_overview

const overviewInput = z.strictObject({
  script: path,
  include: include.optional(),
  cursor: cursor.optional(),
});
type OverviewInput = z.infer<typeof overviewInput>;

const overviewScene = z.object({
  n: z.number().int(),
  number: z.string().nullable(),
  heading: z.string(),
  place: z.string().nullable(),
  inside: z.enum(['inside', 'outside', 'both']).nullable(),
  time: z.string().nullable(),
  act: z.number().int().nullable(),
  page: z.number().int().nullable(),
  pages: z.number(),
  minutes: z.number(),
  synopsis: z.string().nullable(),
  who: z.array(z.string()),
});
type OverviewScene = z.infer<typeof overviewScene>;

const overviewCharacter = z.object({
  name: z.string(),
  speeches: z.number().int(),
  words: z.number().int(),
  share: z.number().int(),
  scenes: z.number().int(),
  first: z.number().int().nullable(),
  last: z.number().int().nullable(),
  absences: z.array(
    z.object({ after: z.number().int(), before: z.number().int(), pages: z.number() }),
  ),
  with: z.array(z.string()),
});

const overviewOutput = z.object({
  // A script.
  title_page: z.record(z.string(), z.string()).optional(),
  template: z.string().optional(),
  pages: z.number().optional(),
  minutes: z.number().optional(),
  acts: z
    .array(
      z.object({
        title: z.string(),
        synopsis: z.string().nullable(),
        scenes: z.array(z.number().int()),
      }),
    )
    .optional(),
  scenes: z.array(overviewScene).optional(),
  characters: z.array(overviewCharacter).optional(),
  places: z.array(z.object({ name: z.string(), scenes: z.number().int() })).optional(),
  /** Characters and places past what a page holds (the least first left out). */
  characters_more: z.number().int().optional(),
  places_more: z.number().int().optional(),
  gaps: z
    .object({
      empty_acts: z.array(z.number().int()),
      planned_scenes: z.array(z.number().int()),
      todos: z.number().int(),
      pages_to_write: z.number().nullable(),
    })
    .optional(),
  problems: z.number().int().optional(),
  // A Markdown document.
  title: z.string().nullable().optional(),
  sections: z
    .array(z.object({ n: z.number().int(), title: z.string(), words: z.number().int() }))
    .optional(),
  words: z.number().int().optional(),
  left_out: leftOut,
  next: z.string().optional(),
  restarted,
});
type OverviewOutput = z.infer<typeof overviewOutput>;

/** The share of a page the characters may take, and the places. */
const CHARACTERS_SHARE = 0.3;
const PLACES_SHARE = 0.2;

/** Items from the first, whole, while their JSON stays within `room` (always the first). */
const fitting = <T>(items: readonly T[], room: number): T[] => pageOf(items, 0, room, 0).items;

/** The title page's fields an overview shows, in this order; never Contact. */
const TITLE_KEYS = ['Title', 'Credit', 'Author', 'Authors', 'Source', 'Draft date'] as const;

function titlePageOf(doc: Doc): Record<string, string> {
  const shown: Record<string, string> = {};
  for (const key of TITLE_KEYS) {
    const present = doc.titlePage?.fields.some(
      (f) => f.key.trim().toLowerCase() === key.toLowerCase(),
    );
    if (present) shown[key] = titleField(doc, key.toLowerCase());
  }
  return shown;
}

/** An act's synopsis: the first under its heading, before its first scene or section. */
function actSynopsis(loaded: Script, block: number, include: Include): string | null {
  const { doc, template } = loaded;
  const end = bodyEnd(doc);
  for (let b = block + 1; b < end; b++) {
    const each = doc.blocks[b] as Doc['blocks'][number];
    if (each.kind === 'section' || startsScene(template, each)) return null;
    if (each.kind === 'synopsis') return synopsisText(doc, b, include);
  }
  return null;
}

/** Scenes, a page at a time: at most OVERVIEW_SCENES, and within the size cap. */
function pageOfScenes<T>(
  items: readonly T[],
  at: number,
  overhead: number,
): { items: T[]; next: number | null } {
  const limit = Math.min(at + OVERVIEW_SCENES, items.length);
  const page = pageOf(items.slice(0, limit), at, answerBudget(), overhead);
  return { items: page.items, next: page.next ?? (limit < items.length ? limit : null) };
}

/** A section's words, its heading's `#` marks aside. */
const sectionWords = (text: string) =>
  wordsIn(text.replace(/^ {0,3}#{1,3}(?=[ \t]|$)/, '').replace(/[ \t]+#+[ \t]*(?=\n|$)/, ''));

function markdownOverview(
  loaded: Markdown,
  args: OverviewInput,
  ctx: ToolContext,
  include: Include,
): OverviewOutput {
  const { text, sections } = loaded;
  const items = sections.map((section, i) => ({
    n: i + 1,
    title: section.title,
    words: sectionWords(visibleMarkdown(text, section.from, section.to)),
  }));
  const before = visibleMarkdown(text, 0, sections[0]?.from ?? text.length);
  const words = wordsIn(before) + items.reduce((sum, s) => sum + s.words, 0);
  const now = cursorBase('script_overview', loaded, { script: args.script, include });
  const start = startOf(ctx, args.cursor, now, items.length);
  const head = { title: loaded.title, words, left_out: { notes: 0, boneyard: 0 } };
  const overhead = JSON.stringify({
    about: ABOUT,
    ...head,
    sections: [],
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;
  const page = pageOfScenes(items, start.at, overhead);
  return {
    title: head.title,
    sections: page.items,
    words: head.words,
    left_out: head.left_out,
    ...(page.next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, at: page.next }) }),
    ...(start.restarted ? { restarted: true as const } : {}),
  };
}

async function overview(args: OverviewInput, ctx: ToolContext): Promise<OverviewOutput> {
  const loaded = await load(args.script, ctx);
  const include = ctx.include(args);
  if (loaded.kind === 'markdown') return markdownOverview(loaded, args, ctx, include);
  const { doc, index, cast, map, layout, template } = loaded;

  const scenes: OverviewScene[] = index.scenes.map((scene, s) => {
    const place = cast.places[s];
    const synopsis = scene.synopses[0];
    return {
      n: s + 1,
      number: scene.number,
      heading: scene.heading.trim(),
      place: place?.location ? place.location : null,
      inside: place && place.inside !== 'none' ? place.inside : null,
      time: place?.time ?? null,
      act: map.scenes[s]?.act ?? null,
      page: scene.pages?.page ?? null,
      pages: (scene.pages?.eighths ?? 0) / 8,
      minutes: round2(map.scenes[s]?.minutes ?? 0),
      synopsis: synopsis ? synopsisText(doc, synopsis.block, include) : null,
      who: (cast.inScene[s] ?? []).map(({ row }) => cast.characters[row]?.name ?? ''),
    };
  });

  const now = cursorBase('script_overview', loaded, { script: args.script, include });
  const start = startOf(ctx, args.cursor, now, scenes.length);
  const first = start.at === 0;

  const sections = topSections(index);
  const acts = map.acts.map((act, a) => {
    const section = sections[a];
    return {
      title: section ? section.title.trim() : act.title,
      synopsis: section ? actSynopsis(loaded, section.block, include) : null,
      scenes: act.scenes.map((s) => s + 1),
    };
  });

  const nameOf = new Map(cast.characters.map((c) => [c.key, c.name]));
  const percents = shares(cast.characters.map((c) => cast.figures.get(c.key)?.words ?? 0));
  const characters = first
    ? cast.characters.map((c, i) => {
        const f = cast.figures.get(c.key);
        return {
          name: c.name,
          speeches: f?.speeches ?? 0,
          words: f?.words ?? 0,
          share: percents[i] ?? 0,
          scenes: f?.scenes.length ?? 0,
          first: f?.first == null ? null : f.first + 1,
          last: f?.last == null ? null : f.last + 1,
          absences: (f?.absences ?? []).map((gap) => ({
            after: gap.from.scene + 1,
            before: gap.to.scene + 1,
            pages: gap.to.page - gap.from.page,
          })),
          with: (f?.sharedWith ?? []).slice(0, 3).map((w) => nameOf.get(w.key) ?? w.key),
        };
      })
    : undefined;
  // Most scenes first, then in the cast's key order.
  const places = first
    ? [...cast.locations.values()]
        .map((l) => ({ name: l.location, scenes: l.scenes.length }))
        .sort((a, b) => b.scenes - a.scenes)
    : undefined;
  // Whole on the first page while they fit their share of it; past that, the most important
  // first and a count of the rest, so the page stays under the cap.
  const keptCharacters = characters && fitting(characters, answerBudget() * CHARACTERS_SHARE);
  const keptPlaces = places && fitting(places, answerBudget() * PLACES_SHARE);

  const tail = map.gaps.tail;
  const head = {
    title_page: titlePageOf(doc),
    template: template.id,
    pages: map.facts.pages,
    minutes: map.facts.minutes,
    acts,
    ...(characters && keptCharacters ? { characters: keptCharacters } : {}),
    ...(characters && keptCharacters && keptCharacters.length < characters.length
      ? { characters_more: characters.length - keptCharacters.length }
      : {}),
    ...(places && keptPlaces ? { places: keptPlaces } : {}),
    ...(places && keptPlaces && keptPlaces.length < places.length
      ? { places_more: places.length - keptPlaces.length }
      : {}),
    gaps: {
      empty_acts: map.gaps.emptyActs,
      planned_scenes: map.gaps.planned,
      todos: openTodos(doc),
      pages_to_write: tail ? round2(tail.to - tail.from) : null,
    },
    problems: lint(doc, template).length + doc.diagnostics.length + layout.diagnostics.length,
    left_out: visible(doc, 0, doc.source.length, include).leftOut,
  };
  const overhead = JSON.stringify({
    about: ABOUT,
    ...head,
    scenes: [],
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;
  const page = pageOfScenes(scenes, start.at, overhead);
  return {
    title_page: head.title_page,
    template: head.template,
    pages: head.pages,
    minutes: head.minutes,
    acts: head.acts,
    scenes: page.items,
    ...(head.characters ? { characters: head.characters } : {}),
    ...(head.characters_more ? { characters_more: head.characters_more } : {}),
    ...(head.places ? { places: head.places } : {}),
    ...(head.places_more ? { places_more: head.places_more } : {}),
    gaps: head.gaps,
    problems: head.problems,
    left_out: head.left_out,
    ...(page.next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, at: page.next }) }),
    ...(start.restarted ? { restarted: true as const } : {}),
  };
}

export const scriptOverview: ToolDef<OverviewInput, OverviewOutput> = {
  name: 'script_overview',
  title: 'Script overview',
  description:
    'The shape of one script: its title page (never the contact), template, pages, and running time; its acts with their synopses; every scene with its heading, place, time of day, act, page, length, synopsis, and who is in it; every character’s speeches, words, share of the talking, scenes, long absences, and who they are most often with; its places; what is still to be written; and a count of problems. For a Markdown document, its title and sections. Notes and the boneyard are left out unless include asks for them. Pass `next` back as `cursor` for more scenes.',
  input: overviewInput,
  output: overviewOutput,
  run: overview,
};

// ---------------------------------------------------------------------------------------------
// read_scene

const readInput = z.strictObject({
  script: path,
  scene: sceneRef,
  through: sceneRef.optional(),
  include: include.optional(),
  cursor: cursor.optional(),
});
type ReadInput = z.infer<typeof readInput>;

const readItem = z.object({
  n: z.number().int(),
  number: z.string().nullable(),
  heading: z.string(),
  place: z.string().nullable(),
  time: z.string().nullable(),
  act: z.number().int().nullable(),
  page: z.number().int().nullable(),
  minutes: z.number().nullable(),
  who: z.array(z.string()),
  text: z.string(),
  part: z.number().int().optional(),
  parts: z.number().int().optional(),
});
type ReadItem = z.infer<typeof readItem>;

const readOutput = z.object({
  scenes: z.array(readItem),
  left_out: leftOut,
  next: z.string().optional(),
  restarted,
});
type ReadOutput = z.infer<typeof readOutput>;

/** "Scene 5 comes before scene 2." for a run or a range given backwards. */
const backwards = (first: number, last: number, what: string) =>
  new Refusal(
    `${what} ${last} comes before ${what.toLowerCase()} ${first}. Give the earlier one first.`,
  );

function sceneItem(loaded: Loaded, n: number, include: Include): { item: ReadItem; left: LeftOut } {
  if (loaded.kind === 'markdown') {
    const section = loaded.sections[n - 1] as Markdown['sections'][number];
    return {
      item: {
        n,
        number: null,
        heading: section.title,
        place: null,
        time: null,
        act: null,
        page: null,
        minutes: null,
        who: [],
        text: visibleMarkdown(loaded.text, section.from, section.to),
      },
      left: { notes: 0, boneyard: 0 },
    };
  }
  const { doc, index, cast, map } = loaded;
  const scene = index.scenes[n - 1] as Script['index']['scenes'][number];
  const place = cast.places[n - 1];
  const shown = visible(doc, scene.span.from, scene.span.to, include);
  return {
    item: {
      n,
      number: scene.number,
      heading: scene.heading.trim(),
      place: place?.location ? place.location : null,
      time: place?.time ?? null,
      act: map.scenes[n - 1]?.act ?? null,
      page: scene.pages?.page ?? null,
      minutes: round2(map.scenes[n - 1]?.minutes ?? 0),
      who: (cast.inScene[n - 1] ?? []).map(({ row }) => cast.characters[row]?.name ?? ''),
      text: shown.text,
    },
    left: shown.leftOut,
  };
}

async function readRun(args: ReadInput, ctx: ToolContext): Promise<ReadOutput> {
  const loaded = await load(args.script, ctx);
  const include = ctx.include(args);
  const first = oneScene(loaded, args.scene);
  const last = args.through === undefined ? first : oneScene(loaded, args.through);
  if (last < first) throw backwards(first, last, 'Scene');
  if (last - first + 1 > MAX_RUN) throw new Refusal('Ask for at most 10 scenes at once.');

  const items: ReadItem[] = [];
  const left: LeftOut = { notes: 0, boneyard: 0 };
  for (let n = first; n <= last; n++) {
    const one = sceneItem(loaded, n, include);
    items.push(one.item);
    addLeftOut(left, one.left);
  }

  const now = cursorBase('read_scene', loaded, {
    script: args.script,
    scene: first,
    through: last,
    include,
  });
  const start = startOf(ctx, args.cursor, now, items.length);
  const budget = answerBudget();
  const overhead = JSON.stringify({
    about: ABOUT,
    scenes: [],
    left_out: left,
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;

  let page: ReadItem[];
  let next: { at: number; part?: number } | null;
  const item = items[start.at] as ReadItem;
  if (start.part > 0 || overhead + 2 + itemCost(item) > budget) {
    // One scene too large for a page: in parts, a page each, whole lines while they fit.
    const shell = {
      ...item,
      text: '',
      part: Number.MAX_SAFE_INTEGER,
      parts: Number.MAX_SAFE_INTEGER,
    };
    const room = Math.max(6, budget - overhead - 2 - itemCost(shell));
    const parts = partsOf(item.text, room);
    const part = start.part < parts.length ? start.part : 0;
    page = [{ ...item, text: parts[part] as string, part: part + 1, parts: parts.length }];
    next =
      part + 1 < parts.length
        ? { at: start.at, part: part + 1 }
        : start.at + 1 < items.length
          ? { at: start.at + 1 }
          : null;
  } else {
    const whole = pageOf(items, start.at, budget, overhead);
    page = whole.items;
    next = whole.next === null ? null : { at: whole.next };
  }
  return {
    scenes: page,
    left_out: left,
    ...(next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, ...next }) }),
    ...(start.restarted ? { restarted: true as const } : {}),
  };
}

export const readScene: ToolDef<ReadInput, ReadOutput> = {
  name: 'read_scene',
  title: 'Read a scene',
  description:
    'One scene as the writer wrote it, or a run of up to 10 (`through`, a later scene), with each scene’s heading, place, time of day, act, page, minutes, and who is in it. Name a scene by its place in order (`7`), its written scene number (`7A`), or words from its heading (`radio room`). Notes and the boneyard are left out unless include asks for them. A scene too long for one answer comes in parts: pass `next` back as `cursor`.',
  input: readInput,
  output: readOutput,
  run: readRun,
};

// ---------------------------------------------------------------------------------------------
// character_lines

const linesInput = z.strictObject({
  script: path,
  character: characterName,
  from: sceneRef.optional(),
  to: sceneRef.optional(),
  include: include.optional(),
  cursor: cursor.optional(),
});
type LinesInput = z.infer<typeof linesInput>;

const speechItem = z.object({
  scene: z.number().int().nullable(),
  extension: z.string().nullable(),
  dual: z.boolean(),
  lines: z.array(z.object({ kind: z.enum(['parenthetical', 'dialogue']), text: z.string() })),
});
type SpeechItem = z.infer<typeof speechItem>;

const linesOutput = z.object({
  character: z.object({
    name: z.string(),
    speeches: z.number().int(),
    words: z.number().int(),
    share: z.number().int(),
    scenes: z.number().int(),
    first: z.number().int().nullable(),
    last: z.number().int().nullable(),
  }),
  speeches: z.array(speechItem),
  left_out: leftOut,
  next: z.string().optional(),
  restarted,
});
type LinesOutput = z.infer<typeof linesOutput>;

/** A name as the cast keys it: upper case, without a leading `@`, a trailing `^`, or `(…)` extensions. */
export function castKey(name: string): string {
  let key = name.trim();
  if (key.startsWith('@')) key = key.slice(1);
  for (;;) {
    const before = key;
    key = key
      .replace(/\s*\^$/, '')
      .replace(/\s*\([^()]*\)$/, '')
      .trim();
    if (key === before) break;
  }
  return key.toUpperCase();
}

/** Edits between two names, counted by code point. */
function distance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let row = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const next = [i];
    for (let j = 1; j <= y.length; j++)
      next[j] = Math.min(
        (row[j] as number) + 1,
        (next[j - 1] as number) + 1,
        (row[j - 1] as number) + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[y.length] as number;
}

/** The five names nearest a name nobody speaks, nearest first, then in the cast's order. */
function nearest(loaded: Script, key: string): string[] {
  return loaded.cast.characters
    .map((c, i) => ({ name: c.name, d: distance(key, c.key), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, 5)
    .map((c) => c.name);
}

const SPOKEN = new Set(['parenthetical', 'dialogue']);

/** Every speech in the script once, with the scene it is in (1-based; null outside a scene). */
function allSpeeches(loaded: Script): Array<{ speech: Speech; scene: number | null }> {
  const { index } = loaded;
  const out: Array<{ speech: Speech; scene: number | null }> = [];
  for (const speech of index.opening?.speeches ?? []) out.push({ speech, scene: null });
  for (const item of index.items)
    for (const speech of item.speeches)
      out.push({ speech, scene: item.kind === 'scene' ? item.ordinal : null });
  return out.sort((a, b) => a.speech.block - b.speech.block);
}

function speechOf(
  loaded: Script,
  speech: Speech,
  scene: number | null,
  include: Include,
): { item: SpeechItem; left: LeftOut } {
  const { doc } = loaded;
  const end = bodyEnd(doc);
  const cue = doc.blocks[speech.block] as Doc['blocks'][number];
  const left: LeftOut = { notes: 0, boneyard: 0 };
  const lines: SpeechItem['lines'] = [];
  let b = speech.block + 1;
  let lastSpoken = speech.block;
  for (; b < end; b++) {
    const block = doc.blocks[b] as Doc['blocks'][number];
    if (block.kind === 'parenthetical' || block.kind === 'dialogue') {
      const shown = visible(doc, block.span.from, block.span.to, include);
      addLeftOut(left, shown.leftOut);
      lines.push({ kind: block.kind, text: shown.text });
      lastSpoken = b;
    } else if (block.kind !== 'note' && block.kind !== 'boneyard') break;
  }
  const after = doc.blocks[lastSpoken + 1];
  const extension = cue.kind === 'character' ? cue.sem.extension : null;
  const dual =
    (cue.kind === 'character' && cue.sem.dual) ||
    (after?.kind === 'character' &&
      after.sem.dual &&
      SPOKEN.has(doc.blocks[lastSpoken]?.kind ?? ''));
  return { item: { scene, extension, dual, lines }, left };
}

async function linesOf(args: LinesInput, ctx: ToolContext): Promise<LinesOutput> {
  const loaded = await load(args.script, ctx);
  if (loaded.kind === 'markdown')
    throw new Refusal(
      'A document has no characters. character_lines reads a screenplay or a stage play.',
    );
  const include = ctx.include(args);
  const key = castKey(args.character);
  const row = loaded.cast.characters.findIndex((c) => c.key === key);
  const character = loaded.cast.characters[row];
  const figures = character ? loaded.cast.figures.get(character.key) : undefined;
  if (!character || !figures) {
    const refusal = new Refusal(`No one called ${args.character.trim()} speaks in this script.`);
    refusal.extra = { names: nearest(loaded, key) };
    throw refusal;
  }

  const ranged = args.from !== undefined || args.to !== undefined;
  const from = args.from === undefined ? 1 : oneScene(loaded, args.from);
  const to = args.to === undefined ? loaded.index.scenes.length : oneScene(loaded, args.to);
  if (to < from) throw backwards(from, to, 'Scene');

  const left: LeftOut = { notes: 0, boneyard: 0 };
  const items: SpeechItem[] = [];
  for (const { speech, scene } of allSpeeches(loaded)) {
    if (speech.name.toUpperCase() !== key) continue;
    if (ranged && (scene === null || scene < from || scene > to)) continue;
    const one = speechOf(loaded, speech, scene, include);
    items.push(one.item);
    addLeftOut(left, one.left);
  }

  const percents = shares(
    loaded.cast.characters.map((c) => loaded.cast.figures.get(c.key)?.words ?? 0),
  );
  const head = {
    character: {
      name: character.name,
      speeches: figures.speeches,
      words: figures.words,
      share: percents[row] ?? 0,
      scenes: figures.scenes.length,
      first: figures.first === null ? null : figures.first + 1,
      last: figures.last === null ? null : figures.last + 1,
    },
    left_out: left,
  };
  const now = cursorBase('character_lines', loaded, {
    script: args.script,
    character: key,
    from: ranged ? from : null,
    to: ranged ? to : null,
    include,
  });
  const start = startOf(ctx, args.cursor, now, items.length);
  const overhead = JSON.stringify({
    about: ABOUT,
    ...head,
    speeches: [],
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;
  const page = pageOf(items, start.at, answerBudget(), overhead);
  return {
    character: head.character,
    speeches: page.items,
    left_out: head.left_out,
    ...(page.next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, at: page.next }) }),
    ...(start.restarted ? { restarted: true as const } : {}),
  };
}

export const characterLines: ToolDef<LinesInput, LinesOutput> = {
  name: 'character_lines',
  title: 'A character’s lines',
  description:
    'Every speech of one character, in order: its scene, extension (V.O., O.S.…), parentheticals, and dialogue, with dual dialogue marked; and the character’s speeches, words, share of the talking, scenes, and first and last scene. Name the character in any case, with or without an extension. `from` and `to` (scenes) narrow it. Notes are left out unless include asks for them. Pass `next` back as `cursor` for more.',
  input: linesInput,
  output: linesOutput,
  run: linesOf,
};
