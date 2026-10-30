import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { diffWords, type WordPart } from '../src';

/** A line of tokens from a small alphabet, so the two sides share words and differ in places. */
const line = fc
  .array(fc.constantFrom('Sam', 'Ann', 'it’s', "don't", 'door', ' ', '  ', '.', ',', '—', '42'), {
    maxLength: 30,
  })
  .map((tokens) => tokens.join(''));

const join = (parts: WordPart[]) => parts.map((p) => p.text).join('');

describe('diffWords properties', () => {
  test('joining same+removed gives the older line and same+added the newer', () => {
    fc.assert(
      fc.property(line, line, (older, newer) => {
        const words = diffWords(older, newer);
        expect(words).not.toBeNull();
        if (!words) return;
        expect(join(words.removed)).toBe(older);
        expect(join(words.added)).toBe(newer);
        expect(words.removed.every((p) => p.kind !== 'added' && p.text !== '')).toBe(true);
        expect(words.added.every((p) => p.kind !== 'removed' && p.text !== '')).toBe(true);
        // The same parts are the same on both sides, and no two neighbours share a kind.
        const same = (parts: WordPart[]) =>
          parts.filter((p) => p.kind === 'same').map((p) => p.text);
        expect(same(words.removed).join('')).toBe(same(words.added).join(''));
        for (const parts of [words.removed, words.added]) {
          for (let i = 1; i < parts.length; i++) expect(parts[i].kind).not.toBe(parts[i - 1].kind);
        }
      }),
    );
  });
});
