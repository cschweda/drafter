import type { MdNode } from './types';

/**
 * The parts of a node the walk reads. The Preview's `MdNode` and the PDF's `DocNode` both have
 * them, so each numbers its own tree with this one walk.
 */
export interface FootnoteNode<N> {
  type: string;
  identifier?: string;
  children?: N[];
}

/** A document's footnotes, numbered as they print. */
export interface Footnotes<N = MdNode> {
  /** Each referenced note's number, by its label's identifier. */
  numbers: Map<string, number>;
  /** The definitions of the referenced notes, in number order: note n is `notes[n - 1]`. */
  notes: N[];
  /**
   * The last number among a note and the notes first referenced inside it, by index (note n is
   * `last[n - 1]`): they are numbered together, n to `last[n - 1]`, and print together.
   */
  last: number[];
}

/**
 * The notes a document prints and their numbers, as GitHub numbers them: 1, 2, 3 in the order they
 * are first referenced, whatever their labels; a note referenced again keeps its number, and a
 * definition never referenced prints nothing (a reference with no definition is text already: the
 * parser makes a reference only when its definition exists). The first definition of a label is
 * the one used. A note's own text is read where it is first referenced, so a note referenced only
 * inside another note is numbered right after it, and a page's notes in the PDF run in order.
 *
 * The one walk for the Preview, the word count, the PDF (`@drafter/render-pdf`), and the HTML
 * export. It keeps its own stack, so any depth of nesting is read.
 */
export function footnotes<N extends FootnoteNode<N>>(tree: N): Footnotes<N> {
  const definitions = new Map<string, N>();
  const all = [tree];
  for (let node = all.pop(); node; node = all.pop()) {
    if (
      node.type === 'footnoteDefinition' &&
      node.identifier !== undefined &&
      !definitions.has(node.identifier)
    ) {
      definitions.set(node.identifier, node);
    }
    // Reversed, so the stack gives them back in document order.
    for (const child of [...(node.children ?? [])].reverse()) all.push(child);
  }

  const numbers = new Map<string, number>();
  const notes: N[] = [];
  const last: number[] = [];
  /** A node to read, or the end of note `close`'s text. */
  const stack: ({ node: N } | { close: number })[] = [...(tree.children ?? [])]
    .reverse()
    .map((node) => ({ node }));
  for (let top = stack.pop(); top; top = stack.pop()) {
    if ('close' in top) {
      last[top.close - 1] = notes.length;
      continue;
    }
    const { node } = top;
    // A definition is read where it is referenced, never where it stands.
    if (node.type === 'footnoteDefinition') continue;
    if (node.type === 'footnoteReference' && node.identifier !== undefined) {
      const definition = definitions.get(node.identifier);
      if (definition && !numbers.has(node.identifier)) {
        const n = notes.length + 1;
        numbers.set(node.identifier, n);
        notes.push(definition);
        // The note's text next, before the rest of the text it was referenced in.
        stack.push({ close: n });
        for (const child of [...(definition.children ?? [])].reverse()) stack.push({ node: child });
      }
      continue;
    }
    for (const child of [...(node.children ?? [])].reverse()) stack.push({ node: child });
  }
  return { numbers, notes, last };
}
