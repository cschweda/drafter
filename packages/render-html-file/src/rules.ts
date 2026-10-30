// Generated CSS for what varies from file to file: where a printed line sits, a page's size, a band
// block's share, a character's color. The CSP allows no style attribute, so each of these is a
// class, and the rules for the classes a file uses go into its one `<style>` (`ShellInput.rules`),
// hashed with the rest. Every rule is built from numbers and validated colors, never from the
// writer's text, so none can hold `<` or a line break. Each helper is one pass over its input,
// sorts what it keeps, and writes the same text for the same input.

/** A count the grid is measured in: a whole number, 0 or more. */
function count(n: number, what: string): number {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`Not a ${what}: ${n}`);
  return n;
}

/** The distinct values, in increasing order. */
const distinct = (values: Iterable<number>, what: string) =>
  [...new Set([...values].map((v) => count(v, what)))].sort((a, b) => a - b);

/** The class that puts a line on row `n` of its page. */
export const rowClass = (n: number) => `r${count(n, 'row')}`;
/** The class that puts a line at column `n` of its page. */
export const colClass = (n: number) => `c${count(n, 'column')}`;
/** The class that sizes a page of `cols` columns by `rows` rows. */
export const pageClass = (cols: number, rows: number) =>
  `p${count(cols, 'column count')}x${count(rows, 'row count')}`;

/**
 * Rules for the rows and columns a file uses, on the Script tab's grid: a row is 1em of the page's
 * 12pt type, which is 1in/6 (six lines an inch), and a column is 1ch of Courier Prime 12pt. They
 * are in em and ch rather than inches so that a page shrinks whole, lines in their places, when
 * its type does on a narrow screen (`pageRules`). A line is placed by its classes:
 * `class="ln r12 c15"`.
 */
export function gridRules(rows: Iterable<number>, cols: Iterable<number>): string {
  return [
    ...distinct(rows, 'row').map((n) => `.${rowClass(n)}{top:${n}em}`),
    ...distinct(cols, 'column').map((n) => `.${colClass(n)}{left:${n}ch}`),
  ].join('\n');
}

/**
 * Rules for the page sizes a file uses, each `[cols, rows]`, a class from `pageClass`. A page is
 * `cols` ch wide and `rows` em tall, in 12pt type; when that is wider than the pages' column (a
 * phone), the type shrinks until it fits, and the page with it (design §3.1), as a PDF viewer
 * shows a whole page. A column is taken as 0.6em, a hair over Courier Prime's 1228/2048, so the
 * page always fits; `.pages` is the container `cqw` measures. A browser without container units
 * drops the declaration and keeps 12pt, and the pages scroll sideways instead.
 */
export function pageRules(sizes: Iterable<readonly [number, number]>): string {
  const seen = new Map<string, string>();
  for (const [cols, rows] of sizes) {
    const name = pageClass(cols, rows);
    const ems = (cols * 6) / 10;
    seen.set(
      name,
      `.${name}{width:${cols}ch;height:${rows}em;font-size:min(12pt, calc(100cqw / ${ems}))}`,
    );
  }
  return [...seen.keys()]
    .sort()
    .map((name) => seen.get(name))
    .join('\n');
}

/**
 * The sheet a printed card goes on: the template's paper, in points, as the PDF's pages are, for
 * the stylesheet's `@page card` (no margin; the card's own margins are on its grid). A browser
 * that ignores `size` prints on the paper the reader chose, the card still at its top left.
 */
export function paperRule(width: number, height: number): string {
  for (const n of [width, height]) {
    if (!Number.isFinite(n) || n <= 0) throw new RangeError(`Not a paper size: ${n}`);
  }
  return `@page card{size:${width}pt ${height}pt}`;
}

/** How finely a band block's share is kept: thousandths of the whole. */
const SHARES = 1000;

/**
 * A band's blocks, sized by their lengths (in lines, or any one unit): a class for each block, in
 * order, and the rules for those classes. A share is kept to a thousandth of the whole, and every
 * block gets at least one, so a short scene still shows; blocks of the same share share a class.
 */
export function bandRules(lengths: readonly number[]): { classes: string[]; rules: string } {
  let total = 0;
  for (const length of lengths) {
    if (!Number.isFinite(length) || length < 0) throw new RangeError(`Not a length: ${length}`);
    total += length;
  }
  const shares = lengths.map((length) =>
    Math.max(1, total > 0 ? Math.round((length / total) * SHARES) : 1),
  );
  const rules = distinct(shares, 'share')
    .map((g) => `.band .g${g}{flex-grow:${g}}`)
    .join('\n');
  return { classes: shares.map((g) => `g${g}`), rules };
}

/** A color for both palettes, or one for both. */
export type ColorPair = string | { dark: string; light: string };

const HEX = /^#[0-9a-f]{6}$/i;

function hex(color: string): string {
  if (!HEX.test(color)) throw new RangeError(`Not a #rrggbb color: ${color}`);
  return color.toLowerCase();
}

/**
 * Rules giving each class `<prefix><i>` its color as `--c`, which the band's blocks and the
 * Reading view's character names draw in. A pair gives the dark palette's color and the light
 * one's; the light one is also the printed one, since print is always light.
 */
export function colorRules(colors: readonly ColorPair[], prefix = 'k'): string {
  if (!/^[a-z]+$/.test(prefix)) throw new RangeError(`Not a class prefix: ${prefix}`);
  const dark: string[] = [];
  const light: string[] = [];
  colors.forEach((color, i) => {
    const pair = typeof color === 'string' ? { dark: color, light: color } : color;
    dark.push(`.${prefix}${i}{--c:${hex(pair.dark)}}`);
    if (pair.light.toLowerCase() !== pair.dark.toLowerCase()) {
      light.push(`.${prefix}${i}{--c:${hex(pair.light)}}`);
    }
  });
  if (light.length === 0) return dark.join('\n');
  const lightRules = light.join('\n');
  return [
    ...dark,
    `:root[data-theme="light"] ${light.join('\n:root[data-theme="light"] ')}`,
    `@media print {\n${lightRules}\n}`,
  ].join('\n');
}
