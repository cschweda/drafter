import { type ComputedRef, computed, type Ref } from 'vue';

// The grid draws only the columns in view, and WINDOW_EXTRA on each side (seeing-the-script design
// §4.4, Call 21): a 300-scene script with 60 characters is 18,000 cells, and its first paint has
// the same budget as a short one's. Every row is drawn: a cast is rarely over 60.

/** The columns drawn past each side of the view, so a short scroll shows cells already there. */
export const WINDOW_EXTRA = 10;

/**
 * The columns to draw, `from` up to but not including `to`, for a grid scrolled `scrollLeft` px
 * with `width` px of it in view, of `total` columns `columnPx` wide.
 */
export function visibleColumns(
  scrollLeft: number,
  width: number,
  columnPx: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0 || columnPx <= 0) return { from: 0, to: 0 };
  const left = Math.min(Math.max(0, scrollLeft), Math.max(0, total * columnPx - width));
  const first = Math.floor(left / columnPx);
  const last = Math.ceil((left + Math.max(0, width)) / columnPx);
  return {
    from: Math.max(0, first - WINDOW_EXTRA),
    to: Math.min(total, last + WINDOW_EXTRA),
  };
}

interface DrawnRange {
  from: number;
  to: number;
  focused: number;
  total: number;
  list: number[];
}

/**
 * The columns the grid draws: `visibleColumns`, and the focused cell's column when it is outside
 * them (so Tab always has a stop), in order. The list is kept, the very same array, while the range,
 * the focused column, and the count stay as they are, so a scroll inside one column (or a move of
 * focus within the range) redraws no cell.
 */
export function useDrawnColumns(
  scrollLeft: Readonly<Ref<number>>,
  width: Readonly<Ref<number>>,
  columnPx: number,
  total: Readonly<Ref<number>>,
  focused: Readonly<Ref<number>>,
): ComputedRef<readonly number[]> {
  const range = computed((previous?: DrawnRange): DrawnRange => {
    const { from, to } = visibleColumns(scrollLeft.value, width.value, columnPx, total.value);
    const n = total.value;
    // Only a focused column outside the range is drawn apart, so one inside it is no change (-1).
    const f = focused.value;
    const at = f < n && (f < from || f >= to) ? f : -1;
    if (
      previous &&
      previous.from === from &&
      previous.to === to &&
      previous.focused === at &&
      previous.total === n
    ) {
      return previous;
    }
    const list: number[] = [];
    if (at >= 0 && at < from) list.push(at);
    for (let c = from; c < to; c++) list.push(c);
    if (at >= to) list.push(at);
    return { from, to, focused: at, total: n, list };
  });
  return computed(() => range.value.list);
}
