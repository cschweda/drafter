// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import type { EditorState as State } from '@codemirror/state';
import { parse } from '@drafter/fountain';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FileAccess, FileRef } from '../app/storage/files';

// The editor session without Nuxt's aliases: a state that `dispatch`es and tells its listeners.
vi.mock('../app/editor/samples', () => {
  const screenplay = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
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
  const { parse } = await import('@drafter/fountain');
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
    load(text: string) {
      state = EditorState.create({ doc: text });
      doc.value = parse(text);
      for (const l of listeners) l(state);
    },
    setReadOnly() {},
    /** For the tests: the first state again, and no listeners left from an earlier session. */
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

interface MemoryRef extends FileRef {
  id: number;
}

/** A FileAccess that keeps its files in a Map: the seam a desktop build would fill. */
function memoryFiles(options: { inPlace?: boolean } = {}) {
  const files = new Map<number, { name: string; bytes: Uint8Array }>();
  const log = {
    picks: [] as { name: string; kind: string }[],
    writes: [] as { ref: MemoryRef; data: string | Uint8Array }[],
    downloads: [] as { name: string; data: string | Uint8Array; type: string }[],
  };
  const control = {
    /** The names `pickToSave` answers with; a null cancels. */
    answers: [] as (string | null)[],
    /** Makes the next write fail with this. */
    failNext: null as Error | null,
  };
  let next = 1;
  const bytesOf = (data: string | Uint8Array) =>
    typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const access: FileAccess = {
    canSaveInPlace: options.inPlace ?? true,
    async pickToOpen() {
      throw new Error('not used');
    },
    async fromDrop() {
      throw new Error('not used');
    },
    async pickToSave(suggestedName, kind) {
      log.picks.push({ name: suggestedName, kind });
      const answer = control.answers.shift();
      if (answer === null) return null;
      const ref: MemoryRef = { id: next++, name: answer ?? suggestedName };
      files.set(ref.id, { name: ref.name, bytes: new Uint8Array() });
      return ref;
    },
    async read(ref) {
      const file = files.get((ref as MemoryRef).id);
      if (!file) throw new (await import('../app/storage/files')).FileGoneError();
      return { bytes: file.bytes, lastModified: 0 };
    },
    async write(ref, data) {
      if (control.failNext) {
        const error = control.failNext;
        control.failNext = null;
        throw error;
      }
      const id = (ref as MemoryRef).id;
      const file = files.get(id);
      if (!file) throw new (await import('../app/storage/files')).FileGoneError();
      file.bytes = bytesOf(data);
      log.writes.push({ ref: ref as MemoryRef, data });
    },
    async permission() {
      return 'granted';
    },
    async sameFile(a, b) {
      return (a as MemoryRef).id === (b as MemoryRef).id;
    },
    download(name, data, type) {
      log.downloads.push({ name, data, type });
    },
  };
  return { access, files, log, control };
}

async function fresh(options: { inPlace?: boolean } = {}) {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  const { setFiles } = await import('../app/storage/files');
  const memory = memoryFiles(options);
  setFiles(memory.access);
  // Each test starts with an empty database.
  const { db } = await import('../app/storage/db');
  await Promise.all(db.tables.map((table) => table.clear()));
  const { useEditor } = await import('../app/editor/session');
  (useEditor() as unknown as { reset(): void }).reset();
  const { useScript } = await import('../app/storage/script');
  const { save, saveAs, saveError } = await import('../app/storage/save');
  const { decodeFile } = await import('../app/storage/text');
  const { hashText } = await import('../app/storage/hash');
  const projects = await import('../app/storage/projects');
  const script = useScript();
  await vi.waitFor(() => expect(script.ready.value).toBe(true));
  const editor = useEditor();
  const type = (text: string) =>
    editor.view.dispatch({
      changes: { from: editor.view.state.doc.length, insert: text },
    });
  const shown = () => editor.view.state.doc.toString();
  return {
    ...memory,
    script,
    editor,
    save,
    saveAs,
    saveError,
    db,
    decodeFile,
    hashText,
    projects,
    type,
    shown,
  };
}

// The recovery copy's timers are the test's to run: a session left over from the last test can't
// write into this one's database.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('saving through a FileAccess', () => {
  test('saves and reopens a script through any FileAccess', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('FADE IN:\n');

    expect(await t.save()).toBe('saved');
    expect(t.log.picks).toEqual([{ name: 'Untitled Screenplay.fountain', kind: 'fountain' }]);
    const first = t.log.writes[0]?.ref as MemoryRef;
    expect(t.decodeFile((await t.access.read(first)).bytes).text).toBe(t.shown());

    // A bound script writes in place, without asking where.
    t.type('CUT TO:\n');
    expect(t.script.dirty.value).toBe(true);
    expect(await t.save()).toBe('saved');
    expect(t.log.picks).toHaveLength(1);
    expect(t.log.writes).toHaveLength(2);
    expect(t.log.writes[1]?.ref.id).toBe(first.id);
    expect(t.script.dirty.value).toBe(false);

    // Save As asks again, and the script follows the new file.
    t.control.answers.push('Second.fountain');
    expect(await t.saveAs()).toBe('saved');
    expect(t.log.picks).toHaveLength(2);
    const second = t.log.writes[2]?.ref as MemoryRef;
    expect(second.id).not.toBe(first.id);
    const project = await t.projects.getProject(t.script.project.value?.id ?? '');
    expect(project?.fileName).toBe('Second.fountain');
    expect((await t.access.read(second)).bytes).toEqual(new TextEncoder().encode(t.shown()));
    // Reopened from the file, the text is what the editor held.
    expect(t.decodeFile((await t.access.read(second)).bytes).text).toBe(t.shown());
    // The first file was not touched again.
    expect(t.decodeFile((await t.access.read(first)).bytes).text).toContain('CUT TO:');
  });

  test('records the hash, the time, the file name, and the saved text', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('FADE IN:\n');
    const before = Date.now();
    await t.save();
    const saved = t.shown();
    const id = t.script.project.value?.id ?? '';
    const row = await t.projects.getProject(id);
    expect(row?.savedHash).toBe(await t.hashText(saved));
    expect(row?.savedAt).toBeGreaterThanOrEqual(before);
    expect(row?.fileName).toBe('Untitled Screenplay.fountain');
    expect(row?.fsHandleId).toBeTruthy();
    expect(await t.projects.getSavedText(id)).toBe(saved);
    expect(t.script.project.value?.savedHash).toBe(row?.savedHash);
  });

  test('keeps the saved text before the project that points to it', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    const order: string[] = [];
    const snapshots = t.db.snapshots.put.bind(t.db.snapshots);
    const projects = t.db.projects.put.bind(t.db.projects);
    vi.spyOn(t.db.snapshots, 'put').mockImplementation(((...args: Parameters<typeof snapshots>) => {
      order.push('snapshot');
      return snapshots(...args);
    }) as never);
    vi.spyOn(t.db.projects, 'put').mockImplementation(((...args: Parameters<typeof projects>) => {
      order.push('project');
      return projects(...args);
    }) as never);
    t.type('X\n');
    await t.save();
    expect(order.indexOf('snapshot')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('snapshot')).toBeLessThan(order.lastIndexOf('project'));
  });

  test('stays saved after typing resumes and the recovery copy writes', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('FADE IN:\n');
    await t.save();
    const id = t.script.project.value?.id ?? '';
    const saved = await t.projects.getProject(id);

    t.type('MORE\n');
    await vi.waitFor(
      async () => expect((await t.projects.getProject(id))?.source).toContain('MORE'),
      { timeout: 3000 },
    );
    const row = await t.projects.getProject(id);
    expect(row?.savedHash).toBe(saved?.savedHash);
    expect(row?.savedAt).toBe(saved?.savedAt);
    expect(row?.fileName).toBe('Untitled Screenplay.fountain');
    expect(row?.fsHandleId).toBe(saved?.fsHandleId);
    // The session's own copy, which the next write starts from, kept them too.
    expect(t.script.project.value?.savedHash).toBe(saved?.savedHash);
    expect(t.script.project.value?.fsHandleId).toBe(saved?.fsHandleId);
    // And only the typed-since text counts as changed.
    expect(t.script.dirty.value).toBe(true);
  });

  test('does nothing when the picker is cancelled', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('FADE IN:\n');
    const id = t.script.project.value?.id ?? '';
    t.control.answers.push(null);
    expect(await t.save()).toBe('cancelled');
    expect(t.log.writes).toHaveLength(0);
    const row = await t.projects.getProject(id);
    expect(row?.savedHash).toBeUndefined();
    expect(row?.fileName).toBeUndefined();
    expect(t.script.dirty.value).toBe(true);
    expect(t.saveError.value).toBe('');
  });

  test('writes a file with its line breaks and byte-order mark', async () => {
    const t = await fresh();
    const made = await t.projects.createProject({
      source: 'Title: Crlf\n\nINT. ROOM - DAY\n\nHi.\n',
      lineBreak: '\r\n',
      bom: true,
    });
    await t.script.open(made.id);
    expect(await t.save()).toBe('saved');
    const bytes = (await t.access.read(t.log.writes[0]?.ref as MemoryRef)).bytes;
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes);
    expect(text).toBe('﻿Title: Crlf\r\n\r\nINT. ROOM - DAY\r\n\r\nHi.\r\n');
  });

  test('turns a saved sample into the writer’s own script and leaves the sample alone', async () => {
    const t = await fresh();
    const sample = t.script.project.value;
    expect(sample?.sample).toBe('screenplay');
    t.type('EDIT\n');
    expect(await t.save()).toBe('saved');
    const mine = t.script.project.value;
    expect(mine?.id).not.toBe(sample?.id);
    expect(mine?.sample).toBeUndefined();
    expect(mine?.fileName).toBe('The Call.fountain');
    expect(t.script.dirty.value).toBe(false);
    expect(t.shown()).toContain('EDIT');
    const rows = await t.projects.listProjects();
    expect(rows).toHaveLength(2);
    const kept = rows.find((p) => p.id === sample?.id);
    expect(kept?.sample).toBe('screenplay');
    expect(kept?.savedHash).toBeUndefined();
    expect(kept?.fileName).toBeUndefined();
    expect(kept?.fsHandleId).toBeUndefined();
    // Writing continues into the new script, not the sample.
    t.type('MORE\n');
    await vi.waitFor(
      async () => expect((await t.projects.getProject(mine?.id ?? ''))?.source).toContain('MORE'),
      { timeout: 3000 },
    );
    expect((await t.projects.getProject(sample?.id ?? ''))?.source).not.toContain('MORE');
  });

  test('asks where to save when the file is gone', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('A\n');
    await t.save();
    const first = t.log.writes[0]?.ref as MemoryRef;
    t.files.delete(first.id);
    t.type('B\n');
    t.control.answers.push('Moved.fountain');
    expect(await t.save()).toBe('saved');
    expect(t.log.picks).toHaveLength(2);
    expect(t.script.project.value?.fileName).toBe('Moved.fountain');
    const moved = t.log.writes.at(-1)?.ref as MemoryRef;
    expect(t.decodeFile((await t.access.read(moved)).bytes).text).toBe(t.shown());
  });

  test('says so and changes nothing when the file can’t be written', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('A\n');
    t.control.failNext = new DOMException('no', 'NotAllowedError');
    await expect(t.save()).rejects.toThrow();
    expect(t.saveError.value).not.toBe('');
    expect(t.script.project.value?.savedHash).toBeUndefined();
    expect(t.script.dirty.value).toBe(true);
    // The next try clears the message.
    expect(await t.save()).toBe('saved');
    expect(t.saveError.value).toBe('');
  });

  test('downloads the script when the browser can’t save in place', async () => {
    const t = await fresh({ inPlace: false });
    await t.script.newScript('screenplay');
    t.type('A\n');
    expect(await t.save()).toBe('saved');
    expect(t.log.picks).toHaveLength(0);
    expect(t.log.downloads).toEqual([
      { name: 'Untitled Screenplay.fountain', data: t.shown(), type: 'text/plain' },
    ]);
    expect(t.script.dirty.value).toBe(false);
    expect(t.script.project.value?.fileName).toBe('Untitled Screenplay.fountain');
    expect(t.script.project.value?.fsHandleId).toBeUndefined();
    // Again, under the same name.
    t.type('B\n');
    await t.save();
    expect(t.log.downloads[1]?.name).toBe('Untitled Screenplay.fountain');
    expect(parse(String(t.log.downloads[1]?.data)).titlePage).toBeTruthy();
  });

  test('saves two requests made together one after the other', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('A\n');
    const both = await Promise.all([t.save(), t.save()]);
    expect(both).toEqual(['saved', 'saved']);
    // One question, then a write in place.
    expect(t.log.picks).toHaveLength(1);
    expect(t.log.writes).toHaveLength(2);
  });
});
