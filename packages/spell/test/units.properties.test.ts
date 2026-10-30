import { type Doc, parse } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { tokenize } from '../src/tokens';
import { fountainUnits } from '../src/units';

/** The source offsets of the metadata block, if the script has one. */
function metaRange(doc: Doc): [number, number] | null {
  const last = doc.blocks[doc.blocks.length - 1];
  if (doc.meta === null || last?.kind !== 'boneyard') return null;
  return [last.span.from, last.span.to];
}

describe('fountainUnits, for any script', () => {
  test("every unit's text has its source's length and offsets", () => {
    fc.assert(
      fc.property(fountainScript, fc.boolean(), (source, notes) => {
        const doc = parse(source);
        for (const unit of fountainUnits(doc, { notes })) {
          expect(unit.from).toBeGreaterThanOrEqual(0);
          expect(unit.from + unit.text.length).toBeLessThanOrEqual(source.length);
          for (let i = 0; i < unit.text.length; i++) {
            const ch = unit.text[i];
            if (ch !== ' ') expect(ch).toBe(source[unit.from + i]);
          }
          for (const token of tokenize(unit.text, unit.from)) {
            expect(
              source.slice(token.from, token.to).replaceAll('*', '').replaceAll('’', "'"),
            ).toBe(token.word);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  test('a unit never covers a cue, a transition, or the metadata block', () => {
    fc.assert(
      fc.property(fountainScript, fc.boolean(), (source, notes) => {
        const doc = parse(source);
        const covered: number[] = [];
        for (const unit of fountainUnits(doc, { notes })) {
          for (let i = 0; i < unit.text.length; i++) {
            if (!/\s/.test(unit.text[i] as string)) covered.push(unit.from + i);
          }
        }
        const forbidden: Array<[number, number]> = doc.blocks
          .filter((b) => b.kind === 'character' || b.kind === 'transition')
          .map((b) => [b.span.from, b.span.to]);
        const meta = metaRange(doc);
        if (meta) forbidden.push(meta);
        if (doc.titlePage) forbidden.push([doc.titlePage.span.from, doc.titlePage.span.to]);
        for (const at of covered) {
          for (const [from, to] of forbidden) {
            expect(at >= from && at < to, `offset ${at} in [${from}, ${to})`).toBe(false);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
