// Counting words lives in @drafter/markdown, beside the parser but apart from it (the parser-free
// `words` entry), so a script's counts, which the export worker uses too, never load the parser.
// Scripts count the same way (`wordsIn`).
import { markdownWordsIn, wordsIn } from '@drafter/markdown/words';

export {
  countWords,
  isSpace,
  markdownProse,
  markdownWordsIn,
  wordsIn,
} from '@drafter/markdown/words';

/**
 * A document's words, as the drafts, the snapshots, and the status bar count them: a script's
 * whole text, and a Markdown document's prose, without its drafter comment. With no kind (a row
 * kept before its kind was passed), a text that ends in a drafter comment is read as a Markdown
 * document's: a script keeps its facts in a boneyard, never in an HTML comment.
 */
export function documentWords(text: string, kind?: 'fountain' | 'markdown'): number {
  if (kind === 'fountain') return wordsIn(text);
  return markdownWordsIn(text);
}
