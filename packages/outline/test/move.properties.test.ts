import type { TextChange } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { bodyEnd, type MoveTarget, moveItem, type SceneIndex } from '../src';
import { anyScript } from './arbitraries';
import { apply, indexOf } from './helpers';

/** Every target a move can name in `index`. */
const targets = (index: SceneIndex): MoveTarget[] => [
  { start: true },
  ...index.items.map((i) => ({ after: i.block })),
];

/** A script, one of its items, and a target: the move to try. */
const moves = anyScript.chain((source) => {
  const { index } = indexOf(source);
  return fc.tuple(
    fc.constant(source),
    fc.integer({ min: 0, max: Math.max(0, index.items.length - 1) }),
    fc.integer({ min: 0, max: index.items.length }),
  );
});

/** Where `pos` is after `changes` (none of them covers it). */
function mapPos(pos: number, changes: readonly TextChange[]): number {
  let shift = 0;
  for (const c of changes) if (c.to <= pos) shift += c.insert.length - (c.to - c.from);
  return pos + shift;
}

const sceneTexts = (source: string) => {
  const { index } = indexOf(source);
  return index.scenes.map((s) => source.slice(s.span.from, s.span.to)).sort();
};

describe('moving, for any script', () => {
  test("a move keeps every scene's text", () => {
    fc.assert(
      fc.property(moves, ([source, i, t]) => {
        const { doc, index } = indexOf(source);
        const item = index.items[i];
        const target = targets(index)[t];
        if (!item || !target) return;
        const move = moveItem(doc, index, item.block, target);
        if (!move) return;
        const result = apply(source, move.changes);
        expect(sceneTexts(result)).toEqual(sceneTexts(source));
        expect(indexOf(result).index.scenes).toHaveLength(index.scenes.length);
        // The moved text is where the move says.
        expect(result.slice(move.at, move.at + (item.span.to - item.span.from))).toBe(
          source.slice(item.span.from, item.span.to),
        );
      }),
      { numRuns: 400 },
    );
  });

  test('moving and moving back restores the source', () => {
    fc.assert(
      fc.property(moves, ([source, i, t]) => {
        const { doc, index } = indexOf(source);
        const item = index.items[i];
        const target = targets(index)[t];
        if (!item || !target) return;
        const move = moveItem(doc, index, item.block, target);
        if (!move) return;
        const result = apply(source, move.changes);
        // Back: after the item that was before it, or to the start.
        const before = index.items[index.items.indexOf(item) - 1];
        const again = indexOf(result);
        let back: MoveTarget = { start: true };
        if (before) {
          const at = mapPos(before.span.from, move.changes);
          const found = again.index.items.find((x) => x.span.from === at);
          if (!found) throw new Error('the item before it is gone');
          back = { after: found.block };
        }
        const moved = again.index.items.find((x) => x.span.from === move.at);
        if (!moved) throw new Error('the moved item is gone');
        const undo = moveItem(again.doc, again.index, moved.block, back);
        expect(undo && apply(result, undo.changes)).toBe(source);
      }),
      { numRuns: 400 },
    );
  });

  test('the preamble and the metadata block never move', () => {
    fc.assert(
      fc.property(moves, ([source, i, t]) => {
        const { doc, index } = indexOf(source);
        const item = index.items[i];
        const target = targets(index)[t];
        if (!item || !target) return;
        const move = moveItem(doc, index, item.block, target);
        if (!move) return;
        const result = apply(source, move.changes);
        if (index.preamble) {
          expect(result.slice(0, index.preamble.to)).toBe(source.slice(0, index.preamble.to));
        }
        const end = bodyEnd(doc);
        const meta = doc.blocks[end];
        if (meta) expect(result.endsWith(source.slice(meta.span.from))).toBe(true);
        for (const change of move.changes) {
          if (index.preamble) expect(change.from).toBeGreaterThanOrEqual(index.preamble.to);
          if (meta) expect(change.to).toBeLessThan(meta.span.from);
        }
      }),
      { numRuns: 400 },
    );
  });
});
