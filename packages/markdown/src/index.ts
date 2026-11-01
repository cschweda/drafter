export { containerDepth, MAX_NESTING } from './depth';
export {
  commentJson,
  findMarkdownMeta,
  type MarkdownMetaBlock,
  readMarkdownMeta,
  setMarkdownMeta,
} from './meta';
export { type FootnoteNode, type Footnotes, footnotes } from './notes';
export { NestedTooDeeply, parseMarkdown } from './parse';
export { markdownTitle, retitleMarkdown } from './title';
export type { MdNode } from './types';
export { countWords, isSpace, wordsIn } from './words';
