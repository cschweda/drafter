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
  /** How many lines it removed (`removed`) or put in (the others). */
  lines: number;
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

  const marks: PageMarks = { lines: [], gaps: [], stops: [] };
  changes.forEach((change, index) => {
    const count = change.kind === 'removed' ? change.removed.length : change.added.length;
    if (change.kind !== 'removed') {
      const hit = printed.filter((p) => meets(p.line.span, change.span));
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
        });
        return;
      }
    }
    // The first line at or after its place, by source: in dual dialogue that is the nearest line
    // of the same column, which reading order alone would miss. On a tie, the first in reading order.
    let next: Printed | undefined;
    for (const p of printed) {
      if (
        p.line.span.from >= change.span.from &&
        (!next || p.line.span.from < next.line.span.from)
      ) {
        next = p;
      }
    }
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
