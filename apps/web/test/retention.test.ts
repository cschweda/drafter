import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { DAY_MS, type Kept, thin } from '../app/snapshots/retention';
import { dateKey } from '../app/stats/keys';

const HOUR = 3_600_000;
const MINUTE = 60_000;
// Noon, local time, so hour and day buckets fall where the tests expect in any time zone.
const NOW = new Date(2026, 9, 29, 12, 0, 0).getTime();
const NONE = new Set<string>();

const row = (id: string, createdAt: number, labeled = false): Kept => ({ id, createdAt, labeled });
const hourKey = (t: number) => `${dateKey(new Date(t))} ${new Date(t).getHours()}`;

describe('thin', () => {
  test('keeps everything from the last 24 hours', () => {
    const rows = [
      row('a', NOW - 1 * MINUTE),
      row('b', NOW - 2 * MINUTE),
      row('c', NOW - 3 * MINUTE),
      row('d', NOW - DAY_MS),
      row('later', NOW + HOUR),
    ];
    expect(thin(rows, NOW, NONE)).toEqual([]);
  });

  test('keeps the last of each hour to 7 days', () => {
    // Two days ago, three in one local hour and one in the next.
    const base = new Date(2026, 9, 27, 9, 0, 0).getTime();
    const rows = [
      row('newest', NOW - MINUTE),
      row('h9-a', base + 5 * MINUTE),
      row('h9-b', base + 30 * MINUTE),
      row('h9-c', base + 55 * MINUTE),
      row('h10', base + HOUR + 5 * MINUTE),
    ];
    expect(thin(rows, NOW, NONE).sort()).toEqual(['h9-a', 'h9-b']);
  });

  test('keeps the last of each day to 90 days', () => {
    const day = new Date(2026, 9, 1, 8, 0, 0).getTime(); // 28 days ago
    const rows = [
      row('newest', NOW - MINUTE),
      row('morning', day),
      row('noon', day + 4 * HOUR),
      row('evening', day + 12 * HOUR),
      row('next-day', day + DAY_MS),
    ];
    expect(thin(rows, NOW, NONE).sort()).toEqual(['morning', 'noon']);
  });

  test('deletes unlabeled snapshots older than 90 days', () => {
    const rows = [
      row('newest', NOW - MINUTE),
      row('old', NOW - 91 * DAY_MS),
      row('older', NOW - 200 * DAY_MS),
      row('just-in', NOW - 89 * DAY_MS),
    ];
    expect(thin(rows, NOW, NONE).sort()).toEqual(['old', 'older']);
  });

  test('keeps the newest however old it is', () => {
    const rows = [row('last', NOW - 120 * DAY_MS), row('before', NOW - 121 * DAY_MS)];
    expect(thin(rows, NOW, NONE)).toEqual(['before']);
  });

  test('keeps a labeled snapshot of any age', () => {
    const rows = [
      row('newest', NOW - MINUTE),
      row('draft-1', NOW - 400 * DAY_MS, true),
      row('same-day', NOW - 30 * DAY_MS, true),
      row('same-day-later', NOW - 30 * DAY_MS + MINUTE),
    ];
    expect(thin(rows, NOW, NONE)).toEqual([]);
  });

  test('keeps the ids it is told to keep', () => {
    const rows = [
      row('newest', NOW - MINUTE),
      row('saved', NOW - 100 * DAY_MS),
      row('gone', NOW - 101 * DAY_MS),
    ];
    expect(thin(rows, NOW, new Set(['saved']))).toEqual(['gone']);
  });

  test('thinning keeps the newest, every labeled, and the last save’s snapshot, and is idempotent', () => {
    const span = 200 * DAY_MS;
    const rowsArb = fc
      .array(
        fc.record({
          createdAt: fc.integer({ min: NOW - span, max: NOW + span }),
          labeled: fc.boolean(),
        }),
        { minLength: 1, maxLength: 80 },
      )
      .map((list) => list.map((r, i) => ({ ...r, id: `s${i}` })));
    fc.assert(
      fc.property(rowsArb, fc.nat(), (rows, pick) => {
        const saved = rows[pick % rows.length]?.id ?? '';
        const keep = new Set([saved]);
        const gone = new Set(thin(rows, NOW, keep));
        const kept = rows.filter((r) => !gone.has(r.id));

        const newest = rows.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
        expect(kept.some((r) => r.createdAt === newest.createdAt)).toBe(true);
        expect(gone.has(saved)).toBe(false);
        for (const r of rows) if (r.labeled) expect(gone.has(r.id)).toBe(false);
        for (const r of rows) if (r.createdAt >= NOW - DAY_MS) expect(gone.has(r.id)).toBe(false);
        for (const r of rows) {
          if (r.createdAt < NOW - 90 * DAY_MS && !r.labeled && r.id !== saved) {
            expect(gone.has(r.id) || r.createdAt === newest.createdAt).toBe(true);
          }
        }

        // Thinning again deletes nothing.
        expect(thin(kept, NOW, keep)).toEqual([]);

        // No two unlabeled kept in one hour between 24 hours and 7 days, but for the kept ids.
        const hours = new Map<string, number>();
        for (const r of kept) {
          if (r.labeled || keep.has(r.id)) continue;
          if (r.createdAt >= NOW - DAY_MS || r.createdAt < NOW - 7 * DAY_MS) continue;
          const key = hourKey(r.createdAt);
          hours.set(key, (hours.get(key) ?? 0) + 1);
        }
        for (const count of hours.values()) expect(count).toBe(1);
      }),
      { numRuns: 300 },
    );
  });
});
