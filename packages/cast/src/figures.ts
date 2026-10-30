import type { Doc } from '@drafter/fountain';
import { type SceneIndex, type Speech, structureStrip } from '@drafter/outline';
import type { Template } from '@drafter/templates';
import { type Absence, absencesOf } from './absences';
import { nameMap } from './names';
import { type Place, placeOf } from './place';
import { type IsWord, mentions, type Presence, sceneBlocks } from './presence';

// The cast and every figure of the seeing-the-script design §3.5 and §3.6, from the scene index
// (speeches, words, pages), the parse (the action's names, the headings), and the dictionary's
// answers. One pass over the speeches, one scan of each scene's action, then sums.

/** A speaking character. */
export interface Character {
  /** The name in capitals: names that differ only in case are one character. */
  key: string;
  /** As first typed: a forced `@McCLANE` keeps its capitals. */
  name: string;
  /** 0 for the first to have a cue, 1 for the next, and so on. */
  order: number;
}

export interface CharacterFigures {
  character: Character;
  /** The scenes they are in, in order, speaking or silent: the very (frozen) array in `Cast.byScene`. */
  scenes: readonly Presence[];
  /** The scenes they speak in. */
  speaksIn: number;
  /** Every cue of theirs, before the first scene and in sections' own stretches too. */
  speeches: number;
  words: number;
  /** Their words over everyone's, 0 to 1; the shares add up to 1 when anyone says a word (Call 10). */
  share: number;
  /** The eighths of every scene they are in; null until the pages are ready. */
  screenEighths: number | null;
  /** Their first and last scene's index; null when no scene has them. */
  first: number | null;
  last: number | null;
  /** Every gap of `LONG_ABSENCE_PAGES` or more between their scenes; null without pages. */
  absences: Absence[] | null;
  /** Their largest gap, whatever its length; null without pages or without a gap. */
  longest: Absence | null;
  /** Everyone they share a scene with, most scenes first, ties to more speeches; the first three are "most often with". */
  sharedWith: Array<{ key: string; scenes: number }>;
  /** The locations of their scenes, most scenes first, ties to the first visited. */
  locations: Array<{ key: string; scenes: number }>;
}

export interface LocationFigures {
  key: string;
  /** As first typed. */
  location: string;
  /** Its scenes' indexes, in order. */
  scenes: number[];
  /** Their eighths; null until the pages are ready. */
  eighths: number | null;
  inside: Record<Place['inside'], number>;
  /** Its scenes by time of day, in capitals as `TIMES_OF_DAY` has it; only the times used. */
  times: Record<string, number>;
  /** Everyone in its scenes, most scenes first, then most scenes spoken in, then the Characters table's order. */
  people: Array<{ key: string; scenes: number; speaksIn: number }>;
}

/** One character in one scene: `row` is their place in `Cast.characters`. */
export interface InScene {
  row: number;
  presence: Presence;
}

/**
 * The cast. Its lists of presences are frozen, and shared: a character's `figures.scenes` is their
 * `byScene` row, and `inScene` holds the same `Presence` objects, so a view never copies them.
 */
export interface Cast {
  /** In the Characters table's order: most speeches first, then most words, then first to speak. */
  characters: Character[];
  /** Per character (as `characters`), the scenes they are in, by scene index. */
  byScene: ReadonlyArray<readonly Presence[]>;
  /** Per scene, the characters in it, in the order of `characters`. */
  inScene: ReadonlyArray<readonly InScene[]>;
  /** Per scene. */
  places: Place[];
  figures: Map<string, CharacterFigures>;
  /** By key, in key order, so a place and the places inside it (`HOUSE`, `HOUSE - KITCHEN`) sit together. */
  locations: Map<string, LocationFigures>;
  /** Each scene in which someone is first seen, and their keys, in the order of `characters`. */
  firstIn: Map<number, string[]>;
}

interface Tally {
  key: string;
  name: string;
  order: number;
  speeches: number;
  words: number;
}

/** Every speech in the script once: the opening's, each section's own, and each scene's, in order. */
function allSpeeches(index: SceneIndex): Speech[][] {
  const units: Speech[][] = [];
  if (index.opening) units.push(index.opening.speeches);
  for (const item of index.items) units.push(item.speeches);
  return units;
}

/**
 * The cast of a script and every figure of it. `perPage` is the layout's lines per page
 * (`linesPerPage`), or null until the pages are ready; `isWord` answers whether a name is an
 * ordinary word (design §3.3).
 */
export function castOf(
  index: SceneIndex,
  doc: Doc,
  template: Template,
  perPage: number | null,
  isWord: IsWord,
): Cast {
  // The cast: every name with a cue, and what each says.
  const tallies = new Map<string, Tally>();
  for (const unit of allSpeeches(index)) {
    for (const speech of unit) {
      const key = speech.name.toUpperCase();
      let tally = tallies.get(key);
      if (!tally) {
        tally = { key, name: speech.name, order: tallies.size, speeches: 0, words: 0 };
        tallies.set(key, tally);
      }
      tally.speeches++;
      tally.words += speech.words;
    }
  }
  const sorted = [...tallies.values()].sort(
    (a, b) => b.speeches - a.speeches || b.words - a.words || a.order - b.order,
  );
  const characters: Character[] = sorted.map(({ key, name, order }) => ({ key, name, order }));
  const row = new Map(characters.map((c, i) => [c.key, i]));
  const names = nameMap(characters.map((c) => ({ name: c.name, word: isWord(c.name) !== false })));

  // Who is in each scene.
  const byScene: Presence[][] = characters.map(() => []);
  /** Per scene, the characters in it, in row order. */
  const present: InScene[][] = [];
  const blocks = sceneBlocks(index, doc);
  index.scenes.forEach((scene, s) => {
    const cells = new Map<number, Presence>();
    for (const speech of scene.speeches) {
      const r = row.get(speech.name.toUpperCase()) as number;
      let cell = cells.get(r);
      if (!cell) {
        cell = { scene: s, speaking: true, speeches: 0, words: 0, firstMention: null };
        cells.set(r, cell);
      }
      cell.speeches++;
      cell.words += speech.words;
    }
    const [from, to] = blocks[s] ?? [0, 0];
    for (const [r, at] of mentions(doc, from, to, names)) {
      const cell = cells.get(r);
      if (cell) cell.firstMention = at;
      else cells.set(r, { scene: s, speaking: false, speeches: 0, words: 0, firstMention: at });
    }
    const here = [...cells]
      .sort(([a], [b]) => a - b)
      .map(([r, presence]) => Object.freeze({ row: r, presence: Object.freeze(presence) }));
    for (const { row: r, presence } of here) byScene[r]?.push(presence);
    present.push(Object.freeze(here) as InScene[]);
  });
  for (const scenes of byScene) Object.freeze(scenes);

  const places = index.scenes.map((scene) => placeOf(scene, doc, template));
  const strip = structureStrip(index, perPage);
  const sceneSpans = strip.rows.at(-1)?.blocks ?? [];
  const paged = strip.unit === 'pages' && index.scenes.every((scene) => scene.pages !== null);
  const eighthsOf = (s: number) => index.scenes[s]?.pages?.eighths ?? 0;

  // Who shares scenes with whom: one count per pair in each scene.
  const shared: Array<Map<number, number>> = characters.map(() => new Map());
  for (const here of present) {
    for (const { row: a } of here) {
      const counts = shared[a] as Map<number, number>;
      for (const { row: b } of here) if (a !== b) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
  }

  const totalWords = sorted.reduce((sum, t) => sum + t.words, 0);
  const figures = new Map<string, CharacterFigures>();
  const firstIn = new Map<number, string[]>();
  characters.forEach((character, r) => {
    const tally = sorted[r] as Tally;
    const scenes = byScene[r] as readonly Presence[];
    const first = scenes[0]?.scene ?? null;
    if (first !== null) {
      const list = firstIn.get(first) ?? [];
      list.push(character.key);
      firstIn.set(first, list);
    }
    const gaps = paged ? absencesOf(scenes, sceneSpans, index.scenes) : null;
    const visits = new Map<string, number>();
    for (const p of scenes) {
      const key = places[p.scene]?.key;
      if (key) visits.set(key, (visits.get(key) ?? 0) + 1);
    }
    figures.set(character.key, {
      character,
      scenes,
      speaksIn: scenes.reduce((n, p) => n + (p.speaking ? 1 : 0), 0),
      speeches: tally.speeches,
      words: tally.words,
      share: totalWords > 0 ? tally.words / totalWords : 0,
      screenEighths: paged ? scenes.reduce((n, p) => n + eighthsOf(p.scene), 0) : null,
      first,
      last: scenes.at(-1)?.scene ?? null,
      absences: gaps?.long ?? null,
      longest: gaps?.longest ?? null,
      sharedWith: [...(shared[r] as Map<number, number>)]
        .sort(
          ([a, x], [b, y]) =>
            y - x ||
            (sorted[b] as Tally).speeches - (sorted[a] as Tally).speeches ||
            (sorted[a] as Tally).order - (sorted[b] as Tally).order,
        )
        .map(([other, count]) => ({ key: (characters[other] as Character).key, scenes: count })),
      // A Map keeps first-visit order, and the sort is stable.
      locations: [...visits]
        .sort(([, x], [, y]) => y - x)
        .map(([key, count]) => ({ key, scenes: count })),
    });
  });
  // Scenes in order, so firstIn is too.
  const firstInOrdered = new Map([...firstIn].sort(([a], [b]) => a - b));

  return {
    characters,
    byScene: Object.freeze(byScene),
    inScene: Object.freeze(present),
    places,
    figures,
    locations: locationFigures(places, present, characters, paged ? eighthsOf : null),
    firstIn: firstInOrdered,
  };
}

/** Each location's scenes, length, inside and outside split, times, and people. */
function locationFigures(
  places: readonly Place[],
  present: ReadonlyArray<readonly InScene[]>,
  characters: readonly Character[],
  eighthsOf: ((scene: number) => number) | null,
): Map<string, LocationFigures> {
  const found = new Map<string, LocationFigures & { rows: Map<number, [number, number]> }>();
  places.forEach((place, s) => {
    if (!place.key || place.location === null) return;
    let figures = found.get(place.key);
    if (!figures) {
      figures = {
        key: place.key,
        location: place.location,
        scenes: [],
        eighths: eighthsOf ? 0 : null,
        inside: { inside: 0, outside: 0, both: 0, none: 0 },
        times: {},
        people: [],
        rows: new Map(),
      };
      found.set(place.key, figures);
    }
    figures.scenes.push(s);
    if (figures.eighths !== null && eighthsOf) figures.eighths += eighthsOf(s);
    figures.inside[place.inside]++;
    if (place.time !== null) {
      const time = place.time.toUpperCase().split(/\s+/).join(' ');
      figures.times[time] = (figures.times[time] ?? 0) + 1;
    }
    for (const { row: r, presence } of present[s] ?? []) {
      const counts = figures.rows.get(r) ?? [0, 0];
      counts[0]++;
      if (presence.speaking) counts[1]++;
      figures.rows.set(r, counts);
    }
  });
  const out = new Map<string, LocationFigures>();
  for (const key of [...found.keys()].sort()) {
    const { rows, ...figures } = found.get(key) as LocationFigures & {
      rows: Map<number, [number, number]>;
    };
    figures.people = [...rows]
      .sort(([a, [x, xs]], [b, [y, ys]]) => y - x || ys - xs || a - b)
      .map(([r, [scenes, speaksIn]]) => ({
        key: (characters[r] as Character).key,
        scenes,
        speaksIn,
      }));
    out.set(key, figures);
  }
  return out;
}
