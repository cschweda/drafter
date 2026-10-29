// The Cards tab's keys (Phase 2 design §7): the cards flow into rows, and the arrow keys move by
// where a card is drawn. Pure functions of card positions; `columns` is measured from the drawn
// cards, so it follows the pane's width and the card size (one column on a phone).

/**
 * Where `key` takes focus from card `focused` of `count` cards in rows of `columns`: Right and
 * Left one card, Down and Up a row (Down from above a short last row's end goes to its last card),
 * Home and End the first and last. Null when it goes nowhere (an edge, or another key).
 */
export function gridKey(
  count: number,
  columns: number,
  focused: number,
  key: string,
): number | null {
  const cols = Math.max(1, Math.floor(columns));
  const last = count - 1;
  const to = (at: number) => (at >= 0 && at <= last && at !== focused ? at : null);
  switch (key) {
    case 'ArrowRight':
      return to(focused + 1);
    case 'ArrowLeft':
      return to(focused - 1);
    case 'ArrowDown':
      if (Math.floor(focused / cols) === Math.floor(last / cols)) return null;
      return to(Math.min(focused + cols, last));
    case 'ArrowUp':
      return to(focused - cols);
    case 'Home':
      return to(0);
    case 'End':
      return to(last);
    default:
      return null;
  }
}

/**
 * `gridKey` over the cards of every section, each section's cards starting a row of their own
 * (`groups` holds how many cards each has; `focused` counts across all of them). Left, Right,
 * Home, and End go through the cards in script order; Down from a section's last row goes to the
 * next section's first row in the same column (or its last card), and Up to the last row above.
 */
export function cardsKey(
  groups: readonly number[],
  columns: number,
  focused: number,
  key: string,
): number | null {
  const total = groups.reduce((sum, n) => sum + n, 0);
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return gridKey(total, columns, focused, key);
  const cols = Math.max(1, Math.floor(columns));
  let start = 0;
  let group = 0;
  while (group < groups.length && focused >= start + (groups[group] ?? 0)) {
    start += groups[group] ?? 0;
    group++;
  }
  const size = groups[group];
  if (size === undefined) return null;
  const local = focused - start;
  const within = gridKey(size, cols, local, key);
  if (within !== null) return start + within;
  const column = local % cols;
  if (key === 'ArrowDown') {
    let next = start + size;
    for (let g = group + 1; g < groups.length; g++) {
      const n = groups[g] ?? 0;
      if (n > 0) return next + Math.min(column, n - 1);
      next += n;
    }
    return null;
  }
  let end = start;
  for (let g = group - 1; g >= 0; g--) {
    const n = groups[g] ?? 0;
    end -= n;
    if (n > 0) {
      const lastRow = Math.floor((n - 1) / cols) * cols;
      return end + Math.min(lastRow + column, n - 1);
    }
  }
  return null;
}
