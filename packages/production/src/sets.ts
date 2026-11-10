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
 * The paper each set prints on, for the revised pages' tint (design §8; ruling F3), by base name
 * in lower case. Not the screen swatches, which are mid-tones: at 12% a grey White or a khaki
 * Yellow would not look like paper. White paper gets no tint, so it has none here.
 */
const PAPER_TINTS: ReadonlyMap<string, string> = new Map([
  ['blue', '#9fc5f8'],
  ['pink', '#f6b8c8'],
  ['yellow', '#fff176'],
  ['green', '#a5d6a7'],
  ['goldenrod', '#f0c05a'],
  ['buff', '#f3e2a9'],
  ['salmon', '#f9a58c'],
  ['cherry', '#e57373'],
  ['tan', '#d7b98e'],
]);

/**
 * The tint for a set's pages: its paper colour by base name ("Double Blue" is Blue's, the last
 * word of the name); null for White and for a name with no paper colour.
 */
export function paperTint(name: string): string | null {
  const base = name.trim().split(/\s+/).at(-1)?.toLowerCase() ?? '';
  return PAPER_TINTS.get(base) ?? null;
}

/**
 * The default name of the next set. A set can be renamed (Tan, Gray, a number), so this counts by
 * position, not by name. `sets` is `production.sets` as stored, the locked White draft first, so
 * [White, Blue] gives Pink. After the list runs out it stays on the last name rather than
 * inventing one.
 */
export function nextSetName(sets: readonly ProductionSet[]): string {
  const i = Math.min(sets.length, REVISION_NAMES.length - 1);
  return REVISION_NAMES[i] as string;
}
