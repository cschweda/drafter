import { describe, expect, it } from 'vitest';
import { SCENE_COLORS, SCENE_SWATCH } from '../src';

describe('SCENE_SWATCH', () => {
  it('has a hex color for every scene color', () => {
    for (const c of SCENE_COLORS) expect(SCENE_SWATCH[c]).toMatch(/^#[0-9a-f]{6}$/);
    expect(Object.keys(SCENE_SWATCH).sort()).toEqual([...SCENE_COLORS].sort());
  });

  it('keeps the outline’s colors', () => {
    expect(SCENE_SWATCH).toEqual({
      red: '#d9534f',
      orange: '#e8883a',
      yellow: '#e5c13a',
      green: '#4caf6a',
      teal: '#2fa7a0',
      blue: '#4a86d9',
      purple: '#9a6ad6',
      pink: '#e06aa8',
      gray: '#8c93a1',
    });
  });
});
