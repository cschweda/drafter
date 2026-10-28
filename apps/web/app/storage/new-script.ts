import { scriptFromMarkdown } from '@drafter/outline';
import { NEW_MARKDOWN } from '../markdown/kind';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** The metadata block that names the stage-play template, as fixed text (Phase 1 design §6). */
const STAGE_PLAY_META = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n';

/**
 * A new script's text: a title page to fill in, then a blank line, and for a stage play the
 * metadata block naming its template. The date is the local calendar's, written out so it reads
 * the same in every locale. A Markdown document is a title heading and a blank line. `cursor` is where typing starts: the end of a screenplay, and the
 * blank line before a stage play's metadata block.
 */
export function newScriptText(
  kind: 'screenplay' | 'stage-play' | 'markdown',
  today: Date,
): { text: string; cursor: number } {
  if (kind === 'markdown') return { text: NEW_MARKDOWN, cursor: NEW_MARKDOWN.length };
  const title = kind === 'screenplay' ? 'Untitled Screenplay' : 'Untitled Play';
  const date = `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
  const titlePage = `Title: ${title}\nCredit: Written by\nAuthor: Your Name\nDraft date: ${date}\n\n`;
  if (kind === 'screenplay') return { text: titlePage, cursor: titlePage.length };
  return { text: `${titlePage}\n${STAGE_PLAY_META}`, cursor: titlePage.length };
}

/**
 * A new screenplay made from a Markdown outline (Phase 2 design §6.5): the new-screenplay title page,
 * titled from the outline's first `#` heading if it has one, then the outline as sections and stubs.
 */
export function screenplayFromOutline(markdown: string, today: Date): string {
  const { title, body } = scriptFromMarkdown(markdown);
  const blank = newScriptText('screenplay', today).text;
  // A function, so a `$` in the title is the writer's, not a replacement pattern.
  const titled = title ? blank.replace(/^Title: .*$/m, () => `Title: ${title}`) : blank;
  return `${titled}${body}`;
}
