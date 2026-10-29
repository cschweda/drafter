import { ChangeSet, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  ignoreHere,
  mapSpellMarks,
  type SpellMark,
  setSpellMarks,
  spellMarkAt,
  spellMarks,
  spellMarksOf,
  stepSpellMark,
  unmarkWord,
} from '@drafter/cm-fountain';
import { afterEach, describe, expect, test } from 'vitest';

const TEXT = 'Margaret waits by the phnoe. The Phnoe rings. Then a PHNOE.\n';
/** Each `word`'s marks in TEXT, as the worker would send them. */
const marksOf = (text: string, ...words: string[]): SpellMark[] =>
  words
    .flatMap((word) =>
      [...text.matchAll(new RegExp(word, 'gi'))].map((m) => ({
        from: m.index,
        to: m.index + m[0].length,
        word: m[0],
      })),
    )
    .sort((a, b) => a.from - b.from);

const stateWith = (text: string, marks: SpellMark[]) =>
  EditorState.create({ doc: text, extensions: spellMarks() }).update({
    effects: setSpellMarks.of(marks),
  }).state;

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.remove();
    view.destroy();
  }
});

describe('spellMarks', () => {
  test('draws a mark with aria-invalid="spelling"', () => {
    const view = new EditorView({ state: stateWith(TEXT, marksOf(TEXT, 'phnoe')) });
    document.body.append(view.dom);
    views.push(view);
    const drawn = [...view.contentDOM.querySelectorAll('.cm-misspelled')];
    expect(drawn.map((el) => el.textContent)).toEqual(['phnoe', 'Phnoe', 'PHNOE']);
    for (const el of drawn) expect(el.getAttribute('aria-invalid')).toBe('spelling');
  });

  test('maps marks through an edit elsewhere', () => {
    const state = stateWith(TEXT, marksOf(TEXT, 'phnoe'));
    const next = state.update({ changes: { from: 0, insert: 'INT. HALL - DAY\n\n' } }).state;
    const marks = spellMarksOf(next);
    expect(marks).toHaveLength(3);
    for (const mark of marks) expect(next.sliceDoc(mark.from, mark.to)).toBe(mark.word);
    // And a deletion before them.
    const shorter = next.update({ changes: { from: 0, to: 5 } }).state;
    for (const mark of spellMarksOf(shorter)) {
      expect(shorter.sliceDoc(mark.from, mark.to)).toBe(mark.word);
    }
  });

  test('drops a mark the writer is retyping', () => {
    const state = stateWith(TEXT, marksOf(TEXT, 'phnoe'));
    const first = TEXT.indexOf('phnoe');
    // Typing inside it, at its end, and at its start each drop that one mark and keep the others.
    for (const at of [first + 2, first + 5, first]) {
      const next = state.update({ changes: { from: at, insert: 'x' } }).state;
      expect(spellMarksOf(next).map((m) => m.word)).toEqual(['Phnoe', 'PHNOE']);
    }
    // Deleting a letter of it, too.
    const deleted = state.update({ changes: { from: first + 1, to: first + 2 } }).state;
    expect(spellMarksOf(deleted).map((m) => m.word)).toEqual(['Phnoe', 'PHNOE']);
    // And the pure mapping does the same.
    const changes = ChangeSet.of({ from: first + 2, insert: 'x' }, TEXT.length);
    expect(mapSpellMarks(marksOf(TEXT, 'phnoe'), changes).map((m) => m.word)).toEqual([
      'Phnoe',
      'PHNOE',
    ]);
  });

  test('mapSpellMarks maps through several changes at once', () => {
    const marks = marksOf(TEXT, 'phnoe');
    const changes = ChangeSet.of(
      [
        { from: 0, insert: 'Old ' },
        { from: TEXT.indexOf('Then'), to: TEXT.indexOf('Then') + 4, insert: 'And' },
      ],
      TEXT.length,
    );
    const text = changes.apply(EditorState.create({ doc: TEXT }).doc).toString();
    const mapped = mapSpellMarks(marks, changes);
    expect(mapped.map((m) => text.slice(m.from, m.to))).toEqual(['phnoe', 'Phnoe', 'PHNOE']);
  });

  test('unmarkWord unmarks every case at once', () => {
    const extra = `${TEXT}A wuold.\n`;
    const state = stateWith(extra, marksOf(extra, 'phnoe', 'wuold'));
    const next = state.update({ effects: unmarkWord.of('pHNoe') }).state;
    expect(spellMarksOf(next).map((m) => m.word)).toEqual(['wuold']);
  });

  test('ignoreHere hides one occurrence until it is edited', () => {
    const state = stateWith(TEXT, marksOf(TEXT, 'phnoe'));
    const [first] = spellMarksOf(state);
    if (!first) throw new Error('no mark');
    const ignored = state.update({ effects: ignoreHere.of(first) }).state;
    expect(spellMarksOf(ignored).map((m) => m.word)).toEqual(['Phnoe', 'PHNOE']);
    // The next check marks it again, and it stays hidden, even after an edit elsewhere moves it.
    const moved = ignored.update({ changes: { from: 0, insert: 'So. ' } }).state;
    const again = moved.update({
      effects: setSpellMarks.of(marksOf(moved.doc.toString(), 'phnoe')),
    }).state;
    expect(spellMarksOf(again).map((m) => m.word)).toEqual(['Phnoe', 'PHNOE']);
    // Edited, it is marked again by the check after.
    const at = first.from + 4;
    const edited = again.update({ changes: { from: at + 1, insert: 'e' } }).state;
    const text = edited.doc.toString();
    const rechecked = edited.update({
      effects: setSpellMarks.of(marksOf(text, 'pehnoe', 'phnoe')),
    }).state;
    expect(spellMarksOf(rechecked).map((m) => m.word)).toEqual(['pehnoe', 'Phnoe', 'PHNOE']);
  });

  test('spellMarkAt finds the mark holding or touching a position', () => {
    const state = stateWith(TEXT, marksOf(TEXT, 'phnoe'));
    const first = TEXT.indexOf('phnoe');
    expect(spellMarkAt(state, first)?.word).toBe('phnoe');
    expect(spellMarkAt(state, first + 3)?.word).toBe('phnoe');
    expect(spellMarkAt(state, first + 5)?.word).toBe('phnoe');
    expect(spellMarkAt(state, first - 1)).toBeNull();
    expect(spellMarkAt(state, 0)).toBeNull();
  });

  test('stepSpellMark wraps both ways', () => {
    const state = stateWith(TEXT, marksOf(TEXT, 'phnoe'));
    const [a, b, c] = spellMarksOf(state);
    if (!a || !b || !c) throw new Error('three marks');
    expect(stepSpellMark(state, 0, 1)).toEqual(a);
    expect(stepSpellMark(state, a.to, 1)).toEqual(b);
    expect(stepSpellMark(state, a.from + 1, 1)).toEqual(b);
    expect(stepSpellMark(state, c.to, 1)).toEqual(a);
    expect(stepSpellMark(state, TEXT.length, 1)).toEqual(a);
    expect(stepSpellMark(state, c.to, -1)).toEqual(b);
    expect(stepSpellMark(state, b.from, -1)).toEqual(a);
    expect(stepSpellMark(state, a.to, -1)).toEqual(c);
    expect(stepSpellMark(state, 0, -1)).toEqual(c);
    const none = EditorState.create({ doc: TEXT, extensions: spellMarks() });
    expect(stepSpellMark(none, 0, 1)).toBeNull();
    expect(stepSpellMark(none, 0, -1)).toBeNull();
  });

  test('a state without the extension has no marks', () => {
    const state = EditorState.create({ doc: TEXT });
    expect(spellMarksOf(state)).toEqual([]);
    expect(spellMarkAt(state, 3)).toBeNull();
    expect(stepSpellMark(state, 0, 1)).toBeNull();
  });

  test('maps 5,000 marks through a keystroke in under 5 ms', () => {
    const line = 'The phnoe rings and rings.\n';
    const text = line.repeat(5000);
    const marks: SpellMark[] = [];
    for (let n = 0; n < 5000; n++) {
      const from = n * line.length + 4;
      marks.push({ from, to: from + 5, word: 'phnoe' });
    }
    let state = stateWith(text, marks);
    const at = text.length / 2;
    // Best of five: one keystroke each, into the middle of the text, between two marks.
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < 5; i++) {
      const pos = at - (at % line.length) + 1 + i;
      const start = performance.now();
      state = state.update({ changes: { from: pos, insert: 'x' } }).state;
      best = Math.min(best, performance.now() - start);
    }
    expect(spellMarksOf(state)).toHaveLength(5000);
    expect(best).toBeLessThan(5);
  });
});
