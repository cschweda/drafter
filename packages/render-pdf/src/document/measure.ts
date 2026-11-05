import fontkit from '@pdf-lib/fontkit';
import { DOCUMENT_FONT_FILES, type DocumentFontSet, type Face, layoutFeatures } from './fonts';

/** Text widths and glyph coverage for a set of faces. */
export interface FaceMeasure<F extends string> {
  /** Width in points of `text` in `face` at `size` pt (no kerning, as pdf-lib draws). */
  width(text: string, face: F, size: number): number;
  /** Whether `face` has a glyph for the code point. */
  has(codePoint: number, face: F): boolean;
}

/** Text widths and glyph coverage for a document's faces. */
export type Measure = FaceMeasure<Face>;

type Font = ReturnType<typeof fontkit.create>;

/**
 * A FaceMeasure from font files, by face, through fontkit; widths cached per face and string. The
 * manuscript's four faces are measured with it too.
 */
export function faceMeasure<F extends string>(
  fonts: Readonly<Record<F, Uint8Array>>,
): FaceMeasure<F> {
  const opened = new Map<F, Font>();
  /** A string's advance in font units, as pdf-lib sums it, by face. */
  const advances = new Map<F, Map<string, number>>();
  for (const face of Object.keys(fonts) as F[]) {
    opened.set(face, fontkit.create(fonts[face]));
    advances.set(face, new Map());
  }

  return {
    width(text, face, size) {
      if (text === '') return 0;
      const font = opened.get(face) as Font;
      const cache = advances.get(face) as Map<string, number>;
      let units = cache.get(text);
      if (units === undefined) {
        units = 0;
        // pdf-lib's widthOfTextAtSize: the glyphs' own advances after layout
        // (so ligatures count as one glyph), without kerning.
        for (const glyph of font.layout(text, layoutFeatures()).glyphs) units += glyph.advanceWidth;
        cache.set(text, units);
      }
      return (units * size) / font.unitsPerEm;
    },
    has(codePoint, face) {
      return (opened.get(face) as Font).hasGlyphForCodePoint(codePoint);
    },
  };
}

/** A Measure from a document's font files, through fontkit; widths cached per face and string. */
export function fontMeasure(fonts: DocumentFontSet): Measure {
  const faces = Object.keys(DOCUMENT_FONT_FILES) as Face[];
  return faceMeasure(
    Object.fromEntries(faces.map((face) => [face, fonts[face]])) as Record<Face, Uint8Array>,
  );
}
