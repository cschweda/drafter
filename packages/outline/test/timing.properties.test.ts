import { parse } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import {
  addTiming,
  blockTiming,
  DEFAULT_WORDS_PER_MINUTE,
  estimateSeconds,
  sceneIndex,
  type Timing,
} from '../src';
import { anyScript } from './arbitraries';
import { screenplay, stagePlay } from './helpers';

const sound = (t: Timing) => {
  for (const n of [t.spoken, t.actionLines]) {
    expect(Number.isInteger(n)).toBe(true);
    expect(n).toBeGreaterThanOrEqual(0);
  }
  const seconds = estimateSeconds(t, DEFAULT_WORDS_PER_MINUTE);
  expect(Number.isFinite(seconds)).toBe(true);
  expect(seconds).toBeGreaterThanOrEqual(0);
};

describe('timing properties', () => {
  test("timing is finite, non-negative, and sums over scenes to at most the script's", () => {
    fc.assert(
      fc.property(anyScript, (source) => {
        const doc = parse(source);
        const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
        const index = sceneIndex(doc, template);
        const script = doc.blocks
          .map((block) => blockTiming(block, template))
          .reduce(addTiming, { spoken: 0, actionLines: 0 });
        sound(script);
        let scenes: Timing = { spoken: 0, actionLines: 0 };
        for (const scene of index.scenes) {
          sound(scene.timing);
          scenes = addTiming(scenes, scene.timing);
        }
        expect(scenes.spoken).toBeLessThanOrEqual(script.spoken);
        expect(scenes.actionLines).toBeLessThanOrEqual(script.actionLines);
        for (const section of index.sections) {
          sound(section.timing);
          // A section is the sum of the scenes inside it.
          const inside = index.scenes
            .filter((s) => s.sections.includes(section.block))
            .reduce((sum, s) => addTiming(sum, s.timing), { spoken: 0, actionLines: 0 });
          expect(section.timing).toEqual(inside);
        }
      }),
    );
  });
});
