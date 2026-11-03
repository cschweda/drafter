import { describe, expect, test } from 'vitest';
import {
  CONTRAST_AS_DESIGNED,
  CONTRAST_DEFAULT,
  CONTRAST_MAX,
  CONTRAST_MIN,
  CONTRASTS,
  contrastLabel,
  contrastMix,
  contrastRatio,
  isContrast,
  ratioLabel,
  wcagLevel,
} from '../app/settings/contrast';

// The contrast sliders (the maintainer, 2026-11-03): one for the Source, one for the Script,
// nearly the highest by default, softer below the theme's own colours, crisper above.

describe('the contrast sliders', () => {
  test('run from 40 to 100 in fives, nearly the highest by default', () => {
    expect(CONTRASTS[0]).toBe(CONTRAST_MIN);
    expect(CONTRASTS.at(-1)).toBe(CONTRAST_MAX);
    expect(CONTRASTS).toHaveLength(13);
    expect(CONTRAST_DEFAULT).toBe(90);
    expect(CONTRAST_DEFAULT).toBeLessThan(CONTRAST_MAX);
    expect(CONTRAST_DEFAULT).toBeGreaterThan(CONTRAST_AS_DESIGNED);
  });

  test('take only a value the slider can hold', () => {
    for (const ok of [40, 75, 90, 100]) expect(isContrast(ok), String(ok)).toBe(true);
    for (const bad of [35, 105, 92, 90.5, '90', null, Number.NaN])
      expect(isContrast(bad), String(bad)).toBe(false);
  });

  test('leave the theme’s colours alone in the middle, crisper above, softer below', () => {
    expect(contrastMix(CONTRAST_AS_DESIGNED)).toEqual({ boost: 0, fade: 0 });
    expect(contrastMix(CONTRAST_MAX)).toEqual({ boost: 50, fade: 0 });
    expect(contrastMix(CONTRAST_DEFAULT)).toEqual({ boost: 30, fade: 0 });
    expect(contrastMix(CONTRAST_MIN)).toEqual({ boost: 0, fade: 55 });
    // Each step up never lowers the contrast.
    let last = -Infinity;
    for (const v of CONTRASTS) {
      const { boost, fade } = contrastMix(v);
      const strength = boost - fade;
      expect(strength).toBeGreaterThan(last);
      last = strength;
    }
    expect(contrastLabel(85)).toBe('85%');
  });
});

describe('WCAG 2.1 contrast ratios', () => {
  test('match the published values', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
    // #767676 on white is the classic 4.54:1.
    expect(contrastRatio([0x76, 0x76, 0x76], [255, 255, 255])).toBeCloseTo(4.54, 2);
    // The order of the two colours doesn't matter.
    expect(contrastRatio([255, 255, 255], [0x76, 0x76, 0x76])).toBeCloseTo(4.54, 2);
  });

  test('name the level a ratio meets, never rounding up into one', () => {
    expect(wcagLevel(21)).toBe('AAA');
    expect(wcagLevel(7)).toBe('AAA');
    expect(wcagLevel(6.99)).toBe('AA');
    expect(wcagLevel(4.5)).toBe('AA');
    expect(wcagLevel(4.49)).toBe('AA large');
    expect(wcagLevel(3)).toBe('AA large');
    expect(wcagLevel(2.99)).toBe('below AA');
    expect(ratioLabel(4.499)).toBe('4.4:1');
    expect(ratioLabel(21)).toBe('21.0:1');
  });
});
