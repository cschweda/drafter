import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STORY_MAP_FONT_FILES, type StoryMapFace, type StoryMapFonts } from '../src';

/** The package's `fonts/` folder. */
export const FONT_DIR = fileURLToPath(new URL('../fonts/', import.meta.url));

/** The committed fonts, as a caller reads them. */
export function realFonts(): StoryMapFonts {
  const out = {} as StoryMapFonts;
  for (const [face, file] of Object.entries(STORY_MAP_FONT_FILES) as Array<
    [StoryMapFace, string]
  >) {
    out[face] = new Uint8Array(readFileSync(`${FONT_DIR}${file}`));
  }
  return out;
}

/** Tiny stand-ins that start as WOFF2 does, each face its own, for tests that don't measure size. */
export function fakeFonts(): StoryMapFonts {
  const woff2 = (tail: number) => new Uint8Array([0x77, 0x4f, 0x46, 0x32, tail, 0, 0, 0]);
  return { anton: woff2(1), archivo: woff2(2), archivoSemiBold: woff2(3), courier: woff2(4) };
}
