import {
  type ChangeSpec,
  EditorSelection,
  type EditorState,
  type Line,
  type SelectionRange,
  type StateCommand,
  type TransactionSpec,
} from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';
import { type Block, blockAt, type CharacterSem, type Doc, parse } from '@drafter/fountain';
import { startCue } from './input';
import { insideRegion, parsedDoc } from './state';

// The keymap is a layer of conveniences over plain text editing (technical design §3.3). Every
// command is an ordinary transaction, so it is one undo step, and each reads its context from the
// parse in the state, `parsedDoc`, at the cursor and, for an empty line, the line above it.
//
// A command that finds nothing to do returns false, and the key is left to the browser. For Tab
// that matters most: a Tab that meant nothing but was taken anyway would trap the keyboard
// (WCAG 2.1.2).

/** What a command finds out about the main cursor, and the parse around it. */
interface Where {
  /** The main selection's head: the cursor, when nothing is selected. */
  head: number;
  line: Line;
  doc: Doc;
  /** The block that holds the cursor's line, if any block does: not on a blank line. */
  found: { block: Block; index: number } | null;
}

function where(state: EditorState): Where {
  const { head } = state.selection.main;
  const line = state.doc.lineAt(head);
  const doc = state.field(parsedDoc);
  return { head, line, doc, found: blockAt(doc, line.from) };
}

/**
 * Makes a command of a function that works out the transaction. Every change to the text is one
 * transaction, with the user event `input`, which is not `input.type`, so the history keeps it
 * apart from the typing around it. Nothing happens in a read-only editor.
 */
export function command(spec: (state: EditorState) => TransactionSpec | null): StateCommand {
  return ({ state, dispatch }) => {
    const found = state.readOnly ? null : spec(state);
    if (!found) return false;
    dispatch(state.update({ ...found, scrollIntoView: true, userEvent: 'input' }));
    return true;
  };
}

/** The byte-order mark, which `trim` counts as space and the editor does not. */
export const BOM = '\uFEFF';

const indentOf = (text: string) => text.length - text.trimStart().length;

/**
 * The index of the cue of the dialogue group that holds block `index`, or -1 when it holds none.
 * A group is a cue and the parentheticals, speech, and lyrics under it, and its blocks follow
 * each other with no blank line between them.
 */
export function cueIndex(blocks: readonly Block[], index: number): number {
  for (let i = index; i >= 0; i--) {
    const block = blocks[i] as Block;
    if (block.kind === 'character') return i;
    if (block.kind !== 'parenthetical' && block.kind !== 'dialogue' && block.kind !== 'lyric') {
      return -1;
    }
    const above = blocks[i - 1];
    if (!above || above.span.to + 1 !== block.span.from) return -1;
  }
  return -1;
}

/**
 * Whether the parser would read a line as a cue if a line of speech followed it (rule 12). A lone
 * cue is action to the parser, so a cue the writer has just typed can't be told from the parse of
 * the script alone. The parser decides here too, on the line by itself, so the rule is its own.
 */
export function readsAsCue(text: string): boolean {
  return parse(`${text}\nx`).blocks[0]?.kind === 'character';
}

// Enter ---------------------------------------------------------------------------------------

/**
 * Enter inserts the file's line break and nothing else: it never indents, since a line of
 * spaces changes how Fountain reads the lines around it (technical design §2.5). Two cases are
 * different, both only for a cursor with nothing selected:
 * - At the end of a scene heading or a transition, two breaks, as a heading is always followed
 *   by a blank line. In the middle of the line it is an ordinary break.
 * - Just before the `)` of a parenthetical, the cursor first moves past it.
 *
 * A selection is replaced by one break. Every cursor is handled, in one pass.
 */
export const fountainEnter: StateCommand = command((state) => {
  const doc = state.field(parsedDoc);
  const changes: ChangeSpec[] = [];
  const ranges: SelectionRange[] = [];
  // How much longer the text is before the next change; a line break is one position.
  let grown = 0;
  for (const range of state.selection.ranges) {
    let from = range.from;
    let breaks = 1;
    if (range.empty) {
      const line = state.doc.lineAt(range.head);
      const kind = blockAt(doc, line.from)?.block.kind;
      if ((kind === 'scene_heading' || kind === 'transition') && range.head === line.to) {
        breaks = 2;
      } else if (kind === 'parenthetical' && state.sliceDoc(range.head, line.to) === ')') {
        from = line.to;
      }
    }
    const to = Math.max(range.to, from);
    changes.push({ from, to, insert: state.lineBreak.repeat(breaks) });
    ranges.push(EditorSelection.cursor(from + grown + breaks));
    grown += breaks - (to - from);
  }
  return { changes, selection: EditorSelection.create(ranges, state.selection.mainIndex) };
});

// Tab and Shift-Tab ---------------------------------------------------------------------------

/**
 * Tab on an empty line. After a blank line, or at the top, it starts a cue: it inserts `@` and
 * turns on cue mode. Under a cue, a parenthetical, or a line of speech it opens a parenthetical,
 * with the cursor between the parentheses. Under anything else it has no meaning.
 */
function emptyLineTab(state: EditorState, here: Where): TransactionSpec | null {
  const { head, line, doc } = here;
  if (line.number > 1) {
    const above = state.doc.line(line.number - 1);
    const found = blockAt(doc, above.to);
    if (found) {
      const { block, index } = found;
      const inSpeech = cueIndex(doc.blocks, index) >= 0;
      // A cue just typed has no speech yet, so the parser reads it as action: it counts if it
      // would be a cue with a line under it.
      const loneCue = block.kind === 'action' && block.lines.length === 1 && readsAsCue(above.text);
      if (!inSpeech && !loneCue) return null;
      return { changes: { from: head, insert: '()' }, selection: { anchor: head + 1 } };
    }
    // Under the last line of the title page there is no blank line yet, so no cue.
    if (doc.titlePage && above.to <= doc.titlePage.span.to) return null;
  }
  return {
    changes: { from: head, insert: '@' },
    selection: { anchor: head + 1 },
    effects: startCue.of(null),
  };
}

/** The extensions Tab cycles through on a cue, after none. Any other extension is left alone. */
const CYCLE = ['(V.O.)', '(O.S.)'];

/**
 * Tab on a cue: none, then `(V.O.)`, then `(O.S.)`, then none again. The extension goes before a
 * dual cue's `^`, and comes out together with the space in front of it. (`(CONT'D)` is not in the
 * cycle: the layout adds it, technical design §5.4.)
 */
function cycleExtension(
  state: EditorState,
  here: Where,
  sem: CharacterSem,
): TransactionSpec | null {
  const { head, line } = here;
  const { text } = line;
  const { extension } = sem;
  let change: { from: number; to: number; insert: string };
  if (extension === null) {
    const nameEnd = sem.dual ? text.lastIndexOf('^') : text.length;
    if (nameEnd < 0) return null;
    const at = line.from + text.slice(0, nameEnd).trimEnd().length;
    change = { from: at, to: at, insert: ` ${CYCLE[0]}` };
  } else {
    const start = text.indexOf(extension);
    const place = CYCLE.indexOf(extension);
    if (start < 0 || place < 0) return null;
    const from = line.from + start;
    const to = from + extension.length;
    if (CYCLE[place + 1]) {
      change = { from, to, insert: CYCLE[place + 1] as string };
    } else {
      const space = start - text.slice(0, start).trimEnd().length;
      change = { from: from - space, to, insert: '' };
    }
  }
  // The cursor keeps its place in the text, and goes after an extension added at the cursor.
  return { changes: change, selection: { anchor: state.changes(change).mapPos(head, 1) } };
}

/**
 * Converts an action line to a cue: upper-cases it and puts `@` before it, in place of the `!` of
 * forced action. It changes case, so it is a command of its own and never done silently. The
 * cursor keeps its distance from the end of the line.
 */
function toCharacter(here: Where): TransactionSpec | null {
  const { head, line, found } = here;
  const { text } = line;
  if (found?.block.kind !== 'action' || text.trim() === '') return null;
  const indent = indentOf(text);
  const insert = `@${text.slice(indent + (text.startsWith('!', indent) ? 1 : 0)).toUpperCase()}`;
  const from = line.from + indent;
  return {
    changes: { from, to: line.to, insert },
    selection: { anchor: Math.max(from + 1, from + insert.length - (line.to - head)) },
  };
}

/**
 * Converts a cue to action: takes off the `@` and lower-cases all but the first letter, so
 * `@MARGARET (V.O.)` is `Margaret (v.o.)`. A name that has no lower case to give, such as `Q`,
 * would still be a cue, so the line gets a `!`.
 */
function toAction(here: Where): TransactionSpec | null {
  const { head, line, found } = here;
  const block = found?.block;
  if (block?.kind !== 'character' || line.from !== block.span.from) return null;
  const { text } = line;
  const indent = indentOf(text);
  const afterMarker = text.slice(indent + (text.startsWith('@', indent) ? 1 : 0));
  const gap = afterMarker.length - afterMarker.trimStart().length;
  const name = afterMarker.slice(gap);
  const first = name ? String.fromCodePoint(name.codePointAt(0) as number) : '';
  const lowered = afterMarker.slice(0, gap) + first + name.slice(first.length).toLowerCase();
  const bang = readsAsCue(lowered) ? '!' : '';
  const from = line.from + indent;
  const end = from + bang.length + lowered.length;
  return {
    changes: { from, to: line.to, insert: bang + lowered },
    selection: { anchor: Math.max(from + bang.length, end - (line.to - head)) },
  };
}

/** The keys that move the caret, not a selection or several carets: Tab means nothing for those. */
const atCaret = (state: EditorState) =>
  state.selection.ranges.length === 1 && state.selection.main.empty;

/**
 * Tab, by what the table of technical design §3.3 says for the cursor's line:
 * - on an empty line, `@` and cue mode after a blank line, or `()` inside a speech;
 * - on a cue, the next extension;
 * - on action with text, `convertToCharacter`.
 *
 * Anywhere else Tab has no meaning, and the command gives it back so it can move focus.
 */
export const fountainTab: StateCommand = command((state) => {
  if (!atCaret(state)) return null;
  const here = where(state);
  const { head, line, doc, found } = here;
  if (insideRegion(doc, head)) return null;
  if (line.length === 0) return found ? null : emptyLineTab(state, here);
  const block = found?.block;
  if (block?.kind === 'character' && line.from === block.span.from) {
    // A cue with no name yet, such as the `@` a first Tab left, has nothing to give an extension to.
    return block.sem.name ? cycleExtension(state, here, block.sem) : null;
  }
  return toCharacter(here);
});

/** Shift-Tab on a cue converts it to action (`convertToAction`), and has no meaning elsewhere. */
export const fountainShiftTab: StateCommand = command((state) => {
  if (!atCaret(state)) return null;
  const here = where(state);
  return insideRegion(here.doc, here.head) ? null : toAction(here);
});

/** Converts the action line at the cursor to a cue: upper-case, with an `@`. */
export const convertToCharacter: StateCommand = command((state) => toCharacter(where(state)));

/** Converts the cue at the cursor to action: no `@`, and lower-case but for the first letter. */
export const convertToAction: StateCommand = command((state) => toAction(where(state)));

// Forcing a kind ------------------------------------------------------------------------------

/** The kinds `forceKind` can force, in the order of Mod-Alt-1 to 7. */
const FORCED_KINDS = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'transition',
  'centered',
  'lyric',
] as const;

export type ForcedKind = (typeof FORCED_KINDS)[number];

/** What each kind puts before and after a line's text. */
const MARKERS: Record<ForcedKind, readonly [open: string, close: string]> = {
  scene_heading: ['.', ''],
  action: ['!', ''],
  character: ['@', ''],
  parenthetical: ['(', ')'],
  transition: ['>', ''],
  centered: ['>', '<'],
  lyric: ['~', ''],
};

/** Whether `(` at the start of the text is closed by the `)` at its end and by no other. */
function isOneGroup(text: string): boolean {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0 && i < text.length - 1) return false;
  }
  return depth === 0;
}

/**
 * A line without its marker or wrapper: the text, trimmed, and where it starts in the line. The
 * markers are the ones the parser reads at the start of a line, `!`, `@`, `~`, `>`, and `.` before
 * a letter or digit, and the wrappers are `>…<` and a `(…)` that is one group.
 */
export function unmarked(line: string): { start: number; body: string } {
  const text = line.trim();
  const lead = indentOf(line);
  let open = 0;
  let inner = text;
  if (text.length >= 2 && text.startsWith('>') && text.endsWith('<')) {
    open = 1;
    inner = text.slice(1, -1);
  } else if (text.length >= 2 && text.startsWith('(') && text.endsWith(')') && isOneGroup(text)) {
    open = 1;
    inner = text.slice(1, -1);
  } else if (/^[!@~>]/.test(text) || /^\.[\p{L}\p{N}]/u.test(text)) {
    open = 1;
    inner = text.slice(1);
  }
  return { start: lead + open + indentOf(inner), body: inner.trim() };
}

/**
 * Forces the kind of the line at the cursor with its marker, `.` for a heading, `!` for action,
 * `@` for a cue, `>` for a transition, and `~` for a lyric, or by wrapping its text, in `(…)` for
 * a parenthetical and `>…<` for centered text. A marker or wrapper the line has is replaced, and
 * the spaces around the text go with it. Case is never changed.
 */
export function forceKind(kind: ForcedKind): StateCommand {
  return command((state) => {
    const { head } = state.selection.main;
    const line = state.doc.lineAt(head);
    // A byte-order mark at the start of the file is no part of the line's text, and stays.
    const bom = line.text.startsWith(BOM) ? 1 : 0;
    const text = line.text.slice(bom);
    const from = line.from + bom;
    const { start, body } = unmarked(text);
    const [open, close] = MARKERS[kind];
    const insert = open + body + close;
    if (insert === text) return {};
    // The cursor keeps its place in the text; from a marker or spaces it goes to the text's start.
    const offset = Math.min(Math.max(head - from - start, 0), body.length);
    return {
      changes: { from, to: line.to, insert },
      selection: { anchor: from + open.length + offset },
    };
  });
}

// Dual dialogue and wrapping ------------------------------------------------------------------

/**
 * In a dialogue group, adds `^` to the cue line to make the speech dual dialogue, or takes it off
 * when it is there. The cursor can be anywhere in the group.
 */
export const toggleDual: StateCommand = command((state) => {
  const { doc, found } = where(state);
  if (!found) return null;
  const cue = doc.blocks[cueIndex(doc.blocks, found.index)];
  if (cue?.kind !== 'character') return null;
  const line = state.doc.lineAt(cue.span.from);
  const { text } = line;
  if (cue.sem.dual) {
    const caret = text.lastIndexOf('^');
    if (caret < 0) return null;
    return {
      changes: {
        from: line.from + text.slice(0, caret).trimEnd().length,
        to: line.from + caret + 1,
      },
    };
  }
  return { changes: { from: line.from + text.trimEnd().length, insert: ' ^' } };
});

/**
 * Wraps each selection in `open` and `close`, keeping it selected. With nothing selected it
 * inserts the empty pair, with the cursor inside.
 */
function wrap(open: string, close: string): StateCommand {
  return command((state) => {
    const changes: ChangeSpec[] = [];
    const ranges: SelectionRange[] = [];
    let grown = 0;
    for (const range of state.selection.ranges) {
      if (range.empty) {
        changes.push({ from: range.from, insert: open + close });
        ranges.push(EditorSelection.cursor(range.from + grown + open.length));
      } else {
        changes.push({ from: range.from, insert: open }, { from: range.to, insert: close });
        const shift = grown + open.length;
        ranges.push(EditorSelection.range(range.anchor + shift, range.head + shift));
      }
      grown += open.length + close.length;
    }
    return { changes, selection: EditorSelection.create(ranges, state.selection.mainIndex) };
  });
}

/** Wraps the selection in `[[ ]]`, a note. */
export const wrapInNote: StateCommand = wrap('[[', ']]');

/** Wraps the selection in `/* *\/`, a boneyard. */
export const wrapInBoneyard: StateCommand = wrap('/*', '*/');

/** Wraps the selection in `**`, bold. No key: the element bar and the palette run it. */
export const wrapInBold: StateCommand = wrap('**', '**');

/** Wraps the selection in `*`, italic. */
export const wrapInItalic: StateCommand = wrap('*', '*');

/** Wraps the selection in `_`, underlined. */
export const wrapInUnderline: StateCommand = wrap('_', '_');

/**
 * Enter, Tab, Shift-Tab, Mod-Alt-1…7 to force a kind, Mod-Shift-d, Mod-/, and Mod-Shift-/. Save
 * keys belong to the app. No binding sets `preventDefault`, so a command that returns false
 * leaves its key to the browser.
 */
export const fountainKeymap: readonly KeyBinding[] = [
  { key: 'Enter', run: fountainEnter },
  { key: 'Tab', run: fountainTab },
  { key: 'Shift-Tab', run: fountainShiftTab },
  ...FORCED_KINDS.map((kind, i) => ({ key: `Mod-Alt-${i + 1}`, run: forceKind(kind) })),
  { key: 'Mod-Shift-d', run: toggleDual },
  { key: 'Mod-/', run: wrapInNote },
  { key: 'Mod-Shift-/', run: wrapInBoneyard },
];
