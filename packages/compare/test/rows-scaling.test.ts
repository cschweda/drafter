import { describe, expect, test } from 'vitest';
import { type Anchor, diffRows, foldRows, groupRows } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

/** Scene `i` of an invented script; `edit` changes one action line and one line of dialogue. */
const scene = (i: number, edit: boolean) =>
  [
    `INT. TORVEL ROOM ${i} - DAY`,
    '',
    edit ? `Brask lifts the merrow ${i} again.` : `Brask lifts the merrow ${i}.`,
    '',
    'ODRA',
    edit ? `Quell the vesh, ${i}, and quickly.` : `Quell the vesh, ${i}.`,
    '',
    `Odra plinks the sarrow ${i} twice.`,
    '',
  ].join('\n');

const anchors = (text: string): Anchor[] =>
  text.split('\n').flatMap((l, i) => (l.startsWith('INT. ') ? [{ line: i, title: l }] : []));

describe('rows scaling', () => {
  test(
    'diffRows and groupRows grow linearly',
    () => {
      // Near-identical scripts: every fifth scene edited.
      const make = (n: number) => {
        let older = '';
        let newer = '';
        for (let i = 0; i < n; i++) {
          older += scene(i, false);
          newer += scene(i, i % 5 === 0);
        }
        return { older, newer, oldAnchors: anchors(older), newAnchors: anchors(newer) };
      };
      const { growth } = scaling(
        make,
        ({ older, newer, oldAnchors, newAnchors }) => {
          const { rows } = diffRows(older, newer);
          for (const g of groupRows(rows, oldAnchors, newAnchors)) foldRows(rows, g.from, g.to);
        },
        500,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
