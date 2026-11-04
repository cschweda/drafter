import { isolateHistory } from '@codemirror/commands';
import type { EditorView } from '@codemirror/view';
import { novelFacts } from '../novel/carry';
import { appChange } from './typewriter';

/**
 * Replaces the editor's whole text with `target` as one change: only the part that differs, so the
 * cursor, the folds, and the scroll stay where they are; its own undo step, never joined to the
 * typing before it; and Drafter's change, not the writer's (`appChange`: no writing time for it).
 * Revert to Saved and Restore both go through it. The same text changes nothing. False, changing
 * nothing, when the editor is read-only.
 *
 * The target brings its own facts: a novel's comment in `target` is the one wanted, so the change
 * is marked `novelFacts` and the facts filter (`carry.ts`) leaves it alone. Without the mark, a
 * change that missed the comment (the same in both texts) would carry the facts by position, onto
 * the wrong headings, and the text would no longer be `target`.
 */
export function replaceText(
  view: EditorView,
  target: string,
  userEvent = 'input.replace',
): boolean {
  if (view.state.readOnly) return false;
  const current = view.state.doc.toString();
  let from = 0;
  const shortest = Math.min(current.length, target.length);
  while (from < shortest && current.charCodeAt(from) === target.charCodeAt(from)) from++;
  let end = 0;
  while (
    end < shortest - from &&
    current.charCodeAt(current.length - 1 - end) === target.charCodeAt(target.length - 1 - end)
  ) {
    end++;
  }
  const to = current.length - end;
  const insert = target.slice(from, target.length - end);
  if (from === to && insert === '') return true;
  view.dispatch({
    changes: { from, to, insert },
    annotations: [isolateHistory.of('full'), appChange.of(true), novelFacts.of(true)],
    userEvent,
  });
  return true;
}
