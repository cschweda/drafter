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
});
