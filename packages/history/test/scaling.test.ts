import { describe, expect, test } from 'vitest';
import { deletedScenes, type PastSnapshot, type ScenePrint, scenePrints } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// Generated scripts of invented words, from a seeded generator, so every run times the same text.

function generator(seed: number) {
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state;
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
  const place = `${g.word().toUpperCase()} ${g.word().toUpperCase()}`;
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
 * `count` snapshots of a 150-scene script, newest first, from cached prints: each one the script
 * with a scene or two at another version or missing, as a day of writing leaves them.
 */
function history(count: number) {
  const base = scenePrints(script(150));
  const prints = new Map<string, ScenePrint>(base.prints.map((p) => [p.hash, p]));
  // Some other versions of the scenes, printed once.
  const others = scenePrints(script(150, 99));
  for (const p of others.prints) prints.set(p.hash, p);
  const snapshots: PastSnapshot[] = [];
  for (let k = 0; k < count; k++) {
    const slots = base.slots.map((slot) => ({ ...slot }));
    const at = k % 150;
    const other = others.slots[at];
    if (other) slots[at] = { ...(slots[at] as (typeof slots)[number]), hash: other.hash };
    if (k % 3 === 0) slots.splice((k * 7) % 140, 1);
    snapshots.push({ id: `s${k}`, at: count - k, slots });
  }
  const current = base.slots.slice(0, 145).map((s) => prints.get(s.hash) as ScenePrint);
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
    expect(found.length).toBeGreaterThan(0);
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
