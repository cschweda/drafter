import type { EditorState } from '@codemirror/state';
import { lookupWord } from '../workers/definitions-compute';

// The word Look up means (definitions design §7.5): the selection, when it is a word or a short
// phrase ("bill of fare"); else the word at (or just before) `at`, the cursor or a right-click.

/** The selection's text when it is one word or a phrase worth looking up; else the word at `at`. */
export function wordToLookUp(state: EditorState, at = state.selection.main.head): string | null {
  const { from, to } = state.selection.main;
  if (from !== to && to - from <= 64 && at >= from && at <= to) {
    const picked = lookupWord(state.sliceDoc(from, to));
    if (picked) return picked;
  }
  const range = state.wordAt(at) ?? (at > 0 ? state.wordAt(at - 1) : null);
  return range ? lookupWord(state.sliceDoc(range.from, range.to)) : null;
}
