// The story-map model (story-map design §3): a plain object of numbers, short strings, and
// indexes, which the renderer only draws. Everything the writer wrote is kept as typed here and
// escaped when it is drawn.

export type MapKind = 'screenplay' | 'play';
export type MapStatus = 'in-progress' | 'finished';
export type TimeKind = 'day' | 'night' | 'twilight';

export interface MapOptions {
  /** Null: the default from the gaps (design §6.4). */
  status: MapStatus | null;
  plannedPages: number | null;
  logline: string | null;
  /** "What I'm writing". */
  greeting: string;
  /** Null: hidden. */
  explain: string | null;
  include: { summaries: boolean; lines: boolean; threads: boolean; contact: boolean };
  contact: string | null;
  /** Edited hooks, by character key (design §4.2). */
  hooks: Readonly<Record<string, string>>;
  rates: { minutesPerPage: number; wordsPerMinute: number };
  /** `id`: 64 hex, or at least 7. */
  draft: { number: number; id: string };
  /** Ms since 1970. */
  updated: number | null;
  /** The export's title, else the file's name. */
  title: string;
}

export interface MapAct {
  /** 1, 2, 3… */
  n: number;
  /** The section's title without a leading "Act One:" label; may be empty. */
  title: string;
  mood: string | null;
  /** Indexes into `StoryMap.scenes`, in order. */
  scenes: number[];
  /** Its scenes' length, in pages (eighths over 8, unrounded). */
  pages: number;
  minutes: number;
  /** No scenes under it. */
  empty: boolean;
}

/** One character on stage in one scene: 0–1 shares of the scene's lines (Task 3). */
export interface StageLine {
  character: number;
  from: number;
  to: number;
}

export interface MapScene {
  /** The page's own 1, 2, 3, never a locked number. */
  n: number;
  /** The act's `n`; null when the script has no acts. */
  act: number | null;
  /** On the page axis, in pages. */
  from: number;
  to: number;
  minutes: number;
  /** In plain words ("Lighthouse, Lamp Room"); null when the heading names none. */
  place: string | null;
  /** A play's scene title (its `##` heading) when it names no place; null in a screenplay. */
  title: string | null;
  /** In plain words ("Night"); null for none, or for a time that takes the one before's. */
  time: string | null;
  timeKind: TimeKind | null;
  inside: 'Inside' | 'Outside' | 'Inside and out' | null;
  /** What happens (Task 2). */
  what: string | null;
  /** Indexes into `StoryMap.characters`, leads first. */
  chips: number[];
  planned: boolean;
  todo: boolean;
  /** Index into `StoryMap.quotes`. */
  quote: number | null;
  /** A play's (Task 3). */
  stage: StageLine[] | null;
  moves: string | null;
}

export interface MapCharacter {
  key: string;
  /** As typed when it has small letters (`McCLANE`), else in title case. */
  name: string;
  /** The first word of `name`, and the rest; an uncased name of one word is all `first`. */
  first: string;
  rest: string;
  /** The first letter of the name, as typed. */
  initial: string;
  lead: boolean;
  /** 0–6: the palette slot; null for the others and for a voice. */
  color: number | null;
  /** Only ever heard (every cue `V.O.` or `O.S.`): a white ring. */
  voice: boolean;
  /** On screen (or on stage), at the script's rates. */
  minutes: number;
  /** Scenes they are in, speaking or not. */
  scenes: number;
  /** Their share of the talking, whole percents that add up to 100 across the characters. */
  share: number;
  hook: string | null;
  age: string | null;
  /** Index into `StoryMap.quotes` (Task 2). */
  signature: number | null;
  presence: Array<{ scene: number; speaking: boolean }>;
}

export interface MapPlace {
  /** In plain words. */
  name: string;
  scenes: number;
  minutes: number;
  /** 5 for the place with the most time, then by fifths of its minutes. */
  size: 1 | 2 | 3 | 4 | 5;
}

/** Two leads and the scenes they share (Task 3). */
export interface MapPair {
  a: number;
  b: number;
  scenes: number;
}

/** A line of dialogue on the page (Task 2). */
export interface MapQuote {
  scene: number;
  character: number;
  text: string;
  /** The cue's block. */
  cue: number;
  marked: boolean;
}

/** A setup and its payoff, by scene numbers; `to` null: not yet paid off (Task 2). */
export interface MapThread {
  label: string;
  from: number;
  to: number | null;
}

/** What isn't written yet (design §6; Task 3 fills it). */
export interface MapGaps {
  /** Any of the four sources. */
  found: boolean;
  /** Scene numbers. */
  planned: number[];
  /** Scene numbers with a to-do. */
  todo: number[];
  /** Act numbers with no scenes. */
  emptyActs: number[];
  /** Pages after the last scene, when the planned length is more than is written. */
  tail: { from: number; to: number } | null;
  /** Written over planned, in whole percents, at most 100; null without a planned length. */
  percent: number | null;
  written: number;
  plannedPages: number | null;
  /** Design §6.3. */
  sentence: string;
}

export interface StoryMap {
  kind: MapKind;
  status: MapStatus;
  title: string;
  writer: { name: string; initials: string } | null;
  greeting: string;
  logline: string | null;
  explain: string | null;
  /** "Draft 03"; "a3f9c2e"; "1 Nov 2026". */
  draftLabel: string;
  shortId: string;
  updated: string | null;
  facts: { pages: number; minutes: number; scenes: number; characters: number; places: number };
  acts: MapAct[];
  scenes: MapScene[];
  /** The pages the strip spans. */
  axis: number;
  lanes: 'two' | 'one';
  /** Whole percents, by minutes; null with one lane. */
  split: { indoors: number; night: number } | null;
  /** The pace chart's caption. */
  pace: string;
  /** By screen time, most first: the leads, then the rest. */
  characters: MapCharacter[];
  pairs: MapPair[];
  places: MapPlace[];
  /** Places past the first 24. */
  placesMore: number;
  quotes: MapQuote[];
  threads: MapThread[];
  gaps: MapGaps;
  interval: { afterAct: number } | null;
  contact: { text: string; mailto: string | null } | null;
}
