import fontkit from '@pdf-lib/fontkit';
import { DOCUMENT_FONT_FILES, type DocumentFontSet, type Face, layoutFeatures } from './fonts';

/** Text widths and glyph coverage for a document's faces. */
export interface Measure {
  /** Width in points of `text` in `face` at `size` pt (no kerning, as pdf-lib draws). */
  width(text: string, face: Face, size: number): number;
  /** Whether `face` has a glyph for the code point. */
  has(codePoint: number, face: Face): boolean;
}

type Font = ReturnType<typeof fontkit.create>;

/** A Measure from the font files, through fontkit; widths cached per face and string. */
export function fontMeasure(fonts: DocumentFontSet): Measure {
  const faces = Object.keys(DOCUMENT_FONT_FILES) as Face[];
  const opened = {} as Record<Face, Font>;
  /** A string's advance in font units, as pdf-lib sums it, by face. */
  const advances = {} as Record<Face, Map<string, number>>;
  for (const face of faces) {
    opened[face] = fontkit.create(fonts[face]);
    advances[face] = new Map();
  }

  return {
    width(text, face, size) {
      if (text === '') return 0;
      const font = opened[face];
      let units = advances[face].get(text);
      if (units === undefined) {
        units = 0;
        // pdf-lib's widthOfTextAtSize: the glyphs' own advances after layout
        // (so ligatures count as one glyph), without kerning.
        for (const glyph of font.layout(text, layoutFeatures()).glyphs) units += glyph.advanceWidth;
        advances[face].set(text, units);
      }
      return (units * size) / font.unitsPerEm;
    },
    has(codePoint, face) {
      return opened[face].hasGlyphForCodePoint(codePoint);
    },
  };
}
