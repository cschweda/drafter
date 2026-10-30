import { type ScenePrint, SKETCH_K } from './print';

// Matching scene versions (version-history design §3.2, Call 6).

/**
 * The thresholds of `sameScene`, in one place. `containment` and `jaccard` are Call 6's.
 * `contained` and `containedMin` were added when the thresholds were tuned against the
 * fixtures (plan, Controller rulings): a scene merged into another under the other's heading,
 * or the half of a split scene under a new heading, keeps over 90% of the smaller version's
 * shingles but shares under half of all of them (J 0.41 to 0.47), so Call 6 alone read it as
 * gone. No two different fixture scenes share more than 20% of the smaller's. `shared` was added
 * for short scenes (the controller's ruling): under one heading, a quarter of a scene of three
 * shingles is one pair of words ("The phone rings." and "The phone stops."), too little to call
 * them one scene, so the rule also needs two shingles in common, or the one a scene of one has.
 */
export const MATCH = {
  containment: 0.25,
  jaccard: 0.5,
  contained: 0.75,
  containedMin: 8,
  shared: 2,
} as const;

/**
 * How alike two scene versions' printed words are: `jaccard`, shared shingles over all of
 * both's, estimated from the `SKETCH_K` smallest hashes of the two sketches together; and
 * `containment`, shared shingles over the smaller scene's (`contained`). Both are exact when
 * both scenes fit in their sketches.
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
  return { jaccard: taken === 0 ? 0 : both / taken, containment: contained(a, b) };
}

/**
 * The share of the smaller scene's shingles that are in the larger's, estimated straight from
 * the two sketches. A sketch holds every one of its scene's hashes up to its largest (all of
 * them when the scene fits), so up to `τ`, the smaller of the two sketches' largest (the
 * larger's when only it is full), whether each of the smaller's hashes is in the larger is
 * known exactly: those hashes are a random sample of the smaller's shingles, and the share of
 * them found is the estimate. With none of the smaller's hashes up to `τ` (a few words against
 * a long scene), there is nothing to go on, and it is 0.
 */
function contained(a: ScenePrint, b: ScenePrint): number {
  const [small, large] = a.shingles <= b.shingles ? [a, b] : [b, a];
  const s = small.sketch;
  const l = large.sketch;
  let tau = Number.POSITIVE_INFINITY;
  if (large.shingles > SKETCH_K) tau = l[l.length - 1] as number;
  if (small.shingles > SKETCH_K) tau = Math.min(tau, s[s.length - 1] as number);
  let seen = 0;
  let found = 0;
  let j = 0;
  for (const value of s) {
    if (value > tau) break;
    seen++;
    while (j < l.length && (l[j] as number) < value) j++;
    if (l[j] === value) found++;
  }
  return seen === 0 ? 0 : found / seen;
}

/**
 * Whether two scene versions are the same scene (Call 6): their hashes are equal; or their
 * heading keys are, and either one has no printed words (a heading written first, filled in
 * later, or emptied) or `containment ≥ 0.25` with at least two shingles in common (all of the
 * smaller's, when it has one); or `jaccard ≥ 0.5`, whatever their headings; or, whatever their
 * headings, the smaller has at least 8 shingles and `containment ≥ 0.75` (most of it is in the
 * other: a merge or a split). It is symmetric; `coveredBy` is the one-way test of a past
 * version against a scene now.
 */
export function sameScene(a: ScenePrint, b: ScenePrint): boolean {
  if (a.hash === b.hash) return true;
  if (a.headingKey === b.headingKey && (a.shingles === 0 || b.shingles === 0)) return true;
  const { jaccard, containment } = similarity(a, b);
  const smaller = Math.min(a.shingles, b.shingles);
  if (
    a.headingKey === b.headingKey &&
    containment >= MATCH.containment &&
    // Exact for scenes that fit their sketches; for larger ones, `containment ≥ 0.25` is
    // already two or more of the smaller's 8 or more.
    Math.round(containment * smaller) >= Math.min(MATCH.shared, smaller)
  )
    return true;
  if (jaccard >= MATCH.jaccard) return true;
  return smaller >= MATCH.containedMin && containment >= MATCH.contained;
}

/**
 * Whether the scene now `now` covers the past version `past`, so `past` isn't deleted: they are
 * the same scene (`sameScene`), but a scene now with no printed words covers only a past version
 * with none. An empty past scene filled in now is still there (a heading written first); a
 * scene emptied to its heading now is not, so a bare heading never hides the words cut from it.
 */
export function coveredBy(past: ScenePrint, now: ScenePrint): boolean {
  if (past.hash === now.hash) return true;
  if (now.shingles === 0 && past.shingles > 0) return false;
  return sameScene(past, now);
}
