import type { OutlineItem, StripRow } from '@drafter/outline';
import {
  colorName,
  lengthLabel,
  sceneName,
  sceneNumber,
  sectionName,
  swatchOf,
} from '../outline/labels';

// What the Structure strip says (structure strip design §3, §3.3, §4): its rows' marks and names,
// each block's name, the lines of its card, and a scene's fill. Drafter's own words throughout.

/** A block narrower than this, in pixels, shows no label, only its color (Call 7). */
export const LABEL_MIN_PX = 28;

/** The strip's one line while the script has no scenes (Call 17). */
export const NO_SCENES = 'No scenes yet. Each scene heading you write shows here.';

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

/** A block's name: as the Outline names its row, then the scene's goal when it has one. */
export function blockName(item: OutlineItem): string {
  const name = item.kind === 'scene' ? sceneName(item) : sectionName(item);
  const goal = goalOf(item);
  return goal ? `${name}, goal: ${goal}` : name;
}

/** The lines of a block's card (Call 11), leaving out any line it has nothing for. */
export function cardLines(item: OutlineItem): string[] {
  if (item.kind === 'section') {
    const scenes = `${item.scenes} ${item.scenes === 1 ? 'scene' : 'scenes'}`;
    return [
      item.title || 'Untitled section',
      item.eighths === null ? scenes : `${scenes} · ${lengthLabel(item.eighths)}`,
    ];
  }
  const facts: string[] = [];
  if (item.pages) facts.push(`page ${item.pages.page}`, lengthLabel(item.pages.eighths));
  if (item.color) facts.push(colorName(item.color.value));
  const goal = goalOf(item);
  return [
    `Scene ${sceneNumber(item)}, ${item.heading || 'Untitled scene'}`,
    facts.join(' · '),
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
