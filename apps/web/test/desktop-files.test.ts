// @vitest-environment jsdom
// The desktop app's FileAccess (app/storage/desktop-files.ts) over a stand-in bridge: the same
// contract the browser's version keeps, with paths for refs.
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DesktopFilesBridge } from '../app/desktop';
import { desktopFiles } from '../app/storage/desktop-files';
import {
  browserFiles,
  FileGoneError,
  FileProblemError,
  type FileRef,
  setFiles,
  useFiles,
} from '../app/storage/files';

const decoder = new TextDecoder();

/** A bridge over an in-memory disk, with links (`realPaths`) and a log of what was asked. */
function fakeBridge() {
  const disk = new Map<string, { bytes: Uint8Array; lastModified: number }>();
  const realPaths = new Map<string, string>();
  const asked = {
    open: [] as true[],
    save: [] as { name: string; extension: string }[],
    watched: [] as string[],
    stopped: [] as string[],
  };
  const answers: (string | null)[] = [];
  const dropped = new Map<File, string>();
  let failNext: string | null = null;
  const bridge: DesktopFilesBridge = {
    async showOpen() {
      asked.open.push(true);
      return answers.shift() ?? null;
    },
    async showSave(name, extension) {
      asked.save.push({ name, extension });
      return answers.shift() ?? null;
    },
    async read(path) {
      const file = disk.get(realPaths.get(path) ?? path);
      if (!file) throw new Error('gone');
      return { bytes: file.bytes.slice(), lastModified: file.lastModified };
    },
    async write(path, bytes) {
      if (failNext) {
        const message = failNext;
        failNext = null;
        throw new Error(message);
      }
      disk.set(realPaths.get(path) ?? path, { bytes: bytes.slice(), lastModified: Date.now() });
    },
    async realPath(path) {
      if (path.startsWith('/broken')) throw new Error('failed');
      return realPaths.get(path) ?? path;
    },
    pathOfDropped(file) {
      return dropped.get(file) ?? '';
    },
    watch(path, onChange) {
      asked.watched.push(path);
      watchers.set(path, onChange);
      return () => {
        asked.stopped.push(path);
        watchers.delete(path);
      };
    },
  };
  const watchers = new Map<string, () => void>();
  return {
    bridge,
    disk,
    realPaths,
    asked,
    answers,
    dropped,
    watchers,
    failNext(message: string) {
      failNext = message;
    },
  };
}

const put = (fake: ReturnType<typeof fakeBridge>, path: string, text: string) =>
  fake.disk.set(path, { bytes: new TextEncoder().encode(text), lastModified: 1234 });

/** A dropped item, as the drop zone hands it over. */
const itemOf = (file: File | null) => ({ kind: 'file', getAsFile: () => file }) as DataTransferItem;

describe('desktopFiles', () => {
  test('picks a file to open, and a ref that is kept and read again', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    put(fake, '/home/w/Scripts/The Call.fountain', 'Title: The Call\n');
    fake.answers.push('/home/w/Scripts/The Call.fountain');
    const picked = await files.pickToOpen();
    expect(picked).toEqual({
      ref: { name: 'The Call.fountain', path: '/home/w/Scripts/The Call.fountain' },
      name: 'The Call.fountain',
      bytes: new TextEncoder().encode('Title: The Call\n'),
      lastModified: 1234,
    });
    // Kept in IndexedDB as it is: plain data.
    const kept = structuredClone(picked?.ref) as FileRef;
    expect(kept).toEqual(picked?.ref);
    expect(decoder.decode((await files.read(kept)).bytes)).toBe('Title: The Call\n');
    // Cancelled.
    expect(await files.pickToOpen()).toBeNull();
  });

  test('opens a path the system named, with a ref to save back to', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    put(fake, '/home/w/Scripts/The Call.fountain', 'Title: The Call\n');
    const picked = await files.fromPath?.('/home/w/Scripts/The Call.fountain');
    expect(picked).toEqual({
      ref: { name: 'The Call.fountain', path: '/home/w/Scripts/The Call.fountain' },
      name: 'The Call.fountain',
      bytes: new TextEncoder().encode('Title: The Call\n'),
      lastModified: 1234,
    });
    await expect(files.fromPath?.('/home/w/Scripts/Gone.fountain')).rejects.toBeInstanceOf(
      FileGoneError,
    );
  });

  test('opens a file that is not a script’s type unbound, and says why', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    put(fake, '/home/w/Mail/letter.text', 'LETTER');
    fake.answers.push('/home/w/Mail/letter.text');
    const picked = await files.pickToOpen();
    expect(picked).toMatchObject({ ref: null, name: 'letter.text' });
    expect(picked?.notice).toBe(
      '“letter.text” opened as a new script. Drafter saves only .fountain, .md, .markdown, and .txt files, so Save will ask where to put it.',
    );
    // A script's name over something else (a link), too: judged by where it leads.
    put(fake, '/home/w/key', 'KEY');
    fake.realPaths.set('/home/w/notes.md', '/home/w/key');
    const linked = await files.fromPath?.('/home/w/notes.md');
    expect(linked?.ref).toBeNull();
    expect(linked?.notice).toContain('“notes.md”');
    // A script is bound, with no notice.
    put(fake, '/home/w/Door.fountain', 'DOOR');
    const script = await files.fromPath?.('/home/w/Door.fountain');
    expect(script?.ref).toEqual({ name: 'Door.fountain', path: '/home/w/Door.fountain' });
    expect(script?.notice).toBeUndefined();
  });

  test('opens a Final Draft file unbound, with no notice: the import says what came in', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    put(fake, '/home/w/The Call.fdx', '<FinalDraft/>');
    const picked = await files.fromPath?.('/home/w/The Call.fdx');
    expect(picked).toMatchObject({ ref: null, name: 'The Call.fdx' });
    expect(picked?.notice).toBeUndefined();
    // Exported as one, through a Save dialog that offers .fdx.
    fake.answers.push('/home/w/The Call.fdx');
    expect(await files.pickToSave('The Call.fdx', 'fdx')).toEqual({
      name: 'The Call.fdx',
      path: '/home/w/The Call.fdx',
    });
    expect(fake.asked.save).toEqual([{ name: 'The Call.fdx', extension: '.fdx' }]);
  });

  test('says no "opened as a new script" notice for a .highland or .fadein', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    for (const name of ['Ferry.highland', 'Cabin.fadein', 'LOUD.HIGHLAND']) {
      put(fake, `/home/w/${name}`, 'PK');
      const picked = await files.fromPath?.(`/home/w/${name}`);
      expect(picked, name).toMatchObject({ ref: null, name });
      expect(picked?.notice, name).toBeUndefined();
    }
  });

  test('says whether it was reading or writing that was not allowed', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    const ref = { name: 'Door.fountain', path: '/home/w/Door.fountain' };
    fake.bridge.read = async () => {
      throw new Error('not-allowed: not chosen');
    };
    fake.bridge.write = async () => {
      throw new Error('not-allowed: not chosen');
    };
    await expect(files.read(ref)).rejects.toMatchObject({
      name: 'NotAllowedError',
      message: 'Drafter isn’t allowed to read that file.',
    });
    await expect(files.write(ref, 'x')).rejects.toMatchObject({
      name: 'NotAllowedError',
      message: 'Drafter isn’t allowed to write that file.',
    });
  });

  test('saves in place, always with permission', async () => {
    const files = desktopFiles(fakeBridge().bridge);
    expect(files.canSaveInPlace).toBe(true);
    const ref = { name: 'a.fountain', path: '/a.fountain' } as FileRef;
    expect(await files.permission(ref, false)).toBe('granted');
    expect(await files.permission(ref, true)).toBe('granted');
  });

  test('asks where to save with the kind’s extension, and writes there', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    fake.answers.push('/home/w/The Call.fountain', '/home/w/Notes.md', null);
    const ref = await files.pickToSave('The Call.fountain', 'fountain');
    expect(ref).toEqual({ name: 'The Call.fountain', path: '/home/w/The Call.fountain' });
    await files.write(ref as FileRef, 'INT. HOUSE - DAY\r\n');
    expect(decoder.decode(fake.disk.get('/home/w/The Call.fountain')?.bytes)).toBe(
      'INT. HOUSE - DAY\r\n',
    );
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x41]);
    await files.write(ref as FileRef, bom);
    expect(fake.disk.get('/home/w/The Call.fountain')?.bytes).toEqual(bom);
    expect(await files.pickToSave('Notes.md', 'markdown')).toEqual({
      name: 'Notes.md',
      path: '/home/w/Notes.md',
    });
    expect(await files.pickToSave('The Call.pdf', 'pdf')).toBeNull();
    expect(fake.asked.save).toEqual([
      { name: 'The Call.fountain', extension: '.fountain' },
      { name: 'Notes.md', extension: '.md' },
      { name: 'The Call.pdf', extension: '.pdf' },
    ]);
  });

  test('names a file by the last part of its path, on Linux and on Windows', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    fake.answers.push('/home/w/back\\slash.fountain', 'C:\\Users\\w\\脚本.fountain');
    expect((await files.pickToSave('x.fountain', 'fountain'))?.name).toBe('back\\slash.fountain');
    expect((await files.pickToSave('x.fountain', 'fountain'))?.name).toBe('脚本.fountain');
  });

  test('says a missing file is gone, and a refused one is not allowed', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    const ref = { name: 'gone.fountain', path: '/gone.fountain' } as FileRef;
    await expect(files.read(ref)).rejects.toBeInstanceOf(FileGoneError);
    // A ref that is not a desktop one (a damaged record) is as good as gone.
    await expect(files.read({ name: 'x' })).rejects.toBeInstanceOf(FileGoneError);

    fake.failNext("Error invoking remote method 'drafter:files:write': Error: gone");
    await expect(files.write(ref, 'x')).rejects.toBeInstanceOf(FileGoneError);
    fake.failNext('not-allowed');
    await expect(files.write(ref, 'x')).rejects.toMatchObject({ name: 'NotAllowedError' });
    fake.failNext('disk-full');
    const full = await files.write(ref, 'x').catch((error: unknown) => error);
    expect(full).toBeInstanceOf(FileProblemError);
    expect((full as Error).message).toBe('the disk is full');
    fake.failNext('failed: EIO');
    const other = await files.write(ref, 'x').catch((error: unknown) => error);
    expect(other).toBeInstanceOf(FileProblemError);
    expect((other as Error).message).toBe('something went wrong writing it (EIO)');
  });

  test('knows two paths are one file through their real paths', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    fake.realPaths.set('/home/w/link.fountain', '/data/real.fountain');
    const a = { name: 'link.fountain', path: '/home/w/link.fountain' } as FileRef;
    const b = { name: 'real.fountain', path: '/data/real.fountain' } as FileRef;
    const c = { name: 'other.fountain', path: '/data/other.fountain' } as FileRef;
    expect(await files.sameFile(a, b)).toBe(true);
    expect(await files.sameFile(a, c)).toBe(false);
    // Where the real path can't be had, the paths themselves are compared.
    const broken = { name: 'x', path: '/broken/x' } as FileRef;
    expect(await files.sameFile(broken, broken)).toBe(true);
    expect(await files.sameFile(broken, c)).toBe(false);
  });

  test('opens a dropped file by its path, so it saves in place', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    const file = new File(['Title: Dropped\n'], 'Dropped.fountain', { lastModified: 99 });
    fake.dropped.set(file, '/home/w/Dropped.fountain');
    put(fake, '/home/w/Dropped.fountain', 'Title: Dropped\n');
    expect(await files.fromDrop(itemOf(file))).toEqual({
      ref: { name: 'Dropped.fountain', path: '/home/w/Dropped.fountain' },
      name: 'Dropped.fountain',
      bytes: new TextEncoder().encode('Title: Dropped\n'),
      lastModified: 1234,
    });
    // A dropped file with no path on disk (from another app's memory) opens, unbound.
    const loose = new File(['Title: Loose\n'], 'Loose.fountain', { lastModified: 7 });
    const picked = await files.fromDrop(itemOf(loose));
    expect(picked?.ref).toBeNull();
    expect(decoder.decode(picked?.bytes)).toBe('Title: Loose\n');
    expect(await files.fromDrop(itemOf(null))).toBeNull();
  });

  test('opens a dropped file the desktop app won’t grant from its bytes, unbound', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    const file = new File(['Title: Notes\n'], 'notes.text', { lastModified: 5 });
    fake.dropped.set(file, '/home/w/notes.text');
    // Not on the (fake) disk as a granted file: the bridge refuses it.
    fake.bridge.read = async () => {
      throw new Error('not-allowed: not a script');
    };
    const picked = await files.fromDrop(itemOf(file));
    expect(picked).toMatchObject({ ref: null, name: 'notes.text', lastModified: 5 });
    expect(decoder.decode(picked?.bytes)).toBe('Title: Notes\n');
  });

  test('download asks where, then writes there', async () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    fake.answers.push('/home/w/The Call.txt');
    files.download('The Call.txt', 'TEXT', 'text/plain');
    await vi.waitFor(() =>
      expect(decoder.decode(fake.disk.get('/home/w/The Call.txt')?.bytes)).toBe('TEXT'),
    );
    expect(fake.asked.save).toEqual([{ name: 'The Call.txt', extension: '.txt' }]);
  });

  test('watches a file through the bridge, until told to stop', () => {
    const fake = fakeBridge();
    const files = desktopFiles(fake.bridge);
    let changes = 0;
    const stop = files.watch?.({ name: 'a', path: '/a.fountain' } as FileRef, () => changes++);
    fake.watchers.get('/a.fountain')?.();
    expect(changes).toBe(1);
    stop?.();
    expect(fake.asked.stopped).toEqual(['/a.fountain']);
    // Nothing to watch for a ref with no path.
    expect(files.watch?.({ name: 'x' }, () => {})).toBeTypeOf('function');
  });
});

describe('useFiles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.drafterDesktop;
    setFiles(browserFiles);
    vi.resetModules();
  });

  test('is the browser’s in a browser', async () => {
    vi.resetModules();
    const { useFiles: use, browserFiles: browser } = await import('../app/storage/files');
    expect(use()).toBe(browser);
  });

  test('is the desktop app’s in the desktop app', async () => {
    vi.resetModules();
    vi.stubGlobal('__DRAFTER_DESKTOP__', true);
    window.drafterDesktop = {
      version: '0.3.0',
      platform: 'linux',
      files: fakeBridge().bridge,
      menu: {} as never,
      onOpenFile: () => () => {},
    };
    const { useFiles: use, browserFiles: browser } = await import('../app/storage/files');
    expect(use()).not.toBe(browser);
    expect(use().canSaveInPlace).toBe(true);
    expect(use()).toBe(use());
  });

  test('can be replaced', () => {
    const mine = desktopFiles(fakeBridge().bridge);
    setFiles(mine);
    expect(useFiles()).toBe(mine);
  });
});
