import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// The welcome and intro cards' text colors (app/assets/css/tour.css), against the cards the tour
// module draws: a light card is #f8fafc, and a dark one is a gradient from #475569 to #334155, which
// axe can't measure, so this does, at both ends.
const css = readFileSync(new URL('../app/assets/css/tour.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

function block(theme: 'dark' | 'light'): Record<string, string> {
  const found = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, selector]) =>
    selector.includes(`.${theme} .welcome-card`),
  );
  if (!found) throw new Error(`tour.css has no .${theme} .welcome-card block`);
  return Object.fromEntries(
    [...found[2].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, k, v]) => [k, v]),
  );
}

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

const GRADIENT = ['#475569', '#334155'];
const LIGHT_CARDS = ['#f8fafc', '#ffffff'];

describe('the tour cards', () => {
  test.each([
    ['dark', ['--ui-text', '--ui-text-muted', '--ui-text-dimmed'], GRADIENT],
    ['light', ['--ui-text', '--ui-text-dimmed', '--ui-primary'], LIGHT_CARDS],
  ] as const)('give their text 4.5:1 in the %s theme', (theme, tokens, cards) => {
    const colors = block(theme);
    for (const token of tokens) {
      for (const card of cards) {
        expect(contrast(colors[token] ?? '', card), `${token} on ${card}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  // The intro's icon is drawn in the primary color: a graphic, so 3:1 (WCAG 1.4.11).
  test.each([
    ['dark', GRADIENT],
    ['light', LIGHT_CARDS],
  ] as const)('give the icon 3:1 in the %s theme', (theme, cards) => {
    const primary = block(theme)['--ui-primary'] ?? '';
    for (const card of cards) {
      expect(contrast(primary, card), `--ui-primary on ${card}`).toBeGreaterThanOrEqual(3);
    }
  });

  // The solid buttons: --ui-text-inverted on the primary color, and on its hover color.
  test.each(['dark', 'light'] as const)('give button text 4.5:1 in the %s theme', (theme) => {
    const colors = block(theme);
    for (const background of ['--ui-primary', '--tour-primary-hover']) {
      expect(
        contrast(colors['--ui-text-inverted'] ?? '', colors[background] ?? ''),
        `--ui-text-inverted on ${background}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
