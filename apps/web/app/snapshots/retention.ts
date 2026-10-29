// Which snapshots to keep (Phase 2 design §11.1, technical design §8.4): pure, with the clock passed in.
import { dateKey } from '../stats/keys';

/** What thinning needs to know of a snapshot. */
export interface Kept {
  id: string;
  createdAt: number;
  labeled: boolean;
}

export const DAY_MS = 86_400_000;

/** Later in time; between two taken at once, the greater id, so every choice is the same one. */
const later = (a: Kept, b: Kept) =>
  a.createdAt !== b.createdAt ? a.createdAt > b.createdAt : a.id > b.id;

const hourOf = (t: number) => `${dateKey(new Date(t))} ${new Date(t).getHours()}`;
const dayOf = (t: number) => dateKey(new Date(t));

/**
 * The ids to delete. Keeps: every labeled; every one in `keep`; the newest; all within 24 hours of
 * `now` (and any dated after it); then the last of each local hour to 7 days; the last of each
 * local day to 90 days; then none. The last of an hour or a day is the last of its unlabeled ones
 * in that stretch (Call 8: it holds the most work).
 */
export function thin(rows: readonly Kept[], now: number, keep: ReadonlySet<string>): string[] {
  let newest: Kept | undefined;
  for (const row of rows) if (!newest || later(row, newest)) newest = row;

  const lastOf = new Map<string, Kept>();
  const bucketOf = (row: Kept): string | null => {
    const age = now - row.createdAt;
    if (age <= DAY_MS) return null; // kept
    if (age <= 7 * DAY_MS) return `h ${hourOf(row.createdAt)}`;
    if (age <= 90 * DAY_MS) return `d ${dayOf(row.createdAt)}`;
    return ''; // too old: none
  };
  for (const row of rows) {
    if (row.labeled) continue;
    const bucket = bucketOf(row);
    if (!bucket) continue;
    const last = lastOf.get(bucket);
    if (!last || later(row, last)) lastOf.set(bucket, row);
  }

  const gone: string[] = [];
  for (const row of rows) {
    if (row.labeled || keep.has(row.id) || row === newest) continue;
    const bucket = bucketOf(row);
    if (bucket === null) continue;
    if (bucket === '' || lastOf.get(bucket) !== row) gone.push(row.id);
  }
  return gone;
}
