import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { contrast } from '../app/compare/colors';
import { CHART_TOKENS } from '../app/stats/chart-colors';

// The grid's shades (seeing-the-script design §8.2): each at least 3:1 against the page it is
// drawn on (a graphic), with the grid's text at least 4.5:1 on every one, in both themes.
const css = readFileSync(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
/** The six-digit colors of every block whose selector list holds `selector` exactly. */
function block(selector: string): Record<string, string> {
  const found = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, list]) =>
    (list as string).split(',').some((part) => part.trim() === selector),
  );
  if (found.length === 0) throw new Error(`tokens.css has no ${selector} block`);
  return Object.fromEntries(
    found.flatMap(([, , body]) =>
      [...(body as string).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(
        ([, token, value]) => [token, value],
      ),
    ),
  );
}
const THEMES = ['light', 'dark'] as const;
const SHADES = ['--grid-shade-1', '--grid-shade-2', '--grid-shade-3', '--grid-shade-4'];
/** The Stats tab is drawn on the pane's background. */
const page = { light: block('.light')['--bg'] as string, dark: block('.dark')['--bg'] as string };

describe('the grid’s colors', () => {
  test.each(THEMES)('grid text on every shade is at least 4.5:1 (%s)', (theme) => {
    const t = CHART_TOKENS[theme];
    const short = SHADES.filter((s) => contrast(t['--grid-ink'] as string, t[s] as string) < 4.5);
    expect(short).toEqual([]);
  });

  test.each(THEMES)('each shade is at least 3:1 against the page (%s)', (theme) => {
    const t = CHART_TOKENS[theme];
    const short = SHADES.filter((s) => contrast(t[s] as string, page[theme]) < 3);
    expect(short).toEqual([]);
  });

  test('the stylesheet holds the same values', () => {
    const sheet = { light: block('.light'), dark: block('.dark') };
    for (const theme of THEMES) {
      for (const [token, value] of Object.entries(CHART_TOKENS[theme]))
        expect(sheet[theme][token]?.toLowerCase(), `${token} (${theme})`).toBe(value);
    }
    expect(Object.keys(CHART_TOKENS.light).sort()).toEqual(Object.keys(CHART_TOKENS.dark).sort());
  });
});
