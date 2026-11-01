import { JSDOM } from 'jsdom';
import { renderStoryMap, type StoryMap } from '../src';
import { fakeFonts } from './fonts';
import { generated } from './scripts';

// Helpers and original scripts for the chart tests (Task 5). Nothing here is from a produced
// script, another app, or a converter's test data.

export const PLAY_META = `
/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`;

export const page = (map: StoryMap) =>
  renderStoryMap({ map, fonts: fakeFonts(), lang: 'en', generator: 'Drafter 0.24.1' });
export const docOf = (map: StoryMap) => new JSDOM(page(map)).window.document;
export const text = (node: Element | null | undefined) =>
  node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** A percentage attribute as a number. */
export const num = (el: Element | null | undefined, name: string) =>
  Number.parseFloat(el?.getAttribute(name) ?? 'NaN');

const ROOMS = ['The front room', 'The porch', 'The cellar', 'The attic'];
const WHO = ['ODILE', 'BRAM', 'CASS', 'TEODOR'];

/**
 * A play of `acts` acts with `perAct` `##` scenes each, every scene about `lines` lines of talk,
 * set in a handful of rooms with no times of day; `extra` goes after the scene at that index (0 is
 * the first scene of the play).
 */
export function generatedPlay(
  acts: number,
  perAct: number,
  lines: number,
  extra: Record<number, string> = {},
): string {
  const words = ['One', 'Two', 'Three', 'Four', 'Five'];
  const out: string[] = ['Title: The Long Porch', 'Author: Test Writer', ''];
  let n = 0;
  for (let a = 0; a < acts; a++) {
    if (acts > 0) out.push(`# Act ${words[a]}`, '');
    for (let s = 0; s < perAct; s++, n++) {
      out.push(`## Scene ${n + 1}`, '', `${ROOMS[n % ROOMS.length]}. ${WHO[n % 4]} waits.`, '');
      for (let l = 0; l < lines; l++) {
        out.push(
          WHO[(n + l) % 4] as string,
          `The wind has turned again, ${l + 1} times today.`,
          '',
        );
      }
      if (extra[n]) out.push(extra[n] as string, '');
    }
  }
  return out.join('\n') + PLAY_META;
}

/** A play of scenes only, no `#` acts. */
export function scenesOnlyPlay(scenes: number, lines: number): string {
  return generatedPlay(1, scenes, lines).replace('# Act One\n\n', '');
}

/** A screenplay of about 120 pages in three acts, with a planned scene and an empty fourth act. */
export function withGaps(): string {
  const base = generated(120, 60, 12);
  return `${base}\nINT. PLACE NUMBER 999 - DAY\n\n# Act Four: Not Yet\n`;
}
