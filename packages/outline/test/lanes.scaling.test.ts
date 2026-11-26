import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { describe, expect, test } from 'vitest';
import { lanesOf, sceneIndex, scriptUnits } from '../src';
import { screenplay } from './helpers';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Lanes of a script grow with the scenes, not faster (threads design §11).

function make(n: number) {
  let text = '';
  for (let i = 0; i < n; i++) {
    text += `INT. ROOM ${i} - DAY\n\n[[Thread: T${i % 7}, T${i % 11}]]\nAction here for a while.\n\n`;
  }
  const doc = parse(text);
  return sceneIndex(doc, screenplay, paginate(doc, screenplay));
}

describe('lanes of a script', () => {
  test(
    'lanesOf grows linearly',
    () => {
      const { growth } = scaling(
        make,
        (index) => {
          const r = scriptUnits(index, 55);
          return lanesOf(r.units, r.unit);
        },
        120,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
