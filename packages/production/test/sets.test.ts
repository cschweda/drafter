import { describe, expect, it } from 'vitest';
import type { ProductionSet } from '../src';
import { nextSetName, REVISION_COLORS, REVISION_NAMES } from '../src';

const set = (name: string): ProductionSet => ({
  name,
  color: '#000000',
  date: '2026-11-09',
  draft: '',
});

const luminance = (hex: string): number => {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('revision sets', () => {
  it('names follow the industry order', () => {
    expect(REVISION_NAMES).toHaveLength(18);
    // The sets as stored: the locked White draft first.
    expect(nextSetName([set('White')])).toBe('Blue');
    expect(nextSetName([set('White'), set('Blue')])).toBe('Pink');
    const upToCherry = REVISION_NAMES.slice(0, 9).map(set);
    expect(upToCherry.at(-1)?.name).toBe('Cherry');
    expect(nextSetName(upToCherry)).toBe('Double White');
  });

  it('a renamed set still advances', () => {
    expect(nextSetName([set('White'), set('Tan')])).toBe('Pink');
  });

  it('stays on the last name when the list runs out', () => {
    expect(nextSetName(REVISION_NAMES.map(set))).toBe('Double Cherry');
  });

  it('every swatch keeps 3:1 against both page backgrounds', () => {
    for (const name of REVISION_NAMES) {
      const base = name.replace('Double ', '');
      const color = REVISION_COLORS[base];
      expect(color, base).toBeDefined();
      expect(contrast(color as string, '#1e1f22'), `${base} on dark`).toBeGreaterThanOrEqual(3);
      expect(contrast(color as string, '#ffffff'), `${base} on light`).toBeGreaterThanOrEqual(3);
    }
  });
});
