// The files a page may touch: only those the writer chose (a dialog, a drop, the command line),
// kept across restarts, checked again on every use. The handlers are called as ipcMain would call
// them, with a stand-in event, so this is what a compromised page could ask for.
import { existsSync } from 'node:fs';
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { type FileEvent, fileHandlers } from '../src/file-handlers';
import { FileError } from '../src/files';
import { Grants } from '../src/grants';

const posix = process.platform !== 'win32';
const bytes = (text: string) => new TextEncoder().encode(text);

let dir: string;
beforeEach(async () => {
  // Real paths throughout (macOS's temp folder is behind a link).
  dir = await realpath(await mkdtemp(join(tmpdir(), 'drafter-grants-')));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FileError);
    return (error as FileError).code;
  }
  throw new Error('expected a refusal');
}

/** A page: what it is sent (watch changes). */
function fakeEvent(): FileEvent & { sent: unknown[][] } {
  const sent: unknown[][] = [];
  const sender = {
    isDestroyed: () => false,
    send: (...args: unknown[]) => sent.push(args),
    once: () => sender,
    on: () => sender,
  };
  return { sender, sent } as unknown as FileEvent & { sent: unknown[][] };
}

/** The handlers over a grants file in `dir`, with dialogs that answer from `answers`. */
function setUp(answers: (string | null)[] = []) {
  const grantsFile = join(dir, 'user-data', 'granted-files.json');
  const grants = new Grants(grantsFile);
  const handlers = fileHandlers({
    grants,
    settingsFile: join(dir, 'user-data', 'desktop-settings.json'),
    documents: () => dir,
    home: dir,
    hook: null,
    showOpenDialog: async () => answers.shift() ?? null,
    showSaveDialog: async () => answers.shift() ?? null,
  });
  return { grants, grantsFile, handlers, event: fakeEvent() };
}

describe('what a page may read and write', () => {
  test('refuses a file nobody chose', async () => {
    const { handlers, event } = setUp();
    const secret = join(dir, 'id_rsa');
    await writeFile(secret, 'PRIVATE KEY');
    const bashrc = join(dir, '.bashrc');
    await writeFile(bashrc, 'export PATH');
    expect(await codeOf(handlers.read(event, secret))).toBe('not-allowed');
    expect(await codeOf(handlers.write(event, bashrc, bytes('rm -rf ~')))).toBe('not-allowed');
    expect(await codeOf(handlers.realPath(event, secret))).toBe('not-allowed');
    expect(await codeOf(handlers.watch(event, 1, secret))).toBe('not-allowed');
    expect(await readFile(bashrc, 'utf8')).toBe('export PATH');
    // Nor one that doesn't exist yet.
    expect(await codeOf(handlers.write(event, join(dir, 'new.fountain'), bytes('x')))).toBe(
      'not-allowed',
    );
    expect(existsSync(join(dir, 'new.fountain'))).toBe(false);
  });

  test('allows a file chosen in the Open dialog, and a new one chosen in the Save dialog', async () => {
    const opened = join(dir, 'Opened.fountain');
    await writeFile(opened, 'OPENED');
    const saved = join(dir, 'Saved.fountain');
    const { handlers, event } = setUp([opened, saved]);
    expect(await handlers.showOpen(event)).toBe(opened);
    expect((await handlers.read(event, opened)).bytes).toEqual(bytes('OPENED'));
    await handlers.write(event, opened, bytes('CHANGED'));
    expect(await readFile(opened, 'utf8')).toBe('CHANGED');
    expect(await handlers.showSave(event, 'Saved.fountain', '.fountain')).toBe(saved);
    await handlers.write(event, saved, bytes('NEW'));
    expect(await readFile(saved, 'utf8')).toBe('NEW');
    expect(await handlers.realPath(event, saved)).toBe(saved);
  });

  test('allows a dropped script, and nothing else dropped', async () => {
    const { handlers, event } = setUp();
    const script = join(dir, 'Dropped.fountain');
    await writeFile(script, 'DROPPED');
    const other = join(dir, 'photo.jpg');
    await writeFile(other, 'JPEG');
    // The preload hands main the path of a dropped File; the read that follows waits for it.
    void handlers.grantDropped(event, script);
    expect((await handlers.read(event, script)).bytes).toEqual(bytes('DROPPED'));
    void handlers.grantDropped(event, other);
    expect(await codeOf(handlers.read(event, other))).toBe('not-allowed');
    void handlers.grantDropped(event, dir);
    expect(await codeOf(handlers.read(event, dir))).toBe('not-allowed');
    void handlers.grantDropped(event, join(dir, 'missing.fountain'));
    expect(await codeOf(handlers.read(event, join(dir, 'missing.fountain')))).toBe('not-allowed');
  });

  test('remembers what was chosen across a restart, and forgets files that are gone', async () => {
    const kept = join(dir, 'Kept.md');
    const gone = join(dir, 'Gone.md');
    await writeFile(kept, 'KEPT');
    await writeFile(gone, 'GONE');
    const first = setUp([kept, gone]);
    await first.handlers.showOpen(first.event);
    await first.handlers.showOpen(first.event);
    await unlink(gone);

    const second = setUp();
    expect((await second.handlers.read(second.event, kept)).bytes).toEqual(bytes('KEPT'));
    await second.handlers.write(second.event, kept, bytes('KEPT AGAIN'));
    expect(await readFile(kept, 'utf8')).toBe('KEPT AGAIN');
    // Its grant was dropped when the list was read: put back, it is not the writer's any more.
    await writeFile(gone, 'PLANTED');
    expect(await codeOf(second.handlers.read(second.event, gone))).toBe('not-allowed');
    const saved = JSON.parse(await readFile(second.grantsFile, 'utf8'));
    expect(JSON.stringify(saved)).not.toContain('Gone.md');
  });

  test('keeps at most so many', async () => {
    const grantsFile = join(dir, 'granted.json');
    const grants = new Grants(grantsFile, { max: 3 });
    const paths = ['a', 'b', 'c', 'd'].map((name) => join(dir, `${name}.fountain`));
    for (const path of paths) {
      await writeFile(path, path);
      await grants.grant(path);
    }
    expect(await codeOf(grants.allowed(paths[0] as string))).toBe('not-allowed');
    for (const path of paths.slice(1)) expect(await grants.allowed(path)).toBe(path);
    expect(JSON.parse(await readFile(grantsFile, 'utf8')).files).toHaveLength(3);
  });

  test('ignores a damaged list', async () => {
    const grantsFile = join(dir, 'granted.json');
    await writeFile(grantsFile, '{"files": [{"path": 42}, "x", {"path": "relative", "real": "r"}]');
    const grants = new Grants(grantsFile);
    expect(await codeOf(grants.allowed(join(dir, 'x.fountain')))).toBe('not-allowed');
    await writeFile(grantsFile, JSON.stringify({ files: [{ path: 'relative', real: 'r' }, 7] }));
    expect(await codeOf(new Grants(grantsFile).allowed(join(dir, 'x.fountain')))).toBe(
      'not-allowed',
    );
  });

  test('refuses a chosen file swapped for a link to another', async () => {
    if (!posix) return;
    const script = join(dir, 'Script.fountain');
    await writeFile(script, 'SCRIPT');
    const elsewhere = join(dir, 'elsewhere');
    await mkdir(elsewhere);
    const victim = join(elsewhere, 'victim.fountain');
    await writeFile(victim, 'VICTIM');
    const { handlers, event } = setUp([script]);
    await handlers.showOpen(event);
    // Another program (or a compromised page's helper) swaps the file for a link.
    await unlink(script);
    await symlink(victim, script);
    expect(await codeOf(handlers.read(event, script))).toBe('not-allowed');
    expect(await codeOf(handlers.write(event, script, bytes('OVERWRITTEN')))).toBe('not-allowed');
    expect(await readFile(victim, 'utf8')).toBe('VICTIM');
    // A folder on the way swapped for a link is refused too.
    const folder = join(dir, 'folder');
    await mkdir(folder);
    const inFolder = join(folder, 'In.fountain');
    await writeFile(inFolder, 'IN');
    const again = setUp([inFolder]);
    await again.handlers.showOpen(again.event);
    await rm(folder, { recursive: true });
    await symlink(elsewhere, folder);
    await writeFile(join(elsewhere, 'In.fountain'), 'OTHER');
    expect(await codeOf(again.handlers.write(again.event, inFolder, bytes('X')))).toBe(
      'not-allowed',
    );
    expect(await readFile(join(elsewhere, 'In.fountain'), 'utf8')).toBe('OTHER');
  });

  test('writes only scripts and exports, even when chosen', async () => {
    const config = join(dir, 'config');
    await writeFile(config, 'SETTING=1');
    const { handlers, event } = setUp([config]);
    expect(await handlers.showOpen(event)).toBe(config);
    // It may be read (the writer opened it) …
    expect((await handlers.read(event, config)).bytes).toEqual(bytes('SETTING=1'));
    // … but never written.
    expect(await codeOf(handlers.write(event, config, bytes('X')))).toBe('not-allowed');
    expect(await readFile(config, 'utf8')).toBe('SETTING=1');
    for (const name of ['a.fountain', 'a.md', 'a.markdown', 'a.txt', 'a.pdf', 'A.FOUNTAIN']) {
      const path = join(dir, name);
      const own = setUp([path]);
      await own.handlers.showSave(own.event, name, '.fountain');
      await own.handlers.write(own.event, path, bytes(name));
      expect(await readFile(path, 'utf8')).toBe(name);
    }
  });

  test('checks every argument', async () => {
    const { handlers, event } = setUp();
    for (const bad of ['relative.fountain', '', 42, null, { path: '/a' }]) {
      expect(await codeOf(handlers.read(event, bad))).toBe('failed');
    }
    expect(await codeOf(handlers.showSave(event, 'x', '.exe'))).toBe('failed');
    expect(await codeOf(handlers.watch(event, -1, join(dir, 'a')))).toBe('failed');
  });
});
