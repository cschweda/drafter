import { StateField } from '@codemirror/state';
import { type Doc, parse, type Region, reparse, type TextChange } from '@drafter/fountain';

/**
 * The parse of the editor's text: `parse` at creation, `reparse(doc, changes)` on every change
 * (technical design §3.1). Every other editor feature reads this field and none parses again.
 *
 * The parser reads `state.doc.toString()`, which joins the lines with `\n` whatever the file
 * used, because CodeMirror counts every line break as one position. So the parser's offsets
 * are CodeMirror's positions, even when an app sets `EditorState.lineSeparator`.
 */
export const parsedDoc: StateField<Doc> = StateField.define<Doc>({
  create: (state) => parse(state.doc.toString()),
  update(doc, transaction) {
    if (!transaction.docChanged) return doc;
    // The changes come in the old document's positions, in order, and never overlapping, which is
    // what `reparse` wants. Ranges that touch are joined, with their inserts in order.
    const changes: TextChange[] = [];
    transaction.changes.iterChanges((from, to, _fromNew, _toNew, inserted) => {
      changes.push({ from, to, insert: inserted.toString() });
    });
    return reparse(doc, changes);
  },
});

/** Whether `pos` is between the delimiters of a note or a boneyard. */
export function insideRegion(doc: Doc, pos: number): boolean {
  const { regions } = doc;
  // The first region that ends at `pos` or after it: the only one that can hold it.
  let low = 0;
  let high = regions.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((regions[middle] as Region).span.to < pos) low = middle + 1;
    else high = middle;
  }
  const region = regions[low];
  // An unclosed boneyard runs to the end of the text, which is still inside it.
  return !!region && region.span.from < pos && (pos < region.span.to || !region.closed);
}
