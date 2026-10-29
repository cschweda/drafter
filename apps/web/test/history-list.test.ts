import { describe, expect, test } from 'vitest';
import { historyDays, historyKey, snapshotFileName } from '../app/snapshots/history';
import type { SnapshotInfo } from '../app/storage/snapshots';

// Local times, so the days are the writer's.
const at = (month: number, day: number, hour: number, minute = 0) =>
  new Date(2026, month - 1, day, hour, minute).getTime();
const NOW = at(10, 29, 15);

const row = (id: string, createdAt: number, extra: Partial<SnapshotInfo> = {}): SnapshotInfo => ({
  id,
  createdAt,
  reason: 'timed',
  words: 100,
  readable: true,
  ...extra,
});

describe('History, listed by day', () => {
  test('groups rows by local day, newest first', () => {
    const rows = [
      row('a', at(10, 27, 9)),
      row('b', at(10, 29, 10, 42)),
      row('c', at(10, 27, 23, 59)),
      row('d', at(10, 29, 0, 1)),
      row('e', at(10, 28, 12)),
    ];
    const days = historyDays(rows, NOW);
    expect(days.map((d) => d.key)).toEqual(['2026-10-29', '2026-10-28', '2026-10-27']);
    expect(days.map((d) => d.rows.map((r) => r.id))).toEqual([['b', 'd'], ['e'], ['c', 'a']]);
    expect(historyDays([], NOW)).toEqual([]);
  });

  test('names today and yesterday', () => {
    const days = historyDays(
      [
        row('a', at(10, 29, 9)),
        row('b', at(10, 28, 9)),
        row('c', at(10, 27, 9)),
        row('d', at(12, 30, 9) - 365 * 86_400_000),
      ],
      NOW,
    );
    expect(days.map((d) => d.title)).toEqual([
      'Today',
      'Yesterday',
      'Tuesday, 27 October',
      // Another year says which.
      'Tuesday, 30 December 2025',
    ]);
    // Just after midnight, yesterday is the day before.
    expect(historyDays([row('a', at(10, 28, 23))], at(10, 29, 0, 5))[0]?.title).toBe('Yesterday');
  });

  test("says each row's words change from the one before", () => {
    const days = historyDays(
      [
        row('new', at(10, 29, 10), { words: 1324, reason: 'saved' }),
        row('mid', at(10, 28, 10), { words: 1204, label: 'Draft for Sam' }),
        row('old', at(10, 28, 9), { words: 1204, reason: 'opened', detail: 'The Call.fountain' }),
      ],
      NOW,
    );
    const rows = days.flatMap((d) => d.rows);
    // Against the next older row, across days; the oldest shows its count.
    expect(rows.map((r) => r.change)).toEqual(['+120 words', 'No change in words', '1,204 words']);
    expect(rows.map((r) => r.said)).toEqual(['Saved', 'Draft for Sam', 'Opened The Call.fountain']);
  });

  test('Up and Down move, and each key names its action', () => {
    expect(historyKey(3, 0, 'ArrowDown')).toEqual({ focus: 1 });
    expect(historyKey(3, 1, 'ArrowUp')).toEqual({ focus: 0 });
    expect(historyKey(3, 0, 'ArrowUp')).toBeNull();
    expect(historyKey(3, 2, 'ArrowDown')).toBeNull();
    expect(historyKey(3, 1, 'Home')).toEqual({ focus: 0 });
    expect(historyKey(3, 1, 'End')).toEqual({ focus: 2 });
    const actions: Record<string, string> = {
      Enter: 'compare-now',
      c: 'compare-with',
      C: 'compare-with',
      r: 'restore',
      R: 'restore',
      l: 'label',
      L: 'label',
      s: 'save',
      S: 'save',
      Delete: 'delete',
      Backspace: 'delete',
      ContextMenu: 'menu',
    };
    for (const [key, action] of Object.entries(actions)) {
      expect(historyKey(3, 1, key)).toEqual({ action });
    }
    expect(historyKey(3, 1, 'x')).toBeNull();
    expect(historyKey(0, 0, 'Enter')).toBeNull();
  });

  test("names a snapshot's file by title and time", () => {
    expect(snapshotFileName('The Call', at(10, 29, 10, 42), 'fountain')).toBe(
      'The Call (snapshot 2026-10-29 1042).fountain',
    );
    expect(snapshotFileName('Notes', at(3, 5, 9, 7), 'markdown')).toBe(
      'Notes (snapshot 2026-03-05 0907).md',
    );
    // A title that can't be a file's name is cleaned as Save's is, and the time is always there.
    expect(snapshotFileName('A/B: "C"', at(10, 29, 10, 42), 'fountain')).toBe(
      'AB C (snapshot 2026-10-29 1042).fountain',
    );
    expect(snapshotFileName('x'.repeat(200), at(10, 29, 10, 42), 'fountain')).toMatch(
      / \(snapshot 2026-10-29 1042\)\.fountain$/,
    );
  });
});
