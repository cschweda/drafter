import { type LaneUnit, lanesOf } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { HEADER, laneRows, nextCell, stopIndex } from '../app/threads/grid-keys';

// The Lanes' keys (threads design §7.5), as a pure function of the lanes: Left and Right along a
// row's blocks, Up and Down to the next row's block nearest in position, Home and End to a row's
// ends. A place is a row (a thread's, by first appearance, then No thread) and a unit's index.

const unit = (i: number, from: number, length: number, threads: string[]): LaneUnit => ({
  id: `u${i}`,
  label: String(i + 1),
  heading: `${i + 1} SCENE ${i + 1}`,
  from,
  length,
  threads,
});

/**
 * Ten units of 10 each, 0–100:
 *   A: 0, 1, 2, 7       (u0 first, so A is row 0)
 *   B: 1, 8, 9          (row 1)
 *   C: 3                (row 2)
 *   No thread: 4, 5, 6  (row 3)
 */
const LANES = lanesOf(
  [
    unit(0, 0, 10, ['A']),
    unit(1, 10, 10, ['B', 'a']),
    unit(2, 20, 10, ['A']),
    unit(3, 30, 10, ['C']),
    unit(4, 40, 10, []),
    unit(5, 50, 10, []),
    unit(6, 60, 10, []),
    unit(7, 70, 10, ['A']),
    unit(8, 80, 10, ['B']),
    unit(9, 90, 10, ['B']),
  ],
  'pages',
);
const at = (row: number, u: number) => ({ row, unit: u });

describe('laneRows', () => {
  test('one row per thread by first appearance, then No thread, case-folded', () => {
    expect(laneRows(LANES)).toEqual([
      { key: 'a', units: [0, 1, 2, 7] },
      { key: 'b', units: [1, 8, 9] },
      { key: 'c', units: [3] },
      { key: null, units: [4, 5, 6] },
    ]);
  });

  test('no No thread row when every unit has a thread', () => {
    const lanes = lanesOf([unit(0, 0, 5, ['A']), unit(1, 5, 5, ['B'])], 'words');
    expect(laneRows(lanes).map((r) => r.key)).toEqual(['a', 'b']);
  });

  test('only No thread when no unit has a thread, and nothing with no units', () => {
    const lanes = lanesOf([unit(0, 0, 5, []), unit(1, 5, 5, [])], 'words');
    expect(laneRows(lanes)).toEqual([{ key: null, units: [0, 1] }]);
    expect(laneRows(lanesOf([], 'pages'))).toEqual([]);
  });
});

describe('nextCell', () => {
  test('Left and Right move along a row’s blocks, skipping units not in it', () => {
    expect(nextCell(LANES, at(0, 2), 'ArrowRight')).toEqual(at(0, 7));
    expect(nextCell(LANES, at(0, 7), 'ArrowLeft')).toEqual(at(0, 2));
    expect(nextCell(LANES, at(1, 1), 'ArrowRight')).toEqual(at(1, 8));
  });

  test('Left at a thread row’s first block goes to its header; Right at its end goes nowhere', () => {
    expect(nextCell(LANES, at(0, 0), 'ArrowLeft')).toEqual(at(0, HEADER));
    expect(nextCell(LANES, at(2, 3), 'ArrowLeft')).toEqual(at(2, HEADER));
    expect(nextCell(LANES, at(0, 7), 'ArrowRight')).toBeNull();
    expect(nextCell(LANES, at(2, 3), 'ArrowRight')).toBeNull();
  });

  test('No thread’s header has no menu, so is no place: Left at its start goes nowhere', () => {
    expect(nextCell(LANES, at(3, 4), 'ArrowLeft')).toBeNull();
    expect(nextCell(LANES, at(3, HEADER), 'ArrowRight')).toBeNull();
  });

  test('from a header: Right and End to the row’s blocks, Up and Down to the next header', () => {
    expect(nextCell(LANES, at(0, HEADER), 'ArrowRight')).toEqual(at(0, 0));
    expect(nextCell(LANES, at(0, HEADER), 'End')).toEqual(at(0, 7));
    expect(nextCell(LANES, at(1, HEADER), 'ArrowLeft')).toBeNull();
    expect(nextCell(LANES, at(1, HEADER), 'Home')).toBeNull();
    expect(nextCell(LANES, at(0, HEADER), 'ArrowDown')).toEqual(at(1, HEADER));
    expect(nextCell(LANES, at(1, HEADER), 'ArrowUp')).toEqual(at(0, HEADER));
    expect(nextCell(LANES, at(0, HEADER), 'ArrowUp')).toBeNull();
    // No thread's header is no place: Down from the last thread's goes nowhere.
    expect(nextCell(LANES, at(2, HEADER), 'ArrowDown')).toBeNull();
    expect(nextCell(LANES, at(1, HEADER), 'Enter')).toBeNull();
  });

  test('Home and End go to a row’s ends, nowhere when already there', () => {
    expect(nextCell(LANES, at(0, 2), 'Home')).toEqual(at(0, 0));
    expect(nextCell(LANES, at(0, 2), 'End')).toEqual(at(0, 7));
    expect(nextCell(LANES, at(0, 0), 'Home')).toBeNull();
    expect(nextCell(LANES, at(0, 7), 'End')).toBeNull();
  });

  test('Down and Up go to the block in the next row covering the middle of this one', () => {
    // u1 (10–20) is in A and B: from A's u1 down to B's u1.
    expect(nextCell(LANES, at(0, 1), 'ArrowDown')).toEqual(at(1, 1));
    expect(nextCell(LANES, at(1, 1), 'ArrowUp')).toEqual(at(0, 1));
  });

  test('with no block near, Down and Up go to the nearest by position', () => {
    // A's u7 (70–80, middle 75): B has u1 (10–20), u8 (80–90), u9: u8 is nearest.
    expect(nextCell(LANES, at(0, 7), 'ArrowDown')).toEqual(at(1, 8));
    // B's u8 (middle 85) down to C, whose only block is u3.
    expect(nextCell(LANES, at(1, 8), 'ArrowDown')).toEqual(at(2, 3));
    // C's u3 (middle 35) down to No thread: u4 (40–50) is nearest.
    expect(nextCell(LANES, at(2, 3), 'ArrowDown')).toEqual(at(3, 4));
    // No thread's u6 (middle 65) up to C's only block.
    expect(nextCell(LANES, at(3, 6), 'ArrowUp')).toEqual(at(2, 3));
    // A's u2 (middle 25): B's u1 ends at 20, 5 away; u8 starts at 80.
    expect(nextCell(LANES, at(0, 2), 'ArrowDown')).toEqual(at(1, 1));
  });

  test('of two blocks as near, Down takes the earlier', () => {
    const lanes = lanesOf(
      [unit(0, 0, 10, ['B']), unit(1, 10, 10, ['A']), unit(2, 20, 10, ['B'])],
      'pages',
    );
    // B is row 0 (first), A row 1. A's u1 (middle 15) up: u0 ends 5 away, u2 starts 5 away.
    expect(nextCell(lanes, at(1, 1), 'ArrowUp')).toEqual(at(0, 0));
  });

  test('Up in the first row and Down in the last go nowhere', () => {
    expect(nextCell(LANES, at(0, 2), 'ArrowUp')).toBeNull();
    expect(nextCell(LANES, at(3, 5), 'ArrowDown')).toBeNull();
  });

  test('a single row: only Left, Right, Home, and End move, Left to the header', () => {
    const lanes = lanesOf(
      [unit(0, 0, 3, ['A']), unit(1, 3, 3, ['A']), unit(2, 6, 3, ['A'])],
      'words',
    );
    expect(nextCell(lanes, at(0, 1), 'ArrowUp')).toBeNull();
    expect(nextCell(lanes, at(0, 1), 'ArrowDown')).toBeNull();
    expect(nextCell(lanes, at(0, 1), 'ArrowRight')).toEqual(at(0, 2));
    expect(nextCell(lanes, at(0, 1), 'Home')).toEqual(at(0, 0));
    expect(nextCell(lanes, at(0, 0), 'End')).toEqual(at(0, 2));
    expect(nextCell(lanes, at(0, 0), 'ArrowLeft')).toEqual(at(0, HEADER));
  });

  test('a zero-length unit is a place: covered at its own point, and moved through', () => {
    const lanes = lanesOf(
      [unit(0, 0, 10, ['A']), unit(1, 10, 0, ['A', 'B']), unit(2, 10, 10, ['B'])],
      'words',
    );
    expect(nextCell(lanes, at(0, 0), 'ArrowRight')).toEqual(at(0, 1));
    expect(nextCell(lanes, at(0, 1), 'ArrowLeft')).toEqual(at(0, 0));
    // From A's empty u1 (at 10) down: B's u1 is at 10 too.
    expect(nextCell(lanes, at(0, 1), 'ArrowDown')).toEqual(at(1, 1));
    // From B's u2 (10–20, middle 15) up: A's u0 ends 5 away, u1 is 5 away; the earlier.
    expect(nextCell(lanes, at(1, 2), 'ArrowUp')).toEqual(at(0, 0));
  });

  test('a unit not in the row, a row not there, or another key: null', () => {
    expect(nextCell(LANES, at(0, 3), 'ArrowRight')).toBeNull();
    expect(nextCell(LANES, at(9, 0), 'ArrowRight')).toBeNull();
    expect(nextCell(LANES, at(0, 0), 'Enter')).toBeNull();
    expect(nextCell(LANES, at(0, 0), 'PageDown')).toBeNull();
  });
});

describe('stopIndex', () => {
  const lanes = lanesOf([unit(0, 0, 10, ['A']), unit(1, 10, 10, [])], 'words');
  test('a unit, a row header, or gone', () => {
    expect(stopIndex(lanes, 'u1', '@header')).toBe(1);
    expect(stopIndex(lanes, '@header', '@header')).toBe(HEADER);
    expect(stopIndex(lanes, 'nope', '@header')).toBeNull();
  });
});
