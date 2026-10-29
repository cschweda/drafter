/** The five faces a Markdown document prints in: Inter Tight's four styles, and Courier Prime for code. */
export type Face = 'text' | 'textItalic' | 'textBold' | 'textBoldItalic' | 'code';

/** A document's fonts, as font file bytes, by face. */
export interface DocumentFontSet {
  text: Uint8Array;
  textItalic: Uint8Array;
  textBold: Uint8Array;
  textBoldItalic: Uint8Array;
  code: Uint8Array;
}

/** Paths under this package's `fonts/`, by face, for callers that read them. */
export const DOCUMENT_FONT_FILES: Readonly<Record<Face, string>> = Object.freeze({
  text: 'inter-tight/InterTight-Regular.ttf',
  textItalic: 'inter-tight/InterTight-Italic.ttf',
  textBold: 'inter-tight/InterTight-SemiBold.ttf',
  textBoldItalic: 'inter-tight/InterTight-SemiBoldItalic.ttf',
  code: 'CourierPrime-Regular.ttf',
});

/**
 * The OpenType features a document's text is laid out with: each font's defaults (ligatures such
 * as fi, contextual alternates), less kerning (`kern: false`). pdf-lib draws each glyph at its own
 * advance and never the kerning positions, and the measure sums the same advances, so kerning is
 * only work: turning it off changes no glyph and no width. The defaults leave typed fractions and
 * dates (1/2, 29/10/2026) as typed; only a fraction slash (U+2044) makes fraction glyphs, which is
 * what it is for. `fontMeasure` lays strings out with these and the renderer embeds the fonts with
 * them, so what the layout measures is what pdf-lib draws; `document-render.test.ts` checks the
 * drawn widths against the measured ones. A new object each time, since fontkit writes the
 * features it applied back into the object it is given.
 */
export function layoutFeatures(): Record<string, boolean> {
  return { kern: false };
}
