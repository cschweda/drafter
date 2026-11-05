import type { ManuscriptFont } from '@drafter/novel';

/** The four styles a manuscript prints in, all of one font. */
export type ManuscriptFace = 'regular' | 'italic' | 'bold' | 'boldItalic';

/** A manuscript's fonts, as font file bytes, by face: the four styles of the font it asked for. */
export type ManuscriptFontSet = Record<ManuscriptFace, Uint8Array>;

/**
 * Paths under this package's `fonts/`, by font and face, for callers that read them: Liberation
 * Serif (metrically Times New Roman's) for `times`, and Courier Prime for `courier`.
 */
export const MANUSCRIPT_FONT_FILES: Readonly<
  Record<ManuscriptFont, Readonly<Record<ManuscriptFace, string>>>
> = Object.freeze({
  times: Object.freeze({
    regular: 'liberation-serif/LiberationSerif-Regular.ttf',
    italic: 'liberation-serif/LiberationSerif-Italic.ttf',
    bold: 'liberation-serif/LiberationSerif-Bold.ttf',
    boldItalic: 'liberation-serif/LiberationSerif-BoldItalic.ttf',
  }),
  courier: Object.freeze({
    regular: 'CourierPrime-Regular.ttf',
    italic: 'CourierPrime-Italic.ttf',
    bold: 'CourierPrime-Bold.ttf',
    boldItalic: 'CourierPrime-BoldItalic.ttf',
  }),
});

/** The faces, in the order the font files list them. */
export const MANUSCRIPT_FACES: readonly ManuscriptFace[] = [
  'regular',
  'italic',
  'bold',
  'boldItalic',
];
