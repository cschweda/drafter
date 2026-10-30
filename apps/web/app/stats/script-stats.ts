import { dayOrNight, insideOf } from '@drafter/cast';
import type { Block, Doc } from '@drafter/fountain';
import { builtins, resolveRole, type Template } from '@drafter/templates';
import { templateIdOf } from '../editor/template';
import type { MdNode } from '../markdown/render';

// The Stats tab's figures for the script as a whole (docs/drafter-stats-design.md §4): the scenes,
// how the scene headings divide, and a Markdown document's headings. Pure functions of the parse.
// Who speaks, and how much, is the cast's (`stats/characters.ts`): it reads the scene index, so it
// is counted once.

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

export interface HeadingSplit {
  total: number;
  /** By the heading's prefix, as `@drafter/cast` reads it: `INT.`; `EXT.` and `EST.`; `INT./EXT.` and `I/E`; none. */
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
    // The prefix is the parser's, and the text starts with it: `EXT./INT.` is read by the parser as
    // `EXT.` and a place starting with `/INT.`, which the text as a whole reads as both.
    const inside = insideOf(block.sem.text);
    if (inside === 'both') split.place.both++;
    else if (inside === 'inside') split.place.interior++;
    else if (inside === 'outside') split.place.exterior++;
    else split.place.other++;
    const time = dayOrNight(block.sem.text, block.sem.prefix);
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
