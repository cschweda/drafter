import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { deletedScenes, putBackChanges, putBackPlace, type ScenePrint, scenePrints } from '../src';
import { anyScript } from './arbitraries';
import { apply, now, nowScenes } from './helpers';

const templateOf = (text: string) =>
  (builtins[parse(text).meta?.template ?? ''] ?? builtins['us-screenplay']) as Template;

/** `text` without its scene at `index` (and the blank lines before the next one). */
function cut(text: string, index: number): string | null {
  const scenes = sceneIndex(parse(text), templateOf(text)).scenes;
  const scene = scenes[index];
  if (!scene) return null;
  const head = text.slice(0, scene.span.from);
  const tail = text.slice(scene.span.to);
  return /\S/.test(tail)
    ? head + tail.replace(/^(\r?\n)+/, '')
    : head.replace(/(\r?\n)+$/, '') + tail;
}

const normalize = (s: string) =>
  s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n+$/, '');

/** A random script, one of its scenes, and the script without it. */
const cases = anyScript
  .chain((text) => {
    const count = scenePrints(text).slots.length;
    return fc.tuple(fc.constant(text), fc.integer({ min: 0, max: Math.max(0, count - 1) }));
  })
  .map(([text, index]) => ({ text, index, current: cut(text, index) }))
  .filter((c): c is { text: string; index: number; current: string } => c.current !== null);

function putBack(text: string, index: number, current: string) {
  const past = scenePrints(text);
  const prints = new Map<string, ScenePrint>(past.prints.map((p) => [p.hash, p]));
  const slot = past.slots[index];
  if (!slot) throw new Error('no such scene');
  const place = putBackPlace(
    past.slots,
    index,
    prints,
    nowScenes(current),
    current.length,
    scenePrints(current).sections,
  );
  const sceneText = text.slice(slot.from, slot.to);
  const changes = putBackChanges(current, place, sceneText);
  return { past, prints, slot, place, sceneText, changes, after: apply(current, changes) };
}

describe('put back (properties)', () => {
  test("put back inserts at a scene boundary and adds exactly the scene's text", () => {
    fc.assert(
      fc.property(cases, ({ text, index, current }) => {
        const { place, sceneText, changes, after } = putBack(text, index, current);
        // One insertion, outside every scene now.
        expect(changes).toHaveLength(1);
        const [change] = changes;
        expect(change?.from).toBe(change?.to);
        for (const s of nowScenes(current)) {
          expect(place.at <= s.from || place.at >= s.to).toBe(true);
        }
        // What it inserts is the scene's text and line breaks, nothing else.
        expect(normalize(change?.insert.replace(/^(\r?\n)+/, '') ?? '')).toBe(normalize(sceneText));
        // Every scene now is still there, unchanged, and the scene put back is one more.
        // The one put back is the scene that starts where the insertion's text does (not the
        // first with its text: a scene can be a copy of another).
        const before = nowScenes(current).map((s) => normalize(current.slice(s.from, s.to)));
        const scenesAfter = nowScenes(after);
        expect(scenesAfter).toHaveLength(before.length + 1);
        const start = (change?.from ?? 0) + (change?.insert.match(/^(\r?\n)*/)?.[0].length ?? 0);
        const at = scenesAfter.findIndex((s) => s.from === start);
        expect(at).toBeGreaterThanOrEqual(0);
        const remaining = scenesAfter.map((s) => normalize(after.slice(s.from, s.to)));
        expect(remaining.splice(at, 1)).toEqual([normalize(sceneText)]);
        expect(remaining).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });

  test('after put back the scene is no longer deleted', () => {
    fc.assert(
      fc.property(cases, ({ text, index, current }) => {
        const { past, prints, slot, after } = putBack(text, index, current);
        const snapshots = [{ id: 'past', at: 1, slots: past.slots }];
        const deleted = deletedScenes(snapshots, prints, now(after));
        expect(deleted.some((d) => d.newest.print.hash === slot.hash)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});
