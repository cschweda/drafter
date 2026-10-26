import {
  EditorSelection,
  EditorState,
  type Extension,
  type StateCommand,
  Text,
  type Transaction,
} from '@codemirror/state';
import type { DecorationSet } from '@codemirror/view';
import { fountainDecorations, fountainInput, parsedDoc } from '@drafter/cm-fountain';

/** A range of positions in the editor's text: `from` inclusive, `to` exclusive. */
export interface Span {
  from: number;
  to: number;
}

/** One decoration read back from a set. A line decoration is empty: `from` equals `to`. */
export interface Found extends Span {
  class: string;
}

/** The byte-order mark, spelled out so no formatter turns it into an invisible literal. */
export const BOM = String.fromCharCode(0xfeff);

/** An editor state that holds the parse. */
export const stateOf = (doc: string, extensions: Extension[] = []) =>
  EditorState.create({ doc, extensions: [parsedDoc, ...extensions] });

/** Every decoration in a set, in document order. */
export function found(set: DecorationSet): Found[] {
  const out: Found[] = [];
  for (const cursor = set.iter(); cursor.value; cursor.next()) {
    out.push({ from: cursor.from, to: cursor.to, class: cursor.value.spec.class });
  }
  return out;
}

/** The decorations for the ranges given, or for the whole document when there are none. */
export const decorate = (
  state: EditorState,
  ranges: readonly Span[] = [{ from: 0, to: state.doc.length }],
): Found[] => found(fountainDecorations(state, ranges));

/** The line decorations of a whole document, each as `[the line's text, its class]`. */
export function lineClasses(doc: string): Array<[string, string]> {
  const state = stateOf(doc);
  return decorate(state)
    .filter((deco) => deco.from === deco.to)
    .map((deco) => [state.doc.lineAt(deco.from).text, deco.class]);
}

/** The text that each mark of a class covers in a whole document, in document order. */
export function marked(doc: string, cls: string): string[] {
  const state = stateOf(doc);
  return decorate(state)
    .filter((deco) => deco.from < deco.to && deco.class === cls)
    .map((deco) => state.sliceDoc(deco.from, deco.to));
}

/**
 * An editor state for the keymap and input tests, with the parse and the input filters.
 * `|` marks the cursor. Without one, `[` and `]` mark a selection, and without either the
 * cursor is at the end. The markers are left out of the text, and `\n` ends a line.
 */
export function editor(marked: string, extensions: Extension[] = []): EditorState {
  const bar = marked.indexOf('|');
  const open = marked.indexOf('[');
  const close = open === -1 ? -1 : marked.indexOf(']', open);
  let text = marked;
  let anchor = marked.length;
  let head = marked.length;
  if (bar !== -1) {
    text = marked.slice(0, bar) + marked.slice(bar + 1);
    anchor = bar;
    head = bar;
  } else if (close !== -1) {
    text = marked.slice(0, open) + marked.slice(open + 1, close) + marked.slice(close + 1);
    anchor = open;
    head = close - 1;
  }
  return EditorState.create({
    // A `Text`, so a state whose line separator is `\r\n` still gets the lines the `\n`s mark.
    doc: Text.of(text.split('\n')),
    selection: EditorSelection.single(anchor, head),
    extensions: [fountainInput(), ...extensions],
  });
}

/** The text of a state with the main selection marked as `editor` reads it. */
export function render(state: EditorState): string {
  const { from, to } = state.selection.main;
  const text = state.doc.toString();
  return from === to
    ? `${text.slice(0, from)}|${text.slice(from)}`
    : `${text.slice(0, from)}[${text.slice(from, to)}]${text.slice(to)}`;
}

/** What running a command did: whether it took the key, and the transactions it dispatched. */
export interface Pressed {
  handled: boolean;
  state: EditorState;
  transactions: Transaction[];
}

export function run(state: EditorState, command: StateCommand): Pressed {
  const transactions: Transaction[] = [];
  const handled = command({ state, dispatch: (tr) => transactions.push(tr) });
  return { handled, state: transactions.at(-1)?.state ?? state, transactions };
}

/** The state after a command, or the same state if it didn't take the key. */
export const apply = (state: EditorState, command: StateCommand): EditorState =>
  run(state, command).state;

/** The text and the cursor (the main selection's head) after a command. */
export function press(state: EditorState, command: StateCommand): [string, number] {
  const next = apply(state, command);
  return [next.sliceDoc(), next.selection.main.head];
}

interface TypeOptions {
  /** The user event of each transaction. Typing is `input.type`. */
  userEvent?: string;
  /**
   * What goes in each transaction: one code point, as the browser reports typing (the default);
   * one UTF-16 unit, which types the halves of a surrogate pair apart, as a text diff can hand
   * them over; or all of the text at once.
   */
  by?: 'point' | 'unit' | 'whole';
}

/** Types `text` into the main selection, the first piece replacing a selection. */
export function type(
  state: EditorState,
  text: string,
  { userEvent = 'input.type', by = 'point' }: TypeOptions = {},
): EditorState {
  const pieces = by === 'whole' ? [text] : by === 'unit' ? text.split('') : [...text];
  let next = state;
  for (const piece of pieces) {
    const { from, to } = next.selection.main;
    next = next.update({
      changes: { from, to, insert: piece },
      selection: { anchor: from + next.toText(piece).length },
      userEvent,
    }).state;
  }
  return next;
}
