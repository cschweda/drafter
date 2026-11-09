import { describe, expect, it } from 'vitest';
import { compareSceneNumbers, numberBetween, provisionalNumbers } from '../src/numbers';

// The brief's cases, verbatim: [before, after, expected].
const CASES: [string | null, string | null, string][] = [
  ['5', '6', '5A'],
  ['5A', '6', '5B'],
  ['5A', '5B', '5AA'],
  ['5Z', '6', '5ZA'],
  ['5', null, '5A'],
  ['5', '5A', 'A5A'],
  ['5', 'A5A', 'AA5A'],
  [null, '1', 'A1'],
  [null, 'A1', 'AA1'],
];

describe('numberBetween', () => {
  for (const [before, after, expected] of CASES) {
    it(`(${before}, ${after}) -> ${expected}`, () => {
      expect(numberBetween(before, after)).toBe(expected);
    });
  }

  it('keeps a writer’s own scheme (12.1) by appending A, or prefixing A when first', () => {
    expect(numberBetween('12.1', '13')).toBe('12.1A');
    expect(numberBetween(null, '12.1')).toBe('A12.1');
  });
});

describe('compareSceneNumbers', () => {
  it('orders digits, then suffix (dictionary), then prefix (longer first)', () => {
    const sorted = ['5B', '10', '2', 'AA1', '1', '5AA', 'A1', '5Z', '5A', 'A5A', '5ZA', '5AB'].sort(
      compareSceneNumbers,
    );
    expect(sorted).toEqual([
      'AA1',
      'A1',
      '1',
      '2',
      'A5A',
      '5A',
      '5AA',
      '5AB',
      '5B',
      '5Z',
      '5ZA',
      '10',
    ]);
  });

  it('puts every numberBetween result strictly between its neighbours', () => {
    for (const [before, after, result] of CASES) {
      if (before !== null) expect(compareSceneNumbers(before, result)).toBeLessThan(0);
      if (after !== null) expect(compareSceneNumbers(result, after)).toBeLessThan(0);
    }
  });

  it('is zero for equal numbers', () => {
    expect(compareSceneNumbers('5A', '5A')).toBe(0);
  });
});

describe('provisionalNumbers', () => {
  it('fills a run of nulls left to right', () => {
    expect(provisionalNumbers(['4', null, null, '5'])).toEqual(['4', '4A', '4B', '5']);
  });
  it('continues after an existing A-number', () => {
    expect(provisionalNumbers(['5', '5A', null, '6'])).toEqual(['5', '5A', '5B', '6']);
  });
  it('uses a prefix when no letter fits', () => {
    expect(provisionalNumbers(['5', null, '5A'])).toEqual(['5', 'A5A', '5A']);
  });
  it('numbers scenes before scene 1 and after the last', () => {
    expect(provisionalNumbers([null, '1', null])).toEqual(['A1', '1', '1A']);
  });
});
