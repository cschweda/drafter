import type { Block, Doc } from '@drafter/fountain';
import { builtins, resolveRole, type Template } from '@drafter/templates';
import { templateIdOf } from '../editor/template';
import type { MdNode } from '../markdown/render';
import { wordsIn } from '../markdown/words';

// The Stats window's figures for the script as a whole (docs/drafter-stats-design.md §4): who
// speaks and how much, how the scene headings divide, and a Markdown document's headings. Pure
// functions of the parse.

/** The roles that begin a scene: a screenplay's heading, and a play's (a `##` section). */
const SCENE_ROLES = new Set(['scene_heading', 'scene_heading_play']);

/**
 * Whether `block` begins a scene in the script's own template: a scene heading in a screenplay, a
 * `##` section in a stage play (where an INT. heading is not a scene, and a section in a
 * screenplay is only an outline marker). Only headings and sections are asked about, and neither
 * template's rules for them look at the block before, so no previous role is needed.
 */
export function sceneStart(template: Template): (block: Block) => boolean {
  return (block) =>
    (block.kind === 'scene_heading' || block.kind === 'section') &&
    SCENE_ROLES.has(resolveRole(template, block, null));
}

/** The template `doc` names, as the editor and the layout read it. */
export const templateOf = (doc: Doc): Template => builtins[templateIdOf(doc)] as Template;

/** The scenes in `doc`, by its template. */
export function sceneCount(doc: Doc): number {
  const starts = sceneStart(templateOf(doc));
  let count = 0;
  for (const block of doc.blocks) if (starts(block)) count++;
  return count;
}

export interface CharacterRow {
  /** As first typed: a forced `@McCLANE` keeps its own capitals. */
  name: string;
  /** Cues: each is a speech, even one with only a parenthetical under it. */
  speeches: number;
  /** Scenes the character speaks in; a speech before the first scene is in none. */
  scenes: number;
  /** Words of dialogue, parentheticals left out. */
  words: number;
}

/**
 * The speaking characters, most speeches first (then most words, then first to speak). A cue's
 * extensions, `(V.O.)` or `(CONT'D)`, and a dual dialogue's `^` are not part of the name, and
 * names are one character whatever their capitals. Scenes are the template's (`sceneStart`).
 */
export function characterTable(doc: Doc): CharacterRow[] {
  const starts = sceneStart(templateOf(doc));
  const rows = new Map<string, CharacterRow & { seen: Set<number>; order: number }>();
  let scene = 0;
  let speaker: (CharacterRow & { seen: Set<number> }) | null = null;
  for (const block of doc.blocks) {
    if (starts(block)) {
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

/** Both inside and outside, in either order: `INT./EXT.`, `EXT./INT.`, `I/E`, `E/I`. */
const BOTH = /^\s*(?:INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|E\/I)\b/i;

/**
 * DAY or NIGHT, from the first part after the place that begins with either: the parts are split
 * at ` - ` (or an en dash), so `NIGHT - CONTINUOUS`, `DAY - LATER`, and `NIGHT (1987)` are read,
 * and the place's own words (`DAY CARE`) are not. Null for anything else, or no time.
 */
function timeOfDay(text: string, prefix: string | null): 'DAY' | 'NIGHT' | null {
  const rest = prefix ? text.slice(prefix.length) : text;
  for (const part of dashParts(rest).slice(1)) {
    const word = /^\p{L}+/u.exec(part.trim().toUpperCase())?.[0];
    if (word === 'DAY' || word === 'NIGHT') return word;
  }
  return null;
}

/**
 * `text` split at each dash with white space on both sides, as `split(/\s+[-–]\s+/)` would split
 * it, by a scan: that pattern backtracks once per space on a long run of them.
 */
function dashParts(text: string): string[] {
  const parts: string[] = [];
  const space = (c: string | undefined) => c !== undefined && /\s/.test(c);
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (!space(text[i])) {
      i++;
      continue;
    }
    let j = i;
    while (space(text[j])) j++;
    if ((text[j] === '-' || text[j] === '–') && space(text[j + 1])) {
      let k = j + 1;
      while (space(text[k])) k++;
      parts.push(text.slice(start, i));
      start = k;
      i = k;
    } else {
      i = j;
    }
  }
  parts.push(text.slice(start));
  return parts;
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
    // `EXT./INT.` is read by the parser as `EXT.` and a place starting with `/INT.`.
    const both = BOTH.test(block.sem.text);
    if (both || prefix === 'I/E' || /^INT\.?\/EXT$/.test(prefix)) split.place.both++;
    else if (prefix === 'INT') split.place.interior++;
    else if (prefix === 'EXT' || prefix === 'EST') split.place.exterior++;
    else split.place.other++;
    const time = timeOfDay(block.sem.text, block.sem.prefix);
    if (time === 'DAY') split.time.day++;
    else if (time === 'NIGHT') split.time.night++;
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
