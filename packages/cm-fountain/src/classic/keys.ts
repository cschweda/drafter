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
import { BOM, command } from '../keymap';
import { insideRegion, parsedDoc, regionAt } from '../state';
import { isBlankScript, visibleEnd, visibleStart } from './hidden';
import {
  BLANK_SPEECH,
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
import { markOf, NO_LINE, settleLine } from './marks';

// Enter and Tab in Classic Mode (design §6): where they go is in `NEXT`, and what they write on the
// way is in `WRITES`. Each key is one transaction with the user event `input`, and carries
// `classicEdit`, or the stored line is dropped, even by a key that wrote nothing. CodeMirror's own
// Tab focus mode needs nothing here: the view hands Tab to the browser before any keymap sees it.

/** On a transaction that moves the cursor and writes nothing. */
export const classicMove: AnnotationType<true> = Annotation.define<true>();

type Key = 'enter' | 'tab';

/** What every key reads about the cursor's line. */
export interface Here {
  state: EditorState;
  element: ClassicElement;
  line: Line;
  head: number;
}

/** The one cursor's place, or null where no key acts: a selection, several cursors, a blocked place, a note inside a line. */
export function hereIn(state: EditorState): Here | null {
  const element = elementAt(state);
  if (!element || element.tab === null) return null;
  const { head } = state.selection.main;
  if (insideRegion(state.field(parsedDoc), head)) return null;
  return { state, element, line: state.doc.lineAt(head), head };
}

/** A command that's Classic Mode's own, and says so when all it does is move the cursor. */
export const key = (spec: (state: EditorState) => TransactionSpec | null): StateCommand =>
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

export const isEmptyParens = ({ element, line }: Here) =>
  element.kind === 'parenthetical' && line.text.trim() === '()';

/** Whether text stands straight under a line. */
function textUnder({ doc }: EditorState, line: Line): boolean {
  return line.number < doc.lines && !isBlank(doc.line(line.number + 1).text);
}

/**
 * Takes an empty `()` away, keeping its line: pending Dialogue. What made the line stays made, and
 * with a speech under it the line is made here, so leaving it can't cut the speech.
 */
export function removeParens({ state, line }: Here): TransactionSpec {
  const from = line.from + line.text.indexOf('(');
  const made = state.field(classicLine)?.made;
  const kept = made && made.to - 2 > made.from ? { from: made.from, to: made.to - 2 } : null;
  const left = textUnder(state, line) ? { from: made?.from ?? line.from - 1, to: from } : kept;
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
  const soft = kind === 'action' && softAction(state);
  return setStored.of({ kind, chosen: isFirm(kind, by), soft, made });
}

const isFirm = (kind: ClassicKind, by: Key) =>
  (WRITES.firm[by] as readonly ClassicKind[]).includes(kind);

/** Whether a line is all notes or boneyard. Under a name the parser keeps them in the speech's block. */
function isAllNote(state: EditorState, line: Line): boolean {
  const doc = state.field(parsedDoc);
  const end = line.from + line.text.trimEnd().length;
  let at = line.from + line.text.length - line.text.trimStart().length;
  while (at < end) {
    // A region counts as holding `pos` only past its opening.
    const region = regionAt(doc, at + 1);
    if (!region) return false;
    at = region.span.to;
    while (at < end && /\s/.test(state.sliceDoc(at, at + 1))) at++;
  }
  return true;
}

/**
 * One break at `at`, and the cursor on the line it makes. Inside a speech that line cuts the speech
 * until a letter is typed on it, and leaving takes it away (§4.2's one exception).
 */
function openLine(state: EditorState, at: number, kind: ClassicKind, by: Key): TransactionSpec {
  return {
    changes: { from: at, insert: state.lineBreak },
    selection: { anchor: at + 1 },
    effects: arriving(state, kind, by, { from: at, to: at + 1 }),
  };
}

/**
 * A name's speech (§6.1): the first line under it that isn't a note. Or the last note under it,
 * which the speech to come goes below, or the name itself.
 */
function speechOf(state: EditorState, name: Line): { speech: Line | null; last: Line } {
  let last = name;
  for (let n = name.number + 1; n <= state.doc.lines; n++) {
    const under = state.doc.line(n);
    if (isBlank(under.text)) break;
    if (!isAllNote(state, under)) return { speech: under, last };
    last = under;
  }
  return { speech: null, last };
}

/** Goes from the end of the cursor's line to the element `kind` under it, writing what it needs. */
function onward(here: Here, kind: ClassicKind, by: Key): TransactionSpec {
  const { state, element } = here;
  const { doc, lineBreak } = state;
  let { line } = here;
  if (element.kind === 'character') {
    const { speech, last } = speechOf(state, line);
    if (speech) return { selection: { anchor: speech.to } };
    line = last;
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
    return openLine(state, line.to, kind, by);
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
  centered: 'centered',
  lyric: 'lyric',
  synopsis: 'synopsis',
  section: 'action',
  act: 'action',
};

/** Enter inside a line: the rest of it goes on as the next element, with the marks each part needs. */
function split({ state, element, line, head }: Here): TransactionSpec | null {
  const from = element.kind as ClassicKind;
  const kind = SPLITS[from];
  if (!kind) return null;
  const breaks = WRITES.by[kind] === 'break' ? 1 : 2;
  const insert = state.lineBreak.repeat(breaks);
  // An element that goes on as itself carries its own mark over, closing and opening.
  if (kind === from && kind !== 'action' && kind !== 'dialogue') {
    const [open, close] = markOf(kind, state.facet(elementStructure)()) ?? ['', ''];
    const between = close + insert + open;
    return {
      changes: { from: head, insert: between },
      selection: { anchor: head + close.length + breaks + open.length },
      effects: setStored.of({ kind }),
    };
  }
  const after = state.update({ changes: { from: head, insert }, filter: false }).state;
  const first = from === 'action' ? needed(after, after.doc.lineAt(line.from), from) : null;
  const rest = kind === 'action' ? needed(after, after.doc.lineAt(head + breaks), kind) : null;
  const changes: ChangeSpec[] = [{ from: head, insert: insert + (rest?.lead ?? '') }];
  const lead = first?.lead ?? '';
  const [mark] = first?.added ?? [];
  if (mark) changes.unshift({ from: mark.from, insert: lead });
  const anchor = head + lead.length + breaks + (rest?.lead.length ?? 0);
  const added = (rest?.added ?? []).map((span) => ({
    from: span.from + lead.length,
    to: span.to + lead.length,
  }));
  return { changes, selection: { anchor }, effects: setStored.of({ kind, added }) };
}

/** Enter at the visible start of a line: it goes down one, and is what it was. */
function pushDown({ state, element, line }: Here): TransactionSpec {
  const kind = element.kind as ClassicKind;
  const speech = (kind === 'dialogue' || kind === 'lyric') && underSpeech(state, line.from);
  if (speech) return openLine(state, line.from - 1, 'dialogue', 'enter');
  const from = line.from + (line.text.startsWith(BOM) ? 1 : 0);
  return {
    changes: { from, insert: state.lineBreak },
    selection: { anchor: visibleStart(state, line) + 1 },
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
  const { kind } = element;
  if (kind === 'parenthetical' || kind === 'page_break' || head >= visibleEnd(state, line)) {
    return onward(here, element.enter, 'enter');
  }
  if (head <= visibleStart(state, line)) return pushDown(here);
  return split(here);
});

/** Tab (§6): what comes next, from anywhere on the line, and it never splits it. */
export const classicTab: StateCommand = key((state) => {
  const { main } = state.selection;
  if (state.selection.ranges.length > 1) return null;
  const onBlank = isBlankScript(state, state.doc.lineAt(main.head));
  if (blocked(state, main.head) && !onBlank) return null;
  if (insideRegion(state.field(parsedDoc), main.head)) return null;
  if (!main.empty) return { selection: { anchor: main.to } };
  const here = hereIn(state);
  if (!here) return null;
  const { element } = here;
  const tab = element.tab as ClassicKind;
  if (isEmptyParens(here)) return removeParens(here);
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
    if (element.tab === 'parenthetical' && underSpeech(state, line.from)) return backOut(here);
    return {
      effects: setStored.of({ kind: rowBefore(state, element.kind as ClassicKind), chosen: true }),
    };
  }
  const above = elementAbove(state, line);
  // At the top it stays: Fountain's Shift+Tab would turn a name into action.
  return above ? { selection: { anchor: visibleEnd(state, above) } } : {};
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
    effects: setStored.of({
      kind: 'action',
      made: rest ? null : { from: at, to: at + 1 },
      madeMark: lead && !rest ? (added[0] as Span) : null,
    }),
  };
}

/** Shift+Enter where it isn't Enter: a break in Action or Dialogue, and two spaces on an empty speech line. */
const breakInside: StateCommand = key((state) => {
  const here = hereIn(state);
  if (!here) return null;
  const { element, line, head } = here;
  if (element.pending) {
    if (element.kind !== 'dialogue' || !underSpeech(state, line.from)) return null;
    // Text straight under would join the speech.
    if (textUnder(state, line)) return null;
    return {
      changes: { from: line.from, to: line.to, insert: BLANK_SPEECH },
      selection: { anchor: line.from + 2 },
      effects: setStored.of({ kind: 'dialogue', made: null }),
    };
  }
  if (head <= visibleStart(state, line)) return null;
  if (element.kind === 'action') return actionBreak(here);
  if (element.kind !== 'dialogue' || head < line.to || textUnder(state, line)) return null;
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
