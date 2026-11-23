import { parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { expandOutline } from '../src';
import { screenplay } from './helpers';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Expand outline on a list item that is a dash and a long run of spaces (the audit of the
// red/blue audit of 23 November 2026, W8): the pattern that read an item tried every place in
// the run, and 80 KB held the page for half a minute.

describe('Expand outline on a line of spaces', () => {
  for (const [name, fill] of [
    ['spaces', ' '],
    ['tabs', '\t'],
  ] as const) {
    test(
      `a dash and a run of ${name} is read in time that grows with it`,
      () => {
        const { growth } = scaling(
          (n: number) => `-${fill.repeat(n)}\n`,
          (source) => expandOutline(parse(source), screenplay, { from: 0, to: source.length }),
          5000,
        );
        expect(growth).toBeLessThan(MAX_GROWTH);
      },
      SCALING_TIMEOUT,
    );
  }
});
