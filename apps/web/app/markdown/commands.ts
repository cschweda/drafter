import { syntaxTree } from '@codemirror/language';
import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type SelectionRange,
  type StateCommand,
  type TransactionSpec,
} from '@codemirror/state';

// The element bar's Markdown buttons (docs/drafter-element-bar-design.md §5): Heading, Bold,
// Italic, List, Numbered, Quote, Link, and Code. Each is one transaction, so one undo step, with
// the user event `input`, and none acts in a read-only editor. The line marks act on each line of
// a selection (or the cursor's line) and come off again when every line has them; the inline marks
// wrap the selection, or put the cursor between an empty pair.

export type MarkdownAction =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'list'
  | 'numbered'
  | 'quote'
  | 'link'
  | 'code';

function command(spec: (state: EditorState) => TransactionSpec | null): StateCommand {
  return ({ state, dispatch }) => {
    const found = state.readOnly ? null : spec(state);
    if (!found) return false;
    dispatch(state.update({ ...found, scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

/** The lines the main selection touches; a selection of whole lines doesn't take the next one. */
function selectedLines(state: EditorState): Line[] {
  const { from, to } = state.selection.main;
  const first = state.doc.lineAt(from);
  let last = state.doc.lineAt(to);
  if (last.number > first.number && to === last.from) last = state.doc.line(last.number - 1);
  const lines: Line[] = [];
  for (let n = first.number; n <= last.number; n++) lines.push(state.doc.line(n));
  return lines;
}

const HEADING = /^(#{1,6})[ \t]+/;
const BULLET = /^[-*+][ \t]+/;
const NUMBER = /^\d{1,9}[.)][ \t]+/;
const QUOTE = /^>[ \t]?/;

/** The length of the line's own mark, of any of the kinds a line mark replaces. */
const markLength = (text: string, marks: readonly RegExp[]) => {
  for (const mark of marks) {
    const found = mark.exec(text);
    if (found) return found[0].length;
  }
  return 0;
};

type LineChange = { from: number; to: number; insert: string };

/**
 * The transaction that changes each selected line (each with text, when there are several), by
 * `next(line, index)` with its index among them, and keeps the selection on the same text: a
 * cursor goes after what is put in before it.
 */
function changeLines(
  state: EditorState,
  lines: readonly Line[],
  next: (line: Line, index: number) => LineChange,
): TransactionSpec {
  const set = state.changes(lines.map((line, index) => next(line, index)));
  // A selection widens to take in what goes in at its edges, so it still covers its lines.
  const ranges = state.selection.ranges.map((range: SelectionRange) => {
    if (range.empty) return EditorSelection.cursor(set.mapPos(range.head, 1));
    const forward = range.head > range.anchor;
    return EditorSelection.range(
      set.mapPos(range.anchor, forward ? -1 : 1),
      set.mapPos(range.head, forward ? 1 : -1),
    );
  });
  return { changes: set, selection: EditorSelection.create(ranges, state.selection.mainIndex) };
}

/** The selected lines a line mark acts on: the cursor's line, or each with text. */
function markedLines(state: EditorState): Line[] {
  const lines = selectedLines(state);
  return lines.length === 1 ? lines : lines.filter((line) => line.text.trim() !== '');
}

/** A line mark that every line gets, or that comes off when every line has it. */
function toggleLines(has: RegExp, replaces: readonly RegExp[], mark: (index: number) => string) {
  return command((state) => {
    const lines = markedLines(state);
    const off = lines.every((line) => has.test(line.text));
    return changeLines(state, lines, (line, index) => ({
      from: line.from,
      to: line.from + markLength(line.text, off ? [has] : replaces),
      insert: off ? '' : mark(index),
    }));
  });
}

const LINE_MARKS = [HEADING, BULLET, NUMBER, QUOTE];

/** A heading one level deeper, to the third, and then a paragraph again. */
const heading = command((state) =>
  changeLines(state, markedLines(state), (line) => {
    const found = HEADING.exec(line.text);
    const level = found ? (found[1] as string).length : 0;
    const insert = level >= 3 ? '' : `${'#'.repeat(level + 1)} `;
    return { from: line.from, to: line.from + markLength(line.text, LINE_MARKS), insert };
  }),
);

/** Wraps each selection in `open` and `close`, keeping it selected, or inserts the empty pair. */
function wrap(open: string, close: string): StateCommand {
  return command((state) => {
    const changes: ChangeSpec[] = [];
    const ranges: SelectionRange[] = [];
    let grown = 0;
    for (const range of state.selection.ranges) {
      changes.push({ from: range.from, insert: open }, { from: range.to, insert: close });
      if (range.empty) ranges.push(EditorSelection.cursor(range.from + grown + open.length));
      else {
        const shift = grown + open.length;
        ranges.push(EditorSelection.range(range.anchor + shift, range.head + shift));
      }
      grown += open.length + close.length;
    }
    return { changes, selection: EditorSelection.create(ranges, state.selection.mainIndex) };
  });
}

/** `[text](…)` with the cursor where the address goes, or `[…]()` with it where the text goes. */
const link = command((state) => {
  const { from, to } = state.selection.main;
  const text = state.sliceDoc(from, to);
  const insert = `[${text}]()`;
  const cursor = from + (text ? text.length + 3 : 1);
  return { changes: { from, to, insert }, selection: { anchor: cursor } };
});

/** What each Markdown button runs. */
export const MARKDOWN_COMMANDS: Record<MarkdownAction, StateCommand> = {
  heading,
  bold: wrap('**', '**'),
  italic: wrap('*', '*'),
  list: toggleLines(BULLET, LINE_MARKS, () => '- '),
  numbered: toggleLines(NUMBER, LINE_MARKS, (index) => `${index + 1}. `),
  quote: toggleLines(QUOTE, [QUOTE], () => '> '),
  link,
  code: wrap('`', '`'),
};

/**
 * The element of the cursor's line in a Markdown document, in words ("Heading 2", "List item"),
 * from the Markdown grammar's tree; null on a blank line, or before the grammar has loaded.
 */
export function markdownElement(state: EditorState): string | null {
  const line = state.doc.lineAt(state.selection.main.head);
  if (line.text.trim() === '') return null;
  let paragraph = false;
  const start = line.from + (line.text.length - line.text.trimStart().length);
  for (
    let node: ReturnType<typeof syntaxTree>['topNode'] | null = syntaxTree(state).resolveInner(
      start,
      1,
    );
    node;
    node = node.parent
  ) {
    const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(node.name);
    if (heading) return `Heading ${heading[1]}`;
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') return 'Code block';
    if (node.name === 'ListItem') {
      return node.parent?.name === 'OrderedList' ? 'Numbered list item' : 'List item';
    }
    if (node.name === 'Blockquote') return 'Quote';
    if (node.name === 'Paragraph') paragraph = true;
  }
  return paragraph ? 'Paragraph' : null;
}
