// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import type { EditorState as State } from '@codemirror/state';
import { parse } from '@drafter/fountain';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { exportOptionsOf, optionsPhrase } from '../app/storage/export-options';
import type { ExportOptions } from '../app/workers/export-compute';

// The editor session without Nuxt's aliases: a state that `dispatch`es and tells its listeners.
vi.mock('../app/editor/session', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { shallowRef } = await import('vue');
  const TEXT = 'Title: The Call\nAuthor: A. Writer\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
  let state = EditorState.create({ doc: TEXT });
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
      session.load(TEXT);
    },
    onState(listener: (state: State) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    goto() {},
  };
  return { useEditor: () => session };
});

/** A fresh session over an empty database, with a script of the writer's own open. */
async function visit() {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  const { db } = await import('../app/storage/db');
  await Promise.all(db.tables.map((table) => table.clear()));
  const { useEditor } = await import('../app/editor/session');
  (useEditor() as unknown as { reset(): void }).reset();
  const script = await import('../app/storage/script');
  const session = script.useScript();
  await vi.waitFor(() => expect(session.ready.value).toBe(true));
  await session.newScript('screenplay');
  const options = await import('../app/storage/export-options');
  const { useGuard } = await import('../app/storage/guard');
  return { session, db, editor: useEditor(), guard: useGuard(), ...options };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exportOptionsOf', () => {
  test('reads missing or unknown options as the defaults', () => {
    const defaults = { sceneNumbers: 'none', titlePage: 'full', notes: 'leave-out' };
    expect(exportOptionsOf(undefined)).toEqual(defaults);
    expect(exportOptionsOf(null)).toEqual(defaults);
    expect(exportOptionsOf({})).toEqual(defaults);
    expect(exportOptionsOf({ exportOptions: {} })).toEqual(defaults);
    // From a later version, or a damaged record: each unknown value is its default alone.
    expect(exportOptionsOf({ exportOptions: { sceneNumbers: 'roman' } as never })).toEqual(
      defaults,
    );
    expect(
      exportOptionsOf({ exportOptions: { sceneNumbers: 'roman', titlePage: 'none' } as never }),
    ).toEqual({ sceneNumbers: 'none', titlePage: 'none', notes: 'leave-out' });
    expect(exportOptionsOf({ exportOptions: { sceneNumbers: 'written' } })).toEqual({
      sceneNumbers: 'written',
      titlePage: 'full',
      notes: 'leave-out',
    });
  });

  test('reads a missing or unknown notes value as Leave out', () => {
    // A project kept before there was a notes option has none: it reads as Leave out.
    expect(
      exportOptionsOf({ exportOptions: { sceneNumbers: 'all', titlePage: 'none' } }).notes,
    ).toBe('leave-out');
    for (const notes of ['all', '', null, 1, 'Include']) {
      expect(exportOptionsOf({ exportOptions: { notes } as never }).notes, String(notes)).toBe(
        'leave-out',
      );
    }
    expect(exportOptionsOf({ exportOptions: { notes: 'include' } })).toEqual({
      sceneNumbers: 'none',
      titlePage: 'full',
      notes: 'include',
    });
  });
});

describe('optionsPhrase', () => {
  test('optionsPhrase is empty for the defaults and names each other choice', () => {
    const phrase = (sceneNumbers: string, titlePage: string) =>
      optionsPhrase({ sceneNumbers, titlePage, notes: 'leave-out' } as ExportOptions);
    expect(phrase('none', 'full')).toBe('');
    expect(phrase('none', 'title-author')).toBe('with the title and author only');
    expect(phrase('none', 'none')).toBe('with no title page');
    expect(phrase('written', 'full')).toBe('with scene numbers as written');
    expect(phrase('written', 'title-author')).toBe(
      'with scene numbers as written and the title and author only',
    );
    expect(phrase('written', 'none')).toBe('with scene numbers as written and no title page');
    expect(phrase('all', 'full')).toBe('with every scene numbered');
    expect(phrase('all', 'title-author')).toBe(
      'with every scene numbered and the title and author only',
    );
    expect(phrase('all', 'none')).toBe('with every scene numbered and no title page');
  });

  test('optionsPhrase says with notes', () => {
    const phrase = (sceneNumbers: string, titlePage: string) =>
      optionsPhrase({ sceneNumbers, titlePage, notes: 'include' } as ExportOptions);
    expect(phrase('none', 'full')).toBe('with notes');
    expect(phrase('all', 'full')).toBe('with every scene numbered and notes');
    expect(phrase('none', 'none')).toBe('with no title page and notes');
    // Three: a list, its last joined by "and".
    expect(phrase('written', 'title-author')).toBe(
      'with scene numbers as written, the title and author only, and notes',
    );
  });
});

describe('setExportOption', () => {
  test('setExportOption keeps the choice on the open project and does nothing read-only', async () => {
    const t = await visit();
    const id = t.session.project.value?.id as string;
    const text = t.editor.view.state.doc.toString();
    const stored = async () => (await t.db.projects.get(id))?.exportOptions;

    await t.setExportOption('sceneNumbers', 'written');
    // The copy held here at once, and the stored one: each option with the other's value.
    expect(t.session.project.value?.exportOptions).toEqual({
      sceneNumbers: 'written',
      titlePage: 'full',
      notes: 'leave-out',
    });
    expect(await stored()).toEqual({
      sceneNumbers: 'written',
      titlePage: 'full',
      notes: 'leave-out',
    });
    await t.setExportOption('titlePage', 'none');
    expect(await stored()).toEqual({
      sceneNumbers: 'written',
      titlePage: 'none',
      notes: 'leave-out',
    });
    await t.setExportOption('notes', 'include');
    expect(await stored()).toEqual({
      sceneNumbers: 'written',
      titlePage: 'none',
      notes: 'include',
    });
    // The text is not touched, and the script isn't changed by it.
    expect(t.editor.view.state.doc.toString()).toBe(text);
    expect((await t.db.projects.get(id))?.source).toBe(text);
    expect(t.session.dirty.value).toBe(false);

    // A tab that only shows the script keeps nothing.
    const readOnly = vi.spyOn(t.guard.readOnly, 'value', 'get').mockReturnValue(true);
    await t.setExportOption('titlePage', 'title-author');
    expect(await stored()).toEqual({
      sceneNumbers: 'written',
      titlePage: 'none',
      notes: 'include',
    });
    expect(t.session.project.value?.exportOptions).toEqual({
      sceneNumbers: 'written',
      titlePage: 'none',
      notes: 'include',
    });
    readOnly.mockRestore();

    // A recovery write afterward keeps them: they are the project's, not the text's.
    t.editor.view.dispatch({ changes: { from: text.length, insert: 'More.\n' } });
    await t.session.flush();
    expect(await stored()).toEqual({
      sceneNumbers: 'written',
      titlePage: 'none',
      notes: 'include',
    });
  });

  test('two quick choices are both kept, though the first is still being written', async () => {
    const t = await visit();
    const id = t.session.project.value?.id as string;
    // The first write to the database is slow: the second choice is made while it waits.
    const put = t.db.projects.put.bind(t.db.projects);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    vi.spyOn(t.db.projects, 'put').mockImplementation(async (...args) => {
      if (first) {
        first = false;
        await held;
      }
      return put(...args);
    });
    const one = t.setExportOption('sceneNumbers', 'written');
    const two = t.setExportOption('titlePage', 'none');
    release();
    await Promise.all([one, two]);
    const both = { sceneNumbers: 'written', titlePage: 'none', notes: 'leave-out' };
    expect(t.session.project.value?.exportOptions).toEqual(both);
    expect((await t.db.projects.get(id))?.exportOptions).toEqual(both);
  });

  test('a choice waiting its turn is kept, though another script opened meanwhile', async () => {
    const t = await visit();
    const id = t.session.project.value?.id as string;
    // The first write is slow; the second choice waits behind it, and the writer opens another script.
    const put = t.db.projects.put.bind(t.db.projects);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    vi.spyOn(t.db.projects, 'put').mockImplementation(async (...args) => {
      if (first) {
        first = false;
        await held;
      }
      return put(...args);
    });
    const one = t.setExportOption('sceneNumbers', 'written');
    const two = t.setExportOption('titlePage', 'none');
    const opened = t.session.newScript('screenplay');
    await vi.waitFor(() => expect(t.session.project.value?.id).not.toBe(id));
    release();
    await Promise.all([one, two, opened]);
    expect((await t.db.projects.get(id))?.exportOptions).toEqual({
      sceneNumbers: 'written',
      titlePage: 'none',
      notes: 'leave-out',
    });
    // The script open now has none of them.
    expect(t.session.project.value?.exportOptions).toBeUndefined();
  });
});
