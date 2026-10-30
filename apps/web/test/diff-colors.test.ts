import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { contrast, DIFF_COLORS, DIFF_TOKENS } from '../app/compare/colors';

// The colors of Compare's Changes view (version-history design §7): two palettes, each with a
// value for both themes, drawn on the page's own colors. Every pair that is read is checked here.

const css = readFileSync(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

/** The six-digit colors of the block whose selector list holds `selector` exactly. */
function block(selector: string): Record<string, string> {
  const found = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, list]) =>
    // Either quote in an attribute selector.
    list
      .split(',')
      .some((part) => part.trim().replaceAll("'", '"') === selector.replaceAll("'", '"')),
  );
  if (!found) throw new Error(`tokens.css has no ${selector} block`);
  return Object.fromEntries(
    [...found[2].matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(([, token, value]) => [
      token,
      value,
    ]),
  );
}

const THEMES = ['light', 'dark'] as const;
/** The page the view is drawn on, and its text, in each theme. */
const page = { light: block('.light'), dark: block('.dark') };

const cases = DIFF_COLORS.flatMap((palette) => THEMES.map((theme) => [palette, theme] as const));

/** The pairs below `min`, named, so a failure says which. */
function short(pairs: [string, string, string, string][], min: number): string[] {
  return pairs
    .filter(([, a, , b]) => contrast(a, b) < min)
    .map(([fg, a, bg, b]) => `${fg} on ${bg}: ${contrast(a, b).toFixed(2)} < ${min}`);
}

describe("the Changes view's colors", () => {
  test('measures contrast the way WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });

  test.each(cases)('text on every tint is at least 4.5:1 (%s, %s)', (palette, theme) => {
    const t = DIFF_TOKENS[palette][theme];
    const { '--ink': ink, '--ink-muted': muted } = page[theme];
    const pairs: [string, string, string, string][] = [];
    // A row's text, and its line numbers.
    for (const tint of ['--diff-add-bg', '--diff-del-bg', '--diff-fold-bg']) {
      pairs.push(['--ink', ink as string, tint, t[tint] as string]);
      pairs.push(['--ink-muted', muted as string, tint, t[tint] as string]);
    }
    // A changed word's text.
    for (const tint of ['--diff-add-word', '--diff-del-word'])
      pairs.push(['--ink', ink as string, tint, t[tint] as string]);
    expect(short(pairs, 4.5)).toEqual([]);
  });

  test.each(cases)('signs on their tints are at least 4.5:1 (%s, %s)', (palette, theme) => {
    const t = DIFF_TOKENS[palette][theme];
    const pairs: [string, string, string, string][] = [];
    for (const side of ['add', 'del']) {
      const sign = `--diff-${side}-sign`;
      // The sign on its row, and the counts in a group's header.
      for (const tint of [`--diff-${side}-bg`, '--diff-fold-bg'])
        pairs.push([sign, t[sign] as string, tint, t[tint] as string]);
    }
    expect(short(pairs, 4.5)).toEqual([]);
  });

  test.each(cases)('bars and rules on the page are at least 3:1 (%s, %s)', (palette, theme) => {
    const t = DIFF_TOKENS[palette][theme];
    const bg = page[theme]['--page'] as string;
    const pairs: [string, string, string, string][] = ['--diff-add-sign', '--diff-del-sign'].map(
      (sign) => [sign, t[sign] as string, '--page', bg],
    );
    expect(short(pairs, 3)).toEqual([]);
  });

  test.each(cases)(
    "Show changes' signs and buttons on the page are at least 4.5:1 (%s, %s)",
    (palette, theme) => {
      // The Script pane's + in the margin and its removed-lines buttons are text on the page.
      const t = DIFF_TOKENS[palette][theme];
      const bg = page[theme]['--page'] as string;
      const pairs: [string, string, string, string][] = ['--diff-add-sign', '--diff-del-sign'].map(
        (sign) => [sign, t[sign] as string, '--page', bg],
      );
      expect(short(pairs, 4.5)).toEqual([]);
    },
  );

  test.each(cases)('focus outlines are at least 3:1 on every tint (%s, %s)', (palette, theme) => {
    // A focused row, fold, button, or group title is outlined in `--heading`, over its own tint.
    const t = DIFF_TOKENS[palette][theme];
    const heading = page[theme]['--heading'] as string;
    const pairs: [string, string, string, string][] = [
      ['--heading', heading, '--page', page[theme]['--page'] as string],
      ...['--diff-add-bg', '--diff-del-bg', '--diff-fold-bg'].map(
        (tint): [string, string, string, string] => ['--heading', heading, tint, t[tint] as string],
      ),
    ];
    expect(short(pairs, 3)).toEqual([]);
  });

  test('every palette has the same seven tokens in both themes', () => {
    const names = Object.keys(DIFF_TOKENS['red-green'].light).sort();
    expect(names).toHaveLength(7);
    for (const [palette, theme] of cases)
      expect(Object.keys(DIFF_TOKENS[palette][theme]).sort()).toEqual(names);
  });

  test('the stylesheet holds the same values', () => {
    // Red and green is the default, on the theme's own block; Blue and orange by `data-diff-colors`.
    const selectors = {
      'red-green': {
        dark: ":root[data-diff-colors='red-green']",
        light: ".light[data-diff-colors='red-green']",
      },
      'blue-orange': {
        dark: ":root[data-diff-colors='blue-orange']",
        light: ".light[data-diff-colors='blue-orange']",
      },
    } as const;
    for (const [palette, theme] of cases) {
      const values = block(selectors[palette][theme]);
      for (const [token, value] of Object.entries(DIFF_TOKENS[palette][theme]))
        expect(values[token]?.toLowerCase(), `${token} (${palette}, ${theme})`).toBe(value);
    }
  });
});
