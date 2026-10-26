import type { MdNode } from './render';

const INLINE = new Set([
  'text',
  'emphasis',
  'strong',
  'inlineCode',
  'link',
  'linkReference',
  'image',
  'imageReference',
  'html',
  'delete',
]);

/**
 * The words of a Markdown document: what is read, not the markup around it. A link counts its
 * text and not its address, an image its description, code and raw HTML their text; a rule or a
 * mark counts nothing. A word is a run of characters between spaces, so `four` and the `.` after
 * it in `*four*.` are one word; a paragraph, a heading, or a list item ends a word.
 */
export function countWords(tree: MdNode): number {
  let text = '';
  const visit = (node: MdNode) => {
    if (node.type === 'image' || node.type === 'imageReference') text += node.alt ?? '';
    else if (node.value !== undefined) text += node.value;
    for (const child of node.children ?? []) visit(child);
    // Everything but the pieces of one line starts a new word.
    if (!INLINE.has(node.type)) text += ' ';
  };
  visit(tree);
  return text.split(/\s+/).filter(Boolean).length;
}
