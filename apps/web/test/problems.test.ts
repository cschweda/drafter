import { describe, expect, test } from 'vitest';
import { mergeFixes } from '../app/editor/problems';

const change = (from: number, to: number, insert = '') => ({ from, to, insert });

describe('mergeFixes', () => {
  test('sorts changes and skips overlapping fixes', () => {
    const merged = mergeFixes([
      { changes: [change(20, 25), change(30, 31, ' ')] },
      { changes: [change(2, 4)] },
      // Overlaps the first fix's second change: left out whole, its other change with it.
      { changes: [change(5, 5, '\n'), change(28, 32)] },
      // Inside the first fix's first change.
      { changes: [change(21, 21, 'x')] },
      { changes: [change(40, 40, '\n')] },
    ]);
    expect(merged).toEqual([
      change(2, 4),
      change(20, 25),
      change(30, 31, ' '),
      change(40, 40, '\n'),
    ]);
  });

  test('keeps fixes that only touch', () => {
    const merged = mergeFixes([
      { changes: [change(10, 15)] },
      { changes: [change(15, 15, '\n')] },
      { changes: [change(15, 18, '-')] },
      { changes: [change(5, 10)] },
    ]);
    expect(merged).toEqual([
      change(5, 10),
      change(10, 15),
      change(15, 15, '\n'),
      change(15, 18, '-'),
    ]);
  });

  test('is empty for no fixes', () => {
    expect(mergeFixes([])).toEqual([]);
    expect(mergeFixes([{ changes: [] }])).toEqual([]);
  });
});
