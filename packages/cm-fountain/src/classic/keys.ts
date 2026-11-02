import {
  Annotation,
  type AnnotationType,
  type ChangeSpec,
  type EditorState,
  type Line,
  type StateCommand,
  type TransactionSpec,
} from '@codemirror/state';
import type { Span } from '@drafter/fountain';
import { blocked, elementStructure, isBlank, underSpeech } from '../elements';
import { command } from '../keymap';
import {
  type ClassicElement,
  type ClassicKind,
  classicEdit,
  classicLine,
  elementAt,
  lineKindAt,
  NEXT,
  setStored,
  WRITES,
} from './line';
import { NO_LINE, settleLine } from './marks';

// Enter and Tab in Classic Mode (design §6): where they go is in `NEXT`, and what they write on the
// way is in `WRITES`. Each key is one transaction with the user event `input`, and carries
// `classicEdit`, or the stored line is dropped, even by a key that wrote nothing. CodeMirror's own
// Tab focus mode needs nothing here: the view hands Tab to the browser before any keymap sees it.

/** On a transaction that moves the cursor and writes nothing. */
export const classicMove: AnnotationType<true> = Annotation.define<true>();

type Key = 'enter' | 'tab';

/** What every key reads about the cursor's line. */
interface Here {
  state: EditorState;
  element: ClassicElement;
  line: Line;
  head: number;
}

/** The one cursor's place, or null where no key acts: a selection, several cursors, a blocked place. */
function hereIn(state: EditorState): Here | null {
  const element = elementAt(state);
  if (!element || element.tab === null) return null;
  const { head } = state.selection.main;
  return { state, element, line: state.doc.lineAt(head), head };
}

/** A command that's Classic Mode's own, and says so when all it does is move the cursor. */
const key = (spec: (state: EditorState) => TransactionSpec | null): StateCommand =>
  command((state) => {
    const found = spec(state);
    if (!found) return null;
    const moved = found.selection && !found.changes;
    return {
      ...found,
      annotations: moved ? [classicEdit.of(true), classicMove.of(true)] : classicEdit.of(true),
    };
  });

/** Whether a template has soft Action: a stage direction is always firm (§4.2). */
const softAction = (state: EditorState) => state.facet(elementStructure)().headings;

/** Where the words of a line end: before Centered's hidden `<`. Task 5's `visibleEnd` replaces this. */
function visibleEnd({ from, to, text }: Line): number {
  const trimmed = text.trimEnd();
  return trimmed.trimStart().startsWith('>') && trimmed.endsWith('<')
    ? from + trimmed.length - 1
    : to;
}

const isEmptyParens = ({ element, line }: Here) =>
  element.kind === 'parenthetical' && line.text.trim() === '()';

/** Takes an empty `()` away, keeping its line: pending Dialogue. What made the line stays made. */
function removeParens({ state, line }: Here): TransactionSpec {
  const from = line.from + line.text.indexOf('(');
  const made = state.field(classicLine)?.made;
  const left = made && made.to - 2 > made.from ? { from: made.from, to: made.to - 2 } : null;
  return {
    changes: { from, to: from + 2 },
    selection: { anchor: from },
    effects: setStored.of({ kind: 'dialogue', made: left }),
  };
}

/** Writes `()` on the cursor's empty line, the cursor inside. */
function writeParens({ state, head }: Here): TransactionSpec {
  const from = state.field(classicLine)?.made?.from ?? head;
  return {
    changes: { from: head, insert: '()' },
    selection: { anchor: head + 1 },
    effects: setStored.of({ kind: 'parenthetical', made: { from, to: head + 2 } }),
  };
}

/** The blank lines under a line, up to the three a key could want, and whether text comes after them. */
function blanksBelow({ doc }: EditorState, line: Line): { blanks: number; text: boolean } {
  let blanks = 0;
  for (let n = line.number + 1; n <= doc.lines; n++) {
    if (!isBlank(doc.line(n).text)) return { blanks, text: true };
    if (++blanks === 3) break;
  }
  return { blanks, text: blanks === 3 };
}

/**
 * The stored line for an element arrived at. An element Enter can't work out for itself, and Tab's
 * Character, is one the writer chose; the rest are what a click on the same empty line would find.
 */
function arriving(state: EditorState, kind: ClassicKind, by: Key, made: Span | null) {
  const chosen = (WRITES.firm[by] as readonly ClassicKind[]).includes(kind);
  const soft = kind === 'action' && softAction(state);
  return setStored.of({ kind, chosen, soft, made });
}

/** Goes from the end of the cursor's line to the element `kind` under it, writing what it needs. */
function onward(here: Here, kind: ClassicKind, by: Key): TransactionSpec {
  const { state, element, line } = here;
  const { doc, lineBreak } = state;
  const under = line.number < doc.lines ? doc.line(line.number + 1) : null;
  // A name with its speech under it goes into the speech.
  if (element.kind === 'character' && under && !isBlank(under.text)) {
    return { selection: { anchor: under.to } };
  }
  const writes = WRITES.by[kind];
  if (writes === 'parens') {
    return {
      changes: { from: line.to, insert: `${lineBreak}()` },
      selection: { anchor: line.to + 2 },
      effects: setStored.of({
        kind: 'parenthetical',
        made: { from: line.to, to: line.to + 3 },
      }),
    };
  }
  if (writes === 'break') {
    return {
      changes: { from: line.to, insert: lineBreak },
      selection: { anchor: line.to + 1 },
      effects: arriving(state, kind, by, { from: line.to, to: line.to + 1 }),
    };
  }
  // One blank line above and below the new one, and never a second: blank lines there already count.
  const { blanks, text } = blanksBelow(state, line);
  const breaks = Math.max(0, (text ? 3 : 2) - blanks);
  if (breaks === 0) {
    return {
      selection: { anchor: doc.line(line.number + 2).from },
      effects: arriving(state, kind, by, null),
    };
  }
  return {
    changes: { from: line.to, insert: lineBreak.repeat(breaks) },
    selection: { anchor: line.to + 2 },
    effects: arriving(state, kind, by, { from: line.to, to: line.to + breaks }),
  };
}

/** What a line needs for `kind` in `state`: the mark that goes at its start, and where it is. */
function needed(state: EditorState, line: Line, kind: ClassicKind) {
  const own = { ...NO_LINE, from: line.from, kind, arrivedAs: kind };
  const { text, added } = settleLine(state, line, line.text, own);
  const [mark] = added;
  return { added, lead: mark ? text.slice(mark.from - line.from, mark.to - line.from) : '' };
}

/** The element the second part of a line is, when Enter splits it (§6.3). */
const SPLITS: Partial<Record<ClassicKind, ClassicKind>> = {
  action: 'action',
  scene_heading: 'action',
  transition: 'action',
  dialogue: 'dialogue',
  character: 'dialogue',
};

/** Enter inside a line: the rest of it goes on as the next element, with the mark it needs. */
function split({ state, element, head }: Here): TransactionSpec | null {
  const kind = SPLITS[element.kind as ClassicKind];
  if (!kind) return null;
  const breaks = WRITES.by[kind] === 'break' ? 1 : 2;
  const insert = state.lineBreak.repeat(breaks);
  const after = state.update({ changes: { from: head, insert }, filter: false }).state;
  const { added, lead } =
    kind === 'action'
      ? needed(after, after.doc.lineAt(head + breaks), kind)
      : { added: [], lead: '' };
  return {
    changes: { from: head, insert: insert + lead },
    selection: { anchor: head + breaks + lead.length },
    effects: setStored.of({ kind, added }),
  };
}

/**
 * Enter (§6): to the next element from the end of a line, and a split inside one. A parenthetical
 * goes past its `)` from anywhere. With a selection or several cursors it's Fountain's.
 */
export const classicEnter: StateCommand = key((state) => {
  const here = hereIn(state);
  if (!here) return null;
  const { element, line, head } = here;
  if (isEmptyParens(here)) return removeParens(here);
  // Task 9 opens the chooser here.
  if (element.pending || element.enter === null || element.enter === 'chooser') return {};
  if (element.kind === 'parenthetical' || head >= visibleEnd(line)) {
    return onward(here, element.enter, 'enter');
  }
  // Nothing to split off: the line goes down one, and is what it was.
  if (state.sliceDoc(line.from, head).trim() === '') {
    return { changes: { from: head, insert: state.lineBreak }, selection: { anchor: head + 1 } };
  }
  return split(here);
});

/** Tab (§6): what comes next, from anywhere on the line, and it never splits it. */
export const classicTab: StateCommand = key((state) => {
  const { main } = state.selection;
  if (state.selection.ranges.length > 1 || blocked(state, main.head)) return null;
  if (!main.empty) return { selection: { anchor: main.to } };
  const here = hereIn(state);
  if (!here) return null;
  const { element } = here;
  const { tab } = element;
  if (isEmptyParens(here)) return removeParens(here);
  if (tab === null) return null;
  if (!element.pending) return onward(here, tab, 'tab');
  if (tab === 'parenthetical') return writeParens(here);
  return { effects: setStored.of({ kind: tab, chosen: true }) };
});

/** The element before `kind` in the empty line's row. */
function rowBefore(state: EditorState, kind: ClassicKind): ClassicKind {
  const row: readonly ClassicKind[] = softAction(state) ? NEXT.row.screenplay : NEXT.row.play;
  return row[(Math.max(row.indexOf(kind), 0) + row.length - 1) % row.length] as ClassicKind;
}

/** Off pending Dialogue to the end of the line above, taking the empty line with it. */
function backOut({ state, line }: Here): TransactionSpec {
  const { doc } = state;
  const above = doc.line(line.number - 1);
  const under = line.number < doc.lines ? doc.line(line.number + 1) : null;
  const kind = lineKindAt(state, above);
  return {
    // A line straight under would join the speech, so the blank line stays.
    ...(under && !isBlank(under.text) ? null : { changes: { from: above.to, to: line.to } }),
    selection: { anchor: above.to },
    effects: kind ? setStored.of({ from: above.from, kind }) : [],
  };
}

/** The nearest line above with an element on it. */
function elementAbove(state: EditorState, line: Line): Line | null {
  const { doc } = state;
  for (let n = line.number - 1; n >= 1; n--) {
    const above = doc.line(n);
    if (!isBlank(above.text) && !blocked(state, above.from)) return above;
  }
  return null;
}

/** Shift+Tab (§6.2, §6.4): back along the row, or to the end of the element above. */
export const classicShiftTab: StateCommand = key((state) => {
  const here = hereIn(state);
  if (!here) return null;
  const { element, line } = here;
  if (isEmptyParens(here)) return removeParens(here);
  if (element.pending) {
    if (element.kind === 'dialogue' && underSpeech(state, line.from)) return backOut(here);
    return {
      effects: setStored.of({ kind: rowBefore(state, element.kind as ClassicKind), chosen: true }),
    };
  }
  const above = elementAbove(state, line);
  // At the top it stays: Fountain's Shift+Tab would turn a name into action.
  return above ? { selection: { anchor: visibleEnd(above) } } : {};
});

/** A break inside Action, with the `!` the line above it needs once a line follows (§4.2). */
function actionBreak({ state, line, head }: Here): TransactionSpec {
  const { lineBreak } = state;
  const rest = state.sliceDoc(head, line.to);
  const follows = rest.trim() ? lineBreak : `${lineBreak}x`;
  const after = state.update({ changes: { from: head, insert: follows }, filter: false }).state;
  const { added, lead } = needed(after, after.doc.lineAt(line.from), 'action');
  const changes: ChangeSpec[] = [{ from: head, insert: lineBreak }];
  if (lead) changes.unshift({ from: (added[0] as Span).from, insert: lead });
  const at = head + lead.length;
  return {
    changes,
    selection: { anchor: at + 1 },
    effects: setStored.of({ kind: 'action', made: rest ? null : { from: at, to: at + 1 } }),
  };
}

/** Shift+Enter where it isn't Enter: a break in Action or Dialogue, and two spaces on an empty speech line. */
const breakInside: StateCommand = key((state) => {
  const here = hereIn(state);
  if (!here) return null;
  const { element, line, head } = here;
  if (element.pending) {
    if (element.kind !== 'dialogue' || !underSpeech(state, line.from)) return null;
    return {
      changes: { from: line.from, to: line.to, insert: '  ' },
      selection: { anchor: line.from + 2 },
      effects: setStored.of({ kind: 'dialogue', made: null }),
    };
  }
  if (state.sliceDoc(line.from, head).trim() === '') return null;
  if (element.kind === 'action') return actionBreak(here);
  if (element.kind !== 'dialogue' || head < line.to) return null;
  return {
    changes: { from: head, insert: state.lineBreak },
    selection: { anchor: head + 1 },
    effects: setStored.of({ kind: 'dialogue', made: { from: head, to: head + 1 } }),
  };
});

/** Shift+Enter (§6.4): a break inside the element, and elsewhere what Enter does. */
export const classicShiftEnter: StateCommand = (target) =>
  breakInside(target) || classicEnter(target);

/** Sets `kind` as the pending element of an empty line, writing nothing. */
export const choosePending = (kind: ClassicKind): StateCommand =>
  key((state) =>
    hereIn(state)?.element.pending ? { effects: setStored.of({ kind, chosen: true }) } : null,
  );
