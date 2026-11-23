import { describe, expect, test } from 'vitest';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';
import { build } from './scripts';

// Many names that share their first two words (the audit of the red/blue audit of 23 November
// 2026, M1): each place those two words came together tried every such name, so a file of a
// quarter of a megabyte stopped Drafter for Claude.

/** `n` cues `A B S<k>`, then a line of `A B` said `n` times. */
const shared = (n: number) =>
  `INT. HALL - DAY\n\n${Array.from({ length: n }, (_, k) => `A B S${k}\nHello.\n`).join('\n')}\n${'A B '.repeat(n)}\n`;

describe('names that share their first two words', () => {
  test(
    'are found in time that grows with the script, not with the square of it',
    () => {
      const { growth } = scaling(shared, (source) => build(source), 1000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  // Names alike in their words and different in the marks between them (A.B, A-B, A.-B …).
  const MARKS = ['.', '-', ',', ';'];
  const gap = (k: number) => Array.from(k.toString(4), (d) => MARKS[Number(d)]).join('');
  const marked = (n: number) =>
    `INT. HALL - DAY\n\n${Array.from({ length: n }, (_, k) => `A${gap(k)} B\nHello.\n`).join('\n')}\n${'A B '.repeat(n)}\n`;

  test(
    'and so are names that differ only in the marks between their words',
    () => {
      const { growth } = scaling(marked, (source) => build(source), 1000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  /** One cue of `n` words, all the same, and lines of that word one time fewer. */
  const long = (n: number) =>
    `INT. HALL - DAY\n\n${'A '.repeat(n).trim()}\nHello.\n\n${'A '.repeat(n - 1)}\n\n${'A '.repeat(n - 1)}\n`;

  test(
    'and so is a name of very many words',
    () => {
      const { growth } = scaling(long, (source) => build(source), 2000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
