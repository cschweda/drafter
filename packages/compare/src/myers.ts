/** A run of lines the two sides share, or that one side added or removed. Ranges are half-open. */
export interface DiffRun {
  kind: 'same' | 'added' | 'removed';
  /** Lines of the older side (`[k, k]` for an addition: it goes before line k). */
  old: [number, number];
  /** Lines of the newer side (`[k, k]` for a removal: it went before line k). */
  new: [number, number];
}

/**
 * A shortest edit script between `a` and `b`, as runs in order; adjacent runs of one kind are merged.
 * Between two same runs, the removal comes before the addition.
 *
 * Myers' O(ND) diff in linear space: each box is split at the middle snake of its shortest path,
 * found by searching from both corners at once, and the two halves are diffed in turn. Lines are
 * compared as integers, the common prefix and suffix of each box are matched before it is split, and
 * a line found on only one side is set aside first, since it can only be an edit.
 */
export function diffLines(a: readonly string[], b: readonly string[]): DiffRun[] {
  const ids = new Map<string, number>();
  const intern = (line: string) => {
    let id = ids.get(line);
    if (id === undefined) {
      id = ids.size;
      ids.set(line, id);
    }
    return id;
  };
  const aIds = a.map(intern);
  const bIds = b.map(intern);

  // Only lines on both sides can match; the rest are edits wherever they fall.
  const inA = new Set(aIds);
  const inB = new Set(bIds);
  const aAt: number[] = [];
  const bAt: number[] = [];
  for (let i = 0; i < aIds.length; i++) if (inB.has(aIds[i])) aAt.push(i);
  for (let j = 0; j < bIds.length; j++) if (inA.has(bIds[j])) bAt.push(j);
  const x = Int32Array.from(aAt, (i) => aIds[i]);
  const y = Int32Array.from(bAt, (j) => bIds[j]);

  // Matched pairs, as indices into x and y, in order.
  const matchX: number[] = [];
  const matchY: number[] = [];
  lcs(x, y, matchX, matchY);

  const runs: DiffRun[] = [];
  const push = (kind: DiffRun['kind'], i0: number, i1: number, j0: number, j1: number) => {
    const last = runs[runs.length - 1];
    if (last?.kind === kind) {
      last.old[1] = i1;
      last.new[1] = j1;
    } else runs.push({ kind, old: [i0, i1], new: [j0, j1] });
  };
  let i = 0;
  let j = 0;
  const gapTo = (i1: number, j1: number) => {
    if (i1 > i) push('removed', i, i1, j, j);
    if (j1 > j) push('added', i1, i1, j, j1);
    i = i1;
    j = j1;
  };
  for (let m = 0; m < matchX.length; m++) {
    const ai = aAt[matchX[m]];
    const bj = bAt[matchY[m]];
    gapTo(ai, bj);
    push('same', ai, ai + 1, bj, bj + 1);
    i = ai + 1;
    j = bj + 1;
  }
  gapTo(a.length, b.length);
  return runs;
}

/** Appends a longest common subsequence of `x` and `y` to `matchX` and `matchY`, in order. */
function lcs(x: Int32Array, y: Int32Array, matchX: number[], matchY: number[]): void {
  const max = x.length + y.length + 1;
  // One pair of diagonal arrays serves every box: a box never needs more diagonals than the whole.
  const forward = new Int32Array(2 * max + 1);
  const backward = new Int32Array(2 * max + 1);

  const box = (x0: number, x1: number, y0: number, y1: number): void => {
    // The common prefix and suffix match as they stand.
    let prefixEnd = x0;
    while (prefixEnd < x1 && y0 < y1 && x[prefixEnd] === y[y0]) {
      matchX.push(prefixEnd++);
      matchY.push(y0++);
    }
    x0 = prefixEnd;
    let suffix = 0;
    while (x1 - suffix > x0 && y1 - suffix > y0 && x[x1 - suffix - 1] === y[y1 - suffix - 1]) {
      suffix++;
    }
    x1 -= suffix;
    y1 -= suffix;
    if (x0 < x1 && y0 < y1) {
      const [sx, sy, ex, ey] = middleSnake(x0, x1, y0, y1);
      box(x0, sx, y0, sy);
      for (let k = 0; k < ex - sx; k++) {
        matchX.push(sx + k);
        matchY.push(sy + k);
      }
      box(ex, x1, ey, y1);
    }
    for (let k = 0; k < suffix; k++) {
      matchX.push(x1 + k);
      matchY.push(y1 + k);
    }
  };

  /**
   * The middle snake of the box's shortest edit path, as [startX, startY, endX, endY]. The forward
   * search keeps, for each diagonal k = x − y, the furthest x reached from the top-left corner; the
   * backward search does the same from the bottom-right corner in reversed coordinates, where its
   * diagonal k stands for the forward diagonal delta − k. Where the two meet is the middle.
   */
  const middleSnake = (x0: number, x1: number, y0: number, y1: number): number[] => {
    const n = x1 - x0;
    const m = y1 - y0;
    const delta = n - m;
    const odd = (delta & 1) !== 0;
    const half = Math.ceil((n + m) / 2);
    const o = max; // the offset of diagonal 0
    forward[o + 1] = 0;
    backward[o + 1] = 0;
    for (let d = 0; d <= half; d++) {
      for (let k = -d; k <= d; k += 2) {
        // Down (an addition) from diagonal k + 1, or right (a removal) from k − 1, whichever is
        // further; a tie goes right, so removals come first.
        let px =
          k === -d || (k !== d && forward[o + k - 1] < forward[o + k + 1])
            ? forward[o + k + 1]
            : forward[o + k - 1] + 1;
        let py = px - k;
        const sx = px;
        const sy = py;
        while (px < n && py < m && x[x0 + px] === y[y0 + py]) {
          px++;
          py++;
        }
        forward[o + k] = px;
        const r = delta - k;
        if (odd && r >= -(d - 1) && r <= d - 1 && px + backward[o + r] >= n) {
          return [x0 + sx, y0 + sy, x0 + px, y0 + py];
        }
      }
      for (let k = -d; k <= d; k += 2) {
        let px =
          k === -d || (k !== d && backward[o + k - 1] < backward[o + k + 1])
            ? backward[o + k + 1]
            : backward[o + k - 1] + 1;
        let py = px - k;
        const sx = px;
        const sy = py;
        while (px < n && py < m && x[x1 - 1 - px] === y[y1 - 1 - py]) {
          px++;
          py++;
        }
        backward[o + k] = px;
        const f = delta - k;
        if (!odd && f >= -d && f <= d && px + forward[o + f] >= n) {
          return [x1 - px, y1 - py, x1 - sx, y1 - sy];
        }
      }
    }
    throw new Error('diffLines: no middle snake'); // unreachable: the searches always meet
  };

  box(0, x.length, 0, y.length);
}
