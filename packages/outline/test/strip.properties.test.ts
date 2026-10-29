import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { linesPerPage, STRIP_DEPTHS, sceneIndex, structureStrip } from '../src';
import { anyScript } from './arbitraries';
import { screenplay, stagePlay } from './helpers';

/** A random script, with or without a layout, its scene index, and its strip. */
const stripped = fc.tuple(anyScript, fc.boolean()).map(([source, paged]) => {
  const doc = parse(source);
  const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
  const layout = paged ? paginate(doc, template) : null;
  const index = sceneIndex(doc, template, layout);
  return { source, paged, index, strip: structureStrip(index, linesPerPage(layout)) };
});

describe('structureStrip properties', () => {
  test("scenes tile the axis: one block per scene, in order, each to > from, each starting at the last one's to", () => {
    fc.assert(
      fc.property(stripped, ({ index, strip, paged }) => {
        if (index.scenes.length === 0) {
          expect(strip.rows).toEqual([]);
          return;
        }
        expect(strip.unit).toBe(paged ? 'pages' : 'words');
        const blocks = strip.rows.at(-1)?.blocks ?? [];
        expect(strip.rows.at(-1)?.kind).toBe('scenes');
        expect(blocks.map((b) => b.block)).toEqual(index.scenes.map((s) => s.block));
        expect(blocks[0]?.from).toBe(strip.start);
        blocks.forEach((b, i) => {
          expect(b.kind).toBe('scene');
          expect(b.to).toBeGreaterThan(b.from);
          if (i > 0) expect(b.from).toBe(blocks[i - 1]?.to);
        });
        expect(blocks.at(-1)?.to).toBeCloseTo(strip.start + strip.length, 9);
        expect(strip.length).toBeGreaterThan(0);
      }),
    );
  });

  test("a section's block covers exactly its scenes' blocks", () => {
    fc.assert(
      fc.property(stripped, ({ index, strip }) => {
        const scenes = strip.rows.at(-1)?.blocks ?? [];
        for (const row of strip.rows.filter((r) => r.kind === 'section')) {
          for (const block of row.blocks) {
            expect(block.kind).toBe('section');
            const inside = index.scenes
              .map((s, i) => ({ s, b: scenes[i] }))
              .filter(({ s }) => s.sections.includes(block.block));
            if (inside.length === 0) {
              expect(block.to).toBe(block.from);
              const next = index.scenes.findIndex((s) => s.block > block.block);
              if (next < 0) expect(block.from).toBe(scenes.at(-1)?.to);
              else expect(block.from).toBe(scenes[next]?.from);
            } else {
              expect(block.from).toBe(inside[0]?.b?.from);
              expect(block.to).toBe(inside.at(-1)?.b?.to);
            }
          }
        }
      }),
    );
  });

  test('rows are only the depths used, at most three, in order, then scenes', () => {
    fc.assert(
      fc.property(stripped, ({ index, strip }) => {
        if (index.scenes.length === 0) return;
        const used = [...new Set(index.sections.map((s) => s.depth))]
          .filter((d) => d <= STRIP_DEPTHS)
          .sort((a, b) => a - b);
        expect(strip.rows.map((r) => r.depth)).toEqual([...used, null]);
        expect(strip.rows.map((r) => r.kind)).toEqual([...used.map(() => 'section'), 'scenes']);
        for (const row of strip.rows.filter((r) => r.kind === 'section')) {
          expect(row.blocks.map((b) => b.block)).toEqual(
            index.sections.filter((s) => s.depth === row.depth).map((s) => s.block),
          );
        }
      }),
    );
  });

  test('no number is NaN or infinite, and every block lies on the axis', () => {
    fc.assert(
      fc.property(stripped, ({ strip }) => {
        expect(Number.isFinite(strip.start)).toBe(true);
        expect(Number.isFinite(strip.length)).toBe(true);
        const end = strip.start + strip.length;
        const eps = 1e-9;
        for (const row of strip.rows) {
          for (const b of row.blocks) {
            expect(Number.isFinite(b.from) && Number.isFinite(b.to)).toBe(true);
            expect(b.from).toBeGreaterThanOrEqual(strip.start);
            expect(b.to).toBeGreaterThanOrEqual(b.from);
            expect(b.to).toBeLessThanOrEqual(end + eps);
          }
        }
      }),
    );
  });
});
