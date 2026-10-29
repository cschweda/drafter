import type { EditorState } from '@codemirror/state';
import { spellMarksKey, spellMarksOf } from '@drafter/cm-fountain';
import type { SpellState } from './spell-client';

// Problems' Spelling group (Plan D, Calls 13 and 14): the spellcheck's marks as rows, one per
// occurrence, read from the editor's state. They belong to the app, not to @drafter/lint, and are
// never counted with the problems. This module imports nothing of the app's, so a test can read it.

export interface SpellingRow {
  /**
   * The word, and how many of its occurrences come before it: a position would change with every
   * edit above.
   */
  key: string;
  word: string;
  from: number;
  to: number;
  /** 1-based source line. */
  line: number;
}

/** The Spelling heading's id in the Problems pane, where Check spelling puts focus. */
export const SPELLING_HEADING_ID = 'problems-spelling';

/** The marks in order, each with its line. None when the state has no marks (spellcheck off). */
export function spellingRows(state: EditorState): SpellingRow[] {
  const seen = new Map<string, number>();
  return spellMarksOf(state).map(({ from, to, word }) => {
    const n = seen.get(word) ?? 0;
    seen.set(word, n + 1);
    return { key: `${word}:${n}`, word, from, to, line: state.doc.lineAt(from).number };
  });
}

/**
 * `spellingRows` that reads the marks again only when they or the text have changed since its last
 * read, and otherwise gives the same list: a cursor move or another effect costs nothing.
 */
export function spellingReader(): (state: EditorState) => SpellingRow[] {
  let key: object | null = null;
  let doc: EditorState['doc'] | null = null;
  let rows: SpellingRow[] = [];
  return (state) => {
    const now = spellMarksKey(state);
    if (now === key && state.doc === doc) return rows;
    key = now;
    doc = state.doc;
    rows = spellingRows(state);
    return rows;
  };
}

/**
 * The group's heading: "Spelling: 3 words", "Spelling: 1 word", or "Spelling: none found"; while
 * the dictionary loads, "Spelling: checking…", and after it couldn't, says so, since no marks
 * then are no finding.
 */
export function spellingHeading(count: number, state: SpellState = 'ready'): string {
  if (state === 'loading') return 'Spelling: checking…';
  if (state === 'failed') return 'Spelling: the dictionary couldn’t load';
  if (count === 0) return 'Spelling: none found';
  return count === 1 ? 'Spelling: 1 word' : `Spelling: ${count} words`;
}

/** What Check spelling says: "3 misspelled words.", "1 misspelled word.", "No misspelled words." */
export function spellingCount(count: number): string {
  if (count === 0) return 'No misspelled words.';
  return count === 1 ? '1 misspelled word.' : `${count} misspelled words.`;
}
