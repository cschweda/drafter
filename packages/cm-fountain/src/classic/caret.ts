import { completionStatus } from '@codemirror/autocomplete';
import { deleteGroupBackward, deleteGroupForward } from '@codemirror/commands';
import {
  ChangeSet,
  EditorSelection,
  EditorState,
  type Extension,
  findClusterBreak,
  type Line,
  type StateCommand,
  Transaction,
  type TransactionSpec,
} from '@codemirror/state';
import type { Command } from '@codemirror/view';
import { blockAt } from '@drafter/fountain';
import { blocked, isBlank } from '../elements';
import { BOM } from '../keymap';
import { appChange, insideRegion, parsedDoc } from '../state';
import {
  endAmong,
  type HiddenSpan,
  hiddenSpans,
  pairsOn,
  pastLead,
  startAmong,
  steps,
  visibleEnd,
  visibleStart,
} from './hidden';
import { hereIn, isEmptyParens, key, removeParens } from './keys';
import { BLANK_SPEECH, classicEdit, classicLine } from './line';
import { classicTidied } from './marks';

// Where the cursor may stand in Classic Mode, and what a delete takes (design §6.4). The writer
// sees the page and not the marks, so a hidden mark is never a place to stand or a thing to delete,
// and the blank line between two elements is space on the page.

/** A blank line between two elements, which isn't a place to stand (§6.4). Not an extra blank line, and not this stay's `made` line. */
export function passedOver(state: EditorState, pos: number): boolean {
  const { doc } = state;
  const line = doc.lineAt(pos);
  if (!isBlank(line.text) || line.number === 1 || line.number === doc.lines) return false;
  if (isBlank(doc.line(line.number - 1).text) || isBlank(doc.line(line.number + 1).text)) {
    return false;
  }
  const parsed = state.field(parsedDoc);
  if (blockAt(parsed, line.from) || insideRegion(parsed, line.from)) return false;
  const held = state.field(classicLine, false);
  return !(held?.made && held.from === line.from);
}

interface Travel {
  /** Where the cursor was. */
  from: number;
  forward: boolean;
  pointer: boolean;
  /** A key's move, not a click or the app's. */
  key: boolean;
}

/** Whether nothing but blank lines stands between the line and the end, far from where it started. */
function pastTheLastElement(
  state: EditorState,
  pos: number,
  { from, key: byKey }: Travel,
): boolean {
  const { doc } = state;
  const line = doc.lineAt(pos);
  if (!byKey || pos !== doc.length || !isBlank(line.text) || line.number === 1) return false;
  const held = state.field(classicLine, false);
  if (held?.made && held.from === line.from) return false;
  return doc.lineAt(from).number < line.number - 1;
}

/** The end of the last line with text, or null with none. */
function lastElementEnd(state: EditorState): number | null {
  for (let n = state.doc.lines; n >= 1; n--) {
    const line = state.doc.line(n);
    if (!isBlank(line.text)) return visibleEnd(state, line);
  }
  return null;
}

/** Whether a line has something hidden before its words, so its start is no place to stand. */
const hidesItsStart = (line: Line, spans: readonly HiddenSpan[], start: number) =>
  (spans[0]?.from ?? start) < start || line.text.startsWith(BOM);

const closesRegion = (state: EditorState, { kind, from, to }: HiddenSpan) =>
  (kind === 'note' || kind === 'boneyard') && /^(?:\]\]|\*\/)$/.test(state.sliceDoc(from, to));

/** The place for a cursor sent to `pos`: it's `pos` unless that's no place to stand. */
function place(state: EditorState, pos: number, travel: Travel): number {
  const { doc } = state;
  const { from, forward, pointer } = travel;
  const line = doc.lineAt(pos);
  if (passedOver(state, pos)) {
    const above = doc.line(line.number - 1);
    return forward && !pointer
      ? place(state, doc.line(line.number + 1).from, travel)
      : visibleEnd(state, above);
  }
  if (pastTheLastElement(state, pos, travel)) return lastElementEnd(state) ?? pos;

  const spans = hiddenSpans(state, line);
  const start = startAmong(line, spans);
  if (pos < start && hidesItsStart(line, spans, start)) {
    // A step back from the words goes on above. A jump to the line's start stops at the words.
    const steppedOff = !forward && !pointer && from === start;
    return steppedOff && line.number > 1 ? place(state, line.from - 1, travel) : start;
  }
  const end = endAmong(line, spans);
  if (pos > end) {
    const steppedOff = forward && !pointer && from === end;
    return steppedOff && line.number < doc.lines ? place(state, line.to + 1, travel) : end;
  }
  // The end of a note's words is a place to add to it, which after the `]]` isn't.
  const closing = spans.find(
    (span) => pos >= span.from && pos < span.to && closesRegion(state, span),
  );
  if (closing) return pos === closing.from || !forward ? closing.from : closing.to;
  for (const step of steps(spans)) {
    if (pos < step.from) break;
    if (pos >= step.to) continue;
    if (forward || pointer || from !== step.to) return step.to;
    return findClusterBreak(line.text, step.from - line.from, false) + line.from;
  }
  return pos;
}

/** A lone cursor, moved off a hidden mark or a passed-over line (§6.4). The one rule for every move. */
export const classicCaret: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection || tr.annotation(classicEdit)) return tr;
  const tidied = tr.annotation(classicTidied) === true;
  if (tr.docChanged && !tidied) return tr;
  const { ranges, main } = tr.newSelection;
  if (ranges.length > 1 || !main.empty) return tr;
  // A tidied line is gone in the new text, and what's a place to stand is read from that.
  const state = tidied ? tr.state : tr.startState;
  const from = tr.changes.mapPos(tr.startState.selection.main.head, -1);
  const pos = place(state, main.head, {
    from,
    forward: main.head >= from,
    pointer: tr.isUserEvent('select.pointer'),
    key: tr.isUserEvent('select') && !tr.isUserEvent('select.pointer'),
  });
  if (pos === main.head) return tr;
  const selection = EditorSelection.cursor(
    pos,
    main.assoc,
    main.bidiLevel ?? undefined,
    main.goalColumn,
  );
  return [tr, { selection, sequential: true }];
});

/** Up or Down, past the lines that aren't places to stand, keeping the column. */
const vertical =
  (forward: boolean): Command =>
  (view) => {
    const { state } = view;
    const range = state.selection.main;
    const list = completionStatus(state) === 'active';
    if (state.selection.ranges.length > 1 || !range.empty || list) return false;
    let next = view.moveVertically(range, forward);
    while (passedOver(state, next.head)) {
      const further = view.moveVertically(next, forward);
      if (state.doc.lineAt(further.head).number === state.doc.lineAt(next.head).number) break;
      next = further;
    }
    if (next.head === range.head) return false;
    view.dispatch({
      selection: EditorSelection.create([next]),
      userEvent: 'select',
      scrollIntoView: true,
    });
    return true;
  };

/** ArrowUp, ArrowDown. Shift+arrows stay CodeMirror's. */
export const classicArrows: Command[] = [vertical(false), vertical(true)];

/** Whether the lone cursor is at `edge` of a line with something hidden past it. */
const stopsAt =
  (edge: (state: EditorState, line: Line) => number): StateCommand =>
  ({ state }) => {
    const { main } = state.selection;
    if (state.selection.ranges.length > 1 || !main.empty) return false;
    const line = state.doc.lineAt(main.head);
    if (main.head !== edge(state, line)) return false;
    // A filter can't tell Home at the words from Left, which goes on above.
    return main.head !== (edge === visibleStart ? line.from : line.to);
  };

/** Home where the line's words start: it stays. */
export const classicHome: StateCommand = stopsAt(visibleStart);

/** End where the line's words end: it stays. */
export const classicEnd: StateCommand = stopsAt(visibleEnd);

/** A change that takes text, with where the cursor goes. `delete` alone, so no filter redoes it. */
const taking = (from: number, to: number, anchor: number): TransactionSpec => ({
  changes: { from, to },
  selection: { anchor },
  userEvent: 'delete',
  scrollIntoView: true,
});

/** The first line with text above a line, and the blank lines between, up to the two that matter. */
function above({ doc }: EditorState, line: Line) {
  let blanks = 0;
  for (let n = line.number - 1; n >= 1 && blanks < 2; n--) {
    const other = doc.line(n);
    if (!isBlank(other.text)) return { line: other, blanks };
    blanks++;
  }
  return { line: null, blanks };
}

/** As `above`, below. */
function below({ doc }: EditorState, line: Line) {
  let blanks = 0;
  for (let n = line.number + 1; n <= doc.lines && blanks < 2; n++) {
    const other = doc.line(n);
    if (!isBlank(other.text)) return { line: other, blanks };
    blanks++;
  }
  return { line: null, blanks };
}

const isPageBreak = (state: EditorState, line: Line) =>
  blockAt(state.field(parsedDoc), line.from)?.block.kind === 'page_break';

/**
 * The line under `upper` joined on to it. Only the lower line's lead and closing mark go: emphasis
 * and notes come along whole, a closing mark of the upper line stays last, and the cursor stands
 * past an opening pair, as it would anywhere.
 */
function join(state: EditorState, upper: Line, lower: Line): TransactionSpec {
  const end = visibleEnd(state, upper);
  const start = pastLead(state, lower);
  const rest = state.sliceDoc(start, visibleEnd(state, lower));
  const opener = hiddenSpans(state, lower).find(
    (span) => span.from === start && span.kind === 'pair',
  );
  return {
    changes: { from: end, to: lower.to, insert: rest + state.sliceDoc(end, upper.to) },
    selection: { anchor: end + (opener ? opener.to - opener.from : 0) },
    userEvent: 'delete',
    scrollIntoView: true,
  };
}

/** A page break taken away whole, with the blank line above it. */
function takeBreak(state: EditorState, line: Line): TransactionSpec {
  const up = above(state, line);
  if (up.blanks >= 2) return taking(line.from - 1, line.to, line.from - 1);
  if (up.line) return taking(up.line.to, line.to, visibleEnd(state, up.line));
  return taking(line.from, below(state, line).line?.from ?? line.to, line.from);
}

/** Backspace on an empty line: it goes, and the blank line above it, unless that's all that keeps the text below apart. */
function backspaceEmpty(state: EditorState, line: Line): TransactionSpec | null {
  if (line.number === 1) return null;
  const { line: upper, blanks } = above(state, line);
  const under = line.number < state.doc.lines && !isBlank(state.doc.line(line.number + 1).text);
  if (!upper || blanks >= 2) return taking(line.from - 1, line.to, line.from - 1);
  const end = visibleEnd(state, upper);
  return taking(blanks && under ? line.from - 1 : upper.to, line.to, end);
}

/** Backspace at the visible start of a line with text. */
function backspaceJoin(state: EditorState, line: Line): TransactionSpec {
  const { line: upper, blanks } = above(state, line);
  const head = state.selection.main.head;
  if (blanks >= 2) return taking(line.from - 1, line.from, head - 1);
  if (!upper) return {};
  if (blocked(state, upper.from) === 'title page') return {};
  if (upper.text === BLANK_SPEECH)
    return taking(upper.from, line.from, head - (line.from - upper.from));
  if (isPageBreak(state, upper)) {
    return taking(upper.from, line.from, head - (line.from - upper.from));
  }
  return join(state, upper, line);
}

/** What Backspace does that CodeMirror's doesn't. */
function backspace(state: EditorState, line: Line, head: number): TransactionSpec | null {
  if (line.text === BLANK_SPEECH) return taking(line.from - 1, line.to, line.from - 1);
  if (isPageBreak(state, line)) return takeBreak(state, line);
  if (isBlank(line.text)) return backspaceEmpty(state, line);
  return head <= visibleStart(state, line) ? backspaceJoin(state, line) : null;
}

/** Delete on a blank speech line: the whole line, as one space would cut the speech. */
function deleteBlankSpeech(state: EditorState, line: Line): TransactionSpec {
  return line.number < state.doc.lines
    ? taking(line.from, line.to + 1, line.from)
    : taking(line.from - 1, line.to, line.from - 1);
}

/** Delete on an empty line: the line goes, and the text below comes up, keeping a blank line above it. */
function deleteEmpty(state: EditorState, line: Line): TransactionSpec | null {
  if (line.number === state.doc.lines) return null;
  const { line: lower, blanks } = below(state, line);
  const open = line.number === 1 || isBlank(state.doc.line(line.number - 1).text);
  if (!lower || blanks >= 2 || !open) return taking(line.from, line.to + 1, line.from);
  const start = visibleStart(state, lower);
  return taking(line.from, lower.from, start - (lower.from - line.from));
}

/** Delete at the visible end of a line with text: the join, from the other side. */
function deleteJoin(state: EditorState, line: Line): TransactionSpec {
  const { line: lower, blanks } = below(state, line);
  const head = state.selection.main.head;
  if (line.number === state.doc.lines) return {};
  if (blanks >= 2) return taking(line.to, line.to + 1, head);
  if (!lower) return taking(line.to, state.doc.length, head);
  if (isPageBreak(state, lower)) return taking(line.to, lower.to, head);
  return join(state, line, lower);
}

/** What Delete does that CodeMirror's doesn't. */
function forwardDelete(state: EditorState, line: Line, head: number): TransactionSpec | null {
  if (line.text === BLANK_SPEECH) return deleteBlankSpeech(state, line);
  if (isPageBreak(state, line)) return takeBreak(state, line);
  if (isBlank(line.text)) return deleteEmpty(state, line);
  return head >= visibleEnd(state, line) ? deleteJoin(state, line) : null;
}

/** With the cursor against a hidden mark, the place on its far side, or null. */
function pastMark(state: EditorState, line: Line, pos: number, forward: boolean): number | null {
  for (const step of steps(hiddenSpans(state, line))) {
    if (forward ? pos >= step.from && pos < step.to : pos === step.to) {
      return forward ? step.to : step.from;
    }
  }
  return null;
}

/** One press with the cursor against a hidden mark: the character the writer sees past it. */
function letterPast(state: EditorState, forward: boolean): TransactionSpec | null {
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  const inner = pastMark(state, line, head, forward);
  if (inner === null || inner === (forward ? line.to : line.from)) return null;
  const next = findClusterBreak(line.text, inner - line.from, forward) + line.from;
  const [from, to] = forward ? [inner, next] : [next, inner];
  return {
    changes: { from, to },
    selection: { anchor: forward ? inner : head - (to - from) },
    userEvent: forward ? 'delete.forward' : 'delete.backward',
    scrollIntoView: true,
  };
}

/** A command that sends the spec through as it says, with no user event of its own. */
const deleting =
  (spec: (state: EditorState) => TransactionSpec | null): StateCommand =>
  ({ state, dispatch }) => {
    const found = state.readOnly ? null : spec(state);
    if (!found) return false;
    dispatch(state.update(found));
    return true;
  };

const emptyParens = key((state) => {
  const here = hereIn(state);
  return here && isEmptyParens(here) ? removeParens(here) : null;
});

const loneCursor = ({ selection }: EditorState) =>
  selection.ranges.length === 1 && selection.main.empty;

const deleteSpec = (forward: boolean) => (state: EditorState) => {
  if (!loneCursor(state)) return null;
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  const here = hereIn(state);
  // A line can start with a note, whose first word is its visible start.
  const atNote = !forward && !here && !blocked(state, head) && head === visibleStart(state, line);
  const own = here || atNote ? (forward ? forwardDelete : backspace)(state, line, head) : null;
  return own ?? letterPast(state, forward);
};

const backspaceKey = deleting(deleteSpec(false));
const deleteKey = deleting(deleteSpec(true));

export const classicBackspace: StateCommand = (target) =>
  emptyParens(target) || backspaceKey(target);
export const classicDelete: StateCommand = (target) => emptyParens(target) || deleteKey(target);

/** The one stretch a delete takes, if that's what it is: nothing written, all on one line. */
function takenOnLine(tr: Transaction): { from: number; to: number; line: Line } | null {
  let range: { from: number; to: number } | null = null;
  let single = true;
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    if (range || inserted.length) single = false;
    range = { from, to };
  });
  if (!range || !single) return null;
  const { from, to } = range as { from: number; to: number };
  const line = tr.startState.doc.lineAt(from);
  return to <= line.to ? { from, to, line } : null;
}

type Stretch = { from: number; to: number };

/** The parts of a stretch outside the spans. */
function outside({ from, to }: Stretch, spans: readonly HiddenSpan[]): Stretch[] {
  const out: Stretch[] = [];
  let at = from;
  for (const span of spans) {
    if (span.to <= at || span.from >= to) continue;
    if (span.from > at) out.push({ from: at, to: span.from });
    at = span.to;
  }
  if (at < to) out.push({ from: at, to });
  return out;
}

/** How many characters the writer would still see before each place on a line once `words` go. */
function shownBefore(line: Line, spans: readonly HiddenSpan[], words: readonly Stretch[]) {
  const gone = new Uint8Array(line.length);
  for (const { from, to } of [...spans, ...words]) gone.fill(1, from - line.from, to - line.from);
  const before = new Int32Array(line.length + 1);
  for (let at = 0; at < line.length; at++) {
    const shown = !gone[at] && /\S/.test(line.text.charAt(at));
    before[at + 1] = (before[at] as number) + (shown ? 1 : 0);
  }
  return before;
}

/** What goes with `words`, beyond them: marks with nothing left to mark, and an escape's backslash. */
function emptied(state: EditorState, line: Line, spans: readonly HiddenSpan[], words: Stretch[]) {
  const before = shownBefore(line, spans, words);
  const pairs = pairsOn(state, line, spans);
  const halves = (kind: HiddenSpan['kind']) =>
    spans.filter((span) => span.kind === kind).length -
    pairs.filter(([open]) => open.kind === kind).length * 2;
  // Nothing left on the line takes it whole, spaces too, unless half a note is all that's holding it.
  if (!before[line.length] && !halves('note') && !halves('boneyard')) return null;
  const out: Stretch[] = spans.filter(
    (span) =>
      span.kind === 'escape' && words.some(({ from, to }) => from <= span.to && span.to < to),
  );
  for (const pair of pairs) {
    const [open, close] = pair;
    const left =
      (before[close.from - line.from] as number) - (before[open.to - line.from] as number);
    if (!left) out.push(open, close);
  }
  return out;
}

/** What a group delete would take from past a hidden mark, as CodeMirror reads a word. */
function groupPast(state: EditorState, inner: number, forward: boolean): Stretch | null {
  const moved = state.update({ selection: { anchor: inner }, filter: false }).state;
  let found: Stretch | null = null;
  (forward ? deleteGroupForward : deleteGroupBackward)({
    state: moved,
    dispatch: (tr) =>
      tr.changes.iterChanges((from, to) => {
        found = { from, to };
      }),
  });
  return found;
}

/**
 * A delete never takes a hidden mark with text left on the line (§6.4): CodeMirror's `deleteBy`
 * would take the whole of an atomic `**`. It takes the words the writer sees, and a mark with
 * nothing left to mark goes with them. Plain Backspace and Delete past a mark are done by their
 * keys, so a delete of nothing but marks that gets here was a word's.
 */
export const keepHiddenMarks: Extension = EditorState.transactionFilter.of((tr) => {
  const event = tr.annotation(Transaction.userEvent);
  if (event !== 'delete.backward' && event !== 'delete.forward') return tr;
  const state = tr.startState;
  if (tr.annotation(appChange) || state.selection.ranges.length > 1) return tr;
  const taken = takenOnLine(tr);
  if (!taken) return tr;
  const { line } = taken;
  const spans = hiddenSpans(state, line);
  if (!spans.length) return tr;
  const forward = event === 'delete.forward';
  const { head } = state.selection.main;
  let words = outside(taken, spans);
  if (!words.length) {
    const inner = pastMark(state, line, forward ? taken.from : taken.to, forward);
    const edge = forward ? line.to : line.from;
    const past = inner === null || inner === edge ? null : groupPast(state, inner, forward);
    if (!past) return deleteSpec(forward)(state) ?? {};
    words = outside(past, spans);
  }
  const marks = emptied(state, line, spans, words);
  const whole = { from: line.from + (line.text.startsWith(BOM) ? 1 : 0), to: line.to };
  if (marks && !marks.length && words.length === 1) {
    if (words[0]?.from === taken.from && words[0].to === taken.to) return tr;
  }
  const changes = ChangeSet.of(marks ? [...words, ...marks] : whole, state.doc.length);
  return {
    changes,
    selection: { anchor: changes.mapPos(head, forward ? 1 : -1) },
    userEvent: event,
    scrollIntoView: tr.scrollIntoView,
  };
});
