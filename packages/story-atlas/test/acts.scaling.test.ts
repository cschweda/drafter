import { describe, expect, test } from 'vitest';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';
import { build } from './scripts';

// A script of many acts stays linear (red/blue audit of 23 November 2026, M2): finding a scene's
// act looked through every act, so a file of a few thousand `#` sections took the square of
// that, and Drafter for Claude could never load one of 600 KB inside its ten seconds.

/** `n` acts, each with a synopsis and one short scene. */
const acts = (n: number) =>
  Array.from(
    { length: n },
    (_, i) =>
      `# Act ${i + 1}\n\n= What happens in act ${i + 1}.\n\nINT. ROOM ${i + 1} - DAY\n\nA.\n`,
  ).join('\n');

describe('a script of many acts', () => {
  test(
    'is built in time that grows with its length, not with the square of it',
    () => {
      const { growth } = scaling(acts, (source) => build(source), 4000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
