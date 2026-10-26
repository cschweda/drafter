import { beforeEach, describe, expect, test, vi } from 'vitest';
import { markdownQuestion } from '../app/editor/markdown-question';
import { DOCUMENT_TYPES, type DocumentType } from '../app/editor/template';
import { useTemplate } from '../app/editor/use-template';

// The editor and the script session, as far as choosing a document type reads them.
const state = vi.hoisted(() => ({
  setKind: undefined as undefined | ((kind: string) => Promise<void>),
  project: undefined as undefined | { value: { id: string } | null },
}));
vi.mock('../app/editor/session', async () => {
  const { shallowRef } = await import('vue');
  const { parse } = await import('@drafter/fountain');
  return {
    useEditor: () => ({
      view: { state: { readOnly: false, lineBreak: '\n' }, dispatch() {} },
      doc: shallowRef(parse('INT. HALL - DAY\n\nShe waits.\n')),
      locked: shallowRef(false),
      kind: shallowRef('fountain'),
    }),
  };
});
vi.mock('../app/storage/script', async () => {
  const { shallowRef } = await import('vue');
  const project = shallowRef<{ id: string } | null>({ id: 'a' });
  state.project = project;
  const setKind = vi.fn(async () => {});
  state.setKind = setKind;
  return { useScript: () => ({ project, setKind }) };
});

const MARKDOWN = DOCUMENT_TYPES.find((t) => t.kind === 'markdown') as DocumentType;

beforeEach(() => {
  vi.mocked(state.setKind as () => Promise<void>).mockClear();
  if (state.project) state.project.value = { id: 'a' };
  markdownQuestion.value = null;
});

describe('making a script Markdown', () => {
  test('changes the script it was asked about, once the writer agrees', async () => {
    const done = useTemplate().chooseType(MARKDOWN);
    expect(markdownQuestion.value).not.toBeNull();
    markdownQuestion.value?.answer(true);
    await done;
    expect(state.setKind).toHaveBeenCalledWith('markdown');
  });

  test('changes nothing if another script was opened while it asked', async () => {
    const done = useTemplate().chooseType(MARKDOWN);
    // Mod+O or Mod+Alt+N still work under the question.
    if (state.project) state.project.value = { id: 'b' };
    markdownQuestion.value?.answer(true);
    await done;
    expect(state.setKind).not.toHaveBeenCalled();
  });
});
