import type { EditorState, Extension } from '@codemirror/state';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { type BlockKind, blockAt } from '@drafter/fountain';
import { parsedDoc } from './state';

/** The element under the cursor: a block and a line of it, or the title page (technical design §3.6). */
export interface CursorElement {
  /** The index in `doc.blocks`, or -1 for the title page. */
  blockIndex: number;
  /** The line within the block (or the title page), counted from 0. */
  lineIndex: number;
  kind: BlockKind | 'title_page';
}

/**
 * The element under the main selection's head, or null on a blank line. A line of exactly two
 * spaces inside a speech is a line of that speech, and a line of any other spaces is blank. The
 * state must have `parsedDoc`. It costs a binary search.
 */
export function cursorElement(state: EditorState): CursorElement | null {
  const doc = state.field(parsedDoc);
  const line = state.doc.lineAt(state.selection.main.head);
  const { titlePage } = doc;
  if (titlePage && line.from >= titlePage.span.from && line.from <= titlePage.span.to) {
    const first = state.doc.lineAt(titlePage.span.from);
    return { blockIndex: -1, lineIndex: line.number - first.number, kind: 'title_page' };
  }
  const found = blockAt(doc, line.from);
  if (!found) return null;
  const first = state.doc.lineAt(found.block.span.from);
  return {
    blockIndex: found.index,
    lineIndex: line.number - first.number,
    kind: found.block.kind,
  };
}

const same = (a: CursorElement | null, b: CursorElement | null) =>
  a === b ||
  (!!a && !!b && a.blockIndex === b.blockIndex && a.lineIndex === b.lineIndex && a.kind === b.kind);

/**
 * Calls back when the element under the cursor changes: when the cursor moves to another, and
 * when an edit changes the element it is in (its index, line, or kind). It is not called for the
 * element the cursor starts in; the app reads that with `cursorElement`. It brings `parsedDoc`.
 */
export function onCursorElement(callback: (element: CursorElement | null) => void): Extension {
  return [
    parsedDoc,
    ViewPlugin.define((view: EditorView) => {
      let last = cursorElement(view.state);
      return {
        update(update: ViewUpdate) {
          if (!update.docChanged && !update.selectionSet) return;
          const next = cursorElement(update.state);
          if (same(last, next)) return;
          last = next;
          callback(next);
        },
      };
    }),
  ];
}
