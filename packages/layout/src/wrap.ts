import type { InlineRun, Span } from '@drafter/fountain';

const SPACE = 32;

/**
 * A line of text as cells, one per code point (one cell takes one column, so a surrogate pair is
 * never split): each cell's run, where it starts and ends in that run's text, and whether it is a
 * space. With `offsets`, also where each starts in the runs' joined text (`at`, with one more
 * entry: the text's length).
 */
export interface Cells {
  run: number[];
  from: number[];
  to: number[];
  space: boolean[];
  at?: number[];
}

export function cellsOf(runs: readonly InlineRun[], offsets = false): Cells {
  const cells: Cells = { run: [], from: [], to: [], space: [] };
  const at: number[] | undefined = offsets ? [] : undefined;
  if (at) cells.at = at;
  let base = 0;
  runs.forEach((run, r) => {
    const t = run.text;
    for (let i = 0; i < t.length; ) {
      const cp = t.codePointAt(i) as number;
      const next = i + (cp > 0xffff ? 2 : 1);
      cells.run.push(r);
      cells.from.push(i);
      cells.to.push(next);
      cells.space.push(cp === SPACE);
      at?.push(base + i);
      i = next;
    }
    base += t.length;
  });
  at?.push(base);
  return cells;
}

/**
 * Where lines break: each range is a line's first cell and the cell past its last. Wrapping starts
 * at cell `start` and stops after `limit` lines; `next` is then the cell the following line starts
 * at, or null when the text ran out. Costs the lines it returns, not the text's length.
 *
 * Lines break at spaces, and the spaces at a break are dropped. A word longer than the width is
 * broken at the edge.
 */
export function wrapCells(
  cells: Cells,
  width: number,
  start = 0,
  limit = Number.POSITIVE_INFINITY,
): { ranges: Array<[number, number]>; next: number | null } {
  const max = Math.max(1, Math.floor(width));
  const { space } = cells;
  const n = cells.run.length;
  const ranges: Array<[number, number]> = [];
  for (let i = start, first = true; ; first = false) {
    if (!first) {
      while (i < n && space[i]) i++;
      if (i >= n) return { ranges, next: null };
    }
    if (ranges.length >= limit) return { ranges, next: i };
    const from = i;
    if (n - from <= max) {
      ranges.push([from, n]);
      return { ranges, next: null };
    }
    // End before the last space within reach; if there is none, or only
    // leading spaces before it, break the word at the edge.
    let gap = from + max;
    while (gap > from && !space[gap]) gap--;
    let end = gap;
    while (end > from && space[end - 1]) end--;
    if (end === from) {
      end = from + max;
      gap = end;
    }
    ranges.push([from, end]);
    i = gap;
  }
}

/** The runs of cells `start` to `end`: styles kept, and each piece's span into the source. */
export function sliceCells<R extends InlineRun>(
  runs: readonly R[],
  cells: Cells,
  start: number,
  end: number,
): R[] {
  const pieces: R[] = [];
  for (let c = start; c < end; ) {
    const r = cells.run[c] as number;
    let d = c;
    while (d < end && cells.run[d] === r) d++;
    const run = runs[r] as R;
    const from = cells.from[c] as number;
    const to = cells.to[d - 1] as number;
    pieces.push({ ...run, text: run.text.slice(from, to), span: subSpan(run, from, to) });
    c = d;
  }
  return pieces;
}

/**
 * Word-wraps one line of printable text to `width` columns (technical design
 * §5.2). `runs` are the text's styled runs, whose texts join to `text`; with no
 * runs, `text` wraps as plain text, with spans relative to it.
 *
 * Lines break at spaces, and the spaces at a break are dropped. A word longer
 * than the width is broken at the edge. One code point takes one column, so a
 * surrogate pair is never split. Styles carry across breaks, and each piece
 * keeps a span into the source. Returns one array of runs per output line.
 */
export function wrap<R extends InlineRun>(text: string, runs: readonly R[], width: number): R[][] {
  const source: readonly R[] =
    runs.length > 0 || text === ''
      ? runs
      : [
          {
            text,
            bold: false,
            italic: false,
            underline: false,
            span: { from: 0, to: text.length },
          } as R,
        ];
  const cells = cellsOf(source);
  return wrapCells(cells, width).ranges.map(([start, end]) =>
    sliceCells(source, cells, start, end),
  );
}

/**
 * The source span of part of a run's text, scaled from the run's span: exact
 * when the text is as long as its span, and inside the run's span when it
 * isn't (escapes removed, case changed, tabs expanded).
 */
function subSpan(run: InlineRun, from: number, to: number): Span {
  const scale = (run.span.to - run.span.from) / run.text.length;
  return {
    from: run.span.from + Math.round(from * scale),
    to: run.span.from + Math.round(to * scale),
  };
}
