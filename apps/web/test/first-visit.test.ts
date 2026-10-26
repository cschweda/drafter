// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import type { EditorState as State } from '@codemirror/state';
import { parse } from '@drafter/fountain';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// The editor session without Nuxt's aliases: a state that `dispatch`es and tells its listeners.
vi.mock('../app/editor/samples', () => {
  const screenplay =
    'Title: The Call\nAuthor: A. Writer\n\n# Act One\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n\nEXT. YARD - DAY\n\nRain.\n';
  const stagePlay = 'Title: The Crossing\n\nINT. HALL - DAY\n\nHi.\n';
  return {
    SAMPLE_SCREENPLAY: screenplay,
    SAMPLE_STAGE_PLAY: stagePlay,
    SAMPLE_TEXT: { screenplay, 'stage-play': stagePlay },
  };
});
vi.mock('../app/editor/session', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { shallowRef } = await import('vue');
  const { SAMPLE_SCREENPLAY } = await import('../app/editor/samples');
  let state = EditorState.create({ doc: SAMPLE_SCREENPLAY });
  const listeners = new Set<(state: State) => void>();
  const doc = shallowRef(parse(state.doc.toString()));
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<State['update']>[0]) {
      state = state.update(spec).state;
      doc.value = parse(state.doc.toString());
      for (const l of listeners) l(state);
    },
    focus() {},
  };
  const session = {
    view,
    doc,
    kind: shallowRef<'fountain' | 'markdown'>('fountain'),
    load(text: string) {
      state = EditorState.create({ doc: text });
      doc.value = parse(text);
      for (const l of listeners) l(state);
    },
    setKind() {},
    setReadOnly() {},
    reset() {
      listeners.clear();
      session.load(SAMPLE_SCREENPLAY);
    },
    onState(listener: (state: State) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    goto() {},
  };
  return { useEditor: () => session };
});

/** A session over the database as it is: `keep` leaves the stored scripts alone (a later visit). */
async function visit(options: { keep?: boolean } = {}) {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  const { db } = await import('../app/storage/db');
  if (!options.keep) await Promise.all(db.tables.map((table) => table.clear()));
  const { useEditor } = await import('../app/editor/session');
  (useEditor() as unknown as { reset(): void }).reset();
  const script = await import('../app/storage/script');
  const session = script.useScript();
  // Before the first project is open, a visit has not been decided.
  expect(script.isFirstVisit()).toBe(false);
  await vi.waitFor(() => expect(session.ready.value).toBe(true));
  return { ...script, session, editor: useEditor(), db };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('a first visit', () => {
  test('welcomes only a first visit', async () => {
    // No projects: the first visit, and the sample is what opens.
    const first = await visit();
    expect(first.isFirstVisit()).toBe(true);
    expect(first.session.project.value?.sample).toBe('screenplay');

    // The sample is a project now, so the next visit finds one.
    const second = await visit({ keep: true });
    expect(second.isFirstVisit()).toBe(false);

    // A script of the writer's own is a project as well.
    await second.session.newScript('screenplay');
    const third = await visit({ keep: true });
    expect(third.isFirstVisit()).toBe(false);
    expect(third.session.project.value?.sample).toBeUndefined();
  });

  test('puts the cursor on the first scene heading', async () => {
    const { editor, SAMPLE_SCREENPLAY_FOR_TEST } = await visitWithText();
    const text = editor.view.state.doc.toString();
    const at = text.indexOf('INT. KITCHEN - NIGHT');
    expect(at).toBeGreaterThan(0);
    expect(SAMPLE_SCREENPLAY_FOR_TEST).toBe(text);
    expect(editor.view.state.selection.main.head).toBe(at);
    expect(editor.view.state.selection.main.empty).toBe(true);
  });

  test('leaves the cursor alone on a returning visit', async () => {
    await visit();
    const again = await visit({ keep: true });
    expect(again.editor.view.state.selection.main.head).toBe(0);
  });
});

async function visitWithText() {
  const t = await visit();
  const { SAMPLE_SCREENPLAY } = await import('../app/editor/samples');
  return { ...t, SAMPLE_SCREENPLAY_FOR_TEST: SAMPLE_SCREENPLAY };
}

describe('Reset sample', () => {
  test('puts the sample’s own text back, only while a sample is open', async () => {
    const t = await visit();
    expect(t.session.canResetSample.value).toBe(true);
    t.editor.view.dispatch({ changes: { from: 0, insert: 'EDIT ' } });
    expect(t.editor.view.state.doc.toString().startsWith('EDIT Title')).toBe(true);

    expect(t.session.resetSample()).toBe(true);
    const { SAMPLE_SCREENPLAY } = await import('../app/editor/samples');
    expect(t.editor.view.state.doc.toString()).toBe(SAMPLE_SCREENPLAY);
    expect(t.editor.view.state.selection.main.head).toBe(SAMPLE_SCREENPLAY.indexOf('INT. KITCHEN'));

    // A script of the writer's own is not reset.
    await t.session.newScript('screenplay');
    expect(t.session.canResetSample.value).toBe(false);
    const before = t.editor.view.state.doc.toString();
    expect(t.session.resetSample()).toBe(false);
    expect(t.editor.view.state.doc.toString()).toBe(before);
  });

  test('resets the stage play to the stage play', async () => {
    const t = await visit();
    await t.session.openSample('stage-play');
    t.editor.view.dispatch({ changes: { from: 0, insert: 'EDIT ' } });
    expect(t.session.resetSample()).toBe(true);
    const { SAMPLE_STAGE_PLAY } = await import('../app/editor/samples');
    expect(t.editor.view.state.doc.toString()).toBe(SAMPLE_STAGE_PLAY);
  });
});
