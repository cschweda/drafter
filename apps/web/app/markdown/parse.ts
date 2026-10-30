// The parser lives in @drafter/markdown, so the HTML export and the command line read a document
// as the Preview does; this module stays, the one the worker and the Preview import lazily.
export { NestedTooDeeply, parseMarkdown } from '@drafter/markdown';
