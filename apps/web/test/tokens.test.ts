import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { aliasOf, themeTokens } from './css-tokens';

// The design tokens (fresh-look design §2), read straight from the stylesheet the app uses, with
// every alias followed to its color.
const THEMES = ['dark', 'light'] as const;

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

/** A see-through `rgb(r g b / a)` laid over a solid `#rrggbb`, as the screen shows it. */
function over(tint: string, under: string): string {
  const match = /^rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)$/.exec(tint);
  if (!match) throw new Error(`${tint} isn't rgb(r g b / a)`);
  const alpha = Number(match[4]);
  return `#${[1, 2, 3]
    .map((i) => {
      const below = Number.parseInt(under.slice(2 * i - 1, 2 * i + 1), 16);
      const mixed = Math.round(Number(match[i]) * alpha + below * (1 - alpha));
      return mixed.toString(16).padStart(2, '0');
    })
    .join('')}`;
}

/** The tokens design §2 names, in both themes. */
const NEW_TOKENS = [
  '--bg',
  '--surface',
  '--raised',
  '--overlay',
  '--border',
  '--text',
  '--muted',
  '--faint',
  '--accent',
  '--accent-soft',
  '--on-accent',
  '--accent-text',
  '--focus',
  '--desk',
  '--paper',
  '--paper-ink',
];

/** The surfaces the interface draws on, from the window's background up to a menu. */
const SURFACES = ['--bg', '--surface', '--raised', '--overlay'];

// Where each color may be used, and the contrast it needs there: 4.5:1 for text, 3:1 for a
// graphic a reader needs (a focus ring, an underline, a bar's edge).
const PAIRS: Array<[string, string, number]> = [
  // The interface's text, on every surface.
  ...['--text', '--muted', '--accent-text'].flatMap((fg) =>
    SURFACES.map((bg): [string, string, number] => [fg, bg, 4.5]),
  ),
  // A primary button's label, and the script on paper.
  ['--on-accent', '--accent', 4.5],
  ['--paper-ink', '--paper', 4.5],
  // Today's page (the Page colour setting's Dark, design §4), until the paper replaces it.
  ['--ink', '--page', 4.5],
  ['--ink-muted', '--page', 4.5],
  // The Source pane's syntax colors, on the pane and on the surface beside it.
  ...['--heading', '--cue', '--paren', '--trans', '--note', '--title', '--gutter'].flatMap((fg) =>
    ['--bg', '--surface'].map((bg): [string, string, number] => [fg, bg, 4.5]),
  ),
  // The focus ring, on every surface (WCAG 2.4.11, and 1.4.11's 3:1).
  ...SURFACES.map((bg): [string, string, number] => ['--focus', bg, 3]),
  // The active tab's underline is a control's edge.
  ['--heading', '--chrome', 3],
  // An export's progress bar (ExportMenu.vue): the track's edge on the toast, and the still fill
  // of a stage that can't say how far it is, with reduced motion, on the track. Graphics: 3:1.
  ['--muted', '--chrome-2', 3],
  ['--muted', '--chrome', 3],
  // The spelling mark's dotted underline is a graphic, not text (Plan D, Call 17).
  ['--spelling', '--bg', 3],
  ['--spelling', '--surface', 3],
];

// Today's names, kept as aliases of the new ones until every component has moved over (fresh-look
// plan, Task 10, removes them).
const ALIASES: Record<string, string> = {
  '--chrome': '--surface',
  '--chrome-2': '--raised',
  '--line': '--border',
  '--tab-on': '--overlay',
  '--heading': '--accent-text',
  '--gutter': '--muted',
  '--paren': '--muted',
};

describe('design tokens', () => {
  test('measures contrast the way WCAG does', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(over('rgb(255 255 255 / .5)', '#000000')).toBe('#808080');
  });

  test.each(THEMES)('both themes define every new token (%s)', (name) => {
    const tokens = themeTokens(name);
    expect(NEW_TOKENS.filter((token) => !tokens[token])).toEqual([]);
    // Every color is a color, once its aliases are followed.
    const colors = NEW_TOKENS.filter((token) => token !== '--accent-soft');
    expect(colors.filter((token) => !/^#[0-9a-f]{6}$/i.test(tokens[token] ?? ''))).toEqual([]);
    expect(tokens['--accent-soft']).toMatch(/^rgb\(\d+ \d+ \d+ \/ [\d.]+\)$/);
  });

  test('the radii and the motion are one set for both themes', () => {
    const tokens = themeTokens('dark');
    expect(tokens['--r-sm']).toBe('6px');
    expect(tokens['--r']).toBe('8px');
    expect(tokens['--r-lg']).toBe('12px');
    expect(tokens['--dur']).toBe('140ms');
    expect(tokens['--ease']).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
  });

  test.each(THEMES)("today's names are aliases of the new ones (%s)", (name) => {
    for (const [old, now] of Object.entries(ALIASES)) expect(aliasOf(name, old), old).toBe(now);
  });

  test.each(THEMES)('every text token is AA on every surface it sits on (%s)', (name) => {
    const colors = themeTokens(name);
    const short = PAIRS.filter(
      ([fg, bg, min]) => contrast(colors[fg] as string, colors[bg] as string) < min,
    ).map(
      ([fg, bg, min]) =>
        `${fg} on ${bg}: ${contrast(colors[fg] as string, colors[bg] as string).toFixed(2)} < ${min}`,
    );
    expect(short).toEqual([]);
  });

  test.each(THEMES)('text is AA on the soft accent, over every surface (%s)', (name) => {
    // The current element's chip and a chosen row are --accent-soft over the surface under them.
    // --muted on it over --overlay (a chosen row in a menu) is 4.4:1 in both themes, short of AA,
    // so a chosen row in a menu keeps its text --text.
    const colors = themeTokens(name);
    const short = SURFACES.flatMap((bg) =>
      (bg === '--overlay' ? ['--text'] : ['--text', '--muted']).map((fg) => {
        const tinted = over(colors['--accent-soft'] as string, colors[bg] as string);
        return [fg, bg, contrast(colors[fg] as string, tinted)] as const;
      }),
    )
      .filter(([, , ratio]) => ratio < 4.5)
      .map(([fg, bg, ratio]) => `${fg} on --accent-soft over ${bg}: ${ratio.toFixed(2)}`);
    expect(short).toEqual([]);
  });

  test('the export bar draws with the colors checked above', () => {
    const vue = readFileSync(new URL('../app/components/ExportMenu.vue', import.meta.url), 'utf8');
    const rule = (selector: string, from = 0) => {
      const start = vue.indexOf(`${selector} {`, from);
      expect(start).toBeGreaterThan(-1);
      return vue.slice(start, vue.indexOf('}', start));
    };
    // The track has an edge you can see (its fill is --chrome, on the toast's --chrome-2).
    expect(rule('.bar')).toMatch(/background: var\(--chrome\);/);
    expect(rule('.bar')).toMatch(/border: 1px solid var\(--muted\);/);
    // With reduced motion, an unknown stage's still fill is solid --muted, never faded.
    const still = rule('.bar.unknown .fill', vue.indexOf('prefers-reduced-motion'));
    expect(still).toMatch(/background: var\(--muted\);/);
    expect(still).not.toMatch(/opacity/);
  });
});

// --faint is below 4.5:1 on purpose (design §2, Call 1): it is for what no one has to read. Every
// rule that uses it is listed here, with why; a new one has to be added, and so thought about.
const FAINT_ALLOWED: Record<string, string> = {
  'components/PaneDivider.vue .divider::after': "the divider's grip, a decoration on the divider",
};

const APP = fileURLToPath(new URL('../app', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(vue|ts|css)$/.test(name) ? [path] : [];
  });
}

/** The selector of the rule each `var(--faint)` in `source` sits in. */
function faintRules(source: string): string[] {
  const rules: string[] = [];
  for (const match of source.matchAll(/var\(--faint\)/g)) {
    const before = source.slice(0, match.index);
    // A CodeMirror theme's rule is a quoted key: `'.cm-f-boneyard': { color: 'var(--faint)' }`.
    const line = before.slice(before.lastIndexOf('\n') + 1);
    const key = /^\s*'([^']+)':/.exec(line)?.[1];
    // A stylesheet's rule is the selector before the last open brace.
    const open = before.lastIndexOf('{');
    const selector = before
      .slice(Math.max(before.lastIndexOf('}', open), before.lastIndexOf(';', open)) + 1, open)
      .trim();
    rules.push(key ?? selector);
  }
  return rules;
}

describe('--faint', () => {
  test('is used only by disabled or decorative rules', () => {
    const used = files(APP)
      .filter((path) => !path.endsWith('tokens.css'))
      .flatMap((path) => {
        const source = readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        return faintRules(source).map((rule) => `${relative(APP, path)} ${rule}`);
      });
    expect(used.filter((rule) => !(rule in FAINT_ALLOWED))).toEqual([]);
  });

  test('finds the rule a use sits in', () => {
    expect(faintRules('.a {\n  color: red;\n}\n.b > .c {\n  color: var(--faint);\n}')).toEqual([
      '.b > .c',
    ]);
    expect(faintRules("  '.cm-x': { color: 'var(--faint)' },")).toEqual(['.cm-x']);
  });
});

// The focus ring and the one motion (design §8), in the global stylesheet.
const main = readFileSync(new URL('../app/assets/css/main.css', import.meta.url), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('focus and motion', () => {
  test('controls get a 2px ring in --focus', () => {
    expect(main).toMatch(
      /(^|\n):focus-visible \{\s*outline: 2px solid var\(--focus\);\s*outline-offset: 2px;\s*\}/,
    );
  });

  test('menus, popovers, and dialogs fade in and rise 4px, and not with reduced motion', () => {
    const enter = /@keyframes motion-in \{([^}]*\{[^}]*\})*[^}]*\}/.exec(main)?.[0] ?? '';
    expect(enter).toMatch(/opacity: 0/);
    expect(enter).toMatch(/translateY\(4px\)/);
    expect(main).toMatch(/\.motion \{\s*animation: motion-in var\(--dur\) var\(--ease\)/);
    const reduced = main.slice(main.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.motion \{\s*animation: none;/);
  });

  test("Nuxt UI's colors are the tokens", () => {
    const css = readFileSync(new URL('../app/assets/css/tokens.css', import.meta.url), 'utf8');
    for (const [ui, token] of [
      ['--ui-primary', '--accent-text'],
      ['--ui-bg', '--raised'],
      ['--ui-text', '--text'],
      ['--ui-text-muted', '--muted'],
      ['--ui-border', '--border'],
    ])
      expect(css, ui).toMatch(new RegExp(`${ui}: var\\(${token}\\);`));
  });
});

// The top bar and what moved into it (fresh-look design §3.1, §3.5): the tokens are its only
// colours, so no circle, chip, or bar has a colour of its own.
describe('the top bar', () => {
  const TOP_BAR = [
    'AppToolbar.vue',
    'AppMenu.vue',
    'FileBar.vue',
    'HelpMenu.vue',
    'ModuleButtons.vue',
    'ReadOnlyBar.vue',
    'SampleChip.vue',
    'SampleBar.vue',
    'StartBlankBar.vue',
    'StorageWarning.vue',
    'StructureStrip.vue',
    'TemplateChip.vue',
    'UpdatePrompt.vue',
  ];

  test.each(TOP_BAR)('%s has no colour but the tokens', (name) => {
    const vue = readFileSync(join(APP, 'components', name), 'utf8');
    const style = vue.slice(vue.indexOf('<style'));
    expect(style.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
    // Today's names are aliases on their way out; the moved components use the new ones.
    expect(style.match(/var\(--(chrome|chrome-2|line|heading|tab-on)\)/g) ?? []).toEqual([]);
  });
});

// The alerts' tones (fresh-look Task 3b, the maintainer, 2026-10-31): a caution is a warm amber, an
// error a red, both desaturated and quiet: a tinted background, a 3px edge in the hue, the text
// still --text, and the dismiss button's icon in the hue.
describe('the alert tones', () => {
  const TONES = ['warn', 'danger'] as const;
  const TONE_TOKENS = TONES.flatMap((tone) =>
    ['', '-bg', '-border', '-hover'].map((part) => `--${tone}${part}`),
  );

  test.each(THEMES)('both themes define every tone token (%s)', (name) => {
    const tokens = themeTokens(name);
    expect(TONE_TOKENS.filter((token) => !/^#[0-9a-f]{6}$/i.test(tokens[token] ?? ''))).toEqual([]);
  });

  test.each(THEMES)('each tone is AA, and its edge and the focus ring show, (%s)', (name) => {
    const c = themeTokens(name);
    const pairs: Array<[string, string, number]> = TONES.flatMap((tone) => [
      // The text, on the tint and on a hovered button's tint.
      ['--text', `--${tone}-bg`, 4.5],
      ['--text', `--${tone}-hover`, 4.5],
      ['--muted', `--${tone}-bg`, 4.5],
      // The icon and the dismiss button's icon are read as text would be.
      [`--${tone}`, `--${tone}-bg`, 4.5],
      [`--${tone}`, `--${tone}-hover`, 4.5],
      // The edge, against the tint and the bar beside it; the focus ring on the tint.
      [`--${tone}-border`, `--${tone}-bg`, 3],
      [`--${tone}-border`, '--raised', 3],
      ['--focus', `--${tone}-bg`, 3],
      ['--focus', `--${tone}-hover`, 3],
    ]);
    const short = pairs
      .filter(([fg, bg, min]) => contrast(c[fg] as string, c[bg] as string) < min)
      .map(
        ([fg, bg, min]) =>
          `${fg} on ${bg}: ${contrast(c[fg] as string, c[bg] as string).toFixed(2)} < ${min}`,
      );
    expect(short).toEqual([]);
  });

  test.each(THEMES)('the tints are quiet: close to the surface they sit on (%s)', (name) => {
    // "Nothing blaring": a tint stays within a small step of --raised's lightness.
    const c = themeTokens(name);
    for (const tone of TONES) {
      const ratio = contrast(c[`--${tone}-bg`] as string, c['--raised'] as string);
      expect(ratio, tone).toBeLessThan(1.25);
    }
  });

  // Each alert draws with a tone, by its class; the class's colours are main.css's.
  test.each([
    ['StorageWarning.vue', ['tone-warn', 'tone-danger']],
    ['ReadOnlyBar.vue', ['tone-warn']],
    ['UpdatePrompt.vue', ['tone-warn', 'tone-danger']],
    ['FileBar.vue', ['tone-warn']],
  ])('%s carries its tone', (name, tones) => {
    const vue = readFileSync(join(APP, 'components', name), 'utf8');
    for (const tone of tones) expect(vue, tone).toContain(tone);
  });

  test('main.css draws a tone from its tokens', () => {
    for (const tone of TONES) {
      expect(main).toMatch(new RegExp(`\\.tone-${tone} \\{[^}]*--tone: var\\(--${tone}\\);`));
      expect(main).toMatch(new RegExp(`\\.tone-${tone} \\{[^}]*--tone-bg: var\\(--${tone}-bg\\);`));
    }
    expect(main).toMatch(/border-left: 3px solid var\(--tone-border\);/);
    expect(main).toMatch(/background: var\(--tone-bg\);/);
  });
});
