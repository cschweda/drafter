import { describe, expect, test } from 'vitest';
import { readNote, safeLine } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Notes and lines made of a long run of spaces (red/blue audit of 23 November 2026, W1 and W8):
// the pattern for `Name on “quote”:` tried every split of the run three ways, so a note of three
// thousand spaces, a file of 3 KB, held the editor for fifteen seconds at every pass.

describe('a note of spaces', () => {
  test(
    'is read in time that grows with its length',
    () => {
      for (const make of [
        (n: number) => ' '.repeat(n),
        (n: number) => `x${' '.repeat(n)}`,
        (n: number) => `${' '.repeat(n)} on `,
        (n: number) => `a${' b'.repeat(n / 2)} on`,
      ]) {
        const { growth } = scaling(make, readNote, 400);
        expect(growth).toBeLessThan(MAX_GROWTH);
      }
    },
    SCALING_TIMEOUT,
  );

  test('still reads a person’s note on a quote, however it is spaced', () => {
    expect(readNote('  Ana  on  “the lamp”  : keep it').head).toMatchObject({
      kind: 'person',
      name: 'Ana',
      on: 'the lamp',
    });
    expect(readNote('Ana Lee on "x": y').head).toMatchObject({ name: 'Ana Lee', on: 'x' });
  });

  test(
    'a line with a long run of spaces is made safe in time that grows with its length',
    () => {
      const { growth } = scaling((n: number) => `a${' '.repeat(n)}b`, safeLine, 20_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
      expect(safeLine('one  \n  two\r\nthree')).toBe('one / two / three');
      // As it always did: blank lines between are one break, and a break at either end is kept.
      const old = (text: string) =>
        text
          .replace(/\s*\r?\n\s*/g, ' / ')
          .replace(/\[(?=\[)/g, '[ ')
          .replace(/\/(?=\*)/g, '/ ')
          .replace(/\*(?=\/)/g, '* ')
          .trim();
      for (const text of [
        'a\n\n\nb',
        '\n\na',
        'a\n\n',
        ' a \n \n b ',
        'a',
        '',
        '\n',
        'a\r\n\r\nb [[x',
        '\t\n\t',
      ]) {
        expect(safeLine(text), JSON.stringify(text)).toBe(old(text));
      }
    },
    SCALING_TIMEOUT,
  );
});
