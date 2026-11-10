// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, test, vi } from 'vitest';

const fountain = vi.hoisted(() => ({ relint: vi.fn() }));
vi.mock('@drafter/cm-fountain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@drafter/cm-fountain')>()),
  relint: fountain.relint,
}));

const { builtins } = await import('@drafter/templates');
const { COMPOSITION_CHECK_MS, editorExtensions, relint } = await import('../app/editor/extensions');

/** Every view a test makes, destroyed after it: a live view's lint timer would otherwise fire
 * after the file's environment is gone (an unhandled `requestAnimationFrame` error in CI). */
const views: EditorView[] = [];
const viewOf = (config: ConstructorParameters<typeof EditorView>[0]) => {
  const view = new EditorView(config);
  views.push(view);
  return view;
};

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const extensions = () =>
  editorExtensions({
    template: () => builtins['us-screenplay'] as never,
    onCursorElement: () => {},
  });

describe('relint', () => {
  test('asks cm-fountain to lint the editor again', () => {
    const view = viewOf({ doc: 'INT. ROOM - DAY\n', extensions: extensions() });
    relint();
    expect(fountain.relint).toHaveBeenCalledTimes(1);
    expect(fountain.relint).toHaveBeenCalledWith(view);
  });

  test('still finds the editor after a fresh state is set (a project opened)', () => {
    const shared = extensions();
    const view = viewOf({ doc: 'One.\n', extensions: shared });
    view.setState(EditorState.create({ doc: 'Another script.\n', extensions: shared }));
    relint();
    expect(fountain.relint).toHaveBeenCalledWith(view);
  });

  /** A view whose input method composition is under the test's control. */
  function composingView() {
    const view = viewOf({ doc: 'One.\n', extensions: extensions() });
    const state = { composing: true };
    Object.defineProperty(view, 'composing', { get: () => state.composing });
    Object.defineProperty(view, 'compositionStarted', { get: () => false });
    return { view, state };
  }

  test('waits for a composition to end, then lints once', async () => {
    vi.useFakeTimers();
    const { view, state } = composingView();
    relint();
    relint();
    expect(fountain.relint).not.toHaveBeenCalled();
    state.composing = false;
    view.contentDOM.dispatchEvent(new Event('compositionend'));
    await vi.advanceTimersByTimeAsync(1);
    expect(fountain.relint).toHaveBeenCalledTimes(1);
  });

  test('lints when the editor loses focus mid-composition', async () => {
    vi.useFakeTimers();
    const { view, state } = composingView();
    relint();
    state.composing = false;
    view.contentDOM.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(1);
    expect(fountain.relint).toHaveBeenCalledTimes(1);
  });

  test('a composition abandoned with no end or blur does not leave relint stuck', async () => {
    vi.useFakeTimers();
    const { state } = composingView();
    relint();
    await vi.advanceTimersByTimeAsync(COMPOSITION_CHECK_MS * 2);
    expect(fountain.relint).not.toHaveBeenCalled();
    state.composing = false;
    await vi.advanceTimersByTimeAsync(COMPOSITION_CHECK_MS + 1);
    expect(fountain.relint).toHaveBeenCalledTimes(1);
    relint();
    expect(fountain.relint).toHaveBeenCalledTimes(2);
  });
});
