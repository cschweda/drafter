import type { DeletedScene, ScenePrint } from '@drafter/history';
import { describe, expect, test } from 'vitest';
import {
  countLabel,
  deletedKey,
  filterDeleted,
  lastInLabel,
  progressLabel,
  versionsLabel,
} from '../app/history/labels';
import { snapshotTime } from '../app/snapshots/history';
import type { SnapshotInfo } from '../app/storage/snapshots';

// What the Deleted scenes tab says of an entry (version-history design §3.3): the snapshot it was
// last in, by History's words for it; how many versions held it, and from when; and the filter,
// which folds case and accents.

const NOW = new Date(2026, 9, 30, 15, 0).getTime();
const TUESDAY = new Date(2026, 9, 27, 10, 42).getTime();
const EARLIER = new Date(2026, 9, 21, 9, 5).getTime();

function entry(heading: string, preview: string, at = TUESDAY, versions = 6): DeletedScene {
  const print: ScenePrint = {
    hash: heading,
    headingKey: heading,
    heading,
    shingles: 0,
    sketch: new Uint32Array(),
    words: 3,
    preview,
  };
  return {
    key: heading,
    newest: {
      snapshot: `s-${heading}`,
      at,
      slot: { hash: heading, ordinal: 1, from: 0, to: 10, section: false },
      print,
    },
    versions,
    oldestAt: EARLIER,
  };
}

const info = (over: Partial<SnapshotInfo>): SnapshotInfo => ({
  id: 's1',
  createdAt: TUESDAY,
  reason: 'saved',
  words: 10,
  readable: true,
  ...over,
});

describe('Deleted scenes labels', () => {
  test('last in says the day, time, and reason or label', () => {
    const hall = entry('INT. HALL - NIGHT', 'Wind.');
    const time = snapshotTime(TUESDAY);
    expect(lastInLabel(hall, info({}), NOW)).toBe(`Last in Tuesday, 27 October, ${time} (Saved)`);
    expect(lastInLabel(hall, info({ reason: 'manual', label: 'Draft two' }), NOW)).toBe(
      `Last in Tuesday, 27 October, ${time} (Draft two)`,
    );
    // Today and yesterday by name; another year with its year; a snapshot no longer listed, no reason.
    const today = entry('INT. HALL - NIGHT', 'Wind.', NOW - 60_000);
    expect(lastInLabel(today, undefined, NOW)).toBe(`Last in today, ${snapshotTime(NOW - 60_000)}`);
    const yesterday = new Date(2026, 9, 29, 8, 0).getTime();
    expect(lastInLabel(entry('A', '', yesterday), info({ reason: 'timed' }), NOW)).toBe(
      `Last in yesterday, ${snapshotTime(yesterday)} (Every 10 minutes)`,
    );
    const lastYear = new Date(2025, 11, 2, 8, 0).getTime();
    expect(lastInLabel(entry('A', '', lastYear), undefined, NOW)).toBe(
      `Last in Tuesday, 2 December 2025, ${snapshotTime(lastYear)}`,
    );
  });

  test('in n versions from a date', () => {
    expect(versionsLabel(entry('A', ''), NOW)).toBe('In 6 versions, from 21 October');
    expect(versionsLabel(entry('A', '', TUESDAY, 1), NOW)).toBe('In 1 version, from 21 October');
    const old = { ...entry('A', ''), oldestAt: new Date(2025, 0, 5).getTime() };
    expect(versionsLabel(old, NOW)).toBe('In 6 versions, from 5 January 2025');
  });

  test('the filter folds case and accents', () => {
    const rows = [
      entry('INT. CAFÉ - DAY', 'Marra orders.'),
      entry('EXT. ROOF - NIGHT', 'Señor Pérez waits.'),
      entry('INT. HALL - DAY', 'Nothing here.'),
    ];
    const headings = (filter: string) =>
      filterDeleted(rows, filter).map((r) => r.newest.print.heading);
    expect(headings('cafe')).toEqual(['INT. CAFÉ - DAY']);
    expect(headings('  CAFÉ ')).toEqual(['INT. CAFÉ - DAY']);
    expect(headings('senor perez')).toEqual(['EXT. ROOF - NIGHT']);
    expect(headings('day')).toEqual(['INT. CAFÉ - DAY', 'INT. HALL - DAY']);
    expect(headings('')).toHaveLength(3);
  });

  test('the slim bar counts and reads', () => {
    expect(countLabel(1)).toBe('1 deleted scene');
    expect(countLabel(1200)).toBe('1,200 deleted scenes');
    expect(progressLabel(120, 300)).toBe('Reading versions… 120 of 300');
  });

  test('keys move through the list and act on the row', () => {
    expect(deletedKey(3, 0, 'ArrowDown')).toEqual({ focus: 1 });
    expect(deletedKey(3, 0, 'ArrowUp')).toBeNull();
    expect(deletedKey(3, 1, 'End')).toEqual({ focus: 2 });
    expect(deletedKey(3, 2, 'Home')).toEqual({ focus: 0 });
    expect(deletedKey(3, 1, 'Enter')).toEqual({ action: 'show-text' });
    expect(deletedKey(3, 1, 'h')).toEqual({ action: 'history' });
    expect(deletedKey(3, 1, 'H')).toEqual({ action: 'history' });
    expect(deletedKey(3, 1, 'p')).toEqual({ action: 'put-back' });
    expect(deletedKey(3, 1, 'P')).toEqual({ action: 'put-back' });
    expect(deletedKey(3, 1, 'ContextMenu')).toEqual({ action: 'menu' });
    expect(deletedKey(3, 1, 'x')).toBeNull();
    expect(deletedKey(0, 0, 'ArrowDown')).toBeNull();
    // A held key repeats moves, never an action: P held down puts back once.
    expect(deletedKey(3, 1, 'p', true)).toBeNull();
    expect(deletedKey(3, 1, 'H', true)).toBeNull();
    expect(deletedKey(3, 1, 'Enter', true)).toBeNull();
    expect(deletedKey(3, 1, 'ArrowDown', true)).toEqual({ focus: 2 });
  });
});
