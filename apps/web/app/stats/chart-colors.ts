// The colors of the Stats tab's charts (seeing-the-script design §8.2), a value for each theme:
// the character-by-scene grid's four shades (1, 2–3, 4–6, and 7 or more speeches) and the text
// drawn on them; Part 2 adds the pacing chart's. The values are Drafter's own, chosen for the
// pane's background (`--bg`): each shade at least 3:1 against it, as a graphic, and the grid's
// text at least 4.5:1 on every shade, which test/chart-colors.test.ts checks, with the
// stylesheet (`assets/css/tokens.css`) holding the same values. The shade only repeats the
// number in the cell, so color is never the only signal. More speeches are darker on the light
// theme and brighter on the dark one.

export const CHART_TOKENS: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--grid-shade-1': '#3f7a9e',
    '--grid-shade-2': '#2c6489',
    '--grid-shade-3': '#1d4c6e',
    '--grid-shade-4': '#123650',
    '--grid-ink': '#ffffff',
  },
  dark: {
    '--grid-shade-1': '#6fa8c8',
    '--grid-shade-2': '#8cc0dc',
    '--grid-shade-3': '#acd6ec',
    '--grid-shade-4': '#d3ecf8',
    '--grid-ink': '#0f1013',
  },
};
