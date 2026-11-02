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
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { metadataSpan, type Span } from '@drafter/fountain';
import { isBlank } from '../elements';
import { appChange, parsedDoc } from '../state';
import { classicEdit } from './line';
import { classicTidied } from './marks';

// The `/* drafter … */` block holds the script's template and settings, and it only counts as the
// script's last block. A writer who can't see it can't look after it, so in Classic Mode it's hidden
// and kept (design §8.4). The selection stops above it, which does most of the work; the filter here
// is the backstop, and what's typed where no line stands above it gets one.

/** The block's line, and the line breaks just before it that keep it a block of its own: up to two. */
function blockStart(doc: Text, span: Span): { line: Line; from: number } {
  const line = doc.lineAt(span.from);
  if (line.number === 1) return { line, from: 0 };
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

/** Each change as far as the range's start. What would go in at or past the range goes in there. */
function cutBack(tr: Transaction, start: number): ChangeSet | null {
  const kept: ChangeSpec[] = [];
  let cut = false;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, insert) => {
    if (toA > start) cut = true;
    kept.push({ from: Math.min(fromA, start), to: Math.min(toA, start), insert });
  });
  return cut ? ChangeSet.of(kept, tr.startState.doc.length) : null;
}

/** What a rewritten transaction keeps of the first, with `changes` in its place. */
function rewritten(tr: Transaction, changes: ChangeSet, limit: number): TransactionSpec {
  const kept = <T>(type: AnnotationType<T>) => {
    const value = tr.annotation(type);
    return value === undefined ? [] : [type.of(value)];
  };
  const { ranges, mainIndex } = tr.newSelection;
  const stopped = ranges.map(({ anchor, head }) =>
    EditorSelection.range(Math.min(anchor, limit), Math.min(head, limit)),
  );
  const event = tr.annotation(Transaction.userEvent);
  return {
    changes,
    ...(tr.selection ? { selection: EditorSelection.create(stopped, mainIndex) } : null),
    effects: tr.effects,
    scrollIntoView: tr.scrollIntoView,
    annotations: [...kept(Transaction.addToHistory), ...kept(classicEdit), ...kept(classicTidied)],
    ...(event ? { userEvent: event } : null),
  };
}

/** How many line breaks must go in at `at` for the block under it to stand alone. */
function roomNeeded(doc: Text, at: number, breaks: number): number {
  let count = breaks;
  let pos = at;
  while (count < 2 && pos > 0 && doc.sliceString(pos - 1, pos) === '\n') {
    count++;
    pos--;
  }
  return pos === 0 ? 0 : 2 - count;
}

/**
 * The backstop (§8.4): a writer's change that reaches the block is cut back to the part above it,
 * and text with no blank line left before the block gets one, or it would no longer be a block.
 */
export const keepMetadata: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || standsBack(tr)) return tr;
  const { doc, lineBreak } = tr.startState;
  const span = metadataSpan(tr.startState.field(parsedDoc));
  if (!span) return tr;
  const { line, from } = blockStart(doc, span);
  const changes = cutBack(tr, from);
  const final = changes ?? tr.changes;
  const at = final.mapPos(from, 1);
  const newDoc = changes ? changes.apply(doc) : tr.newDoc;
  const room = roomNeeded(newDoc, at, line.number - doc.lineAt(from).number);
  const first = changes ? rewritten(tr, changes, at) : tr;
  if (!room) return first;
  return [first, { changes: { from: at, insert: lineBreak.repeat(room) }, sequential: true }];
});

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
