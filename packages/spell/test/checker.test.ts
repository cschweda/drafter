import en from 'dictionary-en';
import gb from 'dictionary-en-gb';
import { describe, expect, test } from 'vitest';
import { createChecker, SUGGESTION_LIMIT } from '../src/checker';

// The real dictionaries, as the packages read them in Node. Loading each takes tens of
// milliseconds, so it happens once here, never per check.
const us = createChecker(en);
const uk = createChecker(gb);

describe('createChecker', () => {
  test('knows common words in both dictionaries', () => {
    for (const checker of [us, uk]) {
      for (const word of ['the', 'kettle', 'Kettle', 'KETTLE', "kettle's", "don't", 'upstairs']) {
        expect(checker.correct(word), word).toBe(true);
      }
      expect(checker.correct('recieve')).toBe(false);
    }
  });

  test("British English knows colour and US English doesn't", () => {
    expect(uk.correct('colour')).toBe(true);
    expect(us.correct('colour')).toBe(false);
    expect(us.correct('color')).toBe(true);
  });

  test('accepts accented words the dictionary has without accents', () => {
    for (const word of ['café', 'naïve', 'Café', 'fiancée', 'résumé']) {
      expect(us.correct(word), word).toBe(true);
      expect(uk.correct(word), word).toBe(true);
    }
    // A decomposed accent (e and a combining mark) too.
    expect(us.correct('café')).toBe(true);
    // Without its accents it still has to be a word.
    expect(us.correct('zzqxé')).toBe(false);
  });

  test('suggests at most five, the likely one first', () => {
    expect(SUGGESTION_LIMIT).toBe(5);
    expect(us.suggest('recieve')[0]).toBe('receive');
    expect(us.suggest('Teh').length).toBeLessThanOrEqual(5);
    expect(us.suggest('Teh', 2)).toHaveLength(2);
    expect(us.suggest('zzqxzzqx')).toEqual([]);
  });

  test('reads the dictionary as text, a Uint8Array, or a Buffer', () => {
    const decoder = new TextDecoder();
    const text = createChecker({ aff: decoder.decode(en.aff), dic: decoder.decode(en.dic) });
    const bytes = createChecker({ aff: new Uint8Array(en.aff), dic: new Uint8Array(en.dic) });
    for (const checker of [text, bytes]) {
      expect(checker.correct('kettle')).toBe(true);
      expect(checker.correct('recieve')).toBe(false);
    }
  });
});
