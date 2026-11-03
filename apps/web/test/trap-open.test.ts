// @vitest-environment jsdom
// The trap documents (fixtures/trap) through the app's own Open, as the real code runs it:
//   web-open: a dropped file, read by `browserFiles.fromDrop` (its 32 MB check before reading),
//     then `openFile`, which every web path (the picker, the file input, a drop, Open as
//     screenplay, a re-read) ends in.
//   desktop-open: a file named on the command line, as the desktop app's main process takes it
//     (`requestsFromArgs`, `grantScript`, the main process's read through the grant), then the
//     page's `desktopFiles` and `openPath`: real files on disk, real code, only Electron's IPC
//     between them left out.
// The editor session is the small stand-in open.test.ts uses (trap-app.ts); everything after the
// bytes is real.
import { webcrypto } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { checkCost, checkOutcome, measured } from '../../../fixtures/trap/check';
import { type Trap, trapsFor } from '../../../fixtures/trap/traps';
import { type App, app, dropped, happened } from './trap-app';

vi.mock('../app/snapshots/use-snapshots', async () =>
  (await import('./trap-app')).snapshotsModule(),
);
vi.mock('../app/editor/samples', async () => (await import('./trap-app')).samplesModule());
vi.mock('../app/editor/session', async () => (await import('./trap-app')).sessionModule());

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
  const { requestsFromArgs, refusalsMessage, grantRefusal } = await import(
    '../../desktop/src/open-files'
  );
  const { fileHandlers } = await import('../../desktop/src/file-handlers');
  const { Grants } = await import('../../desktop/src/grants');
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
      dropGrant: async () => '',
      claimDrop: async () => {
        throw new Error('not-allowed');
      },
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
        refused.push({ name: basename(path), reason: grantRefusal(error) });
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
  test.for(trapsFor('desktop-open').map((t) => [t.id, t] as const))(
    '%s',
    async ([, trap], { skip }) => {
      if (trap.place && !posix) skip('a special file of POSIX’s');
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
    },
  );
});
