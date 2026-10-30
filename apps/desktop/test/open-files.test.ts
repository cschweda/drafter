// The files named when Drafter is started (or started again): which arguments are scripts, what is
// said about the rest, and the inbox that holds a request until the page is listening.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  filesFromArgv,
  heldOpenFiles,
  OpenInbox,
  type OpenItem,
  type Refusal,
  refusalMessage,
  refusalsMessage,
  requestsFromArgv,
} from '../src/open-files';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'drafter-open-files-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const touch = (name: string, text = 'Title: x\n') => {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
};

describe('filesFromArgv', () => {
  test('takes script files from the arguments', () => {
    const a = touch('A Script.fountain');
    const b = touch('notes.md');
    touch('c.markdown');
    touch('d.TXT');
    mkdirSync(join(dir, 'sub'));
    touch('sub/e.fountain');
    touch('picture.png');
    mkdirSync(join(dir, 'folder.fountain'));
    const argv = [
      '/usr/bin/drafterdev',
      '--no-sandbox',
      '--enable-features=Foo',
      a, // absolute
      'notes.md', // relative to the launch folder
      './c.markdown',
      'sub/../d.TXT',
      'sub/e.fountain',
      'missing.fountain', // not there
      'picture.png', // not a script
      'folder.fountain', // a folder
      '--inspect=0',
      '-psn_0_12345',
      'notes.md', // named twice
    ];
    expect(filesFromArgv(argv, dir)).toEqual([
      a,
      b,
      join(dir, 'c.markdown'),
      join(dir, 'd.TXT'),
      join(dir, 'sub', 'e.fountain'),
    ]);
  });

  test('takes a Final Draft file, to import', () => {
    const a = touch('The Call.fdx', '<FinalDraft/>');
    touch('B.FDX', '<FinalDraft/>');
    expect(filesFromArgv(['/usr/bin/drafterdev', a, 'B.FDX'], dir)).toEqual([
      a,
      join(dir, 'B.FDX'),
    ]);
  });

  test('grants a .highland and a .fadein named on the command line', () => {
    const a = touch('Ferry.highland', 'PK');
    const b = touch('Cabin.fadein', 'PK');
    touch('LOUD.HIGHLAND', 'PK');
    expect(filesFromArgv(['/usr/bin/drafterdev', a, b, 'LOUD.HIGHLAND'], dir)).toEqual([
      a,
      b,
      join(dir, 'LOUD.HIGHLAND'),
    ]);
  });

  test('leaves out the executable, the app, and an AppImage, however they are written', () => {
    const script = touch('x.txt');
    const app = join(dir, 'app.txt'); // an app path that happens to look like a script
    writeFileSync(app, 'x');
    const exe = touch('drafterdev.md');
    const ignore = [app, exe, join(dir, 'Drafter.AppImage')];
    expect(filesFromArgv([exe, app, 'Drafter.AppImage', script], dir, ignore)).toEqual([script]);
    // Dev: `electron .` leaves the app folder as the first argument.
    expect(filesFromArgv(['/x/electron', '.', script], dir, [dir])).toEqual([script]);
  });

  test('follows a link to a script, and names it as it was written', () => {
    const real = touch('real.fountain');
    const link = join(dir, 'link.fountain');
    symlinkSync(real, link);
    expect(filesFromArgv(['x', link], dir)).toEqual([link]);
  });
});

describe.runIf(process.platform === 'win32')('on Windows', () => {
  test('a path as Explorer passes it: a drive, backslashes, spaces, and any case', () => {
    const path = touch('The Lamp.FOUNTAIN');
    expect(filesFromArgv(['Drafter.exe', path], dir)).toEqual([path]);
    // A file:// URL with a drive, as some programs pass one.
    expect(filesFromArgv(['Drafter.exe', pathToFileURL(path).href], dir)).toEqual([path]);
  });

  test('names compare without case: the app is ignored and a file opens once', () => {
    const path = touch('pilot.fountain');
    expect(filesFromArgv(['Drafter.exe', dir.toUpperCase()], dir, [dir.toLowerCase()])).toEqual([]);
    expect(filesFromArgv(['Drafter.exe', path, path.toUpperCase()], dir)).toEqual([path]);
  });

  test('a name Windows reads as another, or a stream, is not opened', () => {
    touch('notes.md');
    const { files } = requestsFromArgv(['Drafter.exe', `${join(dir, 'notes.md')}.`], dir);
    expect(files).toEqual([]);
  });
});

describe('requestsFromArgv', () => {
  test('says why each other argument was not opened', () => {
    touch('picture.png');
    mkdirSync(join(dir, 'folder'));
    const { files, refused } = requestsFromArgv(
      ['x', '--flag', 'ok.fountain', 'picture.png', 'missing.md', 'folder', '-x'],
      dir,
    );
    expect(files).toEqual([]);
    // A folder is not a file anyone meant to open: it is left out without a word.
    expect(refused.map((r) => r.name)).toEqual(['ok.fountain', 'picture.png', 'missing.md']);
    expect(refused.map((r) => r.reason)).toEqual([
      'it isn’t there',
      'it isn’t a script (.fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein)',
      'it isn’t there',
    ]);
    expect(refusalMessage(refused[1] as Refusal)).toBe(
      'Drafter can’t open “picture.png”: it isn’t a script (.fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein).',
    );
  });

  test('a script that is a folder, or can’t be read, is refused', () => {
    mkdirSync(join(dir, 'dir.fountain'));
    const { files, refused } = requestsFromArgv(['x', 'dir.fountain'], dir);
    expect(files).toEqual([]);
    expect(refused).toEqual([{ name: 'dir.fountain', reason: 'it isn’t a file' }]);
  });
});

describe('the values of switches', () => {
  test('say nothing about a folder or a name that is not there (`--user-data-dir /x`)', () => {
    mkdirSync(join(dir, 'profile'));
    const exists = requestsFromArgv(['x', '--user-data-dir', join(dir, 'profile')], dir);
    expect(exists).toEqual({ files: [], refused: [] });
    const missing = requestsFromArgv(['x', '--user-data-dir', join(dir, 'nothing-here')], dir);
    expect(missing).toEqual({ files: [], refused: [] });
    // Nor a plain name with no extension that is not a file (a switch's word value).
    expect(requestsFromArgv(['x', '--log-level', 'verbose'], dir)).toEqual({
      files: [],
      refused: [],
    });
  });

  test('still say so for a file that exists and is not a script', () => {
    touch('picture.png');
    const { refused } = requestsFromArgv(['x', 'picture.png'], dir);
    expect(refused.map((r) => r.name)).toEqual(['picture.png']);
  });
});

describe('after a bare --', () => {
  test('everything is a path, even a name that starts with a dash', () => {
    const dashed = touch('-draft.fountain');
    const other = touch('--also.md');
    const plain = touch('plain.fountain');
    const { files, refused } = requestsFromArgv(
      ['x', '-flag', '--', '-draft.fountain', '--also.md', plain, '--', '-not-there.fountain'],
      dir,
    );
    // The second `--` is itself a path (a folder-less name with no extension), and is left out.
    expect(files).toEqual([dashed, other, plain]);
    expect(refused).toEqual([{ name: '-not-there.fountain', reason: 'it isn’t there' }]);
  });

  test('before it, a name starting with a dash is a switch', () => {
    touch('-draft.fountain');
    expect(requestsFromArgv(['x', '-draft.fountain'], dir)).toEqual({ files: [], refused: [] });
  });
});

describe('names that are not ASCII', () => {
  test('opens a CJK name and an accented one, and names them as written', () => {
    const cjk = touch('脚本 第一稿.fountain');
    const accented = touch('Café Noël – résumé.md');
    const { files, refused } = requestsFromArgv(['x', '脚本 第一稿.fountain', accented], dir);
    expect(files).toEqual([cjk, accented]);
    expect(refused).toEqual([]);
    touch('写真.png');
    const png = requestsFromArgv(['x', '写真.png'], dir).refused;
    expect(refusalMessage(png[0] as Refusal)).toBe(
      'Drafter can’t open “写真.png”: it isn’t a script (.fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein).',
    );
  });
});

describe('file URLs (a desktop entry’s %U)', () => {
  test('opens a local file:// URL as its path, spaces and CJK included', () => {
    const plain = touch('My Script.fountain');
    const cjk = touch('脚本.md');
    const { files, refused } = requestsFromArgv(
      [
        'x',
        pathToFileURL(plain).href,
        pathToFileURL(cjk).href,
        `file://localhost${pathToFileURL(plain).pathname}`,
      ],
      dir,
    );
    expect(files).toEqual([plain, cjk]);
    expect(refused).toEqual([]);
  });

  test('says a missing file URL isn’t there, and leaves other hosts and schemes out', () => {
    const { files, refused } = requestsFromArgv(
      [
        'x',
        pathToFileURL(join(dir, 'gone.fountain')).href,
        'file://server/share/a.fountain',
        'https://example.com/a.fountain',
        'file:///%E0%A4%A.fountain',
      ],
      dir,
    );
    expect(files).toEqual([]);
    expect(refused).toEqual([{ name: 'gone.fountain', reason: 'it isn’t there' }]);
  });
});

describe('refusalsMessage', () => {
  const r = (name: string, reason = 'it isn’t there'): Refusal => ({ name, reason });

  test('is the one message for one refusal', () => {
    expect(refusalsMessage([r('a.md')])).toBe(refusalMessage(r('a.md')));
  });

  test('names several together, and counts the rest', () => {
    expect(refusalsMessage([r('a.md'), r('b.png', 'it isn’t a script')])).toBe(
      'Drafter can’t open 2 files: “a.md” (it isn’t there); “b.png” (it isn’t a script).',
    );
    const many = ['a', 'b', 'c', 'd', 'e'].map((n) => r(`${n}.md`));
    expect(refusalsMessage(many)).toBe(
      'Drafter can’t open 5 files: “a.md” (it isn’t there); “b.md” (it isn’t there); “c.md” (it isn’t there); and 2 more.',
    );
    expect(refusalsMessage([])).toBe('');
  });
});

describe('OpenInbox', () => {
  const target = () => {
    const sent: OpenItem[] = [];
    let alive = true;
    return {
      sent,
      isDestroyed: () => !alive,
      send: (_channel: string, item: OpenItem) => sent.push(item),
      kill: () => {
        alive = false;
      },
    };
  };

  test('holds requests until a page is listening, then hands them over in order, once', () => {
    const inbox = new OpenInbox('open');
    inbox.add({ path: '/a.fountain' });
    inbox.add({ problem: 'nope' });
    const page = target();
    inbox.listen(page);
    expect(page.sent).toEqual([{ path: '/a.fountain' }, { problem: 'nope' }]);
    // A page that listens again (it reloaded) isn't given them twice.
    inbox.listen(page);
    expect(page.sent).toHaveLength(2);
    // Later requests go straight to it.
    inbox.add({ path: '/b.md' });
    expect(page.sent.at(-1)).toEqual({ path: '/b.md' });
  });

  test('keeps requests while the page is gone, for the next one', () => {
    const inbox = new OpenInbox('open');
    const first = target();
    inbox.listen(first);
    first.kill();
    inbox.add({ path: '/c.txt' });
    expect(first.sent).toEqual([]);
    const second = target();
    inbox.listen(second);
    expect(second.sent).toEqual([{ path: '/c.txt' }]);
  });

  test('queues requests from a page that is navigating, until the next one says it is listening', () => {
    const inbox = new OpenInbox('open');
    const page = target();
    inbox.listen(page);
    inbox.add({ path: '/before.md' });
    // The page begins to reload (or navigate): nothing is sent to what is about to be replaced.
    inbox.forget(page);
    inbox.add({ path: '/during.md' });
    inbox.add({ problem: 'during too' });
    expect(page.sent).toEqual([{ path: '/before.md' }]);
    // It says it is listening again: it gets what came meanwhile, in order, once.
    inbox.listen(page);
    expect(page.sent).toEqual([
      { path: '/before.md' },
      { path: '/during.md' },
      { problem: 'during too' },
    ]);
  });

  test('forgets only the page it is told to', () => {
    const inbox = new OpenInbox('open');
    const old = target();
    const current = target();
    inbox.listen(old);
    inbox.listen(current);
    inbox.forget(old);
    inbox.add({ path: '/a.md' });
    expect(current.sent).toEqual([{ path: '/a.md' }]);
    expect(old.sent).toEqual([]);
  });

  test('says when a request comes in, so the window can be brought forward', () => {
    const seen = vi.fn();
    const inbox = new OpenInbox('open', seen);
    inbox.add({ path: '/a.md' });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('heldOpenFiles', () => {
  const event = () => ({ preventDefault: vi.fn() });

  test('keeps the files macOS names before the app has started, and hands them on in order', () => {
    const held = heldOpenFiles();
    const first = event();
    held.listener(first, '/Users/a/A.fountain');
    held.listener(event(), '/Users/a/B.md');
    // Taken by Drafter, so macOS doesn't say it couldn't be opened.
    expect(first.preventDefault).toHaveBeenCalledOnce();
    const open = vi.fn();
    held.deliver(open);
    expect(open.mock.calls).toEqual([['/Users/a/A.fountain'], ['/Users/a/B.md']]);
  });

  test('passes the ones after that straight on, once each', () => {
    const held = heldOpenFiles();
    const open = vi.fn();
    held.deliver(open);
    const later = event();
    held.listener(later, '/Users/a/C.markdown');
    expect(later.preventDefault).toHaveBeenCalledOnce();
    expect(open.mock.calls).toEqual([['/Users/a/C.markdown']]);
    held.deliver(open);
    expect(open).toHaveBeenCalledOnce();
  });

  test('takes no path that isn’t one', () => {
    const held = heldOpenFiles();
    const open = vi.fn();
    held.deliver(open);
    for (const bad of ['', 3, null, undefined, 'a\0b']) {
      held.listener(event(), bad as never);
    }
    expect(open).not.toHaveBeenCalled();
  });
});
