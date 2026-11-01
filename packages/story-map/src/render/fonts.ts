import { base64, fontKind } from '@drafter/render-html-file';

/** The four faces a story map draws in (design §10.2). */
export type StoryMapFace = 'anton' | 'archivo' | 'archivoSemiBold' | 'courier';
export type StoryMapFonts = Record<StoryMapFace, Uint8Array>;

/** Each face's file under the package's `fonts/` folder, which the caller reads and passes in. */
export const STORY_MAP_FONT_FILES: Readonly<Record<StoryMapFace, string>> = Object.freeze({
  anton: 'Anton-Regular.woff2',
  archivo: 'Archivo-Regular.woff2',
  archivoSemiBold: 'Archivo-SemiBold.woff2',
  courier: 'CourierPrime-Regular.woff2',
});

/** Each face's family, weight, and copyright line, in the order the rules are written. */
const FACES: ReadonlyArray<readonly [StoryMapFace, string, number, string]> = [
  ['anton', 'Anton', 400, 'Copyright 2020 The Anton Project Authors'],
  ['archivo', 'Archivo', 400, 'Copyright 2020 The Archivo Project Authors'],
  ['archivoSemiBold', 'Archivo', 600, 'Copyright 2020 The Archivo Project Authors'],
  ['courier', 'Courier Prime', 400, 'Copyright 2015 The Courier Prime Project Authors'],
];

/**
 * Four `@font-face` rules, one a line, each the face's bytes as a base64 `data:` URL (the CSP's
 * `font-src data:` allows nothing else), after a comment with its copyright and licence, as the
 * OFL asks. Base64, fixed words, and numbers: nothing that could end the style. Throws a
 * TypeError for a face with no bytes, and a RangeError for bytes that are not a font file.
 */
export function storyMapFontFaces(fonts: StoryMapFonts): string {
  return FACES.map(([face, family, weight, copyright]) => {
    const bytes = fonts[face];
    // By its tag rather than `instanceof`, so bytes made in another realm are bytes too.
    if (Object.prototype.toString.call(bytes) !== '[object Uint8Array]' || !bytes) {
      throw new TypeError(`storyMapFontFaces needs the ${face} face`);
    }
    const kind = fontKind(bytes);
    if (!kind) throw new RangeError(`storyMapFontFaces: the ${face} bytes are not a font file`);
    return (
      `/* ${family}: ${copyright}. SIL Open Font License 1.1, https://openfontlicense.org */` +
      `@font-face{font-family:"${family}";` +
      `src:url(data:font/${kind.mime};base64,${base64(bytes)}) format("${kind.format}");` +
      `font-weight:${weight};font-style:normal}`
    );
  }).join('\n');
}
