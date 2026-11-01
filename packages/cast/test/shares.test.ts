import { describe, expect, test } from 'vitest';
import { shares } from '../src';

// Whole percents by largest remainder (moved from the app's Stats tab, its assertions unchanged).

describe('shares by largest remainder', () => {
  test('sum to 100', () => {
    expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(shares([2, 1, 1, 1, 1, 1])).toEqual([29, 15, 14, 14, 14, 14]);
    expect(shares([7, 0, 3])).toEqual([70, 0, 30]);
  });

  test('ties go to the earlier row', () => {
    // Four equal speakers: exact. Six: 16.67 each, and the four left go to the first four.
    expect(shares([5, 5, 5, 5])).toEqual([25, 25, 25, 25]);
    expect(shares([1, 1, 1, 1, 1, 1])).toEqual([17, 17, 17, 17, 16, 16]);
  });

  test('a single speaker has it all, and no words share nothing', () => {
    expect(shares([12])).toEqual([100]);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([])).toEqual([]);
  });

  test('any words add up to 100', () => {
    for (let n = 1; n <= 40; n++) {
      const words = Array.from({ length: n }, (_, i) => ((i * 7919 + n * 104729) % 97) + 1);
      expect(
        shares(words).reduce((a, b) => a + b, 0),
        String(n),
      ).toBe(100);
    }
  });
});
