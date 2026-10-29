import {
  type ChangeDesc,
  type EditorState,
  type Extension,
  type Range,
  RangeSet,
  RangeValue,
  StateEffect,
  StateField,
  type Transaction,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

// The spelling marks (Phase 2 design §12; Plan D, Calls 5 and 17). The worker checks the text
// after a pause and the app hands its misspellings over with `setSpellMarks`; between checks the
// marks move with the text. A mark an edit touches is dropped, since the word under it is being
// retyped and the next check says whether it is still wrong. Mapping is all a keystroke costs:
// RangeSet's own map, then a filter over the changed ranges only. The marks are not lint
// diagnostics, and live outside `fountain()`, so a Markdown document has them too.

export interface SpellMark {
  from: number;
  to: number;
  word: string;
}

/**
 * Replaces every mark. Positions are in the state the transaction makes. A word `unmarkWord`
 * unmarked since the last of these stays unmarked: this answer may be to a check sent before the
 * word was added to a dictionary.
 */
export const setSpellMarks = StateEffect.define<readonly SpellMark[]>();
/** Unmarks every mark of this word, whatever its case. */
export const unmarkWord = StateEffect.define<string>();
/**
 * Puts these marks back (an undo of `unmarkWord`), all but an ignored one; mapped through the
 * edits made since, as the history does.
 */
export const restoreSpellMarks = StateEffect.define<readonly SpellMark[]>({
  map: (marks, changes) => mapSpellMarks(marks, changes),
});
/** Hides the mark at this range for the visit; an edit that touches the range ends that. */
export const ignoreHere = StateEffect.define<{ from: number; to: number }>();

/** One mark's decoration, which carries its word. */
const markOf = (word: string) =>
  Decoration.mark({
    class: 'cm-misspelled',
    attributes: { 'aria-invalid': 'spelling' },
    word,
  });

/** A range Ignore here hides. */
class Ignored extends RangeValue {}
const IGNORED = new Ignored();

interface SpellValue {
  marks: DecorationSet;
  ignored: RangeSet<Ignored>;
  /** Lowercased: the words unmarked since the last `setSpellMarks`. */
  unmarked: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();

/** Whether [from, to] and [a, b] overlap or touch. */
const touches = (from: number, to: number, a: number, b: number) => from <= b && to >= a;

/** `set` mapped through `changes`, without the ranges a change touches. */
function mapDropping<T extends RangeValue>(set: RangeSet<T>, changes: ChangeDesc): RangeSet<T> {
  if (set.size === 0) return set;
  let mapped = set.map(changes);
  changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    mapped = mapped.update({
      filter: (from, to) => !touches(from, to, fromB, toB),
      filterFrom: fromB,
      filterTo: toB,
    });
  });
  return mapped;
}

const isIgnored = (ignored: RangeSet<Ignored>, from: number, to: number) => {
  let found = false;
  ignored.between(from, to, (a, b) => {
    if (a === from && b === to) {
      found = true;
      return false;
    }
  });
  return found;
};

/** The decorations for `marks`, less the ignored ones, those outside the text, and the `unmarked` words'. */
function rangesOf(
  marks: readonly SpellMark[],
  ignored: RangeSet<Ignored>,
  unmarked: ReadonlySet<string>,
  length: number,
): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = [];
  for (const { from, to, word } of marks) {
    if (from < 0 || to > length || from >= to) continue;
    if (ignored.size > 0 && isIgnored(ignored, from, to)) continue;
    if (unmarked.size > 0 && unmarked.has(word.toLowerCase())) continue;
    ranges.push(markOf(word).range(from, to));
  }
  return ranges;
}

const spellField = StateField.define<SpellValue>({
  create: () => ({ marks: Decoration.none, ignored: RangeSet.empty, unmarked: NONE }),
  update(value, tr) {
    let { marks, ignored, unmarked } = value;
    if (tr.docChanged) {
      marks = mapDropping(marks, tr.changes);
      ignored = mapDropping(ignored, tr.changes);
    }
    const length = tr.state.doc.length;
    for (const effect of tr.effects) {
      if (effect.is(setSpellMarks)) {
        marks = Decoration.set(rangesOf(effect.value, ignored, unmarked, length), true);
        unmarked = NONE;
      } else if (effect.is(unmarkWord)) {
        const word = effect.value.toLowerCase();
        marks = marks.update({
          filter: (_from, _to, mark) => (mark.spec.word as string).toLowerCase() !== word,
        });
        unmarked = new Set(unmarked).add(word);
      } else if (effect.is(restoreSpellMarks)) {
        const back = new Set(effect.value.map((mark) => mark.word.toLowerCase()));
        unmarked = new Set([...unmarked].filter((word) => !back.has(word)));
        // A mark that is there already isn't drawn twice.
        const there = new Set(spellMarksIn(marks).map(({ from, to }) => `${from}:${to}`));
        const add = rangesOf(effect.value, ignored, NONE, length).filter(
          (range) => !there.has(`${range.from}:${range.to}`),
        );
        marks = marks.update({ add, sort: true });
      } else if (effect.is(ignoreHere)) {
        const { from, to } = effect.value;
        if (from >= to || to > length) continue;
        ignored = ignored.update({ add: [IGNORED.range(from, to)], sort: true });
        marks = marks.update({
          filter: (a, b) => !(a === from && b === to),
          filterFrom: from,
          filterTo: to,
        });
      }
    }
    return marks === value.marks && ignored === value.ignored && unmarked === value.unmarked
      ? value
      : { marks, ignored, unmarked };
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.marks),
});

/**
 * For the history's `invertedEffects`: an edit that unmarked a word (Add to this script's
 * dictionary) is undone with the word's marks put back, in the text as it was before the edit;
 * and that undo, redone, unmarks the word again. An unmark with no edit (Add to my dictionary)
 * isn't an undo step, so it gives nothing.
 */
export function invertSpellMarks(tr: Transaction): StateEffect<unknown>[] {
  if (!tr.docChanged) return [];
  const out: StateEffect<unknown>[] = [];
  for (const effect of tr.effects) {
    if (effect.is(unmarkWord)) {
      const word = effect.value.toLowerCase();
      const marks = spellMarksOf(tr.startState).filter((m) => m.word.toLowerCase() === word);
      if (marks.length > 0) out.push(restoreSpellMarks.of(marks));
    } else if (effect.is(restoreSpellMarks)) {
      for (const word of new Set(effect.value.map((m) => m.word.toLowerCase()))) {
        out.push(unmarkWord.of(word));
      }
    }
  }
  return out;
}

/** The field and its decorations: class `cm-misspelled`, `aria-invalid="spelling"`. A mark an edit touches is dropped; the rest map. */
export function spellMarks(): Extension {
  return spellField;
}

const marksIn = (state: EditorState): DecorationSet | null =>
  state.field(spellField, false)?.marks ?? null;

function spellMarksIn(marks: DecorationSet): SpellMark[] {
  const out: SpellMark[] = [];
  for (const cursor = marks.iter(); cursor.value; cursor.next()) {
    out.push({ from: cursor.from, to: cursor.to, word: cursor.value.spec.word as string });
  }
  return out;
}

/**
 * A value that stays the same object while the marks do, and is another once they may have
 * changed (new marks, an unmark, an edit), for a reader that keeps what it made of them. Null
 * without the extension.
 */
export function spellMarksKey(state: EditorState): object | null {
  return marksIn(state);
}

/** The marks, in order (the ignored ones are left out). */
export function spellMarksOf(state: EditorState): readonly SpellMark[] {
  const marks = marksIn(state);
  return marks ? spellMarksIn(marks) : [];
}

/** The mark holding or touching `pos`, or null. */
export function spellMarkAt(state: EditorState, pos: number): SpellMark | null {
  let found: SpellMark | null = null;
  marksIn(state)?.between(pos, pos, (from, to, value) => {
    found = { from, to, word: value.spec.word as string };
    return false;
  });
  return found;
}

/**
 * The next mark after `pos` (direction 1: the first that starts after it) or the one before it
 * (-1: the last that ends before it), wrapping past either end. A mark touching `pos` is the one
 * the cursor is on, so it is stepped over. Null when there are none.
 */
export function stepSpellMark(
  state: EditorState,
  pos: number,
  direction: 1 | -1,
): SpellMark | null {
  const marks = marksIn(state);
  if (!marks || marks.size === 0) return null;
  let first: SpellMark | null = null;
  let last: SpellMark | null = null;
  let found: SpellMark | null = null;
  for (const cursor = marks.iter(); cursor.value; cursor.next()) {
    const mark = { from: cursor.from, to: cursor.to, word: cursor.value.spec.word as string };
    first ??= mark;
    last = mark;
    if (direction === 1 && !found && mark.from > pos) found = mark;
    if (direction === -1 && mark.to < pos) found = mark;
  }
  return found ?? (direction === 1 ? first : last);
}

/** `marks` mapped through `changes`, dropping each one a change touches. */
export function mapSpellMarks(marks: readonly SpellMark[], changes: ChangeDesc): SpellMark[] {
  if (changes.empty) return marks.slice();
  const touched: Array<[number, number]> = [];
  changes.iterChangedRanges((fromA, toA) => {
    touched.push([fromA, toA]);
  });
  const out: SpellMark[] = [];
  let i = 0;
  for (const mark of marks) {
    // Both lists are in order: skip the changes wholly before this mark.
    while (i < touched.length && (touched[i] as [number, number])[1] < mark.from) i++;
    const change = touched[i];
    if (change && touches(mark.from, mark.to, change[0], change[1])) continue;
    out.push({
      from: changes.mapPos(mark.from, 1),
      to: changes.mapPos(mark.to, -1),
      word: mark.word,
    });
  }
  return out;
}
