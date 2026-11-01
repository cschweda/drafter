import { pageHtml, type RenderInput, type Section } from './shell';

export type { StoryMapFace, StoryMapFonts } from './fonts';
export { STORY_MAP_FONT_FILES, storyMapFontFaces } from './fonts';
export type { RenderInput } from './shell';

/** The page's sections, in order, between the facts and the close (Tasks 5–6 add them). */
const SECTIONS: readonly Section[] = [];

/**
 * The whole story map, one self-contained HTML file (design §10): no script, no network, the
 * fonts inside, dark on screen and light in print. Everything the writer wrote is escaped.
 */
export function renderStoryMap(input: RenderInput): string {
  return pageHtml(input, SECTIONS);
}
