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
 * The OpenType features a document's text is laid out with: none asked for, so each font's own
 * defaults (its ligatures and contextual alternates). `fontMeasure` lays strings out with these and
 * the renderer embeds the fonts with them, so what the layout measures is what pdf-lib draws;
 * `document-render.test.ts` checks the drawn widths against the measured ones.
 */
export const LAYOUT_FEATURES = undefined;
