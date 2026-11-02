import { peopleSection } from './people';
import { placesSection } from './places';
import { scenesSection } from './scenes';
import { shapeSection } from './shape';
import { pageHtml, type RenderInput, type Section } from './shell';
import { threadsSection } from './threads';

export type { StoryMapFace, StoryMapFonts } from './fonts';
export { STORY_MAP_FONT_FILES, storyMapFontFaces } from './fonts';
export type { RenderInput } from './shell';
export { chartTable } from './table';

/** The page's sections, in order, between the facts and the close. */
const SECTIONS: readonly Section[] = [
  shapeSection,
  peopleSection,
  scenesSection,
  placesSection,
  threadsSection,
];

/**
 * The whole story map, one self-contained HTML file (design §10): no script, no network, the
 * fonts inside, dark on screen and light in print. Everything the writer wrote is escaped.
 */
export function renderStoryMap(input: RenderInput): string {
  return pageHtml(input, SECTIONS);
}
