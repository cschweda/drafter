import type { Layout, LayoutLine, Page } from './types';

/** What changed, in source offsets: spans of changed text, and gaps where text was cut. */
export interface Marks {
  spans: Array<{ from: number; to: number; set: string }>;
  gaps: Array<{ at: number; set: string }>;
}

/** The part of a row that can carry a mark: it prints source text. */
const prints = (line: LayoutLine) => line.span.to > line.span.from;

/** First index in `sorted` whose key is >= `target` (or the length). */
function lowerBound(sorted: readonly number[], target: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as number) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Returns a layout whose printed lines carry `mark` where a span meets them (they share a
 * character) or where a gap lands (the printed source line with the least start at or after its
 * offset, else the one with the greatest start, whatever order the rows come in). The input is
 * not changed; pages nothing touched are shared. Costs O((lines + spans + gaps) log n).
 */
export function applyMarks(layout: Layout, marks: Marks): Layout {
  // Spans by start, with the running furthest end, so "does any span meet [a, b)" is one search.
  const spans = marks.spans.filter((s) => s.to > s.from).sort((a, b) => a.from - b.from);
  const starts = spans.map((s) => s.from);
  const reach: number[] = []; // index of the span with the furthest end among spans[0..i]
  spans.forEach((s, i) => {
    const prev = i > 0 ? (reach[i - 1] as number) : -1;
    reach.push(prev >= 0 && (spans[prev] as (typeof spans)[number]).to >= s.to ? prev : i);
  });
  const spanSet = (line: LayoutLine): string | undefined => {
    if (!prints(line)) return undefined;
    // Spans that start before the line ends; one of them must also end after the line starts.
    const n = lowerBound(starts, line.span.to);
    if (n === 0) return undefined;
    const best = spans[reach[n - 1] as number] as (typeof spans)[number];
    return best.to > line.span.from ? best.set : undefined;
  };

  // Every printed source line, either column, ordered by where its text starts.
  type Cell = { page: number; line: number; right: boolean; from: number };
  const cells: Cell[] = [];
  if (marks.gaps.length > 0) {
    layout.pages.forEach((page, pi) => {
      page.lines.forEach((line, li) => {
        if (prints(line)) cells.push({ page: pi, line: li, right: false, from: line.span.from });
        if (line.right && prints(line.right)) {
          cells.push({ page: pi, line: li, right: true, from: line.right.span.from });
        }
      });
    });
    cells.sort((a, b) => a.from - b.from); // stable: ties keep reading order
  }
  const cellStarts = cells.map((c) => c.from);
  const gapSets = new Map<string, string>();
  for (const gap of marks.gaps) {
    const at = lowerBound(cellStarts, gap.at);
    const hit = cells[at] ?? cells[cells.length - 1];
    if (hit) gapSets.set(`${hit.page}:${hit.line}:${hit.right ? 1 : 0}`, gap.set);
  }

  const pages = layout.pages.map((page, pi): Page => {
    let lines: LayoutLine[] | undefined;
    page.lines.forEach((line, li) => {
      const left = spanSet(line) ?? gapSets.get(`${pi}:${li}:0`);
      const right = line.right ? (spanSet(line.right) ?? gapSets.get(`${pi}:${li}:1`)) : undefined;
      if (left === undefined && right === undefined) return;
      const next: LayoutLine = { ...line };
      if (left !== undefined) next.mark = { set: left };
      if (right !== undefined && line.right) next.right = { ...line.right, mark: { set: right } };
      lines ??= page.lines.slice();
      lines[li] = next;
    });
    return lines ? { ...page, lines } : page;
  });
  return { ...layout, pages };
}
