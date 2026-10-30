import { type ScenePrint, SKETCH_K } from './print';

// Matching scene versions (version-history design §3.2, Call 6).

/**
 * The thresholds of `sameScene`, in one place. `containment` and `jaccard` are Call 6's.
 * `contained` and `containedMin` were added when the thresholds were tuned against the
 * fixtures (plan, Controller rulings): a scene merged into another under the other's heading,
 * or the half of a split scene under a new heading, keeps over 90% of the smaller version's
 * shingles but shares under half of all of them (J 0.41 to 0.47), so Call 6 alone read it as
 * gone. No two different fixture scenes share more than 16% of the smaller's.
 */
export const MATCH = { containment: 0.25, jaccard: 0.5, contained: 0.75, containedMin: 8 } as const;

/**
 * How alike two scene versions' printed words are: `jaccard`, shared shingles over all of
 * both's, estimated from the `SKETCH_K` smallest hashes of the two sketches together (exact
 * when both scenes fit in their sketches); and `containment`, shared shingles over the smaller
 * scene's, derived from it.
 */
export function similarity(a: ScenePrint, b: ScenePrint): { jaccard: number; containment: number } {
  const x = a.sketch;
  const y = b.sketch;
  if (x.length === 0 || y.length === 0) return { jaccard: 0, containment: 0 };
  // Each sketch holds its scene's smallest hashes, so the smallest of the two together are the
  // smallest of both scenes' shingles, and each is known to be in one or both. When both scenes
  // fit in their sketches, the two together are the whole union: take all of it, exactly.
  const limit =
    a.shingles <= SKETCH_K && b.shingles <= SKETCH_K ? Number.POSITIVE_INFINITY : SKETCH_K;
  let i = 0;
  let j = 0;
  let taken = 0;
  let both = 0;
  while (taken < limit && (i < x.length || j < y.length)) {
    const u = i < x.length ? (x[i] as number) : Number.POSITIVE_INFINITY;
    const v = j < y.length ? (y[j] as number) : Number.POSITIVE_INFINITY;
    if (u === v) {
      both++;
      i++;
      j++;
    } else if (u < v) {
      i++;
    } else {
      j++;
    }
    taken++;
  }
  const jaccard = taken === 0 ? 0 : both / taken;
  const smaller = Math.min(a.shingles, b.shingles);
  const containment = Math.min(
    1,
    (jaccard * (a.shingles + b.shingles)) / ((1 + jaccard) * smaller),
  );
  return { jaccard, containment };
}

/**
 * Whether two scene versions are the same scene (Call 6): their hashes are equal; or their
 * heading keys are, and either both have no printed words or `containment ≥ 0.25`; or
 * `jaccard ≥ 0.5`, whatever their headings; or, whatever their headings, the smaller has at
 * least 8 shingles and `containment ≥ 0.75` (most of it is in the other: a merge or a split).
 */
export function sameScene(a: ScenePrint, b: ScenePrint): boolean {
  if (a.hash === b.hash) return true;
  if (a.headingKey === b.headingKey && a.shingles === 0 && b.shingles === 0) return true;
  const { jaccard, containment } = similarity(a, b);
  if (a.headingKey === b.headingKey && containment >= MATCH.containment) return true;
  if (jaccard >= MATCH.jaccard) return true;
  return Math.min(a.shingles, b.shingles) >= MATCH.containedMin && containment >= MATCH.contained;
}
