import { beforeEach, describe, expect, test, vi } from 'vitest';
import { markdownQuestion } from '../app/editor/markdown-question';
import { DOCUMENT_TYPES, type DocumentType } from '../app/editor/template';
import { useTemplate } from '../app/editor/use-template';

// The editor and the script session, as far as choosing a document type reads them.
const state = vi.hoisted(() => ({
  source: 'INT. HALL - DAY\n\nShe waits.\n',
  kind: undefined as undefined | { value: string },
  doc: undefined as undefined | { value: unknown },
  setKind: undefined as undefined | ((kind: string) => Promise<void>),
  openSample: undefined as undefined | ((kind: string) => Promise<void>),
  project: undefined as undefined | { value: { id: string; sample?: string } | null },
}));
vi.mock('../app/editor/session', async () => {
  const { shallowRef } = await import('vue');
  const { parse } = await import('@drafter/fountain');
  return {
    useEditor: () => {
      const doc = shallowRef(parse(state.source));
      const kind = shallowRef('fountain');
      state.doc = doc;
      state.kind = kind;
      return {
        view: { state: { readOnly: false, lineBreak: '\n' }, dispatch() {} },
        doc,
        locked: shallowRef(false),
        kind,
      };
    },
  };
});
vi.mock('../app/storage/script', async () => {
  const { shallowRef } = await import('vue');
  const project = shallowRef<{ id: string; sample?: string } | null>({ id: 'a' });
  state.project = project;
  const setKind = vi.fn(async () => {});
  state.setKind = setKind;
  const openSample = vi.fn(async () => {});
  state.openSample = openSample;
  return { useScript: () => ({ project, setKind, openSample }) };
});

const MARKDOWN = DOCUMENT_TYPES.find((t) => t.kind === 'markdown') as DocumentType;

beforeEach(() => {
  state.source = 'INT. HALL - DAY\n\nShe waits.\n';
  vi.mocked(state.setKind as () => Promise<void>).mockClear();
  vi.mocked(state.openSample as () => Promise<void>).mockClear();
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

const type = (id: string) => DOCUMENT_TYPES.find((t) => t.id === id) as DocumentType;

describe('which type is the current one', () => {
  test('is the template the script names', () => {
    state.source = 'INT. HALL - DAY\n\n/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/\n';
    const choice = useTemplate();
    expect(choice.isCurrent(type('stage-play-standard'))).toBe(true);
    expect(choice.isCurrent(type('us-screenplay'))).toBe(false);
    expect(choice.isCurrent(MARKDOWN)).toBe(false);
  });

  test('is the screenplay for a script with no template', () => {
    state.source = 'INT. HALL - DAY\n';
    expect(useTemplate().isCurrent(type('us-screenplay'))).toBe(true);
  });

  test('is nothing while the script names a template Drafter does not have, so Screenplay can be chosen', () => {
    state.source = 'INT. HALL - DAY\n\n/* drafter\n{"v":1,"template":"my-own"}\n*/\n';
    const choice = useTemplate();
    // It is shown as a screenplay (`id`), but the screenplay is not what the file says.
    expect(choice.id.value).toBe('us-screenplay');
    expect(choice.isCurrent(type('us-screenplay'))).toBe(false);
    expect(choice.isCurrent(type('stage-play-standard'))).toBe(false);
    expect(choice.canChooseType(type('us-screenplay'))).toBe(true);
  });

  test('is Markdown for a Markdown document', () => {
    state.source = 'INT. HALL - DAY\n';
    const choice = useTemplate();
    (state.kind as { value: string }).value = 'markdown';
    expect(choice.isCurrent(MARKDOWN)).toBe(true);
    expect(choice.isCurrent(type('us-screenplay'))).toBe(false);
  });
});

describe('choosing a type on a sample', () => {
  test('Markdown on the screenplay sample opens the Markdown sample, asking nothing', async () => {
    if (state.project) state.project.value = { id: 's', sample: 'screenplay' };
    const template = useTemplate();
    expect(template.canChooseType(MARKDOWN)).toBe(true);
    await template.chooseType(MARKDOWN);
    expect(markdownQuestion.value).toBeNull();
    expect(state.setKind).not.toHaveBeenCalled();
    expect(state.openSample).toHaveBeenCalledWith('markdown');
  });

  test('a template on the Markdown sample opens that sample', async () => {
    if (state.project) state.project.value = { id: 'm', sample: 'markdown' };
    const template = useTemplate();
    if (state.kind) state.kind.value = 'markdown';
    expect(template.canChooseType(type('stage-play-standard'))).toBe(true);
    await template.chooseType(type('stage-play-standard'));
    expect(state.setKind).not.toHaveBeenCalled();
    expect(state.openSample).toHaveBeenCalledWith('stage-play');
    await template.chooseType(type('us-screenplay'));
    expect(state.openSample).toHaveBeenCalledWith('screenplay');
  });

  test('Markdown on the Markdown sample does nothing', async () => {
    if (state.project) state.project.value = { id: 'm', sample: 'markdown' };
    const template = useTemplate();
    if (state.kind) state.kind.value = 'markdown';
    await template.chooseType(MARKDOWN);
    expect(state.openSample).not.toHaveBeenCalled();
  });
});
