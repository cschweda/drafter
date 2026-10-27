import {
  type ChangeSpec,
  EditorState,
  type Extension,
  type Line,
  StateEffect,
  StateField,
  Transaction,
} from '@codemirror/state';
import { blockAt } from '@drafter/fountain';
import { insideRegion, parsedDoc, readsAsCue } from './state';

// Auto-uppercasing (technical design §3.3) is the one place the editor changes the case of what
// the writer types. It applies only in a cue started with Tab and in a scene heading, to text as
// it is typed, and never to text that is already there.

/** Sent by Tab when it starts a cue; `cueMode` turns on with it. */
export const startCue = StateEffect.define();

/**
 * Sent with `startCue` by the element bar's commands, which write the `@` only so that cue mode can
 * upper-case the name: `barCue` remembers the line, and the `@` comes off again when the cursor
 * leaves it, if the name reads as a cue without one (docs/drafter-element-bar-design.md §4). Tab's
 * `@` is the writer's, and stays.
 */
export const startBarCue = StateEffect.define();

/** A line that opens with `@`, after any indentation: the cue that cue mode is for. */
const CUE_LINE = /^\s*@/;

/**
 * True after Tab starts a cue, until Enter or the cursor leaves the line. It also ends when the
 * `@` is deleted, since the line is then no cue: someone who undoes a Tab by deleting its `@`
 * should not find the next words they type changing case.
 */
export const cueMode: StateField<boolean> = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    if (tr.effects.some((effect) => effect.is(startCue))) return true;
    if (!value || !(tr.docChanged || tr.selection)) return value;
    // The cue's line, found where it was before the transaction, is the line the cursor is on
    // after it. A line break typed into the line, or a move to another, puts the cursor on a
    // different one. (The new state is not made yet, so it is read from the transaction.)
    const before = tr.startState.doc.lineAt(tr.startState.selection.main.head);
    const after = tr.newDoc.lineAt(tr.newSelection.main.head);
    return after.from === tr.changes.mapPos(before.from, -1) && CUE_LINE.test(after.text);
  },
});

/** The start of the line of a cue the element bar began, while the cursor is on it; else null. */
export const barCue: StateField<number | null> = StateField.define<number | null>({
  create: () => null,
  update(value, tr) {
    const head = tr.newDoc.lineAt(tr.newSelection.main.head);
    if (tr.effects.some((effect) => effect.is(startBarCue))) return head.from;
    if (value === null) return null;
    const from = tr.changes.mapPos(value, -1);
    return tr.newDoc.lineAt(from).from === head.from ? from : null;
  },
});

/**
 * Takes the `@` off a cue the element bar began, in the transaction that moves the cursor off its
 * line (Enter, a click, an arrow key), when the name reads as a cue without it.
 */
const dropBarCueMark = EditorState.transactionFilter.of((tr) => {
  const value = tr.startState.field(barCue, false);
  if (value === null || value === undefined) return tr;
  if (tr.effects.some((effect) => effect.is(startBarCue))) return tr;
  // Only the writer's own move off the line: not a change the app makes (a file put back from
  // disk, Revert to Saved), which has no user event, nor a replace-all.
  const event = tr.annotation(Transaction.userEvent);
  if (!event || event.startsWith('input.replace')) return tr;
  const line = tr.newDoc.lineAt(tr.changes.mapPos(value, -1));
  if (tr.newDoc.lineAt(tr.newSelection.main.head).from === line.from) return tr;
  const mark = /^\s*@/.exec(line.text);
  if (!mark) return tr;
  // A cue left with no name at all, a click and nothing typed, leaves no lone `@` behind.
  const name = line.text.slice(mark[0].length).trim();
  if (name && !readsAsCue(name)) return tr;
  const at = line.from + mark[0].length - 1;
  return [tr, { changes: { from: at, to: at + 1 }, sequential: true }];
});

/**
 * The start of a scene heading as rule 11 reads it (technical design §2.5), from the text of the
 * line before the cursor: a prefix, then a `.` or a space. It is the parser's own pattern, so
 * `INT.`, `ext `, and `I/E.` all count, and what comes before the dot is not changed.
 */
const HEADING_PREFIX = /^\s*(?:INT\.?\/EXT|INT|EXT|EST|I\/E)[. ]/i;

/**
 * Whether text typed at `pos` is in a scene heading whose prefix has matched. The prefix says
 * what the line begins with, and the parse says whether a heading can begin there: the line
 * must start a block or follow no block (a line being typed on), so that a line which only
 * opens with `Int ` in the middle of a paragraph, in a speech, in a note or boneyard, or on the
 * title page is left alone.
 */
function inHeading(state: EditorState, line: Line, pos: number): boolean {
  if (!HEADING_PREFIX.test(state.sliceDoc(line.from, pos))) return false;
  const parse = state.field(parsedDoc);
  if (parse.titlePage && line.from <= parse.titlePage.span.to) return false;
  const block = blockAt(parse, line.from)?.block;
  return (
    !block ||
    block.kind === 'scene_heading' ||
    (block.kind === 'action' && block.span.from === line.from)
  );
}

/**
 * Whether text typed at `pos` is in a note or a boneyard, which is the writer's own and is left as
 * typed. The parse knows the ones that are closed, and also a boneyard that runs to the end. A
 * `[[` or `/*` typed on the line and not yet closed is in no region, so the line before the
 * cursor is read for the last opener that has no closer after it.
 */
function inNote(state: EditorState, line: Line, pos: number): boolean {
  if (insideRegion(state.field(parsedDoc), pos)) return true;
  const before = state.sliceDoc(line.from, pos);
  return (
    before.lastIndexOf('[[') > before.lastIndexOf(']]') ||
    before.lastIndexOf('/*') > before.lastIndexOf('*/')
  );
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/**
 * Upper-cases what is typed in a cue or a scene heading. It is a transaction filter, so the
 * letters arrive upper-case in the one transaction that types them: visible at once, and
 * undone with the typing.
 *
 * It rewrites only typing (`input.type`), not a paste, a drop, a completion, a change the app
 * makes, or text still being composed by an input method, which the editor must not change
 * under the writer. Only the part of an insertion on the line it starts on is changed, as the
 * rest is on lines below.
 */
const upperCaseTyping = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent('input.type') || tr.isUserEvent('input.type.compose')) {
    return tr;
  }
  const state = tr.startState;
  const cue = state.field(cueMode) ? state.doc.lineAt(state.selection.main.head) : null;
  const doc = tr.newDoc;
  const fixes: ChangeSpec[] = [];
  tr.changes.iterChanges((fromA, _toA, fromB, _toB, inserted) => {
    const line = state.doc.lineAt(fromA);
    if (line.from !== cue?.from && !inHeading(state, line, fromA)) return;
    if (inNote(state, line, fromA)) return;
    let from = fromB;
    let text = inserted.line(1).text;
    let to = from + text.length;
    // The browser's diff of the text can hand over half of a surrogate pair, with the other half
    // already in the document. The pair is one character, so it is changed as one.
    if (from > 0 && isLowSurrogate(text.charCodeAt(0))) {
      const before = doc.sliceString(from - 1, from);
      if (isHighSurrogate(before.charCodeAt(0))) {
        from--;
        text = before + text;
      }
    }
    if (to < doc.length && isHighSurrogate(text.charCodeAt(text.length - 1))) {
      const after = doc.sliceString(to, to + 1);
      if (isLowSurrogate(after.charCodeAt(0))) {
        to++;
        text += after;
      }
    }
    const upper = text.toUpperCase();
    if (upper !== text) fixes.push({ from, to, insert: upper });
  });
  // The fixes follow the typing, in the new document's positions, and the typing itself (its
  // selection, effects, and user event) is kept. A cursor at the end of a letter that grows, such
  // as `ß` to `SS`, ends up after the new letters.
  return fixes.length ? [tr, { changes: fixes, sequential: true }] : tr;
});

/**
 * The input filters: upper-case typing in cue mode, and in a scene heading whose prefix matched
 * (technical design §2.5, rule 11), and the `@` of a cue the element bar began taken off when it
 * isn't needed. It brings the fields it reads, `parsedDoc`, `cueMode`, and `barCue`.
 */
export function fountainInput(): Extension {
  return [parsedDoc, cueMode, barCue, upperCaseTyping, dropBarCueMark];
}
