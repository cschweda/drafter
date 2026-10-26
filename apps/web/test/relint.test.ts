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
const { editorExtensions, relint } = await import('../app/editor/extensions');

afterEach(() => vi.clearAllMocks());

const extensions = () =>
  editorExtensions({
    template: () => builtins['us-screenplay'] as never,
    onCursorElement: () => {},
  });

describe('relint', () => {
  test('asks cm-fountain to lint the editor again', () => {
    const view = new EditorView({ doc: 'INT. ROOM - DAY\n', extensions: extensions() });
    relint();
    expect(fountain.relint).toHaveBeenCalledTimes(1);
    expect(fountain.relint).toHaveBeenCalledWith(view);
  });

  test('still finds the editor after a fresh state is set (a project opened)', () => {
    const shared = extensions();
    const view = new EditorView({ doc: 'One.\n', extensions: shared });
    view.setState(EditorState.create({ doc: 'Another script.\n', extensions: shared }));
    relint();
    expect(fountain.relint).toHaveBeenCalledWith(view);
  });
});
