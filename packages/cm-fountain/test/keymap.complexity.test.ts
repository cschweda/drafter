import { EditorSelection, EditorState } from '@codemirror/state';
import {
  convertToAction,
  forceKind,
  fountainEnter,
  fountainShiftTab,
  fountainTab,
  toggleDual,
  wrapInNote,
} from '@drafter/cm-fountain';
import { describe, expect, it } from 'vitest';
import { apply, editor, type } from './helpers';

// The keys run on the main thread, on every press, and typing runs the input filters on every
// character. Each of these is a script or a selection shaped to make one of them super-linear,
// and the keys must still finish, together, in well under a second. The states are built before
// the clock starts. A key's time includes the parse after its change, which is linear too.
const BUDGET = 1000;

/** Several cursors, which a state allows only when the app says so. */
const MULTIPLE = EditorState.allowMultipleSelections.of(true);

/** Runs `work` and fails if it takes a second. */
function withinBudget(work: () => void) {
  const start = performance.now();
  work();
  expect(performance.now() - start).toBeLessThan(BUDGET);
}

describe('keys on hostile scripts', () => {
  it('work on lines of two hundred thousand characters', () => {
    const heading = editor(`INT. ${'X'.repeat(200_000)}|`);
    const cue = editor(`${'A'.repeat(200_000)}|\nHello.`);
    const action = editor(`${'margaret '.repeat(22_000)}|`);
    withinBudget(() => {
      expect(apply(heading, fountainEnter).doc.lines).toBe(3);
      expect(type(heading, 'a').doc.length).toBe(heading.doc.length + 1);
      expect(apply(cue, fountainTab).doc.length).toBe(cue.doc.length + 7);
      expect(apply(cue, fountainShiftTab).doc.length).toBe(cue.doc.length);
      expect(apply(cue, toggleDual).doc.length).toBe(cue.doc.length + 2);
      expect(apply(action, fountainTab).doc.length).toBe(action.doc.length + 1);
      expect(apply(action, forceKind('centered')).doc.length).toBe(action.doc.length - 1 + 2);
      expect(apply(action, wrapInNote).doc.length).toBe(action.doc.length + 4);
    });
  }, 60_000);

  it('work in a block of a hundred thousand lines', () => {
    const text = 'She waits.\n'.repeat(100_000);
    // The end of the 50,000th line: every line is eleven characters with its break.
    const at = 50_000 * 11 - 1;
    const state = editor(`${text.slice(0, at)}|${text.slice(at)}`);
    withinBudget(() => {
      expect(apply(state, fountainEnter).doc.lines).toBe(state.doc.lines + 1);
      expect(apply(state, fountainTab).doc.length).toBe(state.doc.length + 1);
      expect(apply(state, forceKind('lyric')).doc.length).toBe(state.doc.length + 1);
      expect(apply(state, wrapInNote).doc.length).toBe(state.doc.length + 4);
      // Nothing to do here, which is found without reading the block.
      expect(apply(state, fountainShiftTab)).toBe(state);
      expect(apply(state, toggleDual)).toBe(state);
    });
  }, 60_000);

  it('work in a speech of fifty thousand lines', () => {
    const speech = `MARGARET\n${'(beat)\nHello.\n'.repeat(25_000)}`;
    // A cue found from the last line of the speech, and a parenthetical under it.
    const inside = editor(`${speech.slice(0, -1)}|\n`);
    const under = editor(`${speech}|`);
    withinBudget(() => {
      expect(apply(inside, toggleDual).doc.line(1).text).toBe('MARGARET ^');
      expect(apply(under, fountainTab).doc.length).toBe(under.doc.length + 2);
      expect(apply(inside, convertToAction)).toBe(inside);
    });
  }, 60_000);

  it('work with twenty thousand cursors', () => {
    // Twenty thousand headings, each with a cursor at the end of its line.
    const text = 'INT. HALL - DAY\n\n'.repeat(20_000);
    const ends = Array.from({ length: 20_000 }, (_, i) => i * 17 + 15);
    const state = editor(text, [MULTIPLE]).update({
      selection: EditorSelection.create(ends.map((end) => EditorSelection.cursor(end))),
    }).state;
    withinBudget(() => {
      const broken = apply(state, fountainEnter);
      expect(broken.doc.lines).toBe(state.doc.lines + 2 * 20_000);
      expect(broken.selection.ranges).toHaveLength(20_000);
      const wrapped = apply(state, wrapInNote);
      expect(wrapped.doc.line(1).text).toBe('INT. HALL - DAY[[]]');
      expect(wrapped.selection.ranges).toHaveLength(20_000);
    });
  }, 60_000);

  it('are filtered in a heading at each of ten thousand cursors', () => {
    // Typing at many cursors is CodeMirror's own work first: its `replaceSelection` and the
    // mapping of a selection through many changes are quadratic in the cursors, so this is not
    // made larger. The filter's part is a look at each cursor's line.
    const text = 'INT. HALL - DAY\n\n'.repeat(10_000);
    const ends = Array.from({ length: 10_000 }, (_, i) => i * 17 + 15);
    const state = editor(text, [MULTIPLE]).update({
      selection: EditorSelection.create(ends.map((end) => EditorSelection.cursor(end))),
    }).state;
    const after = EditorSelection.create(ends.map((end, i) => EditorSelection.cursor(end + i + 1)));
    withinBudget(() => {
      const typed = state.update({
        changes: ends.map((end) => ({ from: end, insert: 'x' })),
        selection: after,
        userEvent: 'input.type',
      }).state;
      // Each is a heading, so each letter is upper-case.
      expect(typed.doc.line(1).text).toBe('INT. HALL - DAYX');
      expect(typed.doc.line(10_000 * 2 - 1).text).toBe('INT. HALL - DAYX');
      expect(typed.selection.main.head).toBe(16);
    });
  }, 60_000);

  it('type a hundred characters into a cue in a script of 100 KB in under a second', () => {
    const script = 'MARGARET\nHello, **you**.\n\n'.repeat(4_000);
    const started = apply(editor(`${script}|`), fountainTab);
    const words = 'margaret '.repeat(12).slice(0, 100);
    withinBudget(() => {
      const typed = type(started, words);
      expect(typed.doc.line(typed.doc.lines).text).toBe(`@${words.toUpperCase()}`);
    });
  }, 60_000);
});
