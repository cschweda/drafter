// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import type { EditorState as State } from '@codemirror/state';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FileAccess, FileRef, PickedFile } from '../app/storage/files';

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
    kind: shallowRef<'fountain' | 'markdown'>('fountain'),
    load(text: string, kind: 'fountain' | 'markdown' = 'fountain') {
      session.kind.value = kind;
      state = EditorState.create({ doc: text });
      doc.value = parse(text);
      for (const l of listeners) l(state);
    },
    setKind(next: 'fountain' | 'markdown') {
      session.kind.value = next;
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

/** A FileAccess whose files are the test's: `pick` is what the next picker or drop answers. */
function memoryFiles(options: { inPlace?: boolean } = {}) {
  const writes: { ref: MemoryRef; data: string | Uint8Array }[] = [];
  const stored = new Map<number, Uint8Array>();
  /** What `fromPath` answers, by path (the desktop app's way of opening a file named by the system). */
  const byPath = new Map<string, PickedFile>();
  const access: FileAccess = {
    canSaveInPlace: options.inPlace ?? true,
    async fromPath(path) {
      const file = byPath.get(path);
      // Imported now: the test resets its modules, so a top-level import is another class.
      if (!file) throw new (await import('../app/storage/files')).FileGoneError();
      return file;
    },
    async pickToOpen() {
      return null;
    },
    async fromDrop() {
      return null;
    },
    async pickToSave() {
      return null;
    },
    async read(ref) {
      return { bytes: stored.get((ref as MemoryRef).id) ?? new Uint8Array(), lastModified: 0 };
    },
    async write(ref, data) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      stored.set((ref as MemoryRef).id, bytes);
      writes.push({ ref: ref as MemoryRef, data });
    },
    async permission() {
      return 'granted';
    },
    async sameFile(a, b) {
      return (a as MemoryRef).id === (b as MemoryRef).id;
    },
    download() {},
  };
  /** A file as the picker would hand it over. */
  const picked = (
    name: string,
    content: string | Uint8Array,
    id: number | null = null,
  ): PickedFile => {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    if (id !== null) stored.set(id, bytes);
    return { ref: id === null ? null : ({ id, name } as MemoryRef), name, bytes, lastModified: 0 };
  };
  return { access, writes, stored, picked, byPath };
}

async function fresh(options: { inPlace?: boolean } = {}) {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  const { setFiles } = await import('../app/storage/files');
  const memory = memoryFiles(options);
  setFiles(memory.access);
  const { db } = await import('../app/storage/db');
  await Promise.all(db.tables.map((table) => table.clear()));
  const { useEditor } = await import('../app/editor/session');
  (useEditor() as unknown as { reset(): void }).reset();
  const { useScript } = await import('../app/storage/script');
  const open = await import('../app/storage/open');
  const { save } = await import('../app/storage/save');
  const projects = await import('../app/storage/projects');
  const { hashText } = await import('../app/storage/hash');
  const script = useScript();
  await vi.waitFor(() => expect(script.ready.value).toBe(true));
  const editor = useEditor();
  const shown = () => editor.view.state.doc.toString();
  const type = (text: string) =>
    editor.view.dispatch({ changes: { from: editor.view.state.doc.length, insert: text } });
  /** The scripts that are not samples. */
  const mine = async () => (await projects.listProjects()).filter((p) => !p.sample);
  return { ...memory, ...open, save, projects, hashText, script, editor, shown, type, mine, db };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const SCRIPT = 'Title: The Open Door\n\nINT. HALL - DAY\n\nA door opens.\n';
const crlf = (s: string) => s.replace(/\n/g, '\r\n');

describe('opening a file', () => {
  test('opens a picked file as a script of its own, clean, with its line breaks and BOM', async () => {
    const t = await fresh();
    const before = Date.now();
    await t.openFile(t.picked('Door.fountain', `﻿${crlf(SCRIPT)}`, 7));

    expect(t.shown()).toBe(SCRIPT);
    const row = t.script.project.value;
    expect(row?.title).toBe('The Open Door');
    expect(row?.lineBreak).toBe('\r\n');
    expect(row?.bom).toBe(true);
    expect(row?.fileName).toBe('Door.fountain');
    expect(row?.fsHandleId).toBeTruthy();
    expect(row?.savedHash).toBe(await t.hashText(SCRIPT));
    expect(row?.savedAt).toBeGreaterThanOrEqual(before);
    expect(row?.baseline).toBe(SCRIPT);
    expect(await t.projects.getSavedText(row?.id ?? '')).toBe(SCRIPT);
    expect(t.script.dirty.value).toBe(false);
    expect(t.openError.value).toBe('');
    // The stored copy is the same.
    expect((await t.projects.getProject(row?.id ?? ''))?.savedHash).toBe(row?.savedHash);

    t.type('MORE\n');
    expect(t.script.dirty.value).toBe(true);
  });

  test('opens a .md file as Markdown, titled by its first heading, and keeps it Markdown', async () => {
    const t = await fresh();
    const notes = '# The Treatment\n\nAct one: a *door* opens.\n';
    await t.openFile(t.picked('notes.md', notes, 9));
    expect(t.shown()).toBe(notes);
    expect(t.editor.kind.value).toBe('markdown');
    const row = t.script.project.value;
    expect(row).toMatchObject({ kind: 'markdown', title: 'The Treatment', fileName: 'notes.md' });
    expect(t.script.dirty.value).toBe(false);
    // Save writes the same file, byte for byte.
    expect(await t.save()).toBe('saved');
    expect(t.stored.get(9)).toEqual(new TextEncoder().encode(notes));
    // .markdown too, and a .fountain after it is Fountain again.
    await t.openFile(t.picked('more.markdown', '## Heading\n'));
    expect(t.script.project.value?.kind).toBe('markdown');
    await t.openFile(t.picked('The Door.fountain', SCRIPT));
    expect(t.script.project.value?.kind).toBe('fountain');
    expect(t.editor.kind.value).toBe('fountain');
  });

  test('saves it back byte for byte, and keeps the file on Save', async () => {
    const t = await fresh();
    const original = `﻿${crlf(SCRIPT)}`;
    await t.openFile(t.picked('Door.fountain', original, 7));
    expect(await t.save()).toBe('saved');
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0]?.ref.id).toBe(7);
    expect(t.stored.get(7)).toEqual(new TextEncoder().encode(original));
  });

  test('names an untitled script after its file', async () => {
    const t = await fresh();
    await t.openFile(t.picked('Rough notes.txt', 'INT. HALL - DAY\n\nHi.\n'));
    expect(t.script.project.value?.title).toBe('Rough notes');
    expect(t.script.project.value?.fileName).toBe('Rough notes.txt');
    // No handle from an input or a download-only browser.
    expect(t.script.project.value?.fsHandleId).toBeUndefined();
    // It stays so as the recovery copy is written.
    t.type('More.\n');
    await vi.waitFor(
      async () =>
        expect((await t.projects.getProject(t.script.project.value?.id ?? ''))?.source).toContain(
          'More.',
        ),
      { timeout: 3000 },
    );
    expect(t.script.project.value?.title).toBe('Rough notes');
  });

  test('keeps the script that was open, with its text', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('TYPED BEFORE\n');
    const was = t.script.project.value?.id ?? '';
    await t.openFile(t.picked('Door.fountain', SCRIPT));
    expect(t.script.project.value?.id).not.toBe(was);
    expect((await t.projects.getProject(was))?.source).toContain('TYPED BEFORE');
  });

  test('refuses a file over 5 MB, without opening anything', async () => {
    const t = await fresh();
    const was = t.script.project.value?.id;
    await t.openFile(t.picked('Big.txt', new Uint8Array(5 * 1024 * 1024 + 1).fill(0x61)));
    expect(t.openError.value).toMatch(/too big/i);
    expect(t.script.project.value?.id).toBe(was);
    expect(await t.mine()).toHaveLength(0);
    // Exactly 5 MB is allowed.
    await t.openFile(t.picked('Edge.txt', new Uint8Array(5 * 1024 * 1024).fill(0x61)));
    expect(t.openError.value).toBe('');
    expect(t.script.project.value?.fileName).toBe('Edge.txt');
  });

  test('refuses a file with a NUL byte in its first 8 KB, but not one after it', async () => {
    const t = await fresh();
    const was = t.script.project.value?.id;
    const early = new Uint8Array(100).fill(0x61);
    early[8191] = 0;
    await t.openFile(t.picked('Image.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 1])));
    expect(t.openError.value).toMatch(/isn’t a script|not a script|text/i);
    expect(t.script.project.value?.id).toBe(was);
    const edge = new Uint8Array(9000).fill(0x61);
    edge[8191] = 0; // the last byte of the first 8 KB
    await t.openFile(t.picked('Edge.bin', edge));
    expect(t.openError.value).not.toBe('');
    expect(t.script.project.value?.id).toBe(was);
    const late = new Uint8Array(9000).fill(0x61);
    late[8192] = 0; // the first byte after it
    await t.openFile(t.picked('Late.txt', late));
    expect(t.openError.value).toBe('');
    expect(t.script.project.value?.fileName).toBe('Late.txt');
  });

  test('refuses a file that is not UTF-8, so saving can never rewrite its characters', async () => {
    const t = await fresh();
    const was = t.script.project.value?.id;
    // "café" in Latin-1.
    await t.openFile(t.picked('Latin.txt', new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x0a])));
    expect(t.openError.value).toMatch(/isn’t UTF-8 text/);
    expect(t.script.project.value?.id).toBe(was);
    expect(await t.mine()).toHaveLength(0);
    // The message is gone with the next good open.
    await t.openFile(t.picked('Door.fountain', SCRIPT));
    expect(t.openError.value).toBe('');
  });

  test('opens a file that is already open as the same script', async () => {
    const t = await fresh();
    await t.openFile(t.picked('Door.fountain', SCRIPT, 7));
    const first = t.script.project.value?.id ?? '';
    t.type('EDITED\n');
    await t.script.newScript('screenplay');
    expect(t.script.project.value?.id).not.toBe(first);

    // The same file, a different handle object: the picker gave a new one.
    await t.openFile(t.picked('Door.fountain', SCRIPT, 7));
    expect(t.script.project.value?.id).toBe(first);
    expect(t.shown()).toContain('EDITED');
    expect((await t.mine()).filter((p) => p.title === 'The Open Door')).toHaveLength(1);
    // A different file with the same name is a different script.
    await t.openFile(t.picked('Door.fountain', SCRIPT, 8));
    expect(t.script.project.value?.id).not.toBe(first);
  });

  test('does nothing more while another switch is under way, and says so', async () => {
    const t = await fresh();
    // New screenplay is held while it creates its script.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const add = t.db.projects.add.bind(t.db.projects);
    vi.spyOn(t.db.projects, 'add').mockImplementationOnce((async (
      ...args: Parameters<typeof add>
    ) => {
      await gate;
      return add(...args);
    }) as never);
    const slow = t.script.newScript('screenplay');
    await t.openFile(t.picked('Door.fountain', SCRIPT));
    release();
    await slow;
    expect(t.openError.value).toMatch(/still opening|try again/i);
    expect((await t.mine()).some((p) => p.title === 'The Open Door')).toBe(false);
  });

  test('says so when the database refuses, and leaves the open script alone', async () => {
    const t = await fresh();
    await t.script.newScript('screenplay');
    t.type('KEEP\n');
    const was = t.script.project.value?.id;
    vi.spyOn(t.db.projects, 'add').mockRejectedValueOnce(new Error('quota'));
    await t.openFile(t.picked('Door.fountain', SCRIPT));
    expect(t.openError.value).toMatch(/couldn’t open/i);
    expect(t.script.project.value?.id).toBe(was);
    expect(t.shown()).toContain('KEEP');
  });
});

describe('a file with the same title as a script in the browser', () => {
  const OTHER = 'Title: The Open Door\n\nINT. YARD - DAY\n\nDifferent.\n';

  async function twice(options: { inPlace?: boolean } = {}) {
    const t = await fresh({ inPlace: options.inPlace ?? false });
    await t.openFile(t.picked('Door.fountain', SCRIPT));
    const first = t.script.project.value?.id ?? '';
    await t.script.newScript('screenplay');
    return { t, first };
  }

  const answer = async (t: Awaited<ReturnType<typeof fresh>>, choice: string) => {
    await vi.waitFor(() => expect(t.sameTitleQuestion.value).not.toBeNull());
    expect(t.sameTitleQuestion.value?.title).toBe('The Open Door');
    (t.sameTitleQuestion.value as { answer(c: string): void }).answer(choice);
  };

  test('asks first where saving downloads, and Cancel changes nothing', async () => {
    const { t, first } = await twice();
    const was = t.script.project.value?.id;
    const opening = t.openFile(t.picked('Door2.fountain', OTHER));
    await answer(t, 'cancel');
    await opening;
    expect(t.sameTitleQuestion.value).toBeNull();
    expect(t.script.project.value?.id).toBe(was);
    expect((await t.mine()).filter((p) => p.title === 'The Open Door')).toHaveLength(1);
    expect((await t.projects.getProject(first))?.source).toBe(SCRIPT);
  });

  test('Open beside it makes a second script', async () => {
    const { t, first } = await twice();
    const opening = t.openFile(t.picked('Door2.fountain', OTHER));
    await answer(t, 'beside');
    await opening;
    expect(t.script.project.value?.id).not.toBe(first);
    expect(t.shown()).toBe(OTHER);
    expect((await t.mine()).filter((p) => p.title === 'The Open Door')).toHaveLength(2);
    expect((await t.projects.getProject(first))?.source).toBe(SCRIPT);
  });

  test('Replace that script puts the new text in it, clean, as one change', async () => {
    const { t, first } = await twice();
    const spy = vi.spyOn(t.editor.view, 'dispatch');
    const opening = t.openFile(t.picked('Door2.fountain', OTHER));
    await answer(t, 'replace');
    await opening;
    expect(t.script.project.value?.id).toBe(first);
    expect(t.shown()).toBe(OTHER);
    expect((await t.mine()).filter((p) => p.title === 'The Open Door')).toHaveLength(1);
    const row = await t.projects.getProject(first);
    expect(row?.fileName).toBe('Door2.fountain');
    expect(row?.savedHash).toBe(await t.hashText(OTHER));
    expect(await t.projects.getSavedText(first)).toBe(OTHER);
    expect(t.script.dirty.value).toBe(false);
    // The whole text changed in one transaction, so one undo brings the old text back.
    const changes = spy.mock.calls.filter(([spec]) => (spec as { changes?: unknown }).changes);
    expect(changes).toHaveLength(1);
  });

  test('does not ask where saving writes in place, or for a different title', async () => {
    const { t } = await twice({ inPlace: true });
    await t.openFile(t.picked('Door2.fountain', OTHER));
    expect(t.sameTitleQuestion.value).toBeNull();
    expect(t.shown()).toBe(OTHER);

    const { t: u } = await twice();
    await u.openFile(u.picked('Other.fountain', 'Title: Another\n\nHi.\n'));
    expect(u.sameTitleQuestion.value).toBeNull();
    expect(u.script.project.value?.title).toBe('Another');
  });

  test('never matches a sample', async () => {
    const t = await fresh({ inPlace: false });
    await t.openFile(t.picked('Call.fountain', 'Title: The Call\n\nHi.\n'));
    expect(t.sameTitleQuestion.value).toBeNull();
    expect(t.script.project.value?.sample).toBeUndefined();
  });
});

describe('a save that finishes after another script was opened', () => {
  test('writes the script the save started on, not the one open now', async () => {
    const t = await fresh();
    await t.openFile(t.picked('Door.fountain', SCRIPT));
    t.type('MORE\n');
    const started = t.script.project.value?.id ?? '';
    // The picker stays open until the test chooses a file.
    let choose: () => void = () => {};
    let asked = false;
    t.access.pickToSave = () =>
      new Promise((resolve) => {
        asked = true;
        choose = () => resolve({ id: 9, name: 'Door.fountain' } as MemoryRef);
      });
    const saving = t.save();
    await vi.waitFor(() => expect(asked).toBe(true));

    // Another script is opened while the picker is up.
    await t.script.openSample('stage-play');
    expect(t.script.project.value?.sample).toBe('stage-play');
    const other = t.shown();
    choose();
    expect(await saving).toBe('saved');

    // The file has the first script's text, and the first script has the record of it.
    expect(t.writes).toHaveLength(1);
    const data = t.writes[0]?.data ?? '';
    expect(typeof data === 'string' ? data : new TextDecoder().decode(data)).toBe(
      `${SCRIPT}MORE\n`,
    );
    const row = await t.projects.getProject(started);
    expect(row?.savedHash).toBe(await t.hashText(`${SCRIPT}MORE\n`));
    // The script that is open was not touched.
    expect(t.script.project.value?.sample).toBe('stage-play');
    expect(t.shown()).toBe(other);
    expect(t.script.dirty.value).toBe(false);
  });

  test('a sample saved while another switch finishes first becomes a script without being opened', async () => {
    const t = await fresh();
    const sample = t.script.project.value;
    expect(sample?.sample).toBe('screenplay');
    const text = 'Title: Saved Meanwhile\n\nINT. ROOM - DAY\n\nWords.\n';

    // A switch is under way when the save is recorded: the record waits its turn.
    const switching = t.script.openSample('stage-play');
    const saving = t.script.saved({
      text,
      fileName: 'Saved.fountain',
      ref: null,
      ...(sample ? { id: sample.id } : {}),
    });
    await Promise.all([switching, saving]);

    // The stage play sample is what is open, and what the editor holds.
    expect(t.script.project.value?.sample).toBe('stage-play');
    expect(t.shown()).toContain('The Crossing');
    expect(t.script.project.value?.source).toBe(t.shown());
    // The saved text is a script of its own, kept but not opened.
    const made = (await t.mine()).filter((p) => p.fileName === 'Saved.fountain');
    expect(made).toHaveLength(1);
    expect(made[0]?.source).toBe(text);
    expect(made[0]?.savedHash).toBe(await t.hashText(text));
    // And nothing was written over the stage play.
    expect((await t.projects.getProject(t.script.project.value?.id ?? ''))?.source).toBe(t.shown());
  });
});

describe('opening a file the system named (the desktop app)', () => {
  /** A bridge that lets the test make the system name a file, or say it can't open one. */
  function bridge() {
    let named: ((path: string) => void) | undefined;
    let problem: ((message: string) => void) | undefined;
    let stops = 0;
    window.drafterDesktop = {
      version: '0',
      platform: 'linux',
      files: {} as never,
      menu: {} as never,
      onOpenFile(onPath: (path: string) => void, onProblem?: (message: string) => void) {
        named = onPath;
        problem = onProblem;
        return () => {
          stops += 1;
          named = undefined;
        };
      },
    };
    return {
      name: (path: string) => named?.(path),
      problem: (message: string) => problem?.(message),
      listening: () => named !== undefined,
      stops: () => stops,
    };
  }
  beforeEach(() => vi.stubGlobal('__DRAFTER_DESKTOP__', true));
  afterEach(() => {
    delete window.drafterDesktop;
  });

  test('opens it as Open does, and listens only in the desktop app', async () => {
    const t = await fresh();
    t.byPath.set('/home/me/Door.fountain', t.picked('Door.fountain', SCRIPT, 3));
    vi.stubGlobal('__DRAFTER_DESKTOP__', false);
    const quiet = bridge();
    expect(t.installSystemOpen()()).toBeUndefined();
    expect(quiet.listening()).toBe(false);
    vi.stubGlobal('__DRAFTER_DESKTOP__', true);

    const system = bridge();
    const stop = t.installSystemOpen();
    expect(system.listening()).toBe(true);
    system.name('/home/me/Door.fountain');
    await vi.waitFor(() => expect(t.script.project.value?.fileName).toBe('Door.fountain'));
    expect(t.shown()).toBe(SCRIPT);
    expect(t.script.dirty.value).toBe(false);
    stop();
    expect(system.stops()).toBe(1);
  });

  test('shows a script that is already open, without opening it twice', async () => {
    const t = await fresh();
    const file = t.picked('Door.fountain', SCRIPT, 3);
    t.byPath.set('/home/me/Door.fountain', file);
    t.byPath.set('/home/me/link.fountain', t.picked('link.fountain', SCRIPT, 3));
    await t.openFile(file);
    const door = t.script.project.value?.id;
    await t.openFile(t.picked('Other.fountain', 'Title: Other\n\nINT. A - DAY\n\nx\n', 4));
    expect(t.script.project.value?.id).not.toBe(door);
    const count = (await t.mine()).length;

    const system = bridge();
    t.installSystemOpen();
    system.name('/home/me/link.fountain');
    await vi.waitFor(() => expect(t.script.project.value?.id).toBe(door));
    expect(await t.mine()).toHaveLength(count);
  });

  test('says why it couldn’t, and leaves the script on show alone', async () => {
    const t = await fresh();
    t.type('MORE\n');
    const text = t.shown();
    const system = bridge();
    t.installSystemOpen();
    system.name('/home/me/Gone.fountain');
    await vi.waitFor(() =>
      expect(t.openError.value).toBe('Drafter can’t open “Gone.fountain”: it isn’t there.'),
    );
    expect(t.shown()).toBe(text);

    system.problem('Drafter can’t open “x.png”: it isn’t a script.');
    await vi.waitFor(() =>
      expect(t.openError.value).toBe('Drafter can’t open “x.png”: it isn’t a script.'),
    );
  });

  test('opens several in the order they were named, one after another', async () => {
    const t = await fresh();
    t.byPath.set(
      '/a/One.fountain',
      t.picked('One.fountain', 'Title: One\n\nINT. A - DAY\n\na\n', 5),
    );
    t.byPath.set(
      '/a/Two.fountain',
      t.picked('Two.fountain', 'Title: Two\n\nINT. B - DAY\n\nb\n', 6),
    );
    const system = bridge();
    t.installSystemOpen();
    system.name('/a/One.fountain');
    system.name('/a/Two.fountain');
    await vi.waitFor(() => expect(t.script.project.value?.fileName).toBe('Two.fountain'));
    expect((await t.mine()).map((p) => p.fileName).sort()).toEqual([
      'One.fountain',
      'Two.fountain',
    ]);
    expect(t.openError.value).toBe('');
  });
});
