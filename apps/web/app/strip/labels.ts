import { estimateSeconds, type OutlineItem, type StripRow } from '@drafter/outline';
import {
  colorName,
  lengthLabel,
  rowTime,
  sceneName,
  sceneNumber,
  sectionName,
  swatchOf,
} from '../outline/labels';
import {
  DEFAULT_RATES,
  ESTIMATE_LABEL,
  type Rates,
  shortTime,
  timeWords,
} from '../stats/time-format';

// What the Structure strip says (structure strip design §3, §3.3, §4): its rows' marks and names,
// each block's name, the lines of its card, and a scene's fill. Drafter's own words throughout.

/** A block narrower than this, in pixels, shows no label, only its color (Call 7). */
export const LABEL_MIN_PX = 28;

/** The strip's one line while the script has no scenes (Call 17). */
export const NO_SCENES = 'No scenes yet. Each scene heading you write shows here.';

/** Why the strip, its toolbar button, and its command are off in a Markdown document (§5). */
export const NOT_FOR_MARKDOWN = 'A Markdown document has no scenes.';

/** What going to a block says when its scene has gone since the strip was drawn (§3.2). */
export const GONE = 'That scene isn’t in the script any more.';

/** The row's mark at its left: the Fountain mark itself, or Scenes (Call 3). */
export const rowMark = (row: StripRow): string =>
  row.kind === 'scenes' ? 'Scenes' : '#'.repeat(row.depth ?? 1);

/** The row's name for a screen reader: "Sections marked ##", or "Scenes". */
export const rowName = (row: StripRow): string =>
  row.kind === 'scenes' ? 'Scenes' : `Sections marked ${rowMark(row)}`;

const goalOf = (item: OutlineItem): string | undefined =>
  item.kind === 'scene' ? item.fields.goal?.body : undefined;

/** Seconds of the estimate from the dialogue for a block, at the script's spoken pace; 0 for none. */
const estimateOf = (item: OutlineItem, rates: Rates): number =>
  estimateSeconds(item.timing, rates.wordsPerMinute);

/**
 * A block's name: as the Outline names its row, then the estimate from the dialogue (which the
 * card shows) and the scene's goal, each when it has one.
 */
export function blockName(item: OutlineItem, rates: Rates = DEFAULT_RATES): string {
  const parts = [item.kind === 'scene' ? sceneName(item, rates) : sectionName(item, rates)];
  const estimate = estimateOf(item, rates);
  if (estimate > 0) parts.push(`${ESTIMATE_LABEL.toLowerCase()}: ${timeWords(estimate)}`);
  const goal = goalOf(item);
  if (goal) parts.push(`goal: ${goal}`);
  return parts.join(', ');
}

/** The card's line for the estimate from the dialogue, or '' when the block has nothing to time. */
function estimateLine(item: OutlineItem, rates: Rates): string {
  const estimate = estimateOf(item, rates);
  return estimate > 0 ? `${ESTIMATE_LABEL}: ${shortTime(estimate)}` : '';
}

/**
 * The lines of a block's card (Call 11), leaving out any line it has nothing for: the time at the
 * script's page rate beside the length, and the estimate from the dialogue at its spoken pace
 * (`rates`, the defaults when not given), which needs no pages.
 */
export function cardLines(item: OutlineItem, rates: Rates = DEFAULT_RATES): string[] {
  if (item.kind === 'section') {
    const facts = [`${item.scenes} ${item.scenes === 1 ? 'scene' : 'scenes'}`];
    if (item.eighths !== null) facts.push(lengthLabel(item.eighths), rowTime(item.eighths, rates));
    return [item.title || 'Untitled section', facts.join(' · '), estimateLine(item, rates)].filter(
      Boolean,
    );
  }
  const facts: string[] = [];
  if (item.pages) {
    facts.push(
      `page ${item.pages.page}`,
      lengthLabel(item.pages.eighths),
      rowTime(item.pages.eighths, rates),
    );
  }
  if (item.color) facts.push(colorName(item.color.value));
  const goal = goalOf(item);
  return [
    `Scene ${sceneNumber(item)}, ${item.heading || 'Untitled scene'}`,
    facts.join(' · '),
    estimateLine(item, rates),
    goal ? `Goal: ${goal}` : '',
    item.synopses[0]?.text ?? '',
  ].filter(Boolean);
}

/**
 * A scene's fill for its color note (Call 8): its swatch mixed 35% over the page color, so text in
 * `--text` reads in both themes, with the swatch itself as the bottom edge. Null for no color or a
 * word Drafter doesn't know, which are drawn neutral.
 */
export function blockFill(color: string | null): { tint: string; edge: string } | null {
  const swatch = color === null ? undefined : swatchOf(color);
  if (!swatch) return null;
  return { tint: `color-mix(in srgb, ${swatch} 35%, var(--page))`, edge: swatch };
}
