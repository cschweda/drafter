import { parseMarkdown } from './parse';
import type { MdNode } from './render';
import { countWords } from './words';

/** What the main thread sends the Markdown worker: the whole text, so the worker's copy never drifts. */
export interface MarkdownRequest {
  seq: number;
  source: string;
}
export type MarkdownReply =
  | { seq: number; tree: MdNode; words: number }
  | { seq: number; error: string };

/**
 * The tree without the positions `mdast-util-from-markdown` records on every node: the Preview
 * does not read them, and a long document's tree is much smaller to send without them.
 */
function bare(node: MdNode & { position?: unknown }): MdNode {
  const { position: _position, ...rest } = node;
  return node.children ? { ...rest, children: node.children.map(bare) } : rest;
}

/** Parses one request. An error is a reply, so the worker never throws. */
export function computeMarkdown({ seq, source }: MarkdownRequest): MarkdownReply {
  try {
    const tree = parseMarkdown(source);
    return { seq, tree: bare(tree), words: countWords(tree) };
  } catch (error) {
    return { seq, error: error instanceof Error ? error.message : String(error) };
  }
}
