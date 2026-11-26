import { normalizeLabel } from '@drafter/notes';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { renameThread, setSceneThreadNotes, setSceneThreads } from '../src';
import { anyScript } from './arbitraries';
import { apply, indexOf, sceneAt } from './helpers';

const label = fc.constantFrom('A', 'b', 'C d', 'Maya & dad', '__proto__', 'a', 'B', 'E', 'f', 'G');
const labels = fc.array(label, { maxLength: 12 });
const firstTyped = (all: string[]) => {
  const seen = new Set<string>();
  return all.filter((l) => !seen.has(normalizeLabel(l)) && seen.add(normalizeLabel(l)));
};

describe('thread properties', () => {
  test('setSceneThreads then sceneIndex returns the set, case-folded, in order of first typing', () => {
    fc.assert(
      fc.property(anyScript, fc.nat(), labels, (source, pick, set) => {
        const { doc, index } = indexOf(source);
        if (index.scenes.length === 0) return;
        const scene = sceneAt(index, pick % index.scenes.length);
        const out = apply(source, setSceneThreads(doc, scene, set));
        const next = indexOf(out).index.scenes[index.scenes.indexOf(scene)];
        expect(next?.threads).toEqual(firstTyped(set));
      }),
      { numRuns: 100 },
    );
  });

  test('the changes are apart, and a scene alone gives what the whole script gives', () => {
    fc.assert(
      fc.property(anyScript, labels, (source, set) => {
        const { doc, index } = indexOf(source);
        const tagged = apply(
          source,
          index.scenes.flatMap((s) => setSceneThreads(doc, s, set)),
        );
        const after = indexOf(tagged).index.scenes.map((s) => s.threads);
        expect(after).toEqual(index.scenes.map(() => firstTyped(set)));
      }),
      { numRuns: 60 },
    );
  });

  test('rename then rename back is the original when no merge happened', () => {
    fc.assert(
      fc.property(anyScript, labels, (source, set) => {
        const first = indexOf(source);
        const tagged = apply(
          source,
          first.index.scenes.flatMap((s, i) =>
            i % 2 === 0 ? setSceneThreads(first.doc, s, set) : [],
          ),
        );
        const { doc, index } = indexOf(tagged);
        const used = index.scenes.flatMap((s) => s.threads);
        if (used.length === 0) return;
        const from = used[0] as string;
        const r = renameThread(doc, index, from, 'Zulu Zulu');
        expect(r.merged).toBe(false);
        const renamed = apply(tagged, r.changes);
        const back = indexOf(renamed);
        const r2 = renameThread(back.doc, back.index, 'Zulu Zulu', from);
        expect(r2.merged).toBe(false);
        expect(apply(renamed, r2.changes)).toBe(tagged);
      }),
      { numRuns: 100 },
    );
  });

  test('the per-scene path of rename gives what the whole-script edit gives', () => {
    fc.assert(
      fc.property(anyScript, labels, (source, set) => {
        const first = indexOf(source);
        const tagged = apply(
          source,
          first.index.scenes.flatMap((s) => setSceneThreads(first.doc, s, set)),
        );
        const { doc, index } = indexOf(tagged);
        const used = index.scenes[0]?.threads[0];
        if (used === undefined) return;
        const viaRename = apply(tagged, renameThread(doc, index, used, 'Zulu Zulu').changes);
        const key = normalizeLabel(used);
        const direct = apply(
          tagged,
          index.scenes
            .filter((s) => s.threads.some((l) => normalizeLabel(l) === key))
            .flatMap((s) =>
              setSceneThreadNotes(
                doc,
                s,
                s.threads.map((l) => (normalizeLabel(l) === key ? 'Zulu Zulu' : l)).join(', '),
              ),
            ),
        );
        expect(viaRename).toBe(direct);
      }),
      { numRuns: 100 },
    );
  });
});
