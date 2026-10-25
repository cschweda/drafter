import type { InlineRun, Span } from '@drafter/fountain';

const SPACE = 32;

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
  const max = Math.max(1, Math.floor(width));

  // One cell per code point: its run, and where it starts and ends in that run's text.
  const cellRun: number[] = [];
  const cellFrom: number[] = [];
  const cellTo: number[] = [];
  const space: boolean[] = [];
  source.forEach((run, r) => {
    const t = run.text;
    for (let i = 0; i < t.length; ) {
      const cp = t.codePointAt(i) as number;
      const next = i + (cp > 0xffff ? 2 : 1);
      cellRun.push(r);
      cellFrom.push(i);
      cellTo.push(next);
      space.push(cp === SPACE);
      i = next;
    }
  });
  const n = cellRun.length;

  const ranges: Array<[number, number]> = [];
  for (let i = 0, first = true; ; first = false) {
    if (!first) {
      while (i < n && space[i]) i++;
      if (i >= n) break;
    }
    const start = i;
    if (n - start <= max) {
      ranges.push([start, n]);
      break;
    }
    // End before the last space within reach; if there is none, or only
    // leading spaces before it, break the word at the edge.
    let gap = start + max;
    while (gap > start && !space[gap]) gap--;
    let end = gap;
    while (end > start && space[end - 1]) end--;
    if (end === start) {
      end = start + max;
      gap = end;
    }
    ranges.push([start, end]);
    i = gap;
  }

  return ranges.map(([start, end]) => {
    const pieces: R[] = [];
    for (let c = start; c < end; ) {
      const r = cellRun[c] as number;
      let d = c;
      while (d < end && cellRun[d] === r) d++;
      const run = source[r] as R;
      const from = cellFrom[c] as number;
      const to = cellTo[d - 1] as number;
      pieces.push({ ...run, text: run.text.slice(from, to), span: subSpan(run, from, to) });
      c = d;
    }
    return pieces;
  });
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
