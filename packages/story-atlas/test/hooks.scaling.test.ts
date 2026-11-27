import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { hooksOf } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';
import { screenplay } from './scripts';

// Finding the hooks stays linear on a hostile script: one name, said over and over in sentences
// that never end, and never introduced, so every mention could start a scan to the sentence's end.

/** One scene whose one action paragraph names ZED `n` times in one sentence, and names ZED ZED in a row. */
function hostile(n: number) {
  const action = 'ZED waits by the long wall and '.repeat(n) + 'ZED ZED '.repeat(n);
  const doc = parse(`INT. HALL - DAY\n\n${action}\n\nZED\nStill here.\n`);
  return { doc, index: sceneIndex(doc, screenplay) };
}

describe('hooks on a hostile script', () => {
  test(
    'one name mentioned again and again, never introduced, is linear',
    () => {
      const { doc, index } = hostile(10);
      expect(hooksOf(doc, index).get('ZED')?.hook).toMatch(/^waits by the long wall/);
      const result = scaling(hostile, ({ doc, index }) => hooksOf(doc, index), 4000);
      expect(result.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
