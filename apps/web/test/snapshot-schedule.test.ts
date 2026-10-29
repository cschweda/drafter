import { describe, expect, test } from 'vitest';
import { createSnapshotSchedule, SNAPSHOT_EVERY_MS } from '../app/snapshots/schedule';

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = new Date(2026, 9, 29, 9).getTime();

/** Edits every 30 seconds from `from` to `to` (milliseconds after T0), both ends included. */
function write(schedule: ReturnType<typeof createSnapshotSchedule>, from: number, to: number) {
  for (let at = from; at <= to; at += 30 * SEC) schedule.edit(T0 + at);
}

describe('the snapshot schedule', () => {
  test('is due after 10 minutes of writing', () => {
    expect(SNAPSHOT_EVERY_MS).toBe(10 * MIN);
    const schedule = createSnapshotSchedule();
    write(schedule, 0, 9 * MIN + 30 * SEC);
    expect(schedule.due()).toBe(false);
    schedule.edit(T0 + 10 * MIN);
    expect(schedule.due()).toBe(true);
  });

  test('a pause longer than 2 minutes doesn’t count', () => {
    const schedule = createSnapshotSchedule();
    write(schedule, 0, 5 * MIN);
    // Three minutes away: a new stretch, and the pause isn't writing.
    write(schedule, 8 * MIN, 12 * MIN + 30 * SEC);
    expect(schedule.due()).toBe(false);
    schedule.edit(T0 + 13 * MIN);
    expect(schedule.due()).toBe(true);
  });

  test('is not due after 10 minutes of the clock with no writing', () => {
    const schedule = createSnapshotSchedule();
    schedule.edit(T0);
    schedule.end();
    schedule.edit(T0 + 10 * MIN);
    expect(schedule.due()).toBe(false);
    // A key every five minutes for an hour is a few bursts, not an hour of writing.
    for (let at = 15 * MIN; at <= 60 * MIN; at += 5 * MIN) schedule.edit(T0 + at);
    expect(schedule.due()).toBe(false);
  });

  test('starts again after a snapshot', () => {
    const schedule = createSnapshotSchedule();
    write(schedule, 0, 6 * MIN);
    // A save at six minutes: the count starts there.
    schedule.taken();
    write(schedule, 6 * MIN + 30 * SEC, 15 * MIN + 30 * SEC);
    expect(schedule.due()).toBe(false);
    schedule.edit(T0 + 16 * MIN);
    expect(schedule.due()).toBe(true);
    schedule.taken();
    expect(schedule.due()).toBe(false);
    write(schedule, 16 * MIN + 30 * SEC, 26 * MIN);
    expect(schedule.due()).toBe(true);
  });
});
