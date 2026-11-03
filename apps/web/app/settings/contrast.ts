// The Source and Script panes' contrast sliders (the maintainer, 2026-11-03: "a contrast slider
// ... in real time adjust the source left colors ... a separate slider for source and the script
// panes ... both set by default to nearly (but not totally) the highest contrast"). One number for
// each pane, from CONTRAST_MIN to CONTRAST_MAX. At CONTRAST_AS_DESIGNED the colours are the
// theme's own; above it each colour is mixed toward the theme's extreme (white on a dark ground,
// black on a light one), and below it toward the pane's background, for a softer page. Pure, so
// test/contrast.test.ts runs it; settings/apply.ts sets the mixes on the root.

export const CONTRAST_MIN = 40;
export const CONTRAST_MAX = 100;
export const CONTRAST_STEP = 5;
/** Nearly, but not quite, the highest. */
export const CONTRAST_DEFAULT = 90;
/** Where the theme's own colours are. */
export const CONTRAST_AS_DESIGNED = 75;
/** How far toward the extreme the highest goes, and toward the background the lowest. */
const MOST_BOOST = 50;
const MOST_FADE = 55;

export const CONTRASTS: readonly number[] = Array.from(
  { length: (CONTRAST_MAX - CONTRAST_MIN) / CONTRAST_STEP + 1 },
  (_, i) => CONTRAST_MIN + i * CONTRAST_STEP,
);

/** Whether `value` is a contrast a slider can hold. */
export const isContrast = (value: unknown): value is number =>
  typeof value === 'number' && CONTRASTS.includes(value);

/** How much of the extreme (`boost`) and of the background (`fade`) each colour takes, in percent. */
export function contrastMix(value: number): { boost: number; fade: number } {
  const v = Math.min(CONTRAST_MAX, Math.max(CONTRAST_MIN, value));
  const round = (n: number) => Math.round(n * 10) / 10;
  if (v >= CONTRAST_AS_DESIGNED) {
    return {
      boost: round(
        ((v - CONTRAST_AS_DESIGNED) / (CONTRAST_MAX - CONTRAST_AS_DESIGNED)) * MOST_BOOST,
      ),
      fade: 0,
    };
  }
  return {
    boost: 0,
    fade: round(((CONTRAST_AS_DESIGNED - v) / (CONTRAST_AS_DESIGNED - CONTRAST_MIN)) * MOST_FADE),
  };
}

/** A colour token as a pane shows it: mixed toward its extreme, then toward its background. */
export const mixed = (token: string, extreme: string, ground: string, pane: 'source' | 'script') =>
  `color-mix(in oklab, color-mix(in oklab, ${token}, ${extreme} var(--${pane}-boost, 0%)), ${ground} var(--${pane}-fade, 0%))`;

/** The slider's words for a value: "90%". */
export const contrastLabel = (value: number): string => `${value}%`;

// ---- WCAG 2.1 contrast ratios ---------------------------------------------------------------
// Shown under each slider (the maintainer, 2026-11-03: "show the contrast ratio between the text
// and background ... for accessibility purposes and WCAG 2.1 verification"): the pane's text and
// its weakest colour against the pane's background, measured from the colours drawn.

export type Rgb = readonly [number, number, number];

/** WCAG 2.1's relative luminance of an sRGB colour (0 to 255 each). */
export function relativeLuminance([r, g, b]: Rgb): number {
  const linear = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.1's contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** What a ratio meets for normal text: AAA at 7:1, AA at 4.5:1, AA for large text at 3:1. */
export type WcagLevel = 'AAA' | 'AA' | 'AA large' | 'below AA';

export function wcagLevel(ratio: number): WcagLevel {
  // WCAG compares the ratio itself, unrounded: 4.49:1 doesn't meet 4.5:1.
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large';
  return 'below AA';
}

/** A ratio as people write it: `4.5:1`, one decimal, rounded down so it never claims more. */
export const ratioLabel = (ratio: number): string =>
  `${(Math.floor(ratio * 10) / 10).toFixed(1)}:1`;
