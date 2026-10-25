import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// The design tokens, read straight from the stylesheet the app uses.
const css = readFileSync(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function theme(name: 'dark' | 'light'): Record<string, string> {
  const block = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, selector]) =>
    selector.split(',').some((part) => part.trim() === `.${name}`),
  );
  if (!block) throw new Error(`tokens.css has no .${name} block`);
  return Object.fromEntries(
    [...block[2].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, token, value]) => [
      token,
      value,
    ]),
  );
}

// WCAG 2's contrast ratio, from each color's relative luminance.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Where each text color may be used, and the contrast it needs there. The
// active tab's underline is a control's edge, so it needs 3:1.
const TEXT_PAIRS: Array<[string, string, number]> = [
  ['--text', '--bg', 4.5],
  ['--text', '--chrome', 4.5],
  ['--muted', '--bg', 4.5],
  ['--muted', '--chrome', 4.5],
  ['--muted', '--chrome-2', 4.5],
  ['--faint', '--bg', 4.5],
  ['--faint', '--chrome', 4.5],
  ['--gutter', '--bg', 4.5],
  ['--heading', '--bg', 4.5],
  ['--cue', '--bg', 4.5],
  ['--paren', '--bg', 4.5],
  ['--trans', '--bg', 4.5],
  ['--note', '--bg', 4.5],
  ['--title', '--bg', 4.5],
  ['--ink', '--page', 4.5],
  ['--ink-muted', '--page', 4.5],
  ['--heading', '--chrome', 3],
];

describe('design tokens', () => {
  test('measures contrast the way WCAG does', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  test('both themes define the same nineteen tokens', () => {
    const dark = Object.keys(theme('dark')).sort();
    expect(dark).toHaveLength(19);
    expect(Object.keys(theme('light')).sort()).toEqual(dark);
  });

  test.each(['dark', 'light'] as const)(
    'every text color has enough contrast in the %s theme',
    (name) => {
      const colors = theme(name);
      const short = TEXT_PAIRS.filter(
        ([fg, bg, min]) => contrast(colors[fg], colors[bg]) < min,
      ).map(
        ([fg, bg, min]) =>
          `${fg} on ${bg}: ${contrast(colors[fg], colors[bg]).toFixed(2)} < ${min}`,
      );
      expect(short).toEqual([]);
    },
  );
});
