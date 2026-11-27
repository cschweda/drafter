import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { linesPerPage, sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { castOf } from '../src';
import { PAIR_BUDGET, PAIR_WORK } from '../src/figures';
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

/** `n` scenes, each with 150 speakers of its own: every scene under the cap, the sum without end. */
function crowds(n: number) {
  const lines: string[] = [];
  for (let scene = 0; scene < n; scene++) {
    lines.push(`INT. HALL ${scene + 1} - DAY`, '');
    for (let k = 0; k < 150; k++) lines.push(speaker(scene * 150 + k), 'Hi.', '');
  }
  const doc = parse(lines.join('\n'));
  const layout = paginate(doc, screenplay);
  return { doc, index: sceneIndex(doc, screenplay, layout), perPage: linesPerPage(layout) };
}

describe('a scene with a crowd in it', () => {
  test(
    'is counted in time that grows with the crowd, not with the square of it',
    () => {
      const { growth } = scaling(crowd, cast, 600);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test('stops counting pairs once the whole script has spent its budget', () => {
    // 60 scenes of 150, each with speakers of its own, are 1.3 million pairs: past the budget, so
    // the last scenes add none.
    const built = cast(crowds(60));
    let pairs = 0;
    for (const figures of built.figures.values()) pairs += figures.sharedWith.length;
    expect(pairs).toBeGreaterThan(0);
    expect(pairs).toBeLessThanOrEqual(PAIR_BUDGET);
    expect(built.figures.get(speaker(0).toUpperCase())?.sharedWith.length).toBe(149);
    expect(built.figures.get(speaker(59 * 150).toUpperCase())?.sharedWith).toEqual([]);
  });

  test('counts every scene of a long script with a small cast: only new pairs are budgeted', () => {
    // 18,500 scenes of the same eight people: 56 counts a scene, over a million in all, and
    // 56 pairs. Counting each scene against the budget left the last scenes out, with no word.
    const scenes = 18_500;
    const lines: string[] = [];
    for (let s = 0; s < scenes; s++) {
      lines.push('INT. HALL - DAY', '');
      for (let k = 0; k < 8; k++) lines.push(speaker(k), 'Hi.', '');
    }
    const doc = parse(lines.join('\n'));
    const layout = paginate(doc, screenplay);
    const built = castOf(
      sceneIndex(doc, screenplay, layout),
      doc,
      screenplay,
      linesPerPage(layout),
      () => undefined,
    );
    for (const figures of built.figures.values()) {
      expect(figures.sharedWith).toHaveLength(7);
      for (const other of figures.sharedWith) expect(other.scenes).toBe(scenes);
    }
  }, 120_000);

  test('stops counting once the counting itself has cost enough, though no pair is new', () => {
    // 1,100 scenes of the same 199 people: no new pair after the first scene, so nothing more to
    // keep, but 19,701 counts a scene, 21 million in all. A file of a few megabytes of these
    // would otherwise be counted for seconds.
    const scenes = 1100;
    const lines: string[] = [];
    for (let s = 0; s < scenes; s++) {
      lines.push('INT. HALL - DAY', '');
      for (let k = 0; k < 199; k++) lines.push(speaker(k), 'Hi.', '');
    }
    const doc = parse(lines.join('\n'));
    const layout = paginate(doc, screenplay);
    const built = castOf(
      sceneIndex(doc, screenplay, layout),
      doc,
      screenplay,
      linesPerPage(layout),
      () => undefined,
    );
    const counted = Math.floor(PAIR_WORK / ((199 * 198) / 2));
    expect(counted).toBeLessThan(scenes);
    const first = built.figures.get(speaker(0).toUpperCase());
    expect(first?.sharedWith).toHaveLength(198);
    expect(first?.sharedWith[0]?.scenes).toBe(counted);
  }, 120_000);

  test('says who shares a scene with whom in a scene of ordinary size, and not in a crowd', () => {
    const few = cast(crowd(5));
    expect(few.figures.get(speaker(0).toUpperCase())?.sharedWith.length).toBe(4);
    const many = cast(crowd(400));
    expect(many.characters.length).toBe(400);
    expect(many.figures.get(speaker(0).toUpperCase())?.sharedWith).toEqual([]);
  });
});
