import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { headingKey, scenePrints, withoutTrailingSpaces } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Long runs of spaces or dots (red/blue audit of 23 November 2026, W7): three patterns anchored
// at the end of the text started again from every character of a run in its middle, so one line
// of 100 KB took scene history ten seconds.

/** `headingKey` as it was, with those patterns: what the new one must still give. */
const oldHeadingKey = (heading: string) =>
  heading
    .toUpperCase()
    .replace(/\s*#[^#\s]*#\s*$/u, '')
    .replace(/[‐‑‒–—―]/gu, '-')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/[.,;:!?]+$/u, '')
    .trim();

describe('long runs in a scene', () => {
  test('a heading’s key is what it always was', () => {
    for (const heading of [
      'INT. HOUSE - DAY',
      'INT. HOUSE - DAY #12A#',
      '  int. house — day  #1#  ',
      'INT. HOUSE...',
      'INT. HOUSE . . .',
      'EXT. #7# CAFE #8#',
      '#1#',
      '',
      '...',
      'A #b c#',
      'A#b#.',
    ]) {
      expect(headingKey(heading), JSON.stringify(heading)).toBe(oldHeadingKey(heading));
    }
    fc.assert(
      fc.property(fc.stringMatching(/^[ a-c#.,!\t–]{0,24}$/), (heading) => {
        expect(headingKey(heading)).toBe(oldHeadingKey(heading));
      }),
    );
  });

  test('trailing spaces come off each line as the pattern took them', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[ a\t\n\r\u2028\u2029]{0,24}$/), (text) => {
        expect(withoutTrailingSpaces(text)).toBe(text.replace(/[ \t]+$/gm, ''));
      }),
    );
  });

  test(
    'are read in time that grows with their length',
    () => {
      for (const make of [
        (n: number) => `INT. A - DAY\n\nA${' '.repeat(n)}b\n`,
        (n: number) => `INT. HOUSE${' '.repeat(n)}x\n\nGo.\n`,
        (n: number) => `INT. HOUSE${'.'.repeat(n)}x\n\nGo.\n`,
      ]) {
        const { growth } = scaling(make, (source) => scenePrints(source), 10_000);
        expect(growth).toBeLessThan(MAX_GROWTH);
      }
    },
    SCALING_TIMEOUT,
  );
});
