import type { MdNode } from './render';

/** A document's footnotes, numbered as they print. */
export interface Footnotes {
  /** Each referenced note's number, by its label's identifier. */
  numbers: Map<string, number>;
  /** The definitions of the referenced notes, in number order: note n is `notes[n - 1]`. */
  notes: MdNode[];
}

/**
 * The notes a document prints and their numbers, as GitHub numbers them: 1, 2, 3 in the order they
 * are first referenced, whatever their labels; a note referenced again keeps its number, and a
 * definition never referenced prints nothing (a reference with no definition is text already: the
 * parser makes a reference only when its definition exists). The first definition of a label is
 * the one used. A note's own text is read where it is first referenced, so a note referenced only
 * inside another note is numbered right after it, and a page's notes in the PDF run in order.
 *
 * The same walk as `footnotes` in `@drafter/render-pdf`, which numbers the PDF's notes; a test
 * keeps the two in step. The walk keeps its own stack, so any depth of nesting is read.
 */
export function footnotes(tree: MdNode): Footnotes {
  const definitions = new Map<string, MdNode>();
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
  const notes: MdNode[] = [];
  const stack = [...(tree.children ?? [])].reverse();
  for (let node = stack.pop(); node; node = stack.pop()) {
    // A definition is read where it is referenced, never where it stands.
    if (node.type === 'footnoteDefinition') continue;
    if (node.type === 'footnoteReference' && node.identifier !== undefined) {
      const definition = definitions.get(node.identifier);
      if (definition && !numbers.has(node.identifier)) {
        numbers.set(node.identifier, notes.length + 1);
        notes.push(definition);
        // The note's text next, before the rest of the text it was referenced in.
        for (const child of [...(definition.children ?? [])].reverse()) stack.push(child);
      }
      continue;
    }
    for (const child of [...(node.children ?? [])].reverse()) stack.push(child);
  }
  return { numbers, notes };
}
