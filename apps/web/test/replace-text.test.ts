// @vitest-environment jsdom
import { history, undo } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, test } from 'vitest';
import { replaceText } from '../app/editor/replace-text';
import { appChange } from '../app/editor/typewriter';

function viewOf(doc: string, readOnly = false) {
  const seen: Transaction[] = [];
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        EditorState.readOnly.of(readOnly),
        EditorView.updateListener.of((u) => seen.push(...u.transactions)),
      ],
    }),
  });
  return { view, seen };
}

describe('replaceText', () => {
  test('replaces only what differs', () => {
    const { view, seen } = viewOf('INT. HALL - DAY\n\nShe waits.\n\nEXT. YARD - NIGHT\n');
    view.dispatch({ selection: { anchor: 3 } });
    expect(replaceText(view, 'INT. HALL - DAY\n\nHe runs.\n\nEXT. YARD - NIGHT\n')).toBe(true);
    expect(view.state.doc.toString()).toBe('INT. HALL - DAY\n\nHe runs.\n\nEXT. YARD - NIGHT\n');
    const tr = seen.at(-1) as Transaction;
    const touched: Array<[number, number, string]> = [];
    tr.changes.iterChanges((from, to, _f, _t, inserted) =>
      touched.push([from, to, inserted.toString()]),
    );
    // Only the middle changed: the heading and the last scene are kept, and the cursor with them.
    expect(touched).toHaveLength(1);
    const [from, to] = touched[0] as [number, number, string];
    expect(from).toBeGreaterThanOrEqual('INT. HALL - DAY\n\n'.length);
    expect(to).toBeLessThanOrEqual('INT. HALL - DAY\n\nShe waits.'.length);
    expect(view.state.selection.main.head).toBe(3);
    // Drafter's change, not the writer's: no writing time for it.
    expect(tr.annotation(appChange)).toBe(true);
    // The same text again changes nothing.
    const count = seen.length;
    expect(replaceText(view, view.state.doc.toString())).toBe(true);
    expect(seen).toHaveLength(count);
    view.destroy();
  });

  test('is one undo step', () => {
    const { view } = viewOf('One.');
    // Typing just before, which the history would join to a change made at once after it.
    view.dispatch({ changes: { from: 4, insert: ' Two.' }, userEvent: 'input.type' });
    // Even as typing, right after it and next to it, it is a step of its own.
    expect(replaceText(view, 'One. Two. Three.', 'input.type')).toBe(true);
    expect(view.state.doc.toString()).toBe('One. Two. Three.');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('One. Two.');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('One.');
    view.destroy();
  });

  test('does nothing when read-only', () => {
    const { view, seen } = viewOf('One.', true);
    expect(replaceText(view, 'Two.')).toBe(false);
    expect(view.state.doc.toString()).toBe('One.');
    expect(seen).toHaveLength(0);
    view.destroy();
  });
});
