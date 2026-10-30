import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  coveredBy,
  MATCH,
  type ScenePrint,
  SKETCH_K,
  sameScene,
  similarity,
  sketchOf,
} from '../src';
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

/**
 * A scene's shingles, as strings, for the true Jaccard and containment: every three words in a
 * row; under five words (fewer than three of those), every two as well; a single word, itself.
 */
function shingleSet(words: readonly string[]): Set<string> {
  const out = new Set<string>();
  const sizes = words.length === 1 ? [1] : words.length < 5 ? [3, 2] : [3];
  for (const size of sizes) {
    for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(' '));
  }
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

/** Shared shingles over the smaller scene's: how much of it is in the other. */
function trueContainment(a: readonly string[], b: readonly string[]): number {
  const x = shingleSet(a);
  const y = shingleSet(b);
  let both = 0;
  for (const s of x) if (y.has(s)) both++;
  const smaller = Math.min(x.size, y.size);
  return smaller === 0 ? 0 : both / smaller;
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

  test('a heading-only scene filled in later is the same scene', () => {
    const bare = one('INT. BARN - DAY');
    const filled = one('INT. BARN - DAY\n\nTobin feeds the goats and counts them twice, slowly.');
    expect(bare.shingles).toBe(0);
    expect(sameScene(bare, filled)).toBe(true);
    expect(sameScene(filled, bare)).toBe(true);
    expect(sameScene(one('INT. SHED - DAY'), filled)).toBe(false);
  });

  test('a short scene grown under its heading is the same; another short scene is not', () => {
    const short = one('INT. CAR - NIGHT\n\nThey drive.');
    const longer = one('INT. CAR - NIGHT\n\nThey drive in silence.');
    expect(sameScene(short, longer)).toBe(true);
    expect(sameScene(longer, short)).toBe(true);
    // Under another heading, a word or two in common is not enough.
    expect(sameScene(short, one('INT. BUS - NIGHT\n\nThey drive in silence.'))).toBe(false);
    // Two short scenes under one heading sharing a word, or a pair of three, are two scenes.
    const different: Array<[string, string]> = [
      ['They drive.', 'They kiss.'],
      ['She waits.', 'She leaves.'],
      ['The phone rings.', 'The phone stops.'],
      ['He runs.', 'The door opens.'],
      ['They drive in silence.', 'They sit in silence.'],
    ];
    for (const [x, y] of different) {
      const a = one(`INT. CAR - NIGHT\n\n${x}`);
      const b = one(`INT. CAR - NIGHT\n\n${y}`);
      expect(sameScene(a, b), `${x} / ${y}`).toBe(false);
      expect(sameScene(b, a), `${y} / ${x}`).toBe(false);
    }
    // One word is a shingle of its own, and shares none with a pair that starts with it.
    expect(
      sameScene(one('INT. CAR - NIGHT\n\nSilence.'), one('INT. CAR - NIGHT\n\nSilence falls.')),
    ).toBe(false);
    expect(
      sameScene(one('INT. CAR - NIGHT\n\nSilence.'), one('INT. CAR - NIGHT\n\nSilence.\n\n[[x]]')),
    ).toBe(true);
    expect(
      sameScene(
        one('INT. CAR - NIGHT\n\nThe phone rings.'),
        one('INT. CAR - NIGHT\n\nThe phone rings twice.'),
      ),
    ).toBe(true);
  });

  test('coveredBy: an empty past scene is covered by a filled one now, not the reverse', () => {
    const bare = one('INT. BARN - DAY');
    const filled = one('INT. BARN - DAY\n\nTobin feeds the goats and counts them twice, slowly.');
    expect(coveredBy(bare, filled)).toBe(true);
    expect(coveredBy(filled, bare)).toBe(false);
    expect(coveredBy(bare, one('INT. BARN - DAY\n\n[[Later.]]'))).toBe(true);
    expect(coveredBy(filled, filled)).toBe(true);
    expect(coveredBy(one(S.cabin), one(CABIN_TRIMMED))).toBe(true);
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

  test('containment is exact for small scenes and within 0.35 of the truth for large ones', () => {
    // Small: both scenes fit in their sketches, so the answer is the true containment.
    fc.assert(
      fc.property(words(SKETCH_K), words(SKETCH_K), (a, b) => {
        expect(similarity(made(a), made(b)).containment).toBeCloseTo(trueContainment(a, b), 10);
      }),
      { numRuns: 200 },
    );
    // Large: a scene of 60 to 200 words, some of it (none to all) in a scene of 150 to 400
    // more, as a scene merged into another is, or cut down to part of one. Lengths and shares
    // are drawn evenly (unbiased), so every containment is tried. The estimate is the share
    // found among the smaller's hashes up to τ, about 64 × smaller / larger of them (7 or more
    // here), so its spread is about √(C(1 − C) / 7) ≤ 0.19 at worst; over 3,000 runs, 99% are
    // within 0.25. The seed is fixed so the run is the same each time.
    const share = fc.noBias(fc.integer({ min: 0, max: 1000 })).map((n) => n / 1000);
    const scene = (min: number, max: number) =>
      fc.noBias(
        fc.array(fc.constantFrom(...vocabulary), { minLength: min, maxLength: max, size: 'max' }),
      );
    fc.assert(
      fc.property(scene(60, 200), scene(150, 400), share, share, (a, extra, kept, at) => {
        const cut = Math.floor(extra.length * at);
        const b = [
          ...extra.slice(0, cut),
          ...a.slice(0, Math.floor(a.length * kept)),
          ...extra.slice(cut),
        ];
        const { containment } = similarity(made(a), made(b));
        expect(Math.abs(containment - trueContainment(a, b))).toBeLessThanOrEqual(0.35);
      }),
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
