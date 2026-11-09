import type { DrafterMeta } from '@drafter/fountain';
import { describe, expect, it } from 'vitest';
import { CAPS, productionMeta, readProduction } from '../src';

const block = {
  lockedAt: '2026-11-09',
  firstScene: 1,
  numbers: ['1', '2', '2A'],
  pages: [
    ['1', 3, 0],
    ['2', 40, 0],
    ['12A', 77, 2],
  ],
  sets: [
    {
      name: 'Blue',
      color: '#8fb4e8',
      date: '2026-11-12',
      draft: 'a'.repeat(64),
      lines: ['5d1e2a0:1'],
      gaps: ['9aa01c3:1'],
    },
    { name: 'Pink', color: '#f2a7c4', date: '2026-11-19', draft: 'b'.repeat(64) },
  ],
  baseline: 'H4sIAAAAAAAA',
};

const meta = (production: unknown): DrafterMeta => ({
  v: 1,
  template: 'us-screenplay',
  production,
});

describe('the production block', () => {
  it('reads a well-formed block', () => {
    const p = readProduction(meta(block));
    expect(p?.lockedAt).toBe('2026-11-09');
    expect(p?.numbers).toEqual(['1', '2', '2A']);
    expect(p?.pages[2]).toEqual({ label: '12A', line: 77, printed: 2 });
    expect(p?.sets[0]?.lines).toEqual(['5d1e2a0:1']);
    expect(p?.sets[1]?.lines).toBeUndefined();
    // Written back it is the same block, pages as tuples again.
    const out = productionMeta(null, p ?? null).production;
    expect(out).toEqual(block);
  });

  it('ignores wrong types, out-of-cap arrays, and a missing baseline', () => {
    const bad: unknown[] = [
      null,
      'x',
      [],
      { ...block, baseline: undefined },
      { ...block, baseline: '' },
      { ...block, lockedAt: 5 },
      { ...block, firstScene: '1' },
      { ...block, numbers: 'no' },
      { ...block, numbers: [1] },
      { ...block, pages: [['1', 'x', 0]] },
      { ...block, pages: [['1', -1, 0]] },
      { ...block, pages: [['1', 1.5, 0]] },
      { ...block, pages: [{ label: '1' }] },
      { ...block, sets: [{ ...block.sets[0], color: 3 }] },
      { ...block, sets: [{ ...block.sets[0], lines: [1] }] },
      { ...block, sets: 'x' },
      { ...block, numbers: new Array(CAPS.numbers + 1).fill('1') },
      { ...block, pages: new Array(CAPS.pages + 1).fill(['1', 0, 0]) },
      { ...block, sets: new Array(CAPS.sets + 1).fill(block.sets[1]) },
      { ...block, sets: [{ ...block.sets[0], lines: new Array(CAPS.lines + 1).fill('a:1') }] },
      { ...block, sets: [{ ...block.sets[0], gaps: new Array(CAPS.lines + 1).fill('a:1') }] },
    ];
    for (const b of bad) expect(readProduction(meta(b))).toBeNull();
    expect(readProduction(null)).toBeNull();
    expect(readProduction({ v: 1 })).toBeNull();
  });

  it('caps the stored baseline by length', () => {
    const at = { ...block, baseline: 'A'.repeat(CAPS.baselineChars) };
    expect(readProduction(meta(at))?.baseline).toHaveLength(CAPS.baselineChars);
    const past = { ...block, baseline: 'A'.repeat(CAPS.baselineChars + 1) };
    expect(readProduction(meta(past))).toBeNull();
  });

  it('writes pages as tuples and drops the key on null', () => {
    const p = readProduction(meta(block));
    const out = productionMeta({ v: 1, template: 'us-screenplay', other: 1 }, p ?? null);
    expect(out.template).toBe('us-screenplay');
    expect(out.other).toBe(1);
    expect((out.production as { pages: unknown }).pages).toEqual(block.pages);
    const gone = productionMeta(out, null);
    expect('production' in gone).toBe(false);
    expect(gone.other).toBe(1);
    expect(productionMeta(null, null)).toEqual({});
  });
});
