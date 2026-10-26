// @vitest-environment jsdom
import { selectAll } from '@codemirror/commands';
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  appChange,
  centersOn,
  exceedsViewport,
  movesCursor,
  typewriterScrolling,
  viewportInsets,
} from '../app/editor/typewriter';

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
    // A cursor move with a key (the plugin says so) is the writer's.
    expect(centersOn(base.update({ selection: { anchor: 5 }, userEvent: 'select' }), true)).toBe(
      true,
    );
  });

  test('leaves a selection change alone unless a key that moves the cursor made it', () => {
    // Select All, a handle dragged by a finger, and the like: no key moved the cursor.
    for (const userEvent of ['select', 'move', 'select.extend']) {
      const tr = base.update({ selection: EditorSelection.single(0, 13), userEvent });
      expect(centersOn(tr), userEvent).toBe(false);
      expect(centersOn(tr, true), `${userEvent} after a key`).toBe(true);
    }
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

  test('does not center on Select All, which would jump to the end of the script', async () => {
    const { view, dispatch } = make();
    view.focus();
    selectAll(view);
    await microtasks();
    expect(view.state.selection.main.to).toBe(view.state.doc.length);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  test('centers on a move made with an arrow key, and not on the same move without one', async () => {
    const { view, dispatch } = make();
    view.focus();
    view.dispatch({ selection: { anchor: 4 }, userEvent: 'select' });
    await microtasks();
    expect(dispatch).toHaveBeenCalledTimes(1);

    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    view.dispatch({ selection: { anchor: 8 }, userEvent: 'select' });
    await microtasks();
    expect(dispatch).toHaveBeenCalledTimes(3);

    // The key's turn is over by the next task.
    await new Promise((resolve) => setTimeout(resolve, 5));
    view.dispatch({ selection: { anchor: 2 }, userEvent: 'select' });
    await microtasks();
    expect(dispatch).toHaveBeenCalledTimes(4);
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

describe('exceedsViewport', () => {
  test('is true for a selection taller than the pane, which scrolling would only chase', () => {
    expect(exceedsViewport(500, 800)).toBe(false);
    expect(exceedsViewport(800, 800)).toBe(false);
    expect(exceedsViewport(801, 800)).toBe(true);
  });
});

describe('viewportInsets', () => {
  const pane = { top: 100, bottom: 900 };

  test('is nothing without a visual viewport, or when it covers the pane', () => {
    expect(viewportInsets(pane, null)).toEqual({ top: 0, bottom: 0 });
    expect(viewportInsets(pane, { offsetTop: 0, height: 1000 })).toEqual({ top: 0, bottom: 0 });
  });

  test('is the part of the pane under a soft keyboard, which shrinks the visual viewport only', () => {
    // A 1000 px page; the keyboard takes the bottom 400, so the pane's bottom 300 is under it.
    expect(viewportInsets(pane, { offsetTop: 0, height: 600 })).toEqual({ top: 0, bottom: 300 });
  });

  test('is the part above a viewport that was panned down', () => {
    expect(viewportInsets(pane, { offsetTop: 150, height: 600 })).toEqual({ top: 50, bottom: 150 });
  });

  test('never hides more than the pane', () => {
    const inset = viewportInsets(pane, { offsetTop: 0, height: 50 });
    expect(inset.top + inset.bottom).toBeLessThanOrEqual(800);
    expect(inset).toEqual({ top: 0, bottom: 800 });
  });
});

describe('the room around the text, with a soft keyboard', () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const view of views.splice(0)) view.destroy();
    Reflect.deleteProperty(window, 'visualViewport');
  });

  test('is measured from the part of the pane that can be seen, and again when it resizes', async () => {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc: 'one\ntwo\nthree' }),
    });
    views.push(view);
    Object.defineProperty(view.scrollDOM, 'clientHeight', { value: 800, configurable: true });
    view.scrollDOM.getBoundingClientRect = () => ({ top: 0, bottom: 800 }) as DOMRect;
    const target = new EventTarget();
    const viewport = Object.assign(target, { offsetTop: 0, height: 800 });
    Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true });
    view.dispatch({ effects: StateEffect.appendConfig.of(typewriterScrolling()) });
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await frame();
    // No keyboard: half the pane above and below.
    expect(view.contentDOM.style.paddingTop).toBe('400px');
    expect(view.contentDOM.style.paddingBottom).toBe('400px');

    // The keyboard opens over the bottom 300: the middle of what is left is 250 down, and the last
    // line needs the keyboard's 300 as well as half of what is left.
    viewport.height = 500;
    target.dispatchEvent(new Event('resize'));
    await frame();
    expect(view.contentDOM.style.paddingTop).toBe('250px');
    expect(view.contentDOM.style.paddingBottom).toBe('550px');
  });
});

describe('movesCursor', () => {
  const key = (key: string, init: KeyboardEventInit = {}) =>
    new KeyboardEvent('keydown', { key, ...init });

  test('is true for the keys that move the cursor, on any keyboard', () => {
    for (const name of [
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
    ]) {
      expect(movesCursor(key(name), false), name).toBe(true);
      expect(movesCursor(key(name), true), name).toBe(true);
    }
    expect(movesCursor(key('a'), false)).toBe(false);
    expect(movesCursor(key('Enter'), true)).toBe(false);
  });

  test("is true for macOS's Control-b, f, n, p, a, e, and v, and only there", () => {
    for (const letter of ['b', 'f', 'n', 'p', 'a', 'e', 'v', 'N']) {
      expect(movesCursor(key(letter, { ctrlKey: true }), true), letter).toBe(true);
      expect(movesCursor(key(letter, { ctrlKey: true }), false), letter).toBe(false);
    }
    // Typing the letter, or a chord with Command or Option, is not a move.
    expect(movesCursor(key('f'), true)).toBe(false);
    expect(movesCursor(key('f', { ctrlKey: true, metaKey: true }), true)).toBe(false);
    expect(movesCursor(key('f', { ctrlKey: true, altKey: true }), true)).toBe(false);
    // Control-d deletes, and Control-k cuts: they are changes, not moves.
    expect(movesCursor(key('d', { ctrlKey: true }), true)).toBe(false);
    expect(movesCursor(key('k', { ctrlKey: true }), true)).toBe(false);
  });
});
