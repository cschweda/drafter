import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { MATCH, type ScenePrint, SKETCH_K, sameScene, similarity, sketchOf } from '../src';
import { now, printOf } from './helpers';
import {
  CABIN_SPLIT,
  CABIN_SPLIT_RENAMED,
  CABIN_TRIMMED,
  CAR,
  JETTY_CALLBACK,
  JETTY_ECHO,
  KITCHEN_STORM_MERGED,
  KITCHEN_STORM_MERGED_RENAMED,
  LAST_FERRY,
  PUB_RENAMED,
  S,
  WHEELHOUSE_REWRITE,
  WHEELHOUSE_SAME_HEADING_REWRITE,
} from './scripts';

const one = (scene: string) => now(`${scene}\n`)[0] as ScenePrint;

/** A print of a scene of `words`, under `heading`, for the sketch's own tests. */
function made(words: readonly string[], heading = 'INT. ROOM - DAY'): ScenePrint {
  return {
    hash: words.join(' '),
    headingKey: heading,
    heading,
    words: words.length,
    preview: '',
    ...sketchOf(words),
  };
}

/** Shingles of three words, as strings, for the true Jaccard. */
function shingleSet(words: readonly string[]): Set<string> {
  if (words.length < 3) return new Set(words.length ? [words.join(' ')] : []);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= words.length; i++) out.add(words.slice(i, i + 3).join(' '));
  return out;
}

function trueJaccard(a: readonly string[], b: readonly string[]): number {
  const x = shingleSet(a);
  const y = shingleSet(b);
  let both = 0;
  for (const s of x) if (y.has(s)) both++;
  const union = x.size + y.size - both;
  return union === 0 ? 0 : both / union;
}

describe('sameScene (Call 6)', () => {
  test('equal text is the same scene', () => {
    expect(sameScene(one(S.cabin), one(S.cabin))).toBe(true);
    expect(similarity(one(S.cabin), one(S.cabin))).toEqual({ jaccard: 1, containment: 1 });
  });

  test('a scene cut to a quarter under its heading is the same', () => {
    const { containment, jaccard } = similarity(one(S.cabin), one(CABIN_TRIMMED));
    expect(jaccard).toBeLessThan(MATCH.jaccard);
    expect(containment).toBeGreaterThanOrEqual(MATCH.containment);
    expect(sameScene(one(S.cabin), one(CABIN_TRIMMED))).toBe(true);
  });

  test('a renamed heading with the text kept is the same', () => {
    expect(one(PUB_RENAMED).headingKey).not.toBe(one(S.pub).headingKey);
    expect(sameScene(one(S.pub), one(PUB_RENAMED))).toBe(true);
  });

  test('a rewrite under a new heading is not', () => {
    expect(sameScene(one(S.wheelhouse), one(WHEELHOUSE_REWRITE))).toBe(false);
  });

  test('a rewrite from nothing under the same heading is not', () => {
    expect(sameScene(one(S.wheelhouse), one(WHEELHOUSE_SAME_HEADING_REWRITE))).toBe(false);
  });

  test('two scenes with no printed words under one heading are the same', () => {
    expect(sameScene(one('INT. HALL - DAY\n\n[[One.]]'), one('INT. HALL - DAY\n\n[[Two.]]'))).toBe(
      true,
    );
    expect(sameScene(one('INT. HALL - DAY\n\n[[One.]]'), one('INT. LOFT - DAY\n\n[[One.]]'))).toBe(
      false,
    );
  });

  // The fixtures the thresholds are tuned against (plan, Controller rulings): each pair of an
  // older and a newer scene version, and whether they are the same scene.
  const pairs: Array<[string, string, string, boolean]> = [
    ['trimmed to a quarter', S.cabin, CABIN_TRIMMED, true],
    ['renamed, text kept', S.pub, PUB_RENAMED, true],
    ['rewritten under a new heading', S.wheelhouse, WHEELHOUSE_REWRITE, false],
    ['rewritten under its heading', S.wheelhouse, WHEELHOUSE_SAME_HEADING_REWRITE, false],
    ['split: the half under its heading', S.cabin, CABIN_SPLIT[0], true],
    ['split: the half under a new heading', S.cabin, CABIN_SPLIT[1], true],
    ['split and renamed: the first half', S.cabin, CABIN_SPLIT_RENAMED[0], true],
    ['merged: the scene whose heading stayed', S.kitchen, KITCHEN_STORM_MERGED, true],
    ['merged: the scene whose heading went', S.storm, KITCHEN_STORM_MERGED, true],
    ['merged and renamed: the first', S.kitchen, KITCHEN_STORM_MERGED_RENAMED, true],
    ['merged and renamed: the second', S.storm, KITCHEN_STORM_MERGED_RENAMED, true],
    ['a near-duplicate', S.jetty, JETTY_CALLBACK, true],
    ['one line in common', S.jetty, JETTY_ECHO, false],
  ];

  test.each(pairs)('fixture: %s', (_, older, newer, same) => {
    expect(sameScene(one(older), one(newer))).toBe(same);
    expect(sameScene(one(newer), one(older))).toBe(same);
  });

  test('no two different scenes of a script match, nor the five car scenes', () => {
    const scenes = [...now(LAST_FERRY), ...CAR.map(one), one(JETTY_ECHO)];
    for (const [i, a] of scenes.entries()) {
      for (const [j, b] of scenes.entries()) {
        if (i !== j) expect(sameScene(a, b), `${a.heading} / ${b.heading}`).toBe(false);
      }
    }
  });

  test('the five car scenes share a heading key', () => {
    expect(new Set(CAR.map((c) => one(c).headingKey))).toEqual(new Set(['INT. CAR - NIGHT']));
    expect(printOf(LAST_FERRY, 'INT. CAR - DAY').headingKey).toBe('INT. CAR - DAY');
  });
});

describe('similarity', () => {
  const vocabulary = Array.from({ length: 400 }, (_, i) => `w${i.toString(36)}`);
  const words = (max: number) =>
    fc.array(fc.constantFrom(...vocabulary), { minLength: 0, maxLength: max });

  test('similarity is exact for small scenes and within 0.15 of the truth for large ones', () => {
    // Small: both scenes fit in the sketch, so the answer is the true Jaccard.
    fc.assert(
      fc.property(words(SKETCH_K), words(SKETCH_K), (a, b) => {
        expect(similarity(made(a), made(b)).jaccard).toBeCloseTo(trueJaccard(a, b), 10);
      }),
      { numRuns: 200 },
    );
    // Large: two scenes of 150 to 600 words sharing a run of words, so every Jaccard from
    // none to all is tried. The estimate's spread at 64 is about 0.06, so 0.15 is a wide
    // margin; the seed is fixed so the run is the same each time.
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(...vocabulary), { minLength: 150, maxLength: 600 }),
        fc.array(fc.constantFrom(...vocabulary), { minLength: 150, maxLength: 600 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, extra, share) => {
          const b = [...a.slice(0, Math.floor(a.length * share)), ...extra];
          const truth = trueJaccard(a, b);
          expect(Math.abs(similarity(made(a), made(b)).jaccard - truth)).toBeLessThanOrEqual(0.15);
        },
      ),
      { numRuns: 200, seed: 20261030 },
    );
  });

  test('containment is the share of the smaller scene found in the larger', () => {
    const big = vocabulary.slice(0, 40);
    const part = big.slice(0, 12);
    const { jaccard, containment } = similarity(made(big), made(part));
    expect(jaccard).toBeCloseTo(10 / 38, 10);
    expect(containment).toBeCloseTo(1, 10);
    expect(similarity(made([]), made(big))).toEqual({ jaccard: 0, containment: 0 });
  });
});
