import { cspHash, el, escapeHtml } from '@drafter/render-html-file';

/**
 * The policy (design §10.1): the HTML export's, without the script. Nothing from anywhere but the
 * one style by its hash, fonts and images from `data:` only, no `<base>`, and no form. No
 * `script-src` at all, so `default-src 'none'` refuses every script; and the page has none.
 */
export const policyOf = (style: string) =>
  [
    "default-src 'none'",
    `style-src ${cspHash(style)}`,
    'font-src data:',
    'img-src data:',
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');

/**
 * Generated CSS, refused if it holds `<` (which could end the style element) or a carriage return
 * (which HTML reads as a line feed before the browser hashes the text, so the CSP's hash, taken
 * here, would no longer match and the whole stylesheet would be dropped). As `htmlShell`'s own
 * check, copied, since `htmlShell` itself requires a script.
 */
export function cssPart(css: string, what: string): string {
  if (css.includes('<')) throw new RangeError(`${what} may not hold "<": it would end the style.`);
  if (css.includes('\r')) throw new RangeError(`${what} may not hold a carriage return.`);
  return css;
}

/** The head: charset, the CSP, the viewport, who made it, its title, and the one style. */
export function headHtml(title: string, generator: string, style: string): string {
  return (
    el('meta', { charset: 'utf-8' }) +
    el('meta', { 'http-equiv': 'Content-Security-Policy', content: policyOf(style) }) +
    el('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }) +
    el('meta', { name: 'generator', content: generator }) +
    el('meta', { name: 'color-scheme', content: 'dark' }) +
    el('title', {}, `${escapeHtml(title)} – story map`) +
    el('style', {}, style)
  );
}

/**
 * Anton's advance widths, in thousandths of an em, for the letters a title is drawn in (upper case,
 * as `text-transform` draws it); anything else counts as a wide letter. Read from the font's own
 * `hmtx` table, so the title can be sized to fill the width with no script.
 */
const ANTON: Readonly<Record<string, number>> = {
  A: 485,
  B: 479,
  C: 474,
  D: 493,
  E: 412,
  F: 399,
  G: 485,
  H: 499,
  I: 227,
  J: 466,
  K: 472,
  L: 397,
  M: 746,
  N: 498,
  O: 486,
  P: 472,
  Q: 494,
  R: 477,
  S: 461,
  T: 396,
  U: 474,
  V: 469,
  W: 712,
  X: 484,
  Y: 446,
  Z: 410,
  '1': 331,
  ' ': 234,
  '.': 229,
  ',': 236,
  ':': 242,
  ';': 245,
  '!': 229,
  "'": 214,
  '’': 214,
  '-': 311,
  '(': 291,
  ')': 291,
  '&': 520,
};
/** A digit but 1, and the default for a letter not in the table. */
const DIGIT = 494;
const WIDE = 500;
/** The title's letter spacing, in thousandths of an em (`.hero h1`). */
const SPACING = 12;

/** How wide `text` is in Anton, in ems, upper-cased, with the title's letter spacing. */
export function antonEms(text: string): number {
  let total = 0;
  for (const ch of text.toUpperCase()) {
    const base = ch.normalize('NFD')[0] ?? ch;
    const width = ANTON[base] ?? (base >= '0' && base <= '9' ? DIGIT : WIDE);
    total += width + SPACING;
  }
  return total / 1000;
}

/** A width in ems as CSS divides by it, 4% wider so rounding never pushes a word onto two lines. */
const em = (n: number) => (Math.max(1, n) * 1.04).toFixed(3);

/**
 * The title's size, so it fills the width (design §2.1) with no script: on a phone, one word to a
 * line, as big as the longest word allows; on a wide screen, one line when that is still big
 * (96 px or more across the 1,160 px column), else a word to a line again. Only numbers go in.
 */
export function titleRules(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  const longest = Math.max(0, ...words.map(antonEms));
  const whole = antonEms(words.join(' '));
  const phone = `.hero h1{font-size:clamp(40px,calc((100vw - 32px) / ${em(longest)}),48vw)}`;
  const tablet = `@media (min-width:700px){.hero h1{font-size:clamp(48px,calc((100vw - 56px) / ${em(longest)}),240px)}}`;
  const oneLine = 1160 / Math.max(1, whole) >= 96;
  const wide = oneLine
    ? `@media (min-width:1100px){.hero h1{font-size:min(calc((min(100vw,1216px) - 56px) / ${em(whole)}),240px);white-space:nowrap}.hero h1 span{display:inline}}`
    : `@media (min-width:1100px){.hero h1{font-size:min(calc((min(100vw,1216px) - 56px) / ${em(longest)}),240px)}}`;
  return [phone, tablet, wide].join('\n');
}
