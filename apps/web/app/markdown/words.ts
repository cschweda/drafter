// Counting words lives in @drafter/markdown, beside the parser but apart from it (the parser-free
// `words` entry), so a script's counts, which the export worker uses too, never load the parser.
// Scripts count the same way (`wordsIn`).
export { countWords, isSpace, wordsIn } from '@drafter/markdown/words';
