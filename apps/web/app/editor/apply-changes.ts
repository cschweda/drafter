import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import type { TextChange } from '@drafter/fountain';
import { appChange } from './typewriter';

/**
 * Applies `changes`, all positioned in the text as it is now, as one transaction: one undo step of
 * its own, never joined to typing before it. A change outside the text, backwards, or overlapping
 * another throws and changes nothing. The parse reads every line break as `\n`; the editor's own
 * may be `\r\n`, so inserted breaks are converted. Returns false, changing nothing, when the editor
 * is read-only.
 */
export function applyTextChanges(view: EditorView, changes: readonly TextChange[]): boolean {
  if (view.state.readOnly) return false;
  const sorted = checkedChanges(changes, view.state.doc.length);
  if (sorted.length === 0) return true;
  view.dispatch({
    changes: sorted.map((c) => ({
      from: c.from,
      to: c.to,
      insert: String(c.insert).replace(/\r?\n/g, view.state.lineBreak),
    })),
    userEvent: 'input',
    annotations: [isolateHistory.of('full'), appChange.of(true)],
  });
  return true;
}

/**
 * `changes` in order, once each is known to fit a text of `length` characters: whole positions
 * inside it, none backwards, none overlapping another (two may touch). Throws a RangeError that
 * says which does not.
 */
export function checkedChanges(changes: readonly TextChange[], length: number): TextChange[] {
  const sorted = [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
  for (const [i, change] of sorted.entries()) {
    const { from, to } = change;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > length) {
      throw new RangeError(`A change at ${from}–${to} is outside the script (0–${length}).`);
    }
    if (from > to) throw new RangeError(`A change at ${from}–${to} runs backwards.`);
    const next = sorted[i + 1];
    if (next && next.from < to) {
      throw new RangeError(`The changes at ${from}–${to} and ${next.from}–${next.to} overlap.`);
    }
  }
  return sorted;
}
