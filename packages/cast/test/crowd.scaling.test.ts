import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { linesPerPage, sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { castOf } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';
import { screenplay } from './scripts';

// One scene where every speech has a new speaker (red/blue audit of 23 November 2026, M1): who
// shares a scene with whom was counted pair by pair, so a scene of three thousand speakers, a
// file of 32 KB, made nine million entries and ran Drafter for Claude's reader out of memory.

/** A name for the `k`th speaker: letters only, all different. */
const speaker = (k: number) =>
  `SPEAKER ${Array.from(k.toString(26), (d) => String.fromCharCode(65 + Number.parseInt(d, 26))).join('')}`;

function crowd(n: number) {
  const lines = ['INT. HALL - DAY', ''];
  for (let k = 0; k < n; k++) lines.push(speaker(k), 'Hi.', '');
  const doc = parse(lines.join('\n'));
  const layout = paginate(doc, screenplay);
  return { doc, index: sceneIndex(doc, screenplay, layout), perPage: linesPerPage(layout) };
}

const cast = (input: ReturnType<typeof crowd>) =>
  castOf(input.index, input.doc, screenplay, input.perPage, () => undefined);

describe('a scene with a crowd in it', () => {
  test(
    'is counted in time that grows with the crowd, not with the square of it',
    () => {
      const { growth } = scaling(crowd, cast, 600);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test('says who shares a scene with whom in a scene of ordinary size, and not in a crowd', () => {
    const few = cast(crowd(5));
    expect(few.figures.get(speaker(0).toUpperCase())?.sharedWith.length).toBe(4);
    const many = cast(crowd(400));
    expect(many.characters.length).toBe(400);
    expect(many.figures.get(speaker(0).toUpperCase())?.sharedWith).toEqual([]);
  });
});
