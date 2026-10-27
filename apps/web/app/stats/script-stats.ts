import type { Doc } from '@drafter/fountain';
import type { MdNode } from '../markdown/render';
import { wordsIn } from '../markdown/words';

// The Stats window's figures for the script as a whole (docs/drafter-stats-design.md §4): who
// speaks and how much, how the scene headings divide, and a Markdown document's headings. Pure
// functions of the parse.

export interface CharacterRow {
  /** As first typed: a forced `@McCLANE` keeps its own capitals. */
  name: string;
  /** Cues: each is a speech, even one with only a parenthetical under it. */
  speeches: number;
  /** Scenes the character speaks in; a speech before the first scene heading is in none. */
  scenes: number;
  /** Words of dialogue, parentheticals left out. */
  words: number;
}

/**
 * The speaking characters, most speeches first (then most words, then first to speak). A cue's
 * extensions, `(V.O.)` or `(CONT'D)`, and a dual dialogue's `^` are not part of the name, and
 * names are one character whatever their capitals.
 */
export function characterTable(doc: Doc): CharacterRow[] {
  const rows = new Map<string, CharacterRow & { seen: Set<number>; order: number }>();
  let scene = 0;
  let speaker: (CharacterRow & { seen: Set<number> }) | null = null;
  for (const block of doc.blocks) {
    if (block.kind === 'scene_heading') {
      scene++;
      speaker = null;
    } else if (block.kind === 'character') {
      const { name } = block.sem;
      const key = name.toUpperCase();
      let row = rows.get(key);
      if (!row) {
        row = { name, speeches: 0, scenes: 0, words: 0, seen: new Set(), order: rows.size };
        rows.set(key, row);
      }
      row.speeches++;
      if (scene > 0) row.seen.add(scene);
      speaker = row;
    } else if (block.kind === 'dialogue' && speaker) {
      for (const line of block.lines) {
        if (line.transparent) continue;
        let text = '';
        for (const run of line.inline) text += run.text;
        speaker.words += wordsIn(text);
      }
    } else if (block.kind !== 'parenthetical') {
      speaker = null;
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.speeches - a.speeches || b.words - a.words || a.order - b.order)
    .map(({ name, speeches, seen, words }) => ({ name, speeches, scenes: seen.size, words }));
}

export interface HeadingSplit {
  total: number;
  /** By the heading's prefix: `INT.`; `EXT.` and `EST.`; `INT./EXT.` and `I/E`; none. */
  place: { interior: number; exterior: number; both: number; other: number };
  /** By the time after the last ` - `: `DAY`, `NIGHT`, anything else or none. */
  time: { day: number; night: number; other: number };
}

/** How the scene headings divide between inside and outside, and day and night. */
export function headingSplit(doc: Doc): HeadingSplit {
  const split: HeadingSplit = {
    total: 0,
    place: { interior: 0, exterior: 0, both: 0, other: 0 },
    time: { day: 0, night: 0, other: 0 },
  };
  for (const block of doc.blocks) {
    if (block.kind !== 'scene_heading') continue;
    split.total++;
    const prefix = (block.sem.prefix ?? '').toUpperCase().replace(/\.$/, '');
    if (prefix === 'INT') split.place.interior++;
    else if (prefix === 'EXT' || prefix === 'EST') split.place.exterior++;
    else if (prefix === 'I/E' || /^INT\.?\/EXT$/.test(prefix)) split.place.both++;
    else split.place.other++;
    // The time's first word, so `NIGHT (1987)` is night.
    const word = /^\p{L}+/u.exec((block.sem.time ?? '').toUpperCase())?.[0];
    if (word === 'DAY') split.time.day++;
    else if (word === 'NIGHT') split.time.night++;
    else split.time.other++;
  }
  return split;
}

/** The headings in a Markdown document's parse, at any depth. */
export function headingCount(tree: MdNode | null): number {
  if (!tree) return 0;
  let count = tree.type === 'heading' ? 1 : 0;
  for (const child of tree.children ?? []) count += headingCount(child);
  return count;
}

/** Words read in a minute, for a Markdown document's reading time. */
export const READING_WPM = 230;

/** Minutes to read `words`, to the nearest whole minute. */
export const readingMinutes = (words: number): number => Math.round(words / READING_WPM);
