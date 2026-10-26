// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { appChange, centersOn, typewriterScrolling } from '../app/editor/typewriter';

const base = EditorState.create({ doc: 'one\ntwo\nthree', selection: { anchor: 0 } });

describe('centersOn', () => {
  test("centers on the writer's typing, deleting, pasting, undoing, and cursor moves", () => {
    for (const userEvent of [
      'input.type',
      'input.paste',
      'input',
      'delete.backward',
      'delete.forward',
      'undo',
      'redo',
      'select',
      'move.line',
    ]) {
      const tr = base.update({ changes: { from: 0, insert: 'x' }, userEvent });
      expect(centersOn(tr), userEvent).toBe(true);
    }
    expect(centersOn(base.update({ selection: { anchor: 5 }, userEvent: 'select' }))).toBe(true);
  });

  test('leaves a click or a drag with the mouse where it is', () => {
    const tr = base.update({ selection: { anchor: 5 }, userEvent: 'select.pointer' });
    expect(centersOn(tr)).toBe(false);
  });

  test("ignores a dispatch that is no event of the writer's", () => {
    expect(centersOn(base.update({ changes: { from: 0, insert: 'x' } }))).toBe(false);
    expect(centersOn(base.update({ selection: { anchor: 4 } }))).toBe(false);
    expect(centersOn(base.update({ effects: [] }))).toBe(false);
  });

  test("ignores a file put in, and a change marked as the app's own", () => {
    const replaced = base.update({ changes: { from: 0, insert: 'x' }, userEvent: 'input.replace' });
    expect(centersOn(replaced)).toBe(false);
    const marked = base.update({
      changes: { from: 0, insert: 'x' },
      userEvent: 'input',
      annotations: appChange.of(true),
    });
    expect(centersOn(marked)).toBe(false);
  });

  test('ignores a user event that changed neither the text nor the selection', () => {
    expect(centersOn(base.update({ userEvent: 'select' }))).toBe(false);
  });
});

describe('typewriterScrolling', () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
  });

  function make() {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: 'one\ntwo\nthree', extensions: [typewriterScrolling()] }),
    });
    views.push(view);
    const dispatch = vi.spyOn(view, 'dispatch');
    return { view, dispatch };
  }

  const microtasks = () => new Promise<void>((resolve) => queueMicrotask(() => resolve()));

  test('centers after an edit the writer makes in the focused editor', async () => {
    const { view, dispatch } = make();
    view.focus();
    expect(view.hasFocus).toBe(true);
    view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' });
    expect(dispatch).toHaveBeenCalledTimes(1);
    await microtasks();
    expect(dispatch).toHaveBeenCalledTimes(2);
    // The second dispatch is the scroll alone, and it asks for no more of its own.
    await microtasks();
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  test('does not center a change the app marks as its own, even one called input', async () => {
    const { view, dispatch } = make();
    view.focus();
    view.dispatch({
      changes: { from: 0, insert: 'x' },
      userEvent: 'input',
      annotations: appChange.of(true),
    });
    await microtasks();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('does not center while the editor does not have focus', async () => {
    const { view, dispatch } = make();
    view.contentDOM.blur();
    expect(view.hasFocus).toBe(false);
    view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' });
    await microtasks();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
