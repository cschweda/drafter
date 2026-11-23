import { describe, expect, test } from 'vitest';
import { putBackChanges } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Putting back a scene with a long run of spaces inside a line (the audit of the red/blue audit
// of 23 November 2026, W7): trimming its end tried every place in the run.

describe('putting back a scene with a run of spaces in it', () => {
  test(
    'takes time that grows with the scene',
    () => {
      const { growth } = scaling(
        (n: number) => `INT. ROOM - DAY\n\nShe waits.${' '.repeat(n)}He goes.\n`,
        (scene) => putBackChanges('INT. HALL - DAY\n\nA.\n', { side: 'end' } as never, scene),
        20_000,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
