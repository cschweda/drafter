// The colors of Compare's Changes view (version-history design §7, Call 41): two palettes, Red and
// green (the default) and Blue and orange (for readers who can't tell red from green), each with
// a value for both themes. The values are Drafter's own, chosen for contrast on the page's own
// colors (`--page`, `--ink`, `--ink-muted`): text on every tint at least 4.5:1, the signs on their
// tints at least 4.5:1, and the bars and rules on the page at least 3:1, which
// `test/diff-colors.test.ts` checks. `assets/css/tokens.css` holds the same values, set on the root
// by `data-diff-colors` (`settings/apply.ts`); the test checks that the two agree.

/** The palettes, as Settings lists them. */
export const DIFF_COLORS = ['red-green', 'blue-orange'] as const;
export type DiffColors = (typeof DIFF_COLORS)[number];

/** What Settings calls each. */
export const DIFF_COLOR_NAMES: Readonly<Record<DiffColors, string>> = {
  'red-green': 'Red and green',
  'blue-orange': 'Blue and orange',
};

/**
 * `--diff-add-bg`, `--diff-del-bg`: a changed row's tint. `--diff-add-word`, `--diff-del-word`: a
 * changed word's stronger tint. `--diff-add-sign`, `--diff-del-sign`: the sign, the bar, and the
 * rule. `--diff-fold-bg`: a fold and a group's header.
 */
export const DIFF_TOKENS: Record<DiffColors, Record<'light' | 'dark', Record<string, string>>> = {
  'red-green': {
    light: {
      '--diff-add-bg': '#e3f3e7',
      '--diff-del-bg': '#fbe7e5',
      '--diff-add-word': '#bfe5c9',
      '--diff-del-word': '#f5c9c4',
      '--diff-add-sign': '#17663a',
      '--diff-del-sign': '#a8322b',
      '--diff-fold-bg': '#eef1f5',
    },
    dark: {
      '--diff-add-bg': '#1c3124',
      '--diff-del-bg': '#3a2225',
      '--diff-add-word': '#2a5236',
      '--diff-del-word': '#5e2f34',
      '--diff-add-sign': '#7fd99a',
      '--diff-del-sign': '#ffa39b',
      '--diff-fold-bg': '#242934',
    },
  },
  'blue-orange': {
    light: {
      '--diff-add-bg': '#e2ecfb',
      '--diff-del-bg': '#fcebdc',
      '--diff-add-word': '#bfd5f6',
      '--diff-del-word': '#f6d0ad',
      '--diff-add-sign': '#1d559e',
      '--diff-del-sign': '#8f4700',
      '--diff-fold-bg': '#eef1f5',
    },
    dark: {
      '--diff-add-bg': '#1c2a40',
      '--diff-del-bg': '#372919',
      '--diff-add-word': '#2b4870',
      '--diff-del-word': '#5c4122',
      '--diff-add-sign': '#9cc2f7',
      '--diff-del-sign': '#f2b06c',
      '--diff-fold-bg': '#242934',
    },
  },
};

/** Side by side needs a Compare pane at least this wide; narrower, the view is unified (Call 27). */
export const SPLIT_MIN_PX = 720;

/** WCAG 2's relative luminance of a `#rrggbb` color. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2's contrast ratio of two `#rrggbb` colors, 1 to 21. */
export function contrast(fg: string, bg: string): number {
  const [light, dark] = [luminance(fg), luminance(bg)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}
