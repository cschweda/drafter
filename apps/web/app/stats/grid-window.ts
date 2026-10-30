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
