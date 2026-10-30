// The main process's file operations (src/files.ts), on real temp folders: what a writer's
// script goes through every time it is opened, saved, or exported.
import { existsSync, writeFileSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  checkBytes,
  checkPath,
  dialogHook,
  FileError,
  nextDialogAnswer,
  readFileAt,
  realPathOf,
  rememberFolder,
  saveTarget,
  startFolder,
  watchFile,
  writeAtomic,
} from '../src/files';

const encoder = new TextEncoder();
const bytes = (text: string) => encoder.encode(text);
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const posix = process.platform !== 'win32';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'drafter-files-'));
});
afterEach(async () => {
  await chmod(dir, 0o755).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

/** The names in `folder` that are a temp file of a save. */
async function temps(folder = dir) {
  return (await readdir(folder)).filter((name) => name.includes('.drafter-tmp'));
}

/** A promise and the function that settles it. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, opened };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(FileError);
    return (error as FileError).code;
  }
  throw new Error('expected a rejection');
}

describe('writeAtomic', () => {
  test('writes atomically', async () => {
    const file = join(dir, 'The Call.fountain');
    await writeFile(file, 'OLD TEXT\n');
    const halfway = gate();
    const goOn = gate();
    async function* source() {
      yield bytes('NEW ');
      halfway.open();
      await goOn.opened;
      yield bytes('TEXT\n');
    }
    const writing = writeAtomic(file, source());
    await halfway.opened;
    // Half the new text is written, to a temp file beside the script: the script itself still
    // holds the old text, whole.
    expect(await readFile(file, 'utf8')).toBe('OLD TEXT\n');
    const [temp] = await temps();
    expect(temp).toMatch(/^\.The Call\.fountain\.drafter-tmp-[0-9a-f]+$/);
    goOn.open();
    await writing;
    expect(await readFile(file, 'utf8')).toBe('NEW TEXT\n');
    expect(await temps()).toEqual([]);
  });

  test('saves a file with a very long name', async () => {
    // 80 CJK characters: 240 bytes, which leaves no room beside it for a temp file's own name.
    const name = `${'脚'.repeat(76)}.fountain`;
    expect(Buffer.byteLength(name)).toBeGreaterThan(230);
    const file = join(dir, name);
    await writeFile(file, 'OLD');
    await writeAtomic(file, bytes('NEW'));
    expect(await readFile(file, 'utf8')).toBe('NEW');
    expect(await temps()).toEqual([]);
    // And a name at the limit, new.
    const longest = `${'a'.repeat(251)}.md`;
    expect(Buffer.byteLength(longest)).toBe(254);
    await writeAtomic(join(dir, longest), bytes('X'));
    expect(await readFile(join(dir, longest), 'utf8')).toBe('X');
  });

  test('clears the temp files an interrupted write left, once one succeeds', async () => {
    const file = join(dir, 'The Call.fountain');
    await writeFile(file, 'OLD');
    const old = new Date(Date.now() - 10 * 60_000);
    const stale = join(dir, '.The Call.fountain.drafter-tmp-0123456789ab');
    const fresh = join(dir, '.The Call.fountain.drafter-tmp-ba9876543210');
    // Another file's, in the same folder, is just as stale: all the folder's are cleared at once.
    const others = join(dir, '.Other.fountain.drafter-tmp-0123456789ab');
    const lookalike = join(dir, '.The Call.fountain.drafter-tmp-notours');
    for (const path of [stale, fresh, others, lookalike]) await writeFile(path, 'LEFT');
    for (const path of [stale, others, lookalike]) await utimes(path, old, old);
    await writeAtomic(file, bytes('NEW'));
    expect((await temps()).sort()).toEqual(
      [fresh, lookalike].map((path) => path.slice(dir.length + 1)).sort(),
    );
    expect(await readFile(file, 'utf8')).toBe('NEW');
  });

  test('looks for them once in a folder, not at every save', async () => {
    const file = join(dir, 'Often.fountain');
    await writeAtomic(file, bytes('ONE'));
    // Left by a write that was killed, after this session began: found at the next start, not now.
    const old = new Date(Date.now() - 10 * 60_000);
    const stale = join(dir, '.Often.fountain.drafter-tmp-0123456789ab');
    await writeFile(stale, 'LEFT');
    await utimes(stale, old, old);
    await writeAtomic(file, bytes('TWO'));
    await writeAtomic(file, bytes('THREE'));
    expect(await temps()).toEqual(['.Often.fountain.drafter-tmp-0123456789ab']);
    expect(await readFile(file, 'utf8')).toBe('THREE');
  });

  test('writes a new file', async () => {
    const file = join(dir, 'New.fountain');
    await writeAtomic(file, bytes('Title: New\n'));
    expect(await readFile(file, 'utf8')).toBe('Title: New\n');
    expect(await temps()).toEqual([]);
  });

  test('keeps the old file when a write fails', async () => {
    const file = join(dir, 'Kept.fountain');
    await writeFile(file, 'KEEP ME\n');

    // The bytes stop coming halfway (the app's side of a failure: an error, the renderer gone).
    async function* broken() {
      yield bytes('HALF OF THE NEW');
      throw new Error('the bytes stopped');
    }
    expect(await codeOf(writeAtomic(file, broken()))).toBe('failed');
    expect(await readFile(file, 'utf8')).toBe('KEEP ME\n');
    expect(await temps()).toEqual([]);

    // The folder is made read-only: nothing can be made beside the file.
    if (posix && !isRoot) {
      await chmod(dir, 0o555);
      expect(await codeOf(writeAtomic(file, bytes('NEW\n')))).toBe('not-allowed');
      await chmod(dir, 0o755);
      expect(await readFile(file, 'utf8')).toBe('KEEP ME\n');
      expect(await temps()).toEqual([]);
    }
  });

  test('refuses a file made read-only, and leaves it as it was', async () => {
    if (!posix || isRoot) return;
    const file = join(dir, 'Locked.fountain');
    await writeFile(file, 'LOCKED\n');
    await chmod(file, 0o444);
    // The folder is writable, so a rename could replace it: the writer's "read-only" is honoured.
    expect(await codeOf(writeAtomic(file, bytes('NEW\n')))).toBe('not-allowed');
    expect(await readFile(file, 'utf8')).toBe('LOCKED\n');
    expect(await temps()).toEqual([]);
  });

  test('reports a folder that is gone as gone', async () => {
    expect(await codeOf(writeAtomic(join(dir, 'nowhere', 'x.fountain'), bytes('x')))).toBe('gone');
  });

  test('keeps the file’s permissions', async () => {
    if (!posix) return;
    const file = join(dir, 'Mine.fountain');
    await writeFile(file, 'x');
    await chmod(file, 0o640);
    await writeAtomic(file, bytes('y'));
    expect((await stat(file)).mode & 0o7777).toBe(0o640);
    await chmod(file, 0o755);
    await writeAtomic(file, bytes('z'));
    expect((await stat(file)).mode & 0o7777).toBe(0o755);
    expect(await readFile(file, 'utf8')).toBe('z');
  });

  test('writes through a symlink to its file, and keeps the link', async () => {
    if (!posix) return;
    const real = join(dir, 'real');
    await mkdir(real);
    const target = join(real, 'Target.fountain');
    await writeFile(target, 'OLD');
    const link = join(dir, 'Link.fountain');
    await symlink(target, link);
    await writeAtomic(link, bytes('NEW'));
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readlink(link)).toBe(target);
    expect(await readFile(target, 'utf8')).toBe('NEW');
    expect(await temps()).toEqual([]);
    expect(await temps(real)).toEqual([]);

    // A relative link, through a link to a link.
    const relative = join(dir, 'Relative.fountain');
    await symlink('Link.fountain', relative);
    await writeAtomic(relative, bytes('NEWER'));
    expect(await readFile(target, 'utf8')).toBe('NEWER');
    expect((await lstat(relative)).isSymbolicLink()).toBe(true);
  });

  test('writes a file in a symlinked folder, and names that aren’t plain ASCII', async () => {
    if (!posix) return;
    const real = join(dir, 'real folder');
    await mkdir(real);
    const linked = join(dir, 'linked folder');
    await symlink(real, linked);
    for (const name of [
      'My Script (2).fountain',
      'Café — draft.fountain',
      '脚本.fountain',
      '.hidden.fountain',
    ]) {
      await writeAtomic(join(linked, name), bytes(name));
      expect(await readFile(join(real, name), 'utf8')).toBe(name);
      expect((await readFileAt(join(linked, name))).bytes).toEqual(bytes(name));
    }
    expect(await temps(real)).toEqual([]);
  });

  test('refuses to replace something that isn’t a file', async () => {
    await mkdir(join(dir, 'folder.fountain'));
    expect(await codeOf(writeAtomic(join(dir, 'folder.fountain'), bytes('x')))).toBe('not-a-file');
  });
});

describe('readFileAt', () => {
  test('reads the bytes and the modification time', async () => {
    const file = join(dir, 'Read.fountain');
    const content = new Uint8Array([0xef, 0xbb, 0xbf, 0x41, 0x0d, 0x0a, 0x42]);
    await writeFile(file, content);
    const read = await readFileAt(file);
    expect(read.bytes).toEqual(content);
    expect(read.lastModified).toBe(Math.floor((await stat(file)).mtimeMs));
  });

  test('reports a missing file as gone', async () => {
    expect(await codeOf(readFileAt(join(dir, 'missing.fountain')))).toBe('gone');
    expect(await codeOf(readFileAt(join(dir, 'missing', 'deeper.fountain')))).toBe('gone');
  });

  test('refuses a folder', async () => {
    expect(await codeOf(readFileAt(dir))).toBe('not-a-file');
  });
});

describe('realPathOf', () => {
  test('follows links, and keeps a path that doesn’t exist', async () => {
    const file = join(dir, 'a.fountain');
    await writeFile(file, 'x');
    const real = await realPathOf(file);
    if (posix) {
      await symlink(file, join(dir, 'b.fountain'));
      expect(await realPathOf(join(dir, 'b.fountain'))).toBe(real);
    }
    expect(await realPathOf(join(dir, 'nope.fountain'))).toBe(join(dir, 'nope.fountain'));
  });
});

describe('checkPath and checkBytes', () => {
  test('take absolute paths only', () => {
    expect(checkPath(join(dir, 'a.fountain'))).toBe(join(dir, 'a.fountain'));
    for (const bad of [
      'a.fountain',
      './a.fountain',
      '',
      `${dir}/a\0.fountain`,
      `/${'x'.repeat(5000)}`,
      42,
      null,
      undefined,
      { path: '/a' },
      ['/a'],
    ]) {
      expect(() => checkPath(bad)).toThrow(FileError);
    }
  });

  test('on Windows, refuse a name Windows reads as another file, a stream, or a device', () => {
    for (const bad of [
      'C:\\Scripts\\notes.md.',
      'C:\\Scripts\\program.exe:notes.md',
      'C:\\Scripts\\nul.md',
      '\\\\.\\pipe\\x.md',
      '\\\\?\\C:\\Scripts\\x.md',
    ]) {
      expect(() => checkPath(bad, 'win32'), bad).toThrow(/a name Windows reads differently/);
    }
    for (const good of ['C:\\Scripts\\The Lamp.fountain', '\\\\server\\share\\x.md']) {
      expect(checkPath(good, 'win32')).toBe(good);
    }
  });

  test('read and write a file whose path is longer than Windows’s old 260-character limit', async () => {
    let folder = dir;
    while (folder.length < 300) folder = join(folder, 'a folder with a long name');
    await mkdir(folder, { recursive: true });
    const path = join(folder, 'The Lamp.fountain');
    expect(path.length).toBeGreaterThan(260);
    await writeAtomic(path, new TextEncoder().encode('INT. LIGHTHOUSE\r\n'));
    expect(new TextDecoder().decode((await readFileAt(path)).bytes)).toBe('INT. LIGHTHOUSE\r\n');
  });

  test('take bytes only, up to the limit', () => {
    const ok = new Uint8Array(3);
    expect(checkBytes(ok)).toBe(ok);
    for (const bad of ['text', [1, 2], new ArrayBuffer(3), null, { length: 1 }]) {
      expect(() => checkBytes(bad)).toThrow(FileError);
    }
    expect(() => checkBytes(new Uint8Array(1), 0)).toThrow(FileError);
  });
});

describe('watchFile', () => {
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  test('tells of a change once, after the changes stop', async () => {
    const file = join(dir, 'Watched.fountain');
    await writeFile(file, 'one');
    let changes = 0;
    const stop = watchFile(file, () => changes++, { debounceMs: 150 });
    try {
      await wait(200);
      // Two writes in a row (synchronous, so the watch can't look between a truncation and a write).
      writeFileSync(file, 'two');
      writeFileSync(file, 'three');
      await expect.poll(() => changes, { timeout: 5000 }).toBe(1);
      await wait(400);
      expect(changes).toBe(1);
      // Another file in the folder is not this one.
      await writeFile(join(dir, 'Other.fountain'), 'x');
      await wait(400);
      expect(changes).toBe(1);
    } finally {
      stop();
    }
  });

  test('keeps watching after another program replaces the file by renaming over it', async () => {
    const file = join(dir, 'Replaced.fountain');
    await writeFile(file, 'one');
    let changes = 0;
    const stop = watchFile(file, () => changes++, { debounceMs: 100 });
    try {
      await wait(200);
      for (let round = 1; round <= 3; round++) {
        const temp = join(dir, `.Replaced.fountain.swp${round}`);
        await writeFile(temp, `version ${round}`);
        await rename(temp, file);
        await expect.poll(() => changes, { timeout: 5000 }).toBe(round);
        await wait(250);
      }
    } finally {
      stop();
    }
  });

  test('stops when told', async () => {
    const file = join(dir, 'Stopped.fountain');
    await writeFile(file, 'one');
    let changes = 0;
    const stop = watchFile(file, () => changes++, { debounceMs: 50 });
    await wait(200);
    stop();
    await writeFile(file, 'two');
    await wait(400);
    expect(changes).toBe(0);
  });
});

describe('the e2e dialog hook', () => {
  test('is honoured only by an unpackaged app', () => {
    expect(dialogHook(false, { DRAFTER_E2E_DIALOG: '/tmp/dialogs.json' })).toBe(
      '/tmp/dialogs.json',
    );
    expect(dialogHook(true, { DRAFTER_E2E_DIALOG: '/tmp/dialogs.json' })).toBeNull();
    expect(dialogHook(false, {})).toBeNull();
    expect(dialogHook(false, { DRAFTER_E2E_DIALOG: 'relative.json' })).toBeNull();
  });

  test('answers from the queue in order, logs each question, and cancels when it is empty', async () => {
    const queue = join(dir, 'dialogs.json');
    await writeFile(queue, JSON.stringify(['/a/one.fountain', null]));
    const ask = { kind: 'open' as const, defaultPath: '/home/w/Documents' };
    expect(nextDialogAnswer(queue, ask)).toBe('/a/one.fountain');
    expect(nextDialogAnswer(queue, ask)).toBeNull();
    expect(nextDialogAnswer(queue, ask)).toBeNull();
    expect(nextDialogAnswer(join(dir, 'none.json'), ask)).toBeNull();
    const log = (await readFile(`${queue}.log`, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(log).toEqual([ask, ask, ask]);
  });
});

describe('saveTarget', () => {
  test('ends a name typed without a script’s extension with one, and never replaces a file unasked', async () => {
    await writeFile(join(dir, 'Taken.md'), 'x');
    await writeFile(join(dir, 'Taken (2).md'), 'x');
    expect(saveTarget(join(dir, 'Notes'), '.md')).toBe(join(dir, 'Notes.md'));
    expect(saveTarget(join(dir, 'Notes.md'), '.md')).toBe(join(dir, 'Notes.md'));
    // Another kind the app writes is the writer's choice.
    expect(saveTarget(join(dir, 'Notes.txt'), '.md')).toBe(join(dir, 'Notes.txt'));
    expect(saveTarget(join(dir, 'Notes.MARKDOWN'), '.md')).toBe(join(dir, 'Notes.MARKDOWN'));
    // A kind it doesn't write gets the extension after it.
    expect(saveTarget(join(dir, 'Notes.rtf'), '.md')).toBe(join(dir, 'Notes.rtf.md'));
    // The writer agreed to replace "Taken" (or nothing), never "Taken.md": a number is added.
    expect(saveTarget(join(dir, 'Taken'), '.md')).toBe(join(dir, 'Taken (3).md'));
    // A leading dot alone is a name, not an extension.
    expect(saveTarget(join(dir, '.hidden'), '.fountain')).toBe(join(dir, '.hidden.fountain'));
    expect(existsSync(join(dir, 'Notes.md'))).toBe(false);
  });

  test('never puts one kind’s bytes under the other’s name: an export is a .pdf, a script is text', () => {
    // Export (PDF) typed with a script's extension: the PDF's own is added.
    expect(saveTarget(join(dir, 'Notes.fountain'), '.pdf')).toBe(join(dir, 'Notes.fountain.pdf'));
    expect(saveTarget(join(dir, 'Notes.md'), '.pdf')).toBe(join(dir, 'Notes.md.pdf'));
    expect(saveTarget(join(dir, 'Notes.PDF'), '.pdf')).toBe(join(dir, 'Notes.PDF'));
    // A script typed as a .pdf: the script's own is added.
    expect(saveTarget(join(dir, 'Notes.pdf'), '.fountain')).toBe(join(dir, 'Notes.pdf.fountain'));
    expect(saveTarget(join(dir, 'Notes.pdf'), '.md')).toBe(join(dir, 'Notes.pdf.md'));
    // An HTML export is a .html, and a script typed as one gets its own extension.
    expect(saveTarget(join(dir, 'Notes'), '.html')).toBe(join(dir, 'Notes.html'));
    expect(saveTarget(join(dir, 'Notes.md'), '.html')).toBe(join(dir, 'Notes.md.html'));
    expect(saveTarget(join(dir, 'Notes.html'), '.fountain')).toBe(join(dir, 'Notes.html.fountain'));
    // A Final Draft export is a .fdx, and a script is never one.
    expect(saveTarget(join(dir, 'Notes'), '.fdx')).toBe(join(dir, 'Notes.fdx'));
    expect(saveTarget(join(dir, 'Notes.fountain'), '.fdx')).toBe(join(dir, 'Notes.fountain.fdx'));
    expect(saveTarget(join(dir, 'Notes.fdx'), '.fountain')).toBe(join(dir, 'Notes.fdx.fountain'));
  });

  test('a script saved as x.highland is saved as x.highland.fountain', () => {
    // A Highland or Fade In file is only ever imported: a script is never one, nor an export.
    expect(saveTarget(join(dir, 'x.highland'), '.fountain')).toBe(join(dir, 'x.highland.fountain'));
    expect(saveTarget(join(dir, 'x.fadein'), '.fountain')).toBe(join(dir, 'x.fadein.fountain'));
    expect(saveTarget(join(dir, 'x.HIGHLAND'), '.md')).toBe(join(dir, 'x.HIGHLAND.md'));
  });
});

describe('the folder a dialog starts in', () => {
  test('is the folder last used, else Documents, else home', async () => {
    const settings = join(dir, 'desktop-settings.json');
    const documents = join(dir, 'Documents');
    expect(startFolder(settings, documents, dir)).toBe(dir);
    await mkdir(documents);
    expect(startFolder(settings, documents, dir)).toBe(documents);
    const used = join(dir, 'Scripts');
    await mkdir(used);
    await writeFile(settings, JSON.stringify({ other: 'kept' }));
    await rememberFolder(settings, used);
    expect(startFolder(settings, documents, dir)).toBe(used);
    expect(JSON.parse(await readFile(settings, 'utf8'))).toEqual({
      other: 'kept',
      lastFolder: used,
    });
    // A folder that is gone isn't offered.
    await rm(used, { recursive: true });
    expect(startFolder(settings, documents, dir)).toBe(documents);
    // Nor is a damaged settings file trusted.
    await writeFile(settings, '{not json');
    expect(startFolder(settings, documents, dir)).toBe(documents);
    await writeFile(settings, JSON.stringify({ lastFolder: 'relative/path' }));
    expect(startFolder(settings, documents, dir)).toBe(documents);
    await rememberFolder(settings, documents);
    expect(startFolder(settings, documents, dir)).toBe(documents);
  });
});
