import type { ProductionSet } from './types';

const BASE = [
  'White',
  'Blue',
  'Pink',
  'Yellow',
  'Green',
  'Goldenrod',
  'Buff',
  'Salmon',
  'Cherry',
] as const;

/** The industry order: the nine colors, then each again as "Double ...". */
export const REVISION_NAMES: readonly string[] = [...BASE, ...BASE.map((n) => `Double ${n}`)];

/**
 * Screen swatches by base name ("Double Blue" uses Blue's). Each keeps 3:1 contrast against both
 * the dark page (#1e1f22) and the white one, which means a mid-tone: a true pastel white or
 * yellow would vanish on one theme or the other. The mark itself is drawn in the text color.
 */
export const REVISION_COLORS: Record<string, string> = {
  White: '#8a8a8a',
  Blue: '#4a86d8',
  Pink: '#d9709a',
  Yellow: '#9a8c10',
  Green: '#3f9a4f',
  Goldenrod: '#b8860b',
  Buff: '#a8885a',
  Salmon: '#e0705a',
  Cherry: '#cc3a58',
};

/**
 * The default name of the next set. A set can be renamed (Tan, Gray, a number), so this counts by
 * position, not by name: after one set, the next is the second name; after the list runs out it
 * stays on the last name rather than inventing one.
 */
export function nextSetName(sets: readonly ProductionSet[]): string {
  // The locked draft is White, so the first set is index 1.
  const i = Math.min(sets.length + 1, REVISION_NAMES.length - 1);
  return REVISION_NAMES[i] as string;
}
