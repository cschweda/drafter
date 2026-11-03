import { getSearchQuery } from '@codemirror/search';
import {
  type AnnotationType,
  ChangeSet,
  type ChangeSpec,
  EditorSelection,
  EditorState,
  type Extension,
  type Line,
  StateField,
  type Text,
  Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, ViewPlugin } from '@codemirror/view';
import { metadataSpan, type Span } from '@drafter/fountain';
import { isBlank } from '../elements';
import { BOM } from '../keymap';
import { appChange, parsedDoc } from '../state';
import { isBlankScript } from './hidden';
import { classicEdit } from './line';
import { classicTidied } from './marks';

// The `/* drafter … */` block holds the script's template and settings, and it only counts as the
// script's last block. A writer who can't see it can't look after it, so in Classic Mode it's hidden
// and kept (design §8.4). The selection stops above it, which does most of the work; the filter here
// is the backstop, and what's typed where no line stands above it gets one.

/** Where text can start: a byte-order mark stays first. */
const firstColumn = (doc: Text) => (doc.line(1).text.startsWith(BOM) ? 1 : 0);

/** The block's line, and the line breaks just before it that keep it a block of its own: up to two. */
function blockStart(doc: Text, span: Span): { line: Line; from: number } {
  const line = doc.lineAt(span.from);
  if (line.number === 1) return { line, from: firstColumn(doc) };
  const before = doc.line(line.number - 1);
  if (!isBlank(before.text)) return { line, from: line.from - 1 };
  return { line, from: before.number === 1 ? 0 : before.from - 1 };
}

/**
 * From the line breaks before the block to its end, for the block `parse` reads as `doc.meta`, or
 * null with none. Blank lines above those two are the writer's: Enter on the last element makes one.
 */
export function protectedRange(state: EditorState): Span | null {
  const span = metadataSpan(state.field(parsedDoc));
  return span && { from: blockStart(state.doc, span).from, to: span.to };
}

/** What the filter leaves alone: what isn't the writer's, and what an input method is still composing (§10). */
const standsBack = (tr: Transaction) =>
  !tr.annotation(Transaction.userEvent) ||
  tr.annotation(appChange) === true ||
  tr.isUserEvent('undo') ||
  tr.isUserEvent('redo') ||
  tr.isUserEvent('input.type.compose');

interface Cut {
  changes: ChangeSet;
  /** Where each insert sent above the block stood in the new text. */
  moved: readonly { fromB: number; toB: number }[];
}

/**
 * Each change as far as the range's start. A replacement inside the block goes whole, what it would
 * have inserted too: it's a Replace All's, and that text belongs to nothing above. Only a plain
 * insert past the block, a drop under the text, goes in above it.
 */
function cutBack(tr: Transaction, start: number): Cut | null {
  const kept: ChangeSpec[] = [];
  const moved: { fromB: number; toB: number }[] = [];
  let cut = false;
  tr.changes.iterChanges((fromA, toA, fromB, toB, insert) => {
    if (toA <= start) {
      kept.push({ from: fromA, to: toA, insert });
      return;
    }
    cut = true;
    if (fromA >= start && toA > fromA) return;
    kept.push({ from: Math.min(fromA, start), to: Math.min(toA, start), insert });
    if (fromA >= start) moved.push({ fromB, toB });
  });
  return cut ? { changes: ChangeSet.of(kept, tr.startState.doc.length), moved } : null;
}

/** Where a place in the first transaction's text is now: in an insert it moved with it, and else no lower than `limit`. */
function stopper({ moved }: Pick<Cut, 'moved'>, limit: number) {
  const length = moved.reduce((sum, { fromB, toB }) => sum + toB - fromB, 0);
  return (pos: number) => {
    let at = limit - length;
    for (const { fromB, toB } of moved) {
      if (pos >= fromB && pos <= toB) return at + pos - fromB;
      at += toB - fromB;
    }
    return Math.min(pos, limit);
  };
}

/** The selection a transaction makes, stopped with `stop`, or null when it isn't touched. */
function stoppedSelection(tr: Transaction, stop: (pos: number) => number) {
  if (!tr.selection) return null;
  const { ranges, mainIndex } = tr.newSelection;
  const next = ranges.map(({ anchor, head }) => EditorSelection.range(stop(anchor), stop(head)));
  const same = next.every(
    (range, i) => range.anchor === ranges[i]?.anchor && range.head === ranges[i]?.head,
  );
  return same ? null : EditorSelection.create(next, mainIndex);
}

/** What a rewritten transaction keeps of the first, with `changes` in its place. */
function rewritten(tr: Transaction, changes: ChangeSet, selection: EditorSelection | null) {
  const kept = <T>(type: AnnotationType<T>) => {
    const value = tr.annotation(type);
    return value === undefined ? [] : [type.of(value)];
  };
  const event = tr.annotation(Transaction.userEvent);
  const chosen = selection ?? (tr.selection ? tr.newSelection : null);
  return {
    changes,
    ...(chosen ? { selection: chosen } : null),
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    annotations: [...kept(Transaction.addToHistory), ...kept(classicEdit), ...kept(classicTidied)],
    ...(event ? { userEvent: event } : null),
  };
}

/** How many line breaks must go in at `at` for the block under it to stand alone. */
function roomNeeded(doc: Text, at: number, breaks: number): number {
  const first = firstColumn(doc);
  let count = breaks;
  let pos = at;
  while (count < 2 && pos > first && doc.sliceString(pos - 1, pos) === '\n') {
    count++;
    pos--;
  }
  return pos <= first ? 0 : 2 - count;
}

/**
 * The backstop (§8.4): a writer's change that reaches the block is cut back to the part above it,
 * text with no blank line left before the block gets one, or it would no longer be a block, and
 * where the change sends the cursor stops above it.
 */
export const keepMetadata: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || standsBack(tr)) return tr;
  const { doc, lineBreak } = tr.startState;
  const span = metadataSpan(tr.startState.field(parsedDoc));
  if (!span) return tr;
  const { line, from } = blockStart(doc, span);
  const cut = cutBack(tr, from);
  const final = cut?.changes ?? tr.changes;
  const at = final.mapPos(from, 1);
  const selection = stoppedSelection(tr, stopper(cut ?? { moved: [] }, at));
  const specs: (Transaction | TransactionSpec)[] = [
    cut ? rewritten(tr, cut.changes, selection) : tr,
  ];
  if (!cut && selection) specs.push({ selection, sequential: true });
  const room = roomNeeded(final.apply(doc), at, line.number - doc.lineAt(from).number);
  if (room) specs.push({ changes: { from: at, insert: lineBreak.repeat(room) }, sequential: true });
  return specs.length > 1 ? specs : (specs[0] as Transaction | TransactionSpec);
});

/**
 * Find past the block: the first match above it, as Find Next wraps, or the last, when nothing
 * stands before the cursor and Find Previous has wrapped. With none, the selection stays.
 */
export function matchAbove(tr: Transaction, limit: number): TransactionSpec {
  const state = tr.startState;
  const query = getSearchQuery(state);
  const { from } = state.selection.main;
  let first: Span | null = null;
  let last: Span | null = null;
  let before = false;
  if (query.valid) {
    const cursor = query.getCursor(state, 0, limit);
    for (let step = cursor.next(); !step.done; step = cursor.next()) {
      first ??= step.value;
      last = step.value;
      before ||= step.value.from < from;
    }
  }
  const found = before ? first : last;
  if (!found) return {};
  const line = state.doc.lineAt(found.from).number;
  const event = tr.annotation(Transaction.userEvent);
  return {
    selection: { anchor: found.from, head: found.to },
    effects: EditorView.announce.of(`Current match, line ${line}.`),
    scrollIntoView: true,
    ...(event ? { userEvent: event } : null),
  };
}

/**
 * Where a line break must go so the line left to type on isn't straight under the title page, or
 * null. A new stage play is its title page, a blank line, and the block: the block keeps the two
 * breaks before it, so the one line left to stand on is the title page's own blank line, and a
 * letter there would be read as more of the title page.
 */
function roomUnderTitlePage(state: EditorState): number | null {
  const parsed = state.field(parsedDoc);
  const span = metadataSpan(parsed);
  const title = parsed.titlePage;
  if (!span || !title) return null;
  const { doc } = state;
  const line = doc.lineAt(blockStart(doc, span).from);
  if (!isBlank(line.text) || line.number === 1) return null;
  const above = doc.line(line.number - 1);
  if (isBlank(above.text) || above.from < title.span.from || above.from > title.span.to)
    return null;
  return line.from;
}

/**
 * Puts the two breaks above a block with nothing above it, so nothing can land on its line, and a
 * break under a title page the block stands right below, so there's a line to type on of its own.
 */
function clearBlock(view: EditorView): void {
  const { state } = view;
  if (state.readOnly || view.composing) return;
  const annotations = [appChange.of(true), Transaction.addToHistory.of(false)];
  if (isBlankScript(state, state.doc.line(1))) {
    const from = firstColumn(state.doc);
    view.dispatch({
      changes: { from, insert: state.lineBreak.repeat(2) },
      selection: { anchor: from },
      annotations,
    });
    return;
  }
  const at = roomUnderTitlePage(state);
  if (at === null) return;
  const { head } = state.selection.main;
  view.dispatch({
    changes: { from: at, insert: state.lineBreak },
    ...(state.selection.ranges.length === 1 && head === at
      ? { selection: { anchor: at + state.lineBreak.length } }
      : null),
    annotations,
  });
}

/**
 * An input method's text can't be rewritten (§10), and `x/* drafter` isn't a block, so a blank script
 * is made ready before a first letter can come: when Classic Mode starts, when the editor takes
 * focus, and when the text changes under a focused editor (a new script, a load, an undo).
 * The move is after the update, as a view can't be changed in the middle of one.
 */
export const blockKeptClear: Extension = ViewPlugin.define(
  (view) => {
    let gone = false;
    const clear = () => queueMicrotask(() => gone || clearBlock(view));
    clear();
    return {
      update(update) {
        if (update.docChanged && view.hasFocus) clear();
      },
      destroy() {
        gone = true;
      },
      clear,
    };
  },
  {
    eventHandlers: {
      focus() {
        this.clear();
      },
    },
  },
);

/** Whether `doc` is `from` with one more break among those just before the block (under a title page). */
function onlyRoomAdded(from: Text, doc: Text): boolean {
  const text = from.toString();
  const block = text.lastIndexOf('/* drafter');
  if (block < 0) return false;
  let at = block;
  while (at > 0 && text[at - 1] === '\n') at--;
  return (
    doc.sliceString(0, at) === text.slice(0, at) &&
    doc.sliceString(at, block + 1) === '\n'.repeat(block - at + 1) &&
    doc.sliceString(block + 1) === text.slice(block)
  );
}

/** Whether `doc` is `from` with only the breaks `blockKeptClear` adds, so nothing of the writer's has changed. */
export function onlyClearedBlock(from: Text, doc: Text): boolean {
  if (doc.length === from.length + 1) return onlyRoomAdded(from, doc);
  if (doc.length !== from.length + 2 || from.lines > doc.lines) return false;
  const at = firstColumn(from);
  return (
    doc.sliceString(at, at + 2) === '\n\n' &&
    doc.sliceString(0, at) === from.sliceString(0, at) &&
    doc.sliceString(at + 2) === from.sliceString(at)
  );
}

const HIDE_LINES = Decoration.replace({ block: true });
const HIDE_ON_LINE = Decoration.replace({});

function hidden(state: EditorState): DecorationSet {
  const span = metadataSpan(state.field(parsedDoc));
  if (!span) return Decoration.none;
  const { doc } = state;
  const { from } = doc.lineAt(span.from);
  const to = /\S/.test(doc.sliceString(span.to)) ? doc.lineAt(span.to).to : doc.length;
  // With no line above it the writer still needs one to stand on, so that one stays, drawn empty.
  return Decoration.set((from === 0 ? HIDE_ON_LINE : HIDE_LINES).range(from, to));
}

/** The block isn't drawn: its lines go, and through the end of the text when only white space follows. */
export const metadataHidden: StateField<DecorationSet> = StateField.define<DecorationSet>({
  create: hidden,
  update: (value, tr) => (tr.docChanged ? hidden(tr.state) : value),
  provide: (field) => EditorView.decorations.from(field),
});
