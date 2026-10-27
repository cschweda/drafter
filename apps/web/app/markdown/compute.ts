import { parseMarkdown } from './parse';
import { BLOCK_TYPES, type MdNode, startOf } from './render';
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
 * The tree without the positions `mdast-util-from-markdown` records on every node, which make a
 * long document's tree much bigger to send. A block keeps where it starts (`from`), which is all
 * of them the Preview reads, for scroll sync.
 */
function bare(node: MdNode): MdNode {
  const { position: _position, ...rest } = node;
  const from = BLOCK_TYPES.has(node.type) ? startOf(node) : undefined;
  const kept = from === undefined ? rest : { ...rest, from };
  return node.children ? { ...kept, children: node.children.map(bare) } : kept;
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
