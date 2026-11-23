import { parse } from '@drafter/fountain';
import { builtins } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { lint } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// One line of action with a long run of spaces in it (red/blue audit of 23 November 2026, W3):
// the rule for a transition with a space after it looked for the trailing run with a pattern that
// started again from every space, so a line of 200 KB held the editor for fourteen seconds.

const template = builtins['us-screenplay'];
if (!template) throw new Error('no screenplay template');

describe('a line with a long run of spaces', () => {
  test(
    'is linted in time that grows with its length',
    () => {
      const make = (n: number) => parse(`INT. A - DAY\n\nA${' '.repeat(n)}b\n`);
      const { growth } = scaling(make, (doc) => lint(doc, template), 25_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
