import type { Layout, LayoutLine } from '@drafter/layout';
import { base64 } from './sha256';

/** Courier Prime's four styles, named as `@drafter/render-pdf`'s `FontSet` names them. */
export type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

/** The styles in the order their faces are written, with the weight and style each declares. */
const FACES: ReadonlyArray<readonly [FontStyle, number, 'normal' | 'italic']> = [
  ['regular', 400, 'normal'],
  ['bold', 700, 'normal'],
  ['italic', 400, 'italic'],
  ['boldItalic', 700, 'italic'],
];

/**
 * The styles of Courier Prime a script's pages draw in: Regular always (the page numbers and the
 * rest of the furniture are in it), and Bold, Italic, or Bold Italic when a run with something to
 * see is. A run of spaces draws nothing, so it needs no face, as in the PDF.
 */
export function stylesUsed(layout: Layout): Set<FontStyle> {
  const used = new Set<FontStyle>(['regular']);
  const add = (line: LayoutLine) => {
    for (const run of line.runs) {
      if (!run.bold && !run.italic) continue;
      if (run.text.trim() === '') continue;
      used.add(run.bold ? (run.italic ? 'boldItalic' : 'bold') : 'italic');
    }
  };
  for (const page of layout.pages) {
    for (const line of page.lines) {
      add(line);
      if (line.right) add(line.right);
    }
  }
  return used;
}

/** What a font file is, from its first four bytes, and how a `data:` URL and `format()` name it. */
export function fontKind(bytes: Uint8Array): { mime: string; format: string } | undefined {
  const tag = String.fromCharCode(...bytes.subarray(0, 4));
  if (tag === '\x00\x01\x00\x00' || tag === 'true') return { mime: 'ttf', format: 'truetype' };
  if (tag === 'OTTO') return { mime: 'otf', format: 'opentype' };
  if (tag === 'wOFF') return { mime: 'woff', format: 'woff' };
  if (tag === 'wOF2') return { mime: 'woff2', format: 'woff2' };
  return undefined;
}

/**
 * `@font-face` rules for Courier Prime, one for each style in `used`, the file inside as base64 in
 * a `data:` URL (the CSP's `font-src data:` allows nothing else). The bytes are carried as they
 * are, TrueType as Drafter ships it; a WOFF or WOFF2 file is named as one. The text is base64 and
 * fixed words, so it holds nothing that could end the style. Throws a TypeError for a style in
 * `used` with no bytes, and a RangeError for bytes that are not a font file.
 */
export function fontFaces(
  fonts: Partial<Record<FontStyle, Uint8Array>>,
  used: ReadonlySet<FontStyle>,
): string {
  const rules: string[] = [];
  for (const [style, weight, slant] of FACES) {
    if (!used.has(style)) continue;
    const bytes = fonts[style];
    // By its tag rather than `instanceof`, so bytes made in another realm (a worker's message, a
    // test's DOM) are bytes too.
    if (Object.prototype.toString.call(bytes) !== '[object Uint8Array]' || !bytes) {
      throw new TypeError(`fontFaces needs Courier Prime's ${style} style, which the script uses`);
    }
    const kind = fontKind(bytes);
    if (!kind) throw new RangeError(`fontFaces: the ${style} bytes are not a font file`);
    rules.push(
      `@font-face{font-family:"Courier Prime";` +
        `src:url(data:font/${kind.mime};base64,${base64(bytes)}) format("${kind.format}");` +
        `font-weight:${weight};font-style:${slant}}`,
    );
  }
  return rules.join('\n');
}
