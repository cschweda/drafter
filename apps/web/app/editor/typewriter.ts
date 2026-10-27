import { Annotation, type Extension, type Transaction } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { isApple } from '../commands/keys';

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
 *
 * A change to the selection alone counts only when `navigated` says a key that moves the cursor
 * (an arrow, Home, End, Page Up or Down) made it. Everything else that selects carries the same
 * `select` user event: Select All, which would jump to the end of the script, and the handles a
 * finger drags on a touch screen, which scrolling would fight.
 */
export function centersOn(tr: Transaction, navigated = false): boolean {
  if (!tr.docChanged && !tr.selection) return false;
  if (
    tr.annotation(appChange) ||
    tr.isUserEvent('select.pointer') ||
    tr.isUserEvent('input.replace')
  ) {
    return false;
  }
  if (!tr.docChanged && !navigated) return false;
  return ['input', 'delete', 'undo', 'redo', 'select', 'move'].some((event) =>
    tr.isUserEvent(event),
  );
}

/** The keys that move the cursor on any keyboard: the only way, with these below, that a selection change scrolls. */
const NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** macOS's Emacs-style moves, which CodeMirror binds there with Control: back, forward, next line, previous line, start, end, and page down. */
const MAC_CONTROL_KEYS = new Set(['b', 'f', 'n', 'p', 'a', 'e', 'v']);

/** Whether `event` is a key that moves the cursor (`apple`: a Mac keyboard, where Control-b and the like do too). */
export function movesCursor(event: KeyboardEvent, apple: boolean = isApple()): boolean {
  if (NAVIGATION_KEYS.has(event.key)) return true;
  return (
    apple &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    MAC_CONTROL_KEYS.has(event.key.toLowerCase())
  );
}

/**
 * Whether a selection `height` pixels tall is more than a pane `viewport` pixels tall can show.
 * Centering the end of one only chases it: extending a selection by keys stops scrolling once it
 * is that big.
 */
export function exceedsViewport(height: number, viewport: number): boolean {
  return height > viewport;
}

export interface Insets {
  /** Pixels at the top of the pane that cannot be seen. */
  top: number;
  /** Pixels at the bottom of the pane that cannot be seen: under a soft keyboard. */
  bottom: number;
}

/**
 * The parts of the pane the writer can't see, for the middle to be that of what they can. The
 * pane is as tall as the layout viewport; on a phone the soft keyboard shrinks the *visual*
 * viewport (`window.visualViewport`) and not the layout one, so the bottom of the pane is under
 * the keyboard. Both are in the layout viewport's coordinates. Without a visual viewport, or when
 * it covers the pane, nothing is hidden.
 */
export function viewportInsets(
  pane: { top: number; bottom: number },
  viewport: { offsetTop: number; height: number } | null | undefined,
): Insets {
  if (!viewport) return { top: 0, bottom: 0 };
  const height = Math.max(0, pane.bottom - pane.top);
  const top = Math.min(height, Math.max(0, Math.round(viewport.offsetTop - pane.top)));
  const bottom = Math.min(
    height - top,
    Math.max(0, Math.round(pane.bottom - (viewport.offsetTop + viewport.height))),
  );
  return { top, bottom };
}

/**
 * Typewriter scrolling (Phase 1 design §7.2): after each change or cursor move the writer makes,
 * the cursor's line is scrolled to the middle of the Source pane, and the pane has half its
 * height of room below the text so the last lines can reach the middle. There is no room above:
 * the opening lines stay at the top, where they are without it, and the line you're on stays in
 * the middle once you're past it (an empty half-pane over the title page only looked broken).
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
  const insetsOf = (view: EditorView): Insets =>
    viewportInsets(
      view.scrollDOM.getBoundingClientRect(),
      view.dom.ownerDocument.defaultView?.visualViewport,
    );
  return [
    // Scrolls to the middle of what can be seen: a target's margins move where "center" is.
    EditorView.scrollMargins.of((view) => insetsOf(view)),
    ViewPlugin.fromClass(
      class {
        private room = '';
        private gone = false;
        /** A key that moves the cursor is being handled: until the task ends, a selection change is its. */
        private navigating = false;
        private readonly win: Window | null;
        private readonly remeasure = () => this.measure();
        private readonly onKey = (event: KeyboardEvent) => {
          if (!movesCursor(event)) return;
          this.navigating = true;
          setTimeout(() => {
            this.navigating = false;
          }, 0);
        };

        constructor(private readonly view: EditorView) {
          this.win = view.dom.ownerDocument.defaultView;
          // In the capture phase, so the flag is set before the keymap's command dispatches.
          view.dom.addEventListener('keydown', this.onKey, true);
          this.win?.visualViewport?.addEventListener('resize', this.remeasure);
          this.win?.visualViewport?.addEventListener('scroll', this.remeasure);
          this.measure();
        }

        update(update: ViewUpdate) {
          if (update.geometryChanged) this.measure();
          if (
            !update.view.hasFocus ||
            !update.transactions.some((tr) => centersOn(tr, this.navigating))
          ) {
            return;
          }
          // A selection taller than the pane (Shift-End across a script) is not chased.
          const { from, to, empty } = update.state.selection.main;
          if (!empty && !update.docChanged && this.tooTall(from, to)) return;
          queueMicrotask(() => {
            if (this.gone) return;
            const head = this.view.state.selection.main.head;
            this.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'center' }) });
          });
        }

        private tooTall(from: number, to: number): boolean {
          const view = this.view;
          const height = view.lineBlockAt(to).bottom - view.lineBlockAt(from).top;
          return exceedsViewport(height, view.scrollDOM.clientHeight);
        }

        /**
         * Half of what can be seen below the text, so the last lines can reach the middle of it; what
         * is hidden (under a soft keyboard, or above the visual viewport) is added on its side. Measured
         * again when the pane or the visual viewport is resized.
         */
        private measure() {
          this.view.requestMeasure({
            key: this,
            read: (view) => {
              const { top, bottom } = insetsOf(view);
              const seen = Math.max(0, view.scrollDOM.clientHeight - top - bottom);
              return {
                above: top,
                below: bottom + Math.round(seen / 2),
              };
            },
            write: ({ above, below }, view) => {
              const room = `${above}/${below}`;
              if (room === this.room || this.gone) return;
              this.room = room;
              if (above > 0) view.contentDOM.style.paddingTop = `${above}px`;
              else view.contentDOM.style.removeProperty('padding-top');
              view.contentDOM.style.paddingBottom = `${below}px`;
            },
          });
        }

        destroy() {
          this.gone = true;
          this.view.dom.removeEventListener('keydown', this.onKey, true);
          this.win?.visualViewport?.removeEventListener('resize', this.remeasure);
          this.win?.visualViewport?.removeEventListener('scroll', this.remeasure);
          this.view.contentDOM.style.removeProperty('padding-top');
          this.view.contentDOM.style.removeProperty('padding-bottom');
        }
      },
    ),
  ];
}
