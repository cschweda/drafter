import { describe, expect, test } from 'vitest';
import { diffWords, lineSimilarity, MAX_TOKENS } from '../src';

describe('diffWords', () => {
  test('marks a changed word in a line', () => {
    expect(diffWords('Ann leaves the hall.', 'Ann crosses the hall.')).toEqual({
      removed: [
        { text: 'Ann ', kind: 'same' },
        { text: 'leaves', kind: 'removed' },
        { text: ' the hall.', kind: 'same' },
      ],
      added: [
        { text: 'Ann ', kind: 'same' },
        { text: 'crosses', kind: 'added' },
        { text: ' the hall.', kind: 'same' },
      ],
    });
  });

  test('folds a single space between two changes into one change', () => {
    expect(diffWords('the cat sat', 'a dog stood')).toEqual({
      removed: [{ text: 'the cat sat', kind: 'removed' }],
      added: [{ text: 'a dog stood', kind: 'added' }],
    });
    // A longer unchanged run between two changes stays.
    expect(diffWords('Sam waits by the door', 'Ann waits by the gate')).toEqual({
      removed: [
        { text: 'Sam', kind: 'removed' },
        { text: ' waits by the ', kind: 'same' },
        { text: 'door', kind: 'removed' },
      ],
      added: [
        { text: 'Ann', kind: 'added' },
        { text: ' waits by the ', kind: 'same' },
        { text: 'gate', kind: 'added' },
      ],
    });
  });

  test('keeps punctuation as its own token', () => {
    expect(diffWords('Wait.', 'Wait!')).toEqual({
      removed: [
        { text: 'Wait', kind: 'same' },
        { text: '.', kind: 'removed' },
      ],
      added: [
        { text: 'Wait', kind: 'same' },
        { text: '!', kind: 'added' },
      ],
    });
  });

  test("reads ’ and ' inside a word as part of it", () => {
    expect(diffWords('It’s late.', 'It’d late.')?.removed).toEqual([
      { text: 'It’s', kind: 'removed' },
      { text: ' late.', kind: 'same' },
    ]);
    expect(diffWords("Don't go.", "Don't stay.")?.added).toEqual([
      { text: "Don't ", kind: 'same' },
      { text: 'stay', kind: 'added' },
      { text: '.', kind: 'same' },
    ]);
  });

  test('an unchanged line is one same part on each side', () => {
    expect(diffWords('Rain.', 'Rain.')).toEqual({
      removed: [{ text: 'Rain.', kind: 'same' }],
      added: [{ text: 'Rain.', kind: 'same' }],
    });
    expect(diffWords('', 'Rain.')).toEqual({
      removed: [],
      added: [{ text: 'Rain.', kind: 'added' }],
    });
  });

  test('returns null past 2,000 tokens a side', () => {
    expect(MAX_TOKENS).toBe(2000);
    // 1,000 words and 1,000 spaces: exactly 2,000 tokens.
    const at = Array.from({ length: 1000 }, (_, i) => `w${i}`)
      .join(' ')
      .concat(' ');
    expect(diffWords(at, at)).not.toBeNull();
    const over = `${at}x`;
    expect(diffWords(over, 'short')).toBeNull();
    expect(diffWords('short', over)).toBeNull();
    // A 20,000-character line with no spaces is one token, and gets its marks.
    expect(diffWords('a'.repeat(20000), 'b'.repeat(20000))).not.toBeNull();
  });
});

describe('lineSimilarity', () => {
  test('lineSimilarity is 1 for equal lines and 0 for disjoint', () => {
    expect(lineSimilarity('Ann waits by the door.', 'Ann waits by the door.')).toBe(1);
    expect(lineSimilarity('', '')).toBe(1);
    expect(lineSimilarity('Ann waits.', 'Sam leaves.')).toBe(0);
    expect(lineSimilarity('', 'Sam leaves.')).toBe(0);
    // Words only: spaces and punctuation don't count. 2 × 3 shared / (4 + 4).
    expect(lineSimilarity('Ann waits by doors.', 'Ann waits by windows!')).toBe(0.75);
    // A repeated word counts as often as it is on both sides.
    expect(lineSimilarity('no no no', 'no')).toBe(0.5);
  });
});
