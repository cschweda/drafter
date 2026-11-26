import { normalizeLabel } from '@drafter/notes';
import type { Lanes, LaneUnit } from '@drafter/outline';

// The Lanes' rows and keys (threads design §7.3, §7.5), as pure functions of the lanes. A row is
// a thread's (by first appearance) or, last and only when some unit has no thread, No thread's; a
// place is a row and the index of a unit in `lanes.units`. The view is one Tab stop and moves its
// roving tabindex to the place `nextCell` gives.

export interface LaneRow {
  /** The thread's key (`normalizeLabel`), or null for No thread. */
  key: string | null;
  /** Indexes into `lanes.units`, in order: the units this row has a block for. */
  units: number[];
}

export interface LanePlace {
  row: number;
  unit: number;
}

/** The rows of `lanes`: one per thread in order of first appearance, then No thread if needed. */
export function laneRows(lanes: Lanes): LaneRow[] {
  const rows: LaneRow[] = lanes.threads.map((t) => ({ key: t.key, units: [] }));
  const byKey = new Map<string, LaneRow>();
  for (const row of rows) byKey.set(row.key as string, row);
  const none: number[] = [];
  lanes.units.forEach((u, i) => {
    if (u.threads.length === 0) {
      none.push(i);
      return;
    }
    const seen = new Set<string>();
    for (const label of u.threads) {
      const key = normalizeLabel(label);
      if (seen.has(key)) continue;
      seen.add(key);
      byKey.get(key)?.units.push(i);
    }
  });
  if (none.length > 0) rows.push({ key: null, units: none });
  return rows;
}

/** How far `at` is from the unit: 0 inside it, else to its nearer end. */
const distance = (u: LaneUnit, at: number) => Math.max(u.from - at, at - (u.from + u.length), 0);

/**
 * Of `units` (indexes into `all`), the one covering `at` (from its start up to its end, so where one
 * ends and the next starts is the next one's; a zero-length unit covers its own point), else the
 * nearest, the earlier of two as near.
 */
function nearest(all: readonly LaneUnit[], units: readonly number[], at: number): number {
  let best = units[0] as number;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const i of units) {
    const u = all[i] as LaneUnit;
    if ((u.from <= at && at < u.from + u.length) || (u.length === 0 && at === u.from)) return i;
    const d = distance(u, at);
    if (d < bestDistance) {
      best = i;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Where `key` moves focus from `at`: Left and Right along the row's blocks (stopping at its ends),
 * Home and End to its first and last, Up and Down to the next row with blocks, on the block
 * covering the middle of this one, else the nearest by position. Null for any other key, no move,
 * or a place that isn't one.
 */
export function nextCell(lanes: Lanes, at: LanePlace, key: string): LanePlace | null {
  const rows = laneRows(lanes);
  const row = rows[at.row];
  const index = row ? row.units.indexOf(at.unit) : -1;
  if (!row || index < 0) return null;
  const last = row.units.length - 1;
  const along = (i: number) =>
    i >= 0 && i <= last && i !== index ? { row: at.row, unit: row.units[i] as number } : null;
  switch (key) {
    case 'ArrowLeft':
      return along(index - 1);
    case 'ArrowRight':
      return along(index + 1);
    case 'Home':
      return along(0);
    case 'End':
      return along(last);
    case 'ArrowUp':
    case 'ArrowDown': {
      const step = key === 'ArrowUp' ? -1 : 1;
      const focused = lanes.units[at.unit] as LaneUnit;
      const middle = focused.from + focused.length / 2;
      for (let r = at.row + step; r >= 0 && r < rows.length; r += step) {
        const units = (rows[r] as LaneRow).units;
        if (units.length > 0) return { row: r, unit: nearest(lanes.units, units, middle) };
      }
      return null;
    }
    default:
      return null;
  }
}
