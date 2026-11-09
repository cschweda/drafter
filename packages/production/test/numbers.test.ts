import { describe, expect, it } from 'vitest';
import { compareSceneNumbers, numberBetween, provisionalNumbers } from '../src/numbers';

// The brief's cases, verbatim: [before, after, expected].
const CASES: [string | null, string | null, string][] = [
  ['5', '6', '5A'],
  ['5A', '6', '5B'],
  ['5', '5A', '5AA'],
  [null, '1', 'A1'],
  [null, 'A1', 'AA1'],
  ['5Z', '6', '5AA'],
  ['5', null, '5A'],
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
  it('orders prefixes first, then digits, then suffixes (A..Z, AA..)', () => {
    const sorted = ['1B', '10', '2', 'AA1', '1', '1AA', 'A1', '1Z', '1A'].sort(compareSceneNumbers);
    expect(sorted).toEqual(['AA1', 'A1', '1', '1A', '1B', '1Z', '1AA', '2', '10']);
  });

  it('puts every numberBetween result strictly between its neighbours', () => {
    for (const [before, after, result] of CASES) {
      // ('5','5A') has nothing in between (5A directly follows 5), so the
      // brief asks for a deeper level, which sorts just after 5A instead.
      if (before === '5' && after === '5A') continue;
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
  it('numbers scenes before scene 1 and after the last', () => {
    expect(provisionalNumbers([null, '1', null])).toEqual(['A1', '1', '1A']);
  });
});
