import {
  ChangeSet,
  type EditorState,
  type Extension,
  type Range,
  type TransactionSpec,
} from '@codemirror/state';
import {
  type Command,
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { Span } from '@drafter/fountain';
import { appChange } from '../state';
import { classicTab } from './keys';
import { classicEdit, classicLine, lineKindAt, setStored } from './line';
import { CAPITALS, difference, shapeOf } from './marks';
import { acceptOffer } from './offer';

// An input method's composition (design §10): Android keyboards, and the input methods for Chinese,
// Japanese, and Korean, type through one. The editor must not change the text while it runs: a
// dispatch then redraws the text being composed and throws away what the editor hasn't read yet
// (the app's session.ts tells how a stage play lost its text that way). So the capitals and the
// mark that typing gets at once come a task after the composition ends, in one step, and till then
// a name, a heading, or a transition only looks like capitals.

/** How often a wait for a composition checks that it's still going: one can be abandoned with no end. */
export const COMPOSITION_CHECK_MS = 500;

/**
 * A composition with text in it. Not `compositionStarted`: on Android merely putting the cursor on
 * a word starts one, and a new one starts as the last ends, so Enter would wait for ever.
 */
const composing = (view: EditorView) => view.composing;

/** Each view's composition, while one waits to be settled. */
const plugins = new WeakMap<EditorView, Composition>();

/**
 * Runs `then` now, or a task after a composition ends, with what was composed settled first. The
 * end, the editor losing focus, or a check every so often (an input method switched off mid-word
 * sends neither) finds it over, as the app's `relint` does. A task, never a microtask: the editor
 * reads what was composed in a microtask of its own.
 */
export function whenComposed(view: EditorView, then: () => void): void {
  if (!composing(view)) {
    then();
    return;
  }
  const dom = view.contentDOM;
  let over = false;
  const done = () => {
    if (over) return;
    over = true;
    dom.removeEventListener('compositionend', done);
    dom.removeEventListener('blur', done);
    clearInterval(check);
    setTimeout(() => {
      if (!view.dom.isConnected && !plugins.has(view)) return;
      // The next word's composition may have begun already: it waits for that one too.
      if (composing(view)) {
        whenComposed(view, then);
        return;
      }
      plugins.get(view)?.settle();
      then();
    });
  };
  const check = setInterval(() => {
    if (!composing(view)) done();
  }, COMPOSITION_CHECK_MS);
  dom.addEventListener('compositionend', done);
  dom.addEventListener('blur', done);
}

/** A command that waits for a composition to end, and then runs. It takes the key either way. */
export const afterComposition =
  (command: Command): Command =>
  (view) => {
    if (!composing(view)) return command(view);
    whenComposed(view, () => {
      // Not if the script went read-only, or Classic Mode went, while it waited.
      if (!view.state.readOnly && view.state.field(classicLine, false) !== undefined) {
        command(view);
      }
    });
    return true;
  };

/** What Tab does, for a button (§10): the offer's top choice, or the next element. Waits for a composition. */
export const classicNext: Command = afterComposition(
  (view) => acceptOffer(view) || classicTab(view),
);

/**
 * The transaction that settles what was composed at `range`, as if it had been typed there all at
 * once: the composed text is taken out and typed again through every filter (the capitals, the
 * mark, a page break's move to the next line, the two spaces of a blank speech line), and the
 * difference is what's written. Null when there's nothing to do.
 */
export function settledComposition(state: EditorState, range: Span): TransactionSpec | null {
  const { main } = state.selection;
  if (state.readOnly || state.selection.ranges.length > 1 || !main.empty) return null;
  if (state.field(classicLine, false) === undefined) return null;
  const line = state.doc.lineAt(range.from);
  if (
    range.from >= range.to ||
    range.to > line.to ||
    main.head < line.from ||
    main.head > line.to
  ) {
    return null;
  }
  const text = state.sliceDoc(range.from, range.to);
  const taken = state.update({
    changes: range,
    selection: { anchor: range.from },
    annotations: classicEdit.of(true),
    filter: false,
  });
  const typed = taken.state.update({
    changes: { from: range.from, insert: text },
    selection: { anchor: range.from + text.length },
    userEvent: 'input.type',
  });
  const stored = typed.state.field(classicLine, false);
  const effects = stored ? setStored.of(stored) : [];
  if (typed.newDoc.eq(state.doc)) return { effects, annotations: classicEdit.of(true) };

  // The one change from the text as it stands to the text as typing would have left it.
  const both = taken.changes.compose(typed.changes);
  let fromA = state.doc.length;
  let toA = 0;
  let fromB = typed.newDoc.length;
  let toB = 0;
  both.iterChanges((a, b, c, d) => {
    fromA = Math.min(fromA, a);
    toA = Math.max(toA, b);
    fromB = Math.min(fromB, c);
    toB = Math.max(toB, d);
  });
  const change = difference(
    state.sliceDoc(fromA, toA),
    typed.newDoc.sliceString(fromB, toB),
    fromA,
  );
  const anchor =
    main.head === range.to
      ? typed.newSelection.main.head
      : ChangeSet.of(change, state.doc.length).mapPos(main.head, 1);
  return {
    changes: change,
    selection: { anchor },
    effects,
    // Typing, to autofill and to the undo history: the list stays, and one undo takes it all. The
    // filters have had their say already.
    userEvent: 'input.type',
    annotations: classicEdit.of(true),
    filter: false,
    scrollIntoView: true,
  };
}

const COMPOSING = Decoration.line({ class: 'cm-c-composing' });

/** The lines of `range` drawn in capitals while composing: those that typing would make capitals. */
function capitalLines(state: EditorState, range: Span): DecorationSet {
  const out: Range<Decoration>[] = [];
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.to).number;
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const kind = lineKindAt(state, line);
    const shape = shapeOf(state, line, line.text);
    if ((kind && CAPITALS.has(kind)) || shape === 'scene_heading' || shape === 'transition') {
      out.push(COMPOSING.range(line.from));
    }
  }
  return Decoration.set(out);
}

class Composition {
  /** What's been composed since the last settling, in the text's positions. */
  private range: Span | null = null;
  private waiting = false;
  decorations: DecorationSet = Decoration.none;

  constructor(private readonly view: EditorView) {
    plugins.set(view, this);
  }

  update(update: ViewUpdate) {
    for (const tr of update.transactions) {
      if (!tr.docChanged) continue;
      if (this.range) {
        const from = tr.changes.mapPos(this.range.from, 1);
        const to = tr.changes.mapPos(this.range.to, -1);
        this.range = from < to ? { from, to } : null;
      }
      if (!tr.isUserEvent('input.type.compose') || tr.annotation(appChange)) continue;
      tr.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
        const was = this.range;
        this.range = was
          ? { from: Math.min(was.from, fromB), to: Math.max(was.to, toB) }
          : { from: fromB, to: toB };
      });
    }
    const on = update.view.composing && this.range;
    this.decorations = on ? capitalLines(update.state, this.range as Span) : Decoration.none;
    if (!this.range || this.waiting) return;
    this.waiting = true;
    // Never in an update: a view can't be changed in the middle of one.
    if (composing(update.view)) whenComposed(this.view, () => {});
    else setTimeout(() => this.settle());
  }

  /** Settles what was composed, now that the composition is over. */
  settle() {
    const { view } = this;
    this.waiting = false;
    if (!plugins.has(view)) return;
    if (composing(view)) {
      if (this.range) {
        this.waiting = true;
        whenComposed(view, () => {});
      }
      return;
    }
    const range = this.range;
    this.range = null;
    const spec = range && settledComposition(view.state, range);
    if (spec) view.dispatch(spec);
    // The capitals by CSS go with the composition, whether or not anything was written.
    else if (this.decorations.size) view.dispatch({});
  }

  destroy() {
    plugins.delete(this.view);
  }
}

const composition = ViewPlugin.fromClass(Composition, {
  decorations: (plugin) => plugin.decorations,
});

/**
 * Classic Mode with an input method (§10): capitals by CSS on a name, a heading, or a transition
 * while a composition runs, and the capitals and the mark written a task after it ends.
 */
export const classicComposition: Extension = [
  composition,
  EditorView.baseTheme({ '.cm-line.cm-c-composing': { textTransform: 'uppercase' } }),
];
