import { describe, expect, it } from 'vitest';
import { CHARACTER_COLORS } from '../src/reading';
import { PALETTES, type Palette, STYLESHEET } from '../src/style';

/** WCAG 2's relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2's contrast ratio, to two places as the checkers print it. */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/**
 * Every pair of colors the file draws text in, and what each measured when the palettes were
 * chosen. A change of color changes a figure here, on purpose: look at it again before you
 * update it. AA asks 4.5 for text and 3 for a control's edge and the focus ring.
 */
const MEASURED: Record<keyof typeof PALETTES, Record<string, number>> = {
  dark: {
    'ink on bg': 15.54,
    'ink on panel': 14.21,
    'dim on bg': 6.24,
    'dim on panel': 5.7,
    'accent on bg': 10.57,
    'accent on panel': 9.67,
    'on-accent on accent': 10.57,
    'page-ink on page': 18.88,
    'dim edge on panel': 5.7,
    'focus on bg': 10.57,
    'focus on panel': 9.67,
  },
  light: {
    'ink on bg': 15.87,
    'ink on panel': 14.28,
    'dim on bg': 6.01,
    'dim on panel': 5.41,
    'accent on bg': 5.79,
    'accent on panel': 5.21,
    'on-accent on accent': 6.04,
    'page-ink on page': 18.88,
    'dim edge on panel': 5.41,
    'focus on bg': 5.79,
    'focus on panel': 5.21,
  },
};

const pairs = (p: Palette): Record<string, [string, string, number]> => ({
  'ink on bg': [p.ink, p.bg, 4.5],
  'ink on panel': [p.ink, p.panel, 4.5],
  'dim on bg': [p.dim, p.bg, 4.5],
  'dim on panel': [p.dim, p.panel, 4.5],
  'accent on bg': [p.accent, p.bg, 4.5],
  'accent on panel': [p.accent, p.panel, 4.5],
  'on-accent on accent': [p.onAccent, p.accent, 4.5],
  'page-ink on page': [p.pageInk, p.page, 4.5],
  'dim edge on panel': [p.dim, p.panel, 3],
  'focus on bg': [p.accent, p.bg, 3],
  'focus on panel': [p.accent, p.panel, 3],
});

describe('the palettes', () => {
  it('keep the Studio look in the dark', () => {
    expect(PALETTES.dark).toMatchObject({
      bg: '#0e1116',
      panel: '#161b22',
      line: '#262d36',
      ink: '#e6e9ee',
      dim: '#8b95a3',
      accent: '#f2b84b',
    });
  });

  for (const name of ['dark', 'light'] as const) {
    it(`every text and background pair passes AA in the ${name} palette, as measured`, () => {
      const measured: Record<string, number> = {};
      for (const [pair, [fg, bg, least]] of Object.entries(pairs(PALETTES[name]))) {
        measured[pair] = contrast(fg, bg);
        expect(measured[pair], pair).toBeGreaterThanOrEqual(least);
      }
      expect(measured).toEqual(MEASURED[name]);
    });
  }

  it('the stylesheet sets every color of both palettes, and draws in no other', () => {
    for (const name of ['dark', 'light'] as const) {
      for (const color of Object.values(PALETTES[name])) {
        expect(STYLESHEET, `${name} ${color}`).toContain(color);
      }
    }
    const known = new Set(
      Object.values(PALETTES).flatMap((p) => Object.values(p).map((c) => c.toLowerCase())),
    );
    const used = STYLESHEET.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(used.filter((c) => !known.has(c.toLowerCase()))).toEqual([]);
  });

  it("every character's color passes AA on the frame and the panel of each palette, as measured", () => {
    // [dark on bg, dark on panel, light on bg, light on panel], by color, in the palette's order.
    const measured = CHARACTER_COLORS.map(({ dark, light }) => [
      contrast(dark, PALETTES.dark.bg),
      contrast(dark, PALETTES.dark.panel),
      contrast(light, PALETTES.light.bg),
      contrast(light, PALETTES.light.panel),
    ]);
    for (const figures of measured) {
      for (const figure of figures) expect(figure).toBeGreaterThanOrEqual(4.5);
    }
    expect(measured).toEqual([
      [8.95, 8.19, 5.84, 5.25],
      [8.26, 7.55, 6.26, 5.64],
      [9.79, 8.96, 5.15, 4.64],
      [8.23, 7.53, 6.42, 5.78],
      [9.51, 8.7, 5.76, 5.18],
      [10.14, 9.27, 5.62, 5.06],
      [8.92, 8.16, 6.02, 5.42],
      [11.79, 10.78, 5.65, 5.09],
    ]);
  });
});
