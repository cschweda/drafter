// @vitest-environment jsdom
// The trap documents (fixtures/trap) through the app's own Open, as the real code runs it:
//   web-open: a dropped file, read by `browserFiles.fromDrop` (its 32 MB check before reading),
//     then `openFile`, which every web path (the picker, the file input, a drop, Open as
//     screenplay, a re-read) ends in.
//   desktop-open: a file named on the command line, as the desktop app's main process takes it
//     (`requestsFromArgs`, `grantScript`, the main process's read through the grant), then the
//     page's `desktopFiles` and `openPath`: real files on disk, real code, only Electron's IPC
//     between them left out.
// The editor session is the small stand-in open.test.ts uses; everything after the bytes is real.
import { webcrypto } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { EditorState as State } from '@codemirror/state';
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { checkCost, checkOutcome, type Happened, measured } from '../../../fixtures/trap/check';
import { type Trap, trapsFor } from '../../../fixtures/trap/traps';

vi.mock('../app/snapshots/use-snapshots', () => ({
  useSnapshots: () => ({ before: () => {}, afterImport: () => {} }),
}));
vi.mock('../app/editor/samples', () => {
  const screenplay = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
  return {
    SAMPLE_SCREENPLAY: screenplay,
    SAMPLE_STAGE_PLAY: screenplay,
    SAMPLE_TEXT: { screenplay, 'stage-play': screenplay },
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
    locked: shallowRef(false),
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
    onState(listener: (state: State) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    goto() {},
  };
  return { useEditor: () => session };
});

let tmp = '';
/** Every request the app makes while it opens traps: there must be none. */
const fetched: unknown[] = [];
beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', async (input: unknown) => {
    fetched.push(input);
    throw new TypeError('The trap documents never fetch.');
  });
  tmp = mkdtempSync(join(tmpdir(), 'drafter-trap-web-'));
});
afterAll(() => {
  vi.unstubAllGlobals();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

/**
 * The app: its modules, database, and editor, once for each entry point. Every trap after the first
 * meets an app that has opened (or refused) the traps before it, as a writer's would; a refusal is
 * seen as the script on show staying the same.
 */
async function app() {
  vi.resetModules();
  const { db } = await import('../app/storage/db');
  await Promise.all(db.tables.map((table) => table.clear()));
  const files = await import('../app/storage/files');
  const open = await import('../app/storage/open');
  const { exportNotice } = await import('../app/storage/export');
  const { useScript } = await import('../app/storage/script');
  const { useEditor } = await import('../app/editor/session');
  const script = useScript();
  await vi.waitFor(() => expect(script.ready.value).toBe(true));
  const editor = useEditor();
  // Where saving downloads, a file whose title is already here asks whether to replace it; many
  // traps share a title, and each is kept beside the others, as a writer would answer.
  const { watch } = await import('vue');
  watch(open.sameTitleQuestion, (question) => question?.answer('beside'));
  exportNotice.value = '';
  return { db, files, open, exportNotice, script, editor };
}
type App = Awaited<ReturnType<typeof app>>;

/** The plain word an open says ("Imported “x”."), which is no warning; anything after it is. */
const PLAIN = /^(?:Imported|Reopened|Opened) “[^”]*”(?: as a screenplay)?\.\s*/;

/** What the app did: a new script with its text, and what it said; or the script on show kept. */
function happened(t: App, was: string | undefined): Happened {
  const error = t.open.openError.value;
  const now = t.script.project.value?.id;
  if (now === was) return { kind: 'refused', message: error };
  const toast = t.exportNotice.value.replace(PLAIN, '');
  return {
    kind: 'opened',
    text: t.editor.view.state.doc.toString(),
    message: [toast, error].filter(Boolean).join(' '),
  };
}

/** A file dropped on the window, as a browser hands it over (no handle, as Firefox and Safari). */
function dropped(name: string, bytes: Uint8Array): DataTransferItem {
  const file = new File([bytes as BlobPart], name);
  return { kind: 'file', type: '', getAsFile: () => file } as unknown as DataTransferItem;
}

describe('web-open: a file dropped on the web app', () => {
  let t: App;
  beforeAll(async () => {
    t = await app();
  });
  test.each(trapsFor('web-open').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    t.exportNotice.value = '';
    const bytes = trap.bytes?.() as Uint8Array;
    const was = t.script.project.value?.id;
    const cost = await measured(async () => {
      const picked = await t.files.browserFiles.fromDrop(dropped(trap.name, bytes));
      if (picked) await t.open.openFile(picked);
      return happened(t, was);
    });
    checkOutcome(trap, trap.expect['web-open'] as never, cost.value, 'web-open');
    expect(fetched, `${trap.id}: fetched something`).toEqual([]);
    expect((window as { __trapped?: unknown }).__trapped, trap.id).toBeUndefined();
    checkCost(trap, bytes.length, cost, 'web-open');
  });
});

/** The trap's file in a folder of its own on disk (or its special file); its folder and name. */
function onDisk(trap: Trap): { dir: string; name: string } {
  const dir = join(tmp, trap.id);
  mkdirSync(dir, { recursive: true });
  if (trap.place) return { dir, name: basename(trap.place(dir)) };
  writeFileSync(join(dir, trap.name), trap.bytes?.() ?? new Uint8Array());
  return { dir, name: trap.name };
}

/**
 * The desktop app, ready for a launch's arguments, doing what it does with them (apps/desktop/src/main.ts `openFromSystem`):
 * sort them, grant each script (a refusal is said), then hand each granted path to the page, which
 * reads it through the grant and opens it.
 */
async function desktopApp(t: App, cwd: string): Promise<(args: string[]) => Promise<void>> {
  const { requestsFromArgs, refusalsMessage, NOT_A_SCRIPT } = await import(
    '../../desktop/src/open-files'
  );
  const { fileHandlers } = await import('../../desktop/src/file-handlers');
  const { Grants } = await import('../../desktop/src/grants');
  const { FileError } = await import('../../desktop/src/files');
  const { desktopFiles } = await import('../app/storage/desktop-files');
  const { say } = await import('../app/storage/say');
  const handlers = fileHandlers({
    grants: new Grants(join(cwd, '..', `${basename(cwd)}-grants.json`)),
    settingsFile: join(cwd, '..', `${basename(cwd)}-settings.json`),
    documents: () => cwd,
    home: cwd,
    hook: null,
    changedChannel: 'files:changed',
    showOpenDialog: async () => null,
    showSaveDialog: async () => null,
  });
  const event = {
    sender: { isDestroyed: () => false, send() {}, once() {}, on() {} },
  } as unknown as Parameters<typeof handlers.read>[0];
  // Over IPC an error reaches the page as its message alone (files-ipc.ts `handle`).
  const ipc =
    <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      try {
        return await call(...args);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    };
  t.files.setFiles(
    desktopFiles({
      showOpen: async () => null,
      showSave: async () => null,
      read: ipc((path: string) => handlers.read(event, path)),
      write: async () => {
        throw new Error('not-allowed');
      },
      realPath: ipc((path: string) => handlers.realPath(event, path)),
      pathOfDropped: () => '',
      watch: () => () => {},
    }),
  );
  return async (args) => {
    const { files, refused } = requestsFromArgs(args, cwd);
    const granted: string[] = [];
    for (const path of files) {
      try {
        await handlers.grantScript(path);
        granted.push(path);
      } catch (error) {
        const notScript = error instanceof FileError && error.code === 'not-allowed';
        refused.push({
          name: basename(path),
          reason: notScript ? NOT_A_SCRIPT : 'it can’t be read',
        });
      }
    }
    for (const path of granted) await t.open.openPath(path);
    if (refused.length > 0) await say(t.open.openError, refusalsMessage(refused));
  };
}

describe('desktop-open: a file named on the desktop app’s command line', () => {
  const posix = process.platform !== 'win32';
  let t: App;
  beforeAll(async () => {
    t = await app();
  });
  test.each(trapsFor('desktop-open').map((t) => [t.id, t] as const))('%s', async (_id, trap) => {
    if (trap.place && !posix) return;
    t.exportNotice.value = '';
    const { dir, name } = onDisk(trap);
    const launch = await desktopApp(t, dir);
    const was = t.script.project.value?.id;
    const cost = await measured(async () => {
      await launch([name]);
      return happened(t, was);
    });
    checkOutcome(trap, trap.expect['desktop-open'] as never, cost.value, 'desktop-open');
    expect(fetched, `${trap.id}: fetched something`).toEqual([]);
    checkCost(trap, trap.bytes ? (trap.bytes().length as number) : 0, cost, 'desktop-open');
  });
});
