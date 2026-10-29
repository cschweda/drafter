// The Cards tab's keys (Phase 2 design §7): the cards flow into rows, and the arrow keys move by
// where a card is drawn. Pure functions of card positions; `columns` is measured from the drawn
// cards, so it follows the pane's width and the card size (one column on a phone).

import {
  downTarget,
  type MoveTarget,
  type Scene,
  type SceneIndex,
  targetBefore,
  upTarget,
} from '@drafter/outline';

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

/**
 * How many cards each group holds: a group is each run of scenes in the same innermost section,
 * as the Cards tab draws them.
 */
export function groupSizes(scenes: readonly Scene[]): number[] {
  const sizes: number[] = [];
  let section: number | null | undefined;
  scenes.forEach((scene, i) => {
    const inner = scene.sections.at(-1) ?? null;
    if (i > 0 && inner === section) sizes[sizes.length - 1] = (sizes.at(-1) ?? 0) + 1;
    else sizes.push(1);
    section = inner;
  });
  return sizes;
}

/**
 * Alt+Up: before the card one row up in the same column; Alt+Down: after the card one row down
 * (rows as drawn, in rows of `columns`, by `cardsKey`). In one column (a phone) a row is one
 * place, so they are `upTarget` and `downTarget`, crossing a section's edge as the Outline does.
 * Null at an edge, or for a block that is no scene.
 */
export function rowMoveTarget(
  index: SceneIndex,
  block: number,
  columns: number,
  direction: 'up' | 'down',
): MoveTarget | null {
  const at = index.scenes.findIndex((s) => s.block === block);
  if (at < 0) return null;
  if (Math.floor(columns) <= 1) {
    return direction === 'up' ? upTarget(index, block) : downTarget(index, block);
  }
  const key = direction === 'up' ? 'ArrowUp' : 'ArrowDown';
  const to = cardsKey(groupSizes(index.scenes), columns, at, key);
  const other = to === null ? undefined : index.scenes[to];
  if (!other) return null;
  return direction === 'up' ? targetBefore(index, other.block) : { after: other.block };
}
