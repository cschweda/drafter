import { describe, expect, test } from 'vitest';
import { bookLine, fillPercent, MAX_TARGET, parseTarget, percent } from '../app/novel/labels';

// Counts and targets for a novel (Novel plan, Task 8): a percentage rounds down and never says 100
// before the target is reached; a writer past the target sees the real figure; a target of 0 or a
// blank clears it; anything else that isn't a whole number of words is refused, in words.

describe('percent', () => {
  test('rounds down', () => {
    expect(percent(62_140, 90_000)).toBe(69);
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(66);
    expect(percent(0, 500)).toBe(0);
  });

  test('never says 100 before the target is reached', () => {
    expect(percent(89_999, 90_000)).toBe(99);
    expect(percent(999_999, 1_000_000)).toBe(99);
    expect(percent(90_000, 90_000)).toBe(100);
  });

  test('past the target it is the real figure, and the bar stops at full', () => {
    expect(percent(93_600, 90_000)).toBe(104);
    expect(percent(200, 100)).toBe(200);
    expect(fillPercent(93_600, 90_000)).toBe(100);
    expect(fillPercent(45, 100)).toBe(45);
  });
});

describe('bookLine', () => {
  test('groups the thousands and gives the percentage', () => {
    expect(bookLine(62_140, 90_000)).toBe('62,140 of 90,000 words (69%)');
    expect(bookLine(93_600, 90_000)).toBe('93,600 of 90,000 words (104%)');
    expect(bookLine(0, 90_000)).toBe('0 of 90,000 words (0%)');
  });
});

describe('parseTarget', () => {
  test('a whole number of words is the target, with or without grouping', () => {
    expect(parseTarget('90000')).toEqual({ target: 90_000 });
    expect(parseTarget(' 90,000 ')).toEqual({ target: 90_000 });
    expect(parseTarget('1')).toEqual({ target: 1 });
    expect(parseTarget(String(MAX_TARGET))).toEqual({ target: MAX_TARGET });
  });

  test('a blank or a 0 clears it', () => {
    expect(parseTarget('')).toEqual({ target: null });
    expect(parseTarget('   ')).toEqual({ target: null });
    expect(parseTarget('0')).toEqual({ target: null });
    expect(parseTarget('000')).toEqual({ target: null });
  });

  test('anything else is a problem, in words', () => {
    for (const bad of ['12.5', '-3', 'lots', '1e5', '9 000', '10000001', '0x10', '90k']) {
      const got = parseTarget(bad);
      expect(got, bad).toHaveProperty('problem');
      expect((got as { problem: string }).problem).toMatch(/whole number of words/);
    }
  });
});
