// Reading one script (§3, tools 2–4): script_overview, read_scene, and character_lines. The
// writer's text comes back exactly as written, minus what §6 leaves out (visible.ts), and only
// ever inside JSON string values. Every answer stays under the cap (§7.3): a scene or a speech
// too long for a page comes in parts, and the short things around them (headings, names,
// synopses, lists) are bounded, cut at a code point and said to be cut when they are.
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
import { answerBudget, clipText, fitting, itemCost, pageOf, partsOf } from '../paging';
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

/**
 * The most a short piece of text may take in an answer, JSON-escaped: a name (a character, a
 * place, an extension, a written scene number), a heading or a title, a title page's value, a
 * synopsis, and a scene's list of who is in it.
 */
export const TEXT_LIMITS = {
  name: 200,
  heading: 1_000,
  titlePage: 500,
  synopsis: 2_000,
  who: 4_000,
} as const;

/** The share of a page each list on the overview's first page may take; past it, a count of the rest. */
const SHARES = { characters: 0.25, places: 0.15, acts: 0.1, gapList: 0.025 } as const;
/** The most scene numbers an act lists, and absences a character lists. */
const ACT_SCENES = 200;
const ABSENCES = 50;

/** Two decimal places: minutes and pages without a float's tail. */
const round2 = (n: number) => Math.round(n * 100) / 100;

const addLeftOut = (into: LeftOut, more: LeftOut) => {
  into.notes += more.notes;
  into.boneyard += more.boneyard;
};

/** A name within its limit (a name that long is cut at a code point). */
const nameOf = (name: string) => clipText(name, TEXT_LIMITS.name).text;

/** Where the page asked for starts, or the beginning (restarted) for a cursor that isn't this call's. */
export function startOf(
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
export function cursorBase(
  tool: string,
  loaded: Loaded,
  args: object,
): Omit<CursorAt, 'at' | 'part'> {
  return {
    tool,
    path: loaded.file.shown,
    mtimeMs: loaded.file.mtimeMs,
    size: loaded.file.size,
    args: argsHash(args),
  };
}

/** The longest cursor an answer could carry, for its size. */
export const longestCursor = (ctx: ToolContext, now: Omit<CursorAt, 'at' | 'part'>) =>
  makeCursor(ctx.data.key, { ...now, at: Number.MAX_SAFE_INTEGER, part: Number.MAX_SAFE_INTEGER });

/**
 * A page of items from `start`, whole while they fit; an item too large for a page alone comes
 * in parts (`split` makes them, each within the room it is given), a part a page. A part index
 * that doesn't exist (a stale cursor) starts again from the beginning.
 */
export function pageWithParts<T>(
  items: readonly T[],
  start: { at: number; part: number; restarted: boolean },
  overhead: number,
  split: (item: T, room: number) => T[],
): { page: T[]; next: { at: number; part?: number } | null; restarted: boolean } {
  if (items.length === 0) return { page: [], next: null, restarted: start.restarted };
  const budget = answerBudget();
  const from = (at: number, part: number) => {
    const item = items[at] as T;
    if (part > 0 || overhead + 2 + itemCost(item) > budget) {
      const parts = split(item, budget - overhead - 2);
      if (part >= parts.length) return null;
      const next =
        part + 1 < parts.length
          ? { at, part: part + 1 }
          : at + 1 < items.length
            ? { at: at + 1 }
            : null;
      return { page: [parts[part] as T], next };
    }
    const whole = pageOf(items, at, budget, overhead);
    return { page: whole.items, next: whole.next === null ? null : { at: whole.next } };
  };
  const got = from(start.at, start.part);
  if (got) return { ...got, restarted: start.restarted };
  return { ...(from(0, 0) as NonNullable<ReturnType<typeof from>>), restarted: true };
}

/** A synopsis block's text through `visible`, without its `=`; null when nothing is left. */
function synopsisText(doc: Doc, block: number, include: Include): string | null {
  const span = doc.blocks[block]?.span;
  if (!span) return null;
  const text = visible(doc, span.from, span.to, include)
    .text.replace(/^\s*=\s*/, '')
    .trim();
  return text === '' ? null : text;
}

/** A synopsis within its limit, and whether it was cut. */
function boundedSynopsis(text: string | null): { synopsis: string | null; synopsis_cut?: true } {
  if (text === null) return { synopsis: null };
  const clipped = clipText(text, TEXT_LIMITS.synopsis);
  return clipped.cut ? { synopsis: clipped.text, synopsis_cut: true } : { synopsis: text };
}

/** What every scene says of itself: its heading, place, time, and who is in it, each bounded. */
function sceneFacts(loaded: Script, s: number) {
  const { index, cast } = loaded;
  const scene = index.scenes[s] as Script['index']['scenes'][number];
  const place = cast.places[s];
  const heading = clipText(scene.heading.trim(), TEXT_LIMITS.heading);
  const names = (cast.inScene[s] ?? []).map(({ row }) => nameOf(cast.characters[row]?.name ?? ''));
  const who = fitting(names, TEXT_LIMITS.who);
  return {
    number: scene.number === null ? null : nameOf(scene.number),
    heading: heading.text,
    ...(heading.cut ? { heading_cut: true as const } : {}),
    place: place?.location ? clipText(place.location, TEXT_LIMITS.heading).text : null,
    inside: place && place.inside !== 'none' ? place.inside : null,
    time: place?.time ? clipText(place.time, TEXT_LIMITS.heading).text : null,
    who,
    ...(who.length < names.length ? { who_more: names.length - who.length } : {}),
  };
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
  /** The heading was longer than an answer holds: this is its start. */
  heading_cut: z.literal(true).optional(),
  place: z.string().nullable(),
  inside: z.enum(['inside', 'outside', 'both']).nullable(),
  time: z.string().nullable(),
  act: z.number().int().nullable(),
  page: z.number().int().nullable(),
  pages: z.number(),
  minutes: z.number(),
  synopsis: z.string().nullable(),
  synopsis_cut: z.literal(true).optional(),
  who: z.array(z.string()),
  who_more: z.number().int().optional(),
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
  absences_more: z.number().int().optional(),
  with: z.array(z.string()),
});

const overviewAct = z.object({
  title: z.string(),
  synopsis: z.string().nullable(),
  synopsis_cut: z.literal(true).optional(),
  scenes: z.array(z.number().int()),
  scenes_more: z.number().int().optional(),
});

const overviewOutput = z.object({
  // A script.
  title_page: z.record(z.string(), z.string()).optional(),
  /** A title page value was longer than an answer holds: its start is shown. */
  title_page_cut: z.literal(true).optional(),
  template: z.string().optional(),
  pages: z.number().optional(),
  minutes: z.number().optional(),
  acts: z.array(overviewAct).optional(),
  acts_more: z.number().int().optional(),
  scenes: z.array(overviewScene).optional(),
  characters: z.array(overviewCharacter).optional(),
  places: z.array(z.object({ name: z.string(), scenes: z.number().int() })).optional(),
  /** Characters and places past what a page holds (the least first left out). */
  characters_more: z.number().int().optional(),
  places_more: z.number().int().optional(),
  gaps: z
    .object({
      empty_acts: z.array(z.number().int()),
      empty_acts_more: z.number().int().optional(),
      planned_scenes: z.array(z.number().int()),
      planned_more: z.number().int().optional(),
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

/** The title page's fields an overview shows, in this order; never Contact. */
const TITLE_KEYS = ['Title', 'Credit', 'Author', 'Authors', 'Source', 'Draft date'] as const;

function titlePageOf(doc: Doc): { fields: Record<string, string>; cut: boolean } {
  const fields: Record<string, string> = {};
  let cut = false;
  for (const key of TITLE_KEYS) {
    const present = doc.titlePage?.fields.some(
      (f) => f.key.trim().toLowerCase() === key.toLowerCase(),
    );
    if (!present) continue;
    const value = clipText(titleField(doc, key.toLowerCase()), TEXT_LIMITS.titlePage);
    fields[key] = value.text;
    cut ||= value.cut;
  }
  return { fields, cut };
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

/** A list within its share of a page, and how many were left out (none: no field). */
function bounded<T, K extends string>(
  items: readonly T[],
  share: number,
  more: K,
): { kept: T[] } & Partial<Record<K, number>> {
  const kept = fitting(items, answerBudget() * share);
  return (kept.length < items.length ? { kept, [more]: items.length - kept.length } : { kept }) as {
    kept: T[];
  } & Partial<Record<K, number>>;
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
    title: clipText(section.title, TEXT_LIMITS.heading).text,
    words: sectionWords(visibleMarkdown(text, section.from, section.to)),
  }));
  const before = visibleMarkdown(text, 0, sections[0]?.from ?? text.length);
  const words = wordsIn(before) + items.reduce((sum, s) => sum + s.words, 0);
  const now = cursorBase('script_overview', loaded, { script: args.script, include });
  const start = startOf(ctx, args.cursor, now, items.length);
  const title = loaded.title === null ? null : clipText(loaded.title, TEXT_LIMITS.heading).text;
  const head = { title, words, left_out: { notes: 0, boneyard: 0 } };
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
    const facts = sceneFacts(loaded, s);
    const synopsis = scene.synopses[0];
    return {
      n: s + 1,
      number: facts.number,
      heading: facts.heading,
      ...(facts.heading_cut ? { heading_cut: true as const } : {}),
      place: facts.place,
      inside: facts.inside,
      time: facts.time,
      act: map.scenes[s]?.act ?? null,
      page: scene.pages?.page ?? null,
      pages: (scene.pages?.eighths ?? 0) / 8,
      minutes: round2(map.scenes[s]?.minutes ?? 0),
      ...boundedSynopsis(synopsis ? synopsisText(doc, synopsis.block, include) : null),
      who: facts.who,
      ...(facts.who_more ? { who_more: facts.who_more } : {}),
    };
  });

  const now = cursorBase('script_overview', loaded, { script: args.script, include });
  const start = startOf(ctx, args.cursor, now, scenes.length);
  const first = start.at === 0;

  const sections = topSections(index);
  const acts = bounded(
    map.acts.map((act, a) => {
      const section = sections[a];
      const numbers = act.scenes.map((s) => s + 1);
      return {
        title: clipText(section ? section.title.trim() : act.title, TEXT_LIMITS.heading).text,
        ...boundedSynopsis(section ? actSynopsis(loaded, section.block, include) : null),
        scenes: numbers.slice(0, ACT_SCENES),
        ...(numbers.length > ACT_SCENES ? { scenes_more: numbers.length - ACT_SCENES } : {}),
      };
    }),
    SHARES.acts,
    'acts_more',
  );

  const names = new Map(cast.characters.map((c) => [c.key, nameOf(c.name)]));
  const percents = shares(cast.characters.map((c) => cast.figures.get(c.key)?.words ?? 0));
  const characters = first
    ? bounded(
        cast.characters.map((c, i) => {
          const f = cast.figures.get(c.key);
          const absences = (f?.absences ?? []).map((gap) => ({
            after: gap.from.scene + 1,
            before: gap.to.scene + 1,
            pages: gap.to.page - gap.from.page,
          }));
          return {
            name: nameOf(c.name),
            speeches: f?.speeches ?? 0,
            words: f?.words ?? 0,
            share: percents[i] ?? 0,
            scenes: f?.scenes.length ?? 0,
            first: f?.first == null ? null : f.first + 1,
            last: f?.last == null ? null : f.last + 1,
            absences: absences.slice(0, ABSENCES),
            ...(absences.length > ABSENCES ? { absences_more: absences.length - ABSENCES } : {}),
            with: (f?.sharedWith ?? []).slice(0, 3).map((w) => names.get(w.key) ?? nameOf(w.key)),
          };
        }),
        SHARES.characters,
        'characters_more',
      )
    : undefined;
  // Most scenes first, then in the cast's key order.
  const places = first
    ? bounded(
        [...cast.locations.values()]
          .map((l) => ({ name: nameOf(l.location), scenes: l.scenes.length }))
          .sort((a, b) => b.scenes - a.scenes),
        SHARES.places,
        'places_more',
      )
    : undefined;

  const tail = map.gaps.tail;
  const emptyActs = bounded(map.gaps.emptyActs, SHARES.gapList, 'empty_acts_more');
  const planned = bounded(map.gaps.planned, SHARES.gapList, 'planned_more');
  const titlePage = titlePageOf(doc);
  const head = {
    title_page: titlePage.fields,
    ...(titlePage.cut ? { title_page_cut: true as const } : {}),
    template: template.id,
    pages: map.facts.pages,
    minutes: map.facts.minutes,
    acts: acts.kept,
    ...(acts.acts_more ? { acts_more: acts.acts_more } : {}),
    ...(characters ? { characters: characters.kept } : {}),
    ...(characters?.characters_more ? { characters_more: characters.characters_more } : {}),
    ...(places ? { places: places.kept } : {}),
    ...(places?.places_more ? { places_more: places.places_more } : {}),
    gaps: {
      empty_acts: emptyActs.kept,
      ...(emptyActs.empty_acts_more ? { empty_acts_more: emptyActs.empty_acts_more } : {}),
      planned_scenes: planned.kept,
      ...(planned.planned_more ? { planned_more: planned.planned_more } : {}),
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
  const { acts: actList, ...rest } = head;
  return {
    title_page: rest.title_page,
    ...(rest.title_page_cut ? { title_page_cut: true as const } : {}),
    template: rest.template,
    pages: rest.pages,
    minutes: rest.minutes,
    acts: actList,
    ...(rest.acts_more ? { acts_more: rest.acts_more } : {}),
    scenes: page.items,
    ...(rest.characters ? { characters: rest.characters } : {}),
    ...(rest.characters_more ? { characters_more: rest.characters_more } : {}),
    ...(rest.places ? { places: rest.places } : {}),
    ...(rest.places_more ? { places_more: rest.places_more } : {}),
    gaps: rest.gaps,
    problems: rest.problems,
    left_out: rest.left_out,
    ...(page.next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, at: page.next }) }),
    ...(start.restarted ? { restarted: true as const } : {}),
  };
}

export const scriptOverview: ToolDef<OverviewInput, OverviewOutput> = {
  name: 'script_overview',
  title: 'Script overview',
  description:
    'The shape of one script: its title page (never the contact), template, pages, and running time; its acts with their synopses; every scene with its heading, place, time of day, act, page, length, synopsis, and who is in it; every character’s speeches, words, share of the talking, scenes, long absences, and who they are most often with; its places; what is still to be written; and a count of problems. For a Markdown document, its title and sections. Notes and the boneyard are left out unless include asks for them. Pass `next` back as `cursor` for more scenes. A field ending `_cut` means its text was too long and only its start is shown; one ending `_more` counts what didn’t fit.',
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
  heading_cut: z.literal(true).optional(),
  place: z.string().nullable(),
  time: z.string().nullable(),
  act: z.number().int().nullable(),
  page: z.number().int().nullable(),
  minutes: z.number().nullable(),
  who: z.array(z.string()),
  who_more: z.number().int().optional(),
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
    const heading = clipText(section.title, TEXT_LIMITS.heading);
    return {
      item: {
        n,
        number: null,
        heading: heading.text,
        ...(heading.cut ? { heading_cut: true as const } : {}),
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
  const { doc, index, map } = loaded;
  const scene = index.scenes[n - 1] as Script['index']['scenes'][number];
  const facts = sceneFacts(loaded, n - 1);
  const shown = visible(doc, scene.span.from, scene.span.to, include);
  return {
    item: {
      n,
      number: facts.number,
      heading: facts.heading,
      ...(facts.heading_cut ? { heading_cut: true as const } : {}),
      place: facts.place,
      time: facts.time,
      act: map.scenes[n - 1]?.act ?? null,
      page: scene.pages?.page ?? null,
      minutes: round2(map.scenes[n - 1]?.minutes ?? 0),
      who: facts.who,
      ...(facts.who_more ? { who_more: facts.who_more } : {}),
      text: shown.text,
    },
    left: shown.leftOut,
  };
}

/** A scene's text in parts, each with the scene's facts, `part`, and `parts`. */
function sceneParts(item: ReadItem, room: number): ReadItem[] {
  const shell = {
    ...item,
    text: '',
    part: Number.MAX_SAFE_INTEGER,
    parts: Number.MAX_SAFE_INTEGER,
  };
  const texts = partsOf(item.text, Math.max(6, room - itemCost(shell)));
  return texts.map((text, i) => ({ ...item, text, part: i + 1, parts: texts.length }));
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
  const overhead = JSON.stringify({
    about: ABOUT,
    scenes: [],
    left_out: left,
    next: longestCursor(ctx, now),
    restarted: true,
  }).length;
  const page = pageWithParts(items, start, overhead, sceneParts);
  return {
    scenes: page.page,
    left_out: left,
    ...(page.next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, ...page.next }) }),
    ...(page.restarted ? { restarted: true as const } : {}),
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

const speechLine = z.object({
  kind: z.enum(['parenthetical', 'dialogue', 'note', 'boneyard']),
  text: z.string(),
  /** This carries on the line before it: a line too long for one part, cut between parts. */
  continues: z.literal(true).optional(),
});
type SpeechLine = z.infer<typeof speechLine>;

const speechItem = z.object({
  scene: z.number().int().nullable(),
  extension: z.string().nullable(),
  dual: z.boolean(),
  lines: z.array(speechLine),
  part: z.number().int().optional(),
  parts: z.number().int().optional(),
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
    .map((c, i) => ({ name: nameOf(c.name), d: distance(key, nameOf(c.key)), i }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, 5)
    .map((c) => c.name);
}

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

/**
 * A speech: its cue's extension, and its blocks through the last parenthetical or dialogue, each
 * through `visible`. A note or boneyard between them is counted when left out, shown when included.
 */
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
  const lines: SpeechLine[] = [];
  /** Notes and boneyard seen since the last spoken block: the speech's only if one follows. */
  let pending: SpeechLine[] = [];
  let pendingLeft: LeftOut = { notes: 0, boneyard: 0 };
  let lastSpoken = speech.block;
  for (let b = speech.block + 1; b < end; b++) {
    const block = doc.blocks[b] as Doc['blocks'][number];
    const shown = visible(doc, block.span.from, block.span.to, include);
    if (block.kind === 'parenthetical' || block.kind === 'dialogue') {
      lines.push(...pending, { kind: block.kind, text: shown.text });
      addLeftOut(left, pendingLeft);
      addLeftOut(left, shown.leftOut);
      pending = [];
      pendingLeft = { notes: 0, boneyard: 0 };
      lastSpoken = b;
    } else if (block.kind === 'note' || block.kind === 'boneyard') {
      if (shown.text.trim() !== '') pending.push({ kind: block.kind, text: shown.text });
      addLeftOut(pendingLeft, shown.leftOut);
    } else break;
  }
  const after = doc.blocks[lastSpoken + 1];
  const extension =
    cue.kind === 'character' && cue.sem.extension !== null ? nameOf(cue.sem.extension) : null;
  const dual =
    (cue.kind === 'character' && cue.sem.dual) ||
    (lastSpoken > speech.block && after?.kind === 'character' && after.sem.dual);
  return { item: { scene, extension, dual, lines }, left };
}

/**
 * A speech too long for one page, in parts: its lines in order, a part each while they fit, and a
 * line longer than a part cut between code points (its later pieces marked `continues`).
 */
function speechParts(item: SpeechItem, room: number): SpeechItem[] {
  const shell = {
    ...item,
    lines: [],
    part: Number.MAX_SAFE_INTEGER,
    parts: Number.MAX_SAFE_INTEGER,
  };
  const space = Math.max(16, room - itemCost(shell));
  const lineShell = itemCost({ kind: 'parenthetical', text: '', continues: true });
  const pieceRoom = Math.max(6, space - 2 - lineShell);
  const groups: SpeechLine[][] = [];
  let group: SpeechLine[] = [];
  let used = 2;
  for (const line of item.lines) {
    partsOf(line.text, pieceRoom).forEach((text, k) => {
      const entry: SpeechLine =
        k > 0 ? { kind: line.kind, text, continues: true } : { kind: line.kind, text };
      const cost = itemCost(entry);
      if (group.length > 0 && used + cost - 1 > space) {
        groups.push(group);
        group = [];
        used = 2;
      }
      group.push(entry);
      used += cost;
    });
  }
  groups.push(group);
  return groups.map((lines, i) => ({ ...item, lines, part: i + 1, parts: groups.length }));
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
    const refusal = new Refusal(
      `No one called ${nameOf(args.character.trim())} speaks in this script.`,
    );
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
      name: nameOf(character.name),
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
  const page = pageWithParts(items, start, overhead, speechParts);
  return {
    character: head.character,
    speeches: page.page,
    left_out: head.left_out,
    ...(page.next === null ? {} : { next: makeCursor(ctx.data.key, { ...now, ...page.next }) }),
    ...(page.restarted ? { restarted: true as const } : {}),
  };
}

export const characterLines: ToolDef<LinesInput, LinesOutput> = {
  name: 'character_lines',
  title: 'A character’s lines',
  description:
    'Every speech of one character, in order: its scene, extension (V.O., O.S.…), parentheticals, and dialogue, with dual dialogue marked; and the character’s speeches, words, share of the talking, scenes, and first and last scene. Name the character in any case, with or without an extension. `from` and `to` (scenes) narrow it. Notes are left out unless include asks for them. A speech too long for one answer comes in parts (a line cut between parts is marked `continues`). Pass `next` back as `cursor` for more.',
  input: linesInput,
  output: linesOutput,
  run: linesOf,
};
