import { fromMarkdown } from 'mdast-util-from-markdown';
import type { MdNode } from './render';

/**
 * Reads CommonMark into a syntax tree (`mdast-util-from-markdown`, which drives `micromark`).
 * Only CommonMark: no extensions, so raw HTML stays an `html` node for the preview to show as
 * text, and nothing in the text is ever run.
 */
export function parseMarkdown(source: string): MdNode {
  return fromMarkdown(source) as MdNode;
}
