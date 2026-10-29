import { EditorState } from '@codemirror/state';
import { setSpellMarks, spellMarks } from '@drafter/cm-fountain';
import { describe, expect, test } from 'vitest';
import { spellingCount, spellingHeading, spellingRows } from '../app/spell/rows';

// Problems' Spelling group (Plan D, Calls 13 and 14): one row per marked occurrence, keyed so a
// row keeps its key (and its list item, and focus in it) while text above it changes.

const TEXT = 'INT. HALL - DAY\n\nThe phnoe rings.\n\nA phnoe again. Then the drowr shuts.\n';

function withMarks(doc: string, words: string[]): EditorState {
  const marks = [];
  let from = 0;
  for (const word of words) {
    const at = doc.indexOf(word, from);
    marks.push({ from: at, to: at + word.length, word });
    from = at + word.length;
  }
  const state = EditorState.create({ doc, extensions: [spellMarks()] });
  return state.update({ effects: setSpellMarks.of(marks) }).state;
}

describe('the Spelling rows', () => {
  test('one row per mark, in order, with its line', () => {
    const state = withMarks(TEXT, ['phnoe', 'phnoe', 'drowr']);
    const first = TEXT.indexOf('phnoe');
    expect(spellingRows(state)).toEqual([
      { key: 'phnoe:0', word: 'phnoe', from: first, to: first + 5, line: 3 },
      {
        key: 'phnoe:1',
        word: 'phnoe',
        from: TEXT.indexOf('phnoe', first + 1),
        to: TEXT.indexOf('phnoe', first + 1) + 5,
        line: 5,
      },
      {
        key: 'drowr:0',
        word: 'drowr',
        from: TEXT.indexOf('drowr'),
        to: TEXT.indexOf('drowr') + 5,
        line: 5,
      },
    ]);
    // No marks (spellcheck off, or nothing wrong): no rows.
    expect(spellingRows(EditorState.create({ doc: TEXT }))).toEqual([]);
    expect(spellingRows(EditorState.create({ doc: TEXT, extensions: [spellMarks()] }))).toEqual([]);
  });

  test('keys survive an edit above', () => {
    const state = withMarks(TEXT, ['phnoe', 'phnoe', 'drowr']);
    const before = spellingRows(state);
    const edited = state.update({ changes: { from: 0, insert: 'Title: Night Work\n\n' } }).state;
    const after = spellingRows(edited);
    expect(after.map((row) => row.key)).toEqual(before.map((row) => row.key));
    expect(after.map((row) => row.line)).toEqual([5, 7, 7]);
    expect(after.map((row) => row.from)).toEqual(before.map((row) => row.from + 19));
  });

  test('names the heading by count', () => {
    expect(spellingHeading(0)).toBe('Spelling: none found');
    expect(spellingHeading(1)).toBe('Spelling: 1 word');
    expect(spellingHeading(3)).toBe('Spelling: 3 words');
    // What Check spelling says.
    expect(spellingCount(0)).toBe('No misspelled words.');
    expect(spellingCount(1)).toBe('1 misspelled word.');
    expect(spellingCount(3)).toBe('3 misspelled words.');
  });
});
