import { Annotation, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Marks a transaction as the app's own, not the writer's: a template block written, a fix applied,
 * a module's changes, a file's text put in. These carry the same `input` user event typing does
 * (that is how they take their place in the undo history), so typewriter scrolling is told which
 * they are.
 */
export const appChange = Annotation.define<boolean>();

/**
 * Whether a transaction is the writer's own typing, deleting, pasting, undoing, or cursor move,
 * by its user event and its annotation. A click or a drag with the mouse (`select.pointer`) is
 * left where it is: the line under the pointer is the one the writer is looking at, and a drag
 * that scrolled the text under the pointer would fight it. A transaction with no user event
 * (loading, relinting, the palette's Go to line, which scrolls itself), one marked `appChange`,
 * a file's text put in (`input.replace`), and one that changed neither the text nor the selection
 * never count.
 */
export function centersOn(tr: Transaction): boolean {
  if (!tr.docChanged && !tr.selection) return false;
  if (
    tr.annotation(appChange) ||
    tr.isUserEvent('select.pointer') ||
    tr.isUserEvent('input.replace')
  ) {
    return false;
  }
  return ['input', 'delete', 'undo', 'redo', 'select', 'move'].some((event) =>
    tr.isUserEvent(event),
  );
}

/**
 * Typewriter scrolling (Phase 1 design §7.2): after each change or cursor move the writer makes,
 * the cursor's line is scrolled to the middle of the Source pane, and the pane has half its
 * height of room above and below the text so the first and last lines can reach the middle.
 *
 * The scroll is `scrollIntoView(…, { y: 'center' })` dispatched in a microtask, since a listener
 * may not dispatch during an update. It lands before CodeMirror's measure step, which keeps only
 * the last scroll target, so it replaces the minimal scroll the writer's own edit asked for and
 * the text moves once. Nothing here animates: CodeMirror's scrolling is instant whatever the
 * `prefers-reduced-motion` setting says, and the scroller has no `scroll-behavior`.
 *
 * Only the writer's edits and moves scroll (`centersOn`, and only while the editor has focus, as
 * the writer's typing needs), so the writer's wheel is never fought: scrolling by hand changes
 * neither the text nor the selection. (Events can't tell typing from the app's own dispatches:
 * on Android CodeMirror reads typing from the page's mutations, and no `input` event reaches it.)
 */
export function typewriterScrolling(): Extension {
  return ViewPlugin.fromClass(
    class {
      private half = -1;
      private gone = false;

      constructor(private readonly view: EditorView) {
        this.measure();
      }

      update(update: ViewUpdate) {
        if (update.geometryChanged) this.measure();
        if (!update.view.hasFocus || !update.transactions.some(centersOn)) return;
        queueMicrotask(() => {
          if (this.gone) return;
          const head = this.view.state.selection.main.head;
          this.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
        });
      }

      /** Half the pane's height above and below the text, and again when the pane is resized. */
      private measure() {
        this.view.requestMeasure({
          key: this,
          read: (view) => Math.round(view.scrollDOM.clientHeight / 2),
          write: (half, view) => {
            if (half === this.half || this.gone) return;
            this.half = half;
            view.contentDOM.style.paddingTop = `${half}px`;
            view.contentDOM.style.paddingBottom = `${half}px`;
          },
        });
      }

      destroy() {
        this.gone = true;
        this.view.contentDOM.style.removeProperty('padding-top');
        this.view.contentDOM.style.removeProperty('padding-bottom');
      }
    },
  );
}
