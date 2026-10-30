import type { Span } from '@drafter/fountain';
import type { Layout, LayoutLine } from '@drafter/layout';
import type { Change } from './changes';

/** A printed line a change added or changed, by its span: a dual dialogue `right` line too. */
export interface LineMark {
  page: number;
  span: Span;
  kind: 'added' | 'changed';
  /** The change's index. */
  change: number;
}

/**
 * Lines with no printed line to mark: removed ones, or new ones that print nothing. It sits before
 * the printed line whose span is `before`, or at the end of the page when `before` is null.
 */
export interface GapMark {
  page: number;
  before: Span | null;
  /** The removed lines, or the new lines that don't print. */
  lines: string[];
  kind: 'removed' | 'unprinted';
  change: number;
}

/** Where Next change and the Changes list go for one change. */
export interface ChangeStop {
  change: number;
  kind: Change['kind'] | 'unprinted';
  /** The page of its first mark. */
  page: number;
  /** The block its first mark is on, or that its gap sits before (at the end: the last printed); -1 for none. */
  block: number;
  /**
   * How many lines with text it removed (`removed`) or put in (the others); for a change of blank
   * lines only, how many blank lines.
   */
  lines: number;
  /** Set (true) when the change holds blank lines only, so its name can say so. */
  blank?: true;
}

export interface PageMarks {
  lines: LineMark[];
  gaps: GapMark[];
  /** One per change, in order. */
  stops: ChangeStop[];
}

/** A printed line with its page, in reading order. */
interface Printed {
  page: number;
  line: LayoutLine;
}

/** A line prints source text when its span holds some; blank lines and `(MORE)` hold none. */
const printsSource = (line: LayoutLine) => line.span.from < line.span.to;

/** Half-open spans meet when they share a character. */
const meets = (a: Span, b: Span) => a.from < b.to && b.from < a.to;

/**
 * Places each change on `layout`, the newer text's: a printed line whose span meets a change's span
 * is marked; a removal is a gap before the first line at or after its place. A change whose new
 * lines print nothing is an `unprinted` gap there, so it still has a stop. Reads `layout` only.
 */
export function markPages(layout: Layout, changes: readonly Change[]): PageMarks {
  const printed: Printed[] = [];
  for (const page of layout.pages) {
    for (const row of page.lines) {
      for (const line of row.right ? [row, row.right] : [row]) {
        if (printsSource(line)) printed.push({ page: page.number, line });
      }
    }
  }
  const lastPage = layout.pages.at(-1)?.number ?? 1;
  const lastBlock = printed.findLast((p) => p.line.blockIndex >= 0)?.line.blockIndex ?? -1;

  // The printed lines by source (`from`, then reading order), and the largest `to` up to each, so
  // each change finds its lines by binary search instead of reading every line: a script with a
  // change every few lines is marked in n log n, not n × changes (Show changes marks every layout).
  const bySource = printed
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = printed[a] as Printed;
      const pb = printed[b] as Printed;
      return pa.line.span.from - pb.line.span.from || a - b;
    });
  const maxTo: number[] = [];
  for (const i of bySource) {
    const to = (printed[i] as Printed).line.span.to;
    maxTo.push(Math.max(to, maxTo[maxTo.length - 1] ?? Number.NEGATIVE_INFINITY));
  }
  /** The first place in `bySource` where `test` holds; it holds from there on. */
  const firstWhere = (test: (k: number) => boolean) => {
    let lo = 0;
    let hi = bySource.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (test(mid)) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  const fromAt = (k: number) => (printed[bySource[k] as number] as Printed).line.span.from;

  const marks: PageMarks = { lines: [], gaps: [], stops: [] };
  changes.forEach((change, index) => {
    const touched = change.kind === 'removed' ? change.removed : change.added;
    const withText = touched.filter((line) => line.trim() !== '').length;
    const count = withText || touched.length;
    const blank = withText === 0 && touched.length > 0 ? ({ blank: true } as const) : {};
    if (change.kind !== 'removed') {
      // A line meets the change when it starts before the change ends and ends after it starts.
      const start = firstWhere((k) => (maxTo[k] as number) > change.span.from);
      const end = firstWhere((k) => fromAt(k) >= change.span.to);
      const at: number[] = [];
      for (let k = start; k < end; k++) {
        const i = bySource[k] as number;
        if (meets((printed[i] as Printed).line.span, change.span)) at.push(i);
      }
      // In reading order, as the page reads them.
      const hit = at.sort((a, b) => a - b).map((i) => printed[i] as Printed);
      if (hit.length > 0) {
        for (const { page, line } of hit) {
          marks.lines.push({ page, span: { ...line.span }, kind: change.kind, change: index });
        }
        const [first] = hit as [Printed];
        marks.stops.push({
          change: index,
          kind: change.kind,
          page: first.page,
          block: first.line.blockIndex,
          lines: count,
          ...blank,
        });
        return;
      }
    }
    // The first line at or after its place, by source: in dual dialogue that is the nearest line
    // of the same column, which reading order alone would miss. On a tie, the first in reading order.
    const k = firstWhere((k) => fromAt(k) >= change.span.from);
    const next = k < bySource.length ? printed[bySource[k] as number] : undefined;
    const kind = change.kind === 'removed' ? 'removed' : 'unprinted';
    const page = next?.page ?? lastPage;
    marks.gaps.push({
      page,
      before: next ? { ...next.line.span } : null,
      lines: change.kind === 'removed' ? [...change.removed] : [...change.added],
      kind,
      change: index,
    });
    marks.stops.push({
      change: index,
      kind,
      page,
      block: next ? next.line.blockIndex : lastBlock,
      lines: count,
      ...blank,
    });
  });
  return marks;
}

/** The next or previous stop from `current` (null: before the first), wrapping; null when there are none. */
export function stepChange(
  stops: readonly ChangeStop[],
  current: number | null,
  direction: 1 | -1,
): number | null {
  const n = stops.length;
  if (n === 0) return null;
  if (current === null) return direction === 1 ? 0 : n - 1;
  return (((current + direction) % n) + n) % n;
}
