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
  /** An index into `lanes.units`, or `HEADER` for a thread row's header (its menu's button). */
  unit: number;
}

/** The place of a thread row's header. No thread's header has no menu, so is no place. */
export const HEADER = -1;

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
 * From a thread row's header: Right and End to the row's first and last block, Up and Down to the
 * header of the row above or below when that is a thread's; null otherwise.
 */
function fromHeader(rows: readonly LaneRow[], r: number, key: string): LanePlace | null {
  const row = rows[r] as LaneRow;
  if (row.key === null) return null;
  switch (key) {
    case 'ArrowRight':
      return row.units.length > 0 ? { row: r, unit: row.units[0] as number } : null;
    case 'End':
      return row.units.length > 0 ? { row: r, unit: row.units.at(-1) as number } : null;
    case 'ArrowUp':
    case 'ArrowDown': {
      const next = r + (key === 'ArrowUp' ? -1 : 1);
      return rows[next] && rows[next]?.key !== null ? { row: next, unit: HEADER } : null;
    }
    default:
      return null;
  }
}

/**
 * Where `key` moves focus from `at`: Left and Right along the row's blocks (Left from a thread
 * row's first block to its header, `HEADER`; Right stopping at the end), headers as `fromHeader`,
 * Home and End to its first and last, Up and Down to the next row with blocks, on the block
 * covering the middle of this one, else the nearest by position. Null for any other key, no move,
 * or a place that isn't one.
 */
export function nextCell(lanes: Lanes, at: LanePlace, key: string): LanePlace | null {
  const rows = laneRows(lanes);
  const row = rows[at.row];
  if (row && at.unit === HEADER) return fromHeader(rows, at.row, key);
  const index = row ? row.units.indexOf(at.unit) : -1;
  if (!row || index < 0) return null;
  const last = row.units.length - 1;
  const along = (i: number) =>
    i >= 0 && i <= last && i !== index ? { row: at.row, unit: row.units[i] as number } : null;
  switch (key) {
    case 'ArrowLeft':
      // From a thread row's first block, to its header.
      if (index === 0) return row.key === null ? null : { row: at.row, unit: HEADER };
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

/**
 * Where the tab stop `id` is in `lanes`: a unit's index, `HEADER` when `id` is `headId` (a row's
 * header is the stop), or null when it's gone.
 */
export function stopIndex(lanes: Lanes, id: string, headId: string): number | null {
  if (id === headId) return HEADER;
  const i = lanes.units.findIndex((u) => u.id === id);
  return i >= 0 ? i : null;
}
