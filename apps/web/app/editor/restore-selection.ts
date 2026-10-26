import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Makes the page's selection the editor's again after the editor's element has been moved in the
 * page and focused. Safari drops the cursor from the page's selection when an element moves, while
 * CodeMirror still believes the selection is where it was and so doesn't write it again; typing
 * then lands at the start of the text. Moving the selection away and back makes CodeMirror write
 * it. Neither step is an undo step, and neither scrolls.
 */
export function restoreSelection(view: EditorView): void {
  const selection = view.state.selection;
  const elsewhere = selection.main.head === 0 ? view.state.doc.length : 0;
  const quiet = Transaction.addToHistory.of(false);
  view.dispatch({ selection: { anchor: elsewhere }, annotations: quiet });
  view.dispatch({ selection, annotations: quiet });
}
