import { describe, expect, test } from 'vitest';
import {
  deletedScenes,
  type PastSnapshot,
  type ScenePrint,
  type SceneSlot,
  scenePrints,
} from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Generated scripts of invented words, from a seeded generator, so every run times the same text.

function generator(seed: number) {
  let state = seed;
  // Marsaglia's xorshift, in 32-bit integers (a product of doubles would round and repeat).
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const syllables = ['bra', 'tol', 'mev', 'ska', 'rin', 'dou', 'pel', 'vax', 'quo', 'ten', 'lir'];
  const word = () => {
    const n = 1 + (next() % 3);
    let w = '';
    for (let i = 0; i < n; i++) w += syllables[next() % syllables.length];
    return w;
  };
  const sentence = (n: number) => {
    const words = Array.from({ length: n }, word);
    return `${words.join(' ').replace(/^./, (c) => c.toUpperCase())}.`;
  };
  return { next, word, sentence };
}

/** A scene of invented words: about 90 printed words, a speech among the action. */
function scene(g: ReturnType<typeof generator>, i: number): string {
  const place = `${g.word().toUpperCase()} ${g.word().toUpperCase()} ${i + 1}`;
  return [
    `${i % 2 ? 'INT.' : 'EXT.'} ${place} - ${i % 3 ? 'DAY' : 'NIGHT'}`,
    `${g.sentence(14)} ${g.sentence(10)}`,
    `${g.word().toUpperCase()}\n${g.sentence(12)} ${g.sentence(8)}`,
    `${g.sentence(16)} ${g.sentence(12)}`,
    `${g.word().toUpperCase()}\n${g.sentence(10)}`,
  ].join('\n\n');
}

/** A script of `count` generated scenes, in acts of 25. */
function script(count: number, seed = 7): string {
  const g = generator(seed);
  const parts: string[] = ['Title: Generated\nAuthor: A. Writer'];
  for (let i = 0; i < count; i++) {
    if (i % 25 === 0) parts.push(`# ACT ${i / 25 + 1}`);
    parts.push(scene(g, i));
  }
  return `${parts.join('\n\n')}\n`;
}

/**
 * `count` snapshots of a 150-scene script, newest first, from cached prints, as days of writing
 * leave them: each snapshot has a scene at a new version (a paragraph rewritten), and every third
 * one a scene cut and a new one written in its place, so the versions to resolve and the scenes
 * deleted grow with `count`. The script now is the newest snapshot's with five more scenes cut.
 */
function history(count: number) {
  const g = generator(11);
  /** Every scene version, in the order written; printed together, once. */
  const texts: string[] = [];
  const write = (paragraphs: readonly string[]) => {
    texts.push(paragraphs.join('\n\n'));
    return { paragraphs, version: texts.length - 1 };
  };
  let written = 150;
  let scenes = Array.from({ length: 150 }, (_, i) => write(scene(g, i).split('\n\n')));
  const held: number[][] = [];
  for (let k = 0; k < count; k++) {
    const at = g.next() % scenes.length;
    const old = scenes[at] as (typeof scenes)[number];
    const paragraphs = [...old.paragraphs];
    paragraphs[1 + 2 * (g.next() % 2)] = `${g.sentence(16)} ${g.sentence(12)}`;
    scenes = scenes.with(at, write(paragraphs));
    if (k % 3 === 0) {
      scenes = scenes.toSpliced(g.next() % scenes.length, 1);
      const fresh = write(scene(g, written++).split('\n\n'));
      scenes = scenes.toSpliced(g.next() % scenes.length, 0, fresh);
    }
    held.push(scenes.map((s) => s.version));
  }
  const printed = scenePrints(`${texts.join('\n\n')}\n`);
  if (printed.slots.length !== texts.length) throw new Error('a generated scene did not print');
  const prints = new Map<string, ScenePrint>(printed.prints.map((p) => [p.hash, p]));
  const hashOf = (version: number) => (printed.slots[version] as SceneSlot).hash;
  const snapshots: PastSnapshot[] = held
    .map((versions, k) => ({
      id: `s${k}`,
      at: k + 1,
      slots: versions.map((v, i) => ({
        hash: hashOf(v),
        ordinal: i + 1,
        from: 0,
        to: 0,
        section: false,
      })),
    }))
    .reverse();
  const current = scenes.slice(5).map((s) => prints.get(hashOf(s.version)) as ScenePrint);
  return { snapshots, prints, current };
}

describe('scaling', () => {
  test(
    'scenePrints grows linearly',
    () => {
      const result = scaling(
        (n) => script(n),
        (text) => scenePrints(text),
        40,
      );
      expect(result.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'deletedScenes grows linearly in snapshots',
    () => {
      const result = scaling(
        (n) => history(n),
        ({ snapshots, prints, current }) => deletedScenes(snapshots, prints, current),
        300,
      );
      console.info(`deletedScenes growth 300 to 1,200 snapshots: ${result.growth.toFixed(1)}`);
      expect(result.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test('matching 150 scenes now against cached prints of 300 snapshots finishes', () => {
    const { snapshots, prints, current } = history(300);
    const start = performance.now();
    const found = deletedScenes(snapshots, prints, current);
    const elapsed = performance.now() - start;
    // The 50 ms budget is checked in the app's e2e (Task 3); here, it is logged and held to the
    // hang guard of ten times the budget.
    console.info(`deletedScenes: 150 scenes now, 300 snapshots, ${elapsed.toFixed(1)} ms`);
    expect(found.length).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(500);
  });

  test('prints of a 150-scene script', () => {
    const text = script(150);
    scenePrints(text);
    const start = performance.now();
    const { slots } = scenePrints(text);
    const elapsed = performance.now() - start;
    console.info(`scenePrints: 150 scenes, ${text.length} characters, ${elapsed.toFixed(1)} ms`);
    expect(slots).toHaveLength(150);
    expect(elapsed).toBeLessThan(400);
  });
});
