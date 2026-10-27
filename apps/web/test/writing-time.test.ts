import { describe, expect, test } from 'vitest';
import { BURST_MS, createTimeTracker, GAP_MS } from '../app/stats/writing-time';

/** Local time, which is what a day is. */
const at = (h: number, min = 0, s = 0, d = 27) => new Date(2026, 9, d, h, min, s).getTime();
const SEC = 1000;
const MIN = 60 * SEC;

const total = (counted: ReadonlyMap<string, number>) =>
  [...counted.values()].reduce((sum, ms) => sum + ms, 0);

describe('the writing-time tracker', () => {
  test('counts a stretch of edits from the first to the last', () => {
    const t = createTimeTracker();
    t.edit(at(9));
    t.edit(at(9, 1));
    t.edit(at(9, 2, 30));
    expect(t.counted().get('2026-10-27')).toBe(2.5 * MIN);
  });

  test('ends a stretch after a 2-minute gap, and does not count the gap', () => {
    expect(GAP_MS).toBe(2 * MIN);
    const t = createTimeTracker();
    t.edit(at(9));
    t.edit(at(9, 1));
    // Exactly two minutes is still the same stretch.
    t.edit(at(9, 3));
    // More than two is a new one.
    t.edit(at(9, 5, 1));
    t.edit(at(9, 6, 1));
    expect(t.counted().get('2026-10-27')).toBe(3 * MIN + 1 * MIN);
  });

  test('counts a single edit as a 30-second burst', () => {
    expect(BURST_MS).toBe(30 * SEC);
    const t = createTimeTracker();
    t.edit(at(9));
    expect(t.counted().get('2026-10-27')).toBe(30 * SEC);
    // A second edit 10 seconds later is the same stretch, and still the burst.
    t.edit(at(9, 0, 10));
    expect(t.counted().get('2026-10-27')).toBe(30 * SEC);
    // Past the burst, the stretch counts from first to last.
    t.edit(at(9, 0, 45));
    expect(t.counted().get('2026-10-27')).toBe(45 * SEC);
  });

  test('ends a stretch at its last edit when the tab is hidden, and the burst stops at the next edit', () => {
    const t = createTimeTracker();
    t.edit(at(9));
    t.edit(at(9, 1));
    t.end();
    // Back after 20 seconds: a new stretch, the hidden time not counted.
    t.edit(at(9, 1, 20));
    t.edit(at(9, 2, 20));
    expect(t.counted().get('2026-10-27')).toBe(2 * MIN);

    // A burst cut short: one edit, hidden, and an edit 10 seconds after the first.
    const u = createTimeTracker();
    u.edit(at(10));
    u.end();
    u.edit(at(10, 0, 10));
    // 10 seconds for the first stretch, 30 for the second burst.
    expect(u.counted().get('2026-10-27')).toBe(40 * SEC);
  });

  test('ending twice, or with nothing counted, changes nothing', () => {
    const t = createTimeTracker();
    t.end();
    t.end();
    expect(total(t.counted())).toBe(0);
    t.edit(at(9));
    t.end();
    t.end();
    expect(total(t.counted())).toBe(30 * SEC);
  });

  test('splits a stretch over local midnight between the two days', () => {
    const t = createTimeTracker();
    t.edit(at(23, 59, 0, 26));
    t.edit(at(0, 0, 30, 27));
    t.edit(at(0, 1, 0, 27));
    expect(t.counted().get('2026-10-26')).toBe(1 * MIN);
    expect(t.counted().get('2026-10-27')).toBe(1 * MIN);
    // A burst that starts a few seconds before midnight crosses it too.
    const u = createTimeTracker();
    u.edit(at(23, 59, 50, 26));
    expect(u.counted().get('2026-10-26')).toBe(10 * SEC);
    expect(u.counted().get('2026-10-27')).toBe(20 * SEC);
  });

  test('a clock that goes back starts a new stretch and counts nothing backward', () => {
    const t = createTimeTracker();
    t.edit(at(9, 5));
    t.edit(at(9));
    expect(t.counted().get('2026-10-27')).toBe(60 * SEC);
  });

  test('hands over what was counted since the last take, by day', () => {
    const t = createTimeTracker();
    expect(t.take().size).toBe(0);
    t.edit(at(9));
    t.edit(at(9, 1));
    expect(Object.fromEntries(t.take())).toEqual({ '2026-10-27': 1 * MIN });
    expect(t.take().size).toBe(0);
    t.edit(at(9, 1, 30));
    expect(Object.fromEntries(t.take())).toEqual({ '2026-10-27': 30 * SEC });
    // A burst taken and then cut short hands back the difference.
    const u = createTimeTracker();
    u.edit(at(10));
    u.end();
    expect(Object.fromEntries(u.take())).toEqual({ '2026-10-27': 30 * SEC });
    u.edit(at(10, 0, 10));
    // 10 seconds instead of 30 for the first, and 30 for the new burst: +10 in all.
    expect(Object.fromEntries(u.take())).toEqual({ '2026-10-27': 10 * SEC });
  });
});
