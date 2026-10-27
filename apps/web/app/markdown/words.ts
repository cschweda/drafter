import type { MdNode } from './render';

/**
 * Whether a UTF-16 code unit is one that `/\s/` matches: the ASCII spaces (tab, line feed,
 * vertical tab, form feed, carriage return, space), the no-break space, the ogham space, the
 * spaces U+2000 to U+200A, the line and paragraph separators, the narrow no-break space, the
 * medium mathematical space, the ideographic space, and the byte-order mark. A comparison per
 * character, where a regular expression per character cost more than the reparse on a long script.
 */
function isSpace(code: number): boolean {
  if (code <= 0x20) return code === 0x20 || (code >= 0x09 && code <= 0x0d);
  if (code < 0xa0) return false;
  return (
    code === 0xa0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/** The words in a text: runs of characters between spaces. Markdown documents and scripts both count this way. */
export function wordsIn(text: string): number {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < text.length; i++) {
    const space = isSpace(text.charCodeAt(i));
    if (!space && !inWord) count++;
    inWord = !space;
  }
  return count;
}

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
  return wordsIn(text);
}
