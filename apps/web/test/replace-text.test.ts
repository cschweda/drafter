// @vitest-environment jsdom
import { history, undo } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { setMarkdownMeta } from '@drafter/markdown';
import { readFacts } from '@drafter/novel';
import { describe, expect, test } from 'vitest';
import { replaceText } from '../app/editor/replace-text';
import { appChange } from '../app/editor/typewriter';
import { carryNovelFacts, novelFacts } from '../app/novel/carry';

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

// Revert to Saved, a snapshot's Restore, and a draft's Restore all go through `replaceText`: the
// text they bring has its own comment, and so its own facts, which the facts filter must not move.
describe('replaceText on a novel', () => {
  const book = (body: string, nodes: Record<string, { status: string }>) =>
    setMarkdownMeta(body, { template: 'novel', novel: { nodes } });
  const FACTS = { 'chapter:alpha:0': { status: 'done' }, 'chapter:beta:0': { status: 'draft' } };
  const SAVED = book('# Alpha\n\nThe first.\n\n# Beta\n\nThe second.\n', FACTS);
  // The Outline's move: Alpha after Beta. The ids don't change, so the comment doesn't either.
  const MOVED = book('# Beta\n\nThe second.\n\n# Alpha\n\nThe first.\n', FACTS);

  function novelView(doc: string) {
    return new EditorView({
      state: EditorState.create({
        doc,
        extensions: [history(), carryNovelFacts({ active: () => true })],
      }),
    });
  }

  test('a move, then Revert to Saved, is the saved text byte for byte, facts and all', () => {
    const view = novelView(SAVED);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: MOVED },
      annotations: novelFacts.of(true),
      userEvent: 'input',
    });
    expect(view.state.doc.toString()).toBe(MOVED);
    expect(replaceText(view, SAVED)).toBe(true);
    expect(view.state.doc.toString()).toBe(SAVED);
    expect(readFacts(view.state.doc.toString())).toEqual(readFacts(SAVED));
    // Undo brings the move back, its facts with it.
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(MOVED);
    view.destroy();
  });

  test('a snapshot or a draft restored over typed headings is exactly its text', () => {
    // Older text with other facts, over a book whose headings were renamed since.
    const older = book('# Alpha\n\nOld.\n\n# Beta\n\nOlder.\n', {
      'chapter:alpha:0': { status: 'todo' },
    });
    const view = novelView(SAVED);
    view.dispatch({ changes: { from: 2, to: 7, insert: 'Gamma' }, userEvent: 'input.type' });
    expect(readFacts(view.state.doc.toString()).nodes['chapter:gamma:0']).toEqual({
      status: 'done',
    });
    expect(replaceText(view, older)).toBe(true);
    expect(view.state.doc.toString()).toBe(older);
    expect(replaceText(view, MOVED)).toBe(true);
    expect(view.state.doc.toString()).toBe(MOVED);
    expect(readFacts(view.state.doc.toString())).toEqual(readFacts(MOVED));
    view.destroy();
  });
});
