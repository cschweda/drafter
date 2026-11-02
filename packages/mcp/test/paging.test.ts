import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pageOf, partsOf } from '../src/paging';

/** What a page costs as JSON: the envelope's own characters and the items array. */
const cost = (overhead: number, items: unknown[]) => overhead + JSON.stringify(items).length;

describe('paging', () => {
  it('whole items until the budget', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ n: i, text: 'x'.repeat(90) }));
    const page = pageOf(items, 0, 1_000, 100);
    expect(page.items.length).toBeGreaterThan(1);
    expect(cost(100, page.items)).toBeLessThanOrEqual(1_000);
    // One more would not fit.
    expect(cost(100, items.slice(0, page.items.length + 1))).toBeGreaterThan(1_000);
    expect(page.next).toBe(page.items.length);

    const rest = pageOf(items, page.next as number, 1_000, 100);
    expect(rest.items[0]).toEqual(items[page.next as number]);
    // The last page has no next.
    const last = pageOf(items, 45, 100_000, 100);
    expect(last.items).toHaveLength(5);
    expect(last.next).toBeNull();
    expect(pageOf(items, 50, 1_000, 100)).toEqual({ items: [], next: null });
  });

  it('always at least one item', () => {
    const items = [{ text: 'y'.repeat(5_000) }, { text: 'z' }];
    const page = pageOf(items, 0, 1_000, 100);
    expect(page.items).toEqual([items[0]]);
    expect(page.next).toBe(1);
  });

  it('a too-large item comes in parts at line breaks, each under the budget', () => {
    // Lines that fit are never split.
    const text = `${'a'.repeat(30)}\n${'b'.repeat(30)}\n${'c'.repeat(30)}\n`;
    expect(partsOf(text, 70)).toEqual([
      `${'a'.repeat(30)}\n${'b'.repeat(30)}\n`,
      `${'c'.repeat(30)}\n`,
    ]);
    // A line too long for one part is cut at code points.
    const emoji = '😀'.repeat(10);
    const parts = partsOf(emoji, 7);
    expect(parts.join('')).toBe(emoji);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(7);
    expect(partsOf('', 10)).toEqual(['']);

    const escaped = (part: string) => JSON.stringify(part).length - 2;
    // Whole code points (no lone surrogates), with line breaks often enough to matter.
    const texts = fc
      .array(fc.oneof(fc.string({ unit: 'binary', maxLength: 2_000 }), fc.constant('\n')), {
        maxLength: 100,
      })
      .map((pieces) => pieces.join(''));
    const isHigh = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
    const isLow = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;
    fc.assert(
      fc.property(
        fc.oneof(texts, fc.string({ unit: 'binary', maxLength: 200_000 })),
        fc.integer({ min: 6, max: 50_000 }),
        (text, budget) => {
          const parts = partsOf(text, budget);
          expect(parts.join('')).toBe(text);
          for (const part of parts) {
            expect(part.length).toBeLessThanOrEqual(budget);
            // Its escaped length too: the part goes inside a JSON string.
            expect(escaped(part)).toBeLessThanOrEqual(budget);
            // Never half a surrogate pair at either end.
            if (part.length > 0) {
              expect(isLow(part.charCodeAt(0))).toBe(false);
              expect(isHigh(part.charCodeAt(part.length - 1))).toBe(false);
            }
          }
        },
      ),
      { numRuns: 60 },
    );
  });
});
