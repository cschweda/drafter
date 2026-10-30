// Copied from packages/markdown/test/scaling.ts, unchanged below this line.
// Copied from apps/web/test/scaling.ts, unchanged below this line.
// Copied from packages/compare/test/scaling.ts, unchanged below this line.
// Copied from packages/fdx/test/scaling.ts (version history, Task 1), unchanged below this line.
// Linear-time checks that don't depend on how fast the machine is. The same work is timed on an
// input of size n and of size 4n, after a warm-up, taking the best of a few runs of each (a busy
// machine only ever makes a run slower, so the best is the closest to the real cost). Linear work
// grows about 4 times; quadratic work grows about 16 times, so a growth under 8 is linear with room
// for noise. A very generous absolute ceiling stays only as a guard against a hang.

/** The largest growth from n to 4n that still counts as linear. */
export const MAX_GROWTH = 8;

/** The slowest a single run may be before it counts as a hang, in milliseconds. */
export const HANG_MS = 30_000;

/** A test timeout that leaves room for every run of a scaling check. */
export const SCALING_TIMEOUT = 120_000;

export interface Scaling {
  /** The best time at size n, in milliseconds. */
  small: number;
  /** The best time at size 4n, in milliseconds. */
  large: number;
  /** `large / small`. */
  growth: number;
}

/**
 * Times `run` on `make(n)` and `make(4 * n)`. Inputs are built before any timing. After a warm-up,
 * the two sizes are run in turn, `tries` times each, so a change in the machine's load falls on
 * both, and the best of each is kept. A comparison that looks worse than linear is made again, up
 * to `attempts` times, and the best kept: load only ever slows a run, while quadratic work looks
 * quadratic every time. A run slower than the hang guard ends the check at once.
 */
export function scaling<T>(
  make: (n: number) => T,
  run: (input: T) => unknown,
  n: number,
  tries = 5,
  attempts = 3,
): Scaling {
  const smallInput = make(n);
  const largeInput = make(4 * n);
  const time = (input: T) => {
    const start = performance.now();
    run(input);
    return performance.now() - start;
  };
  time(smallInput); // warm-up: the first run pays for compiling the code it runs
  let best: Scaling = {
    small: 0,
    large: Number.POSITIVE_INFINITY,
    growth: Number.POSITIVE_INFINITY,
  };
  for (let a = 0; a < attempts; a++) {
    let small = Number.POSITIVE_INFINITY;
    let large = Number.POSITIVE_INFINITY;
    for (let k = 0; k < tries; k++) {
      small = Math.min(small, time(smallInput));
      large = Math.min(large, time(largeInput));
      if (large > HANG_MS) return { small, large, growth: large / Math.max(small, 0.1) };
    }
    // A run too quick to time (under a tenth of a millisecond) counts as a tenth.
    const growth = large / Math.max(small, 0.1);
    if (growth < best.growth) best = { small, large, growth };
    if (best.growth < MAX_GROWTH) break;
  }
  return best;
}
