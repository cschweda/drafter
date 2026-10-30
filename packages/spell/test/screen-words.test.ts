import { readFileSync } from 'node:fs';
import en from 'dictionary-en';
import gb from 'dictionary-en-gb';
import { describe, expect, test } from 'vitest';
import { createChecker } from '../src/checker';
import { SCREEN_WORDS } from '../src/screen-words';
import { createSpellSession } from '../src/session';

// Drafter's own short list of the craft's words that the dictionaries lack (Plan D, final review):
// `PRE-LAP`, `INTERCUT`, `walkie-talkie`, `sotto voce`, and the like are in nearly every screenplay.

const us = createChecker(en);
const british = createChecker(gb);
const source = readFileSync(new URL('./fixtures/screen-terms.fountain', import.meta.url), 'utf8');

describe('the screenplay words', () => {
  test('are lowercase, sorted, once each, and each unknown to a bundled dictionary', () => {
    expect(SCREEN_WORDS.length).toBeLessThanOrEqual(25);
    expect([...SCREEN_WORDS]).toEqual([...new Set(SCREEN_WORDS)].sort());
    for (const word of SCREEN_WORDS) {
      expect(word).toBe(word.toLowerCase());
      // A word both dictionaries know has no place here.
      expect(us.correct(word) && british.correct(word), word).toBe(false);
    }
  });

  test('are never flagged, in either language, with only the planted misspelling marked', () => {
    for (const checker of [us, british]) {
      const session = createSpellSession(checker);
      for (const notes of [false, true]) {
        const marks = session.check({ source, kind: 'fountain', notes, mine: [] });
        expect(marks.map((m) => m.word)).toEqual(['lanturn']);
      }
    }
  });

  test('are known in a Markdown document too', () => {
    const session = createSpellSession(us);
    const marks = session.check({
      source: '# Notes\n\nThe intercut needs a pre-lap and a walkie-talkie, sotto voce.\n',
      kind: 'markdown',
      notes: false,
      mine: [],
    });
    expect(marks).toEqual([]);
  });

  test('a hyphenated compound is known when the whole of it is, with or without its hyphens', () => {
    const session = createSpellSession(us);
    const check = (text: string, mine: string[]) =>
      session
        .check({ source: `${text}\n`, kind: 'fountain', notes: false, mine })
        .map((m) => m.word);
    expect(check('A zub-zarn and a flim-flork.', [])).toEqual(['zub', 'zarn', 'flim', 'flork']);
    expect(check('A zub-zarn and a flim-flork.', ['zub-zarn', 'flimflork'])).toEqual([]);
    // Only the whole compound: its parts alone are still checked.
    expect(check('A zub and a zarn.', ['zub-zarn'])).toEqual(['zub', 'zarn']);
  });
});
