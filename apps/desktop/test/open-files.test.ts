// The files named when Drafter is started (or started again): which arguments are scripts, what is
// said about the rest, and the inbox that holds a request until the page is listening.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  filesFromArgv,
  OpenInbox,
  type OpenItem,
  type Refusal,
  refusalMessage,
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

describe('requestsFromArgv', () => {
  test('says why each other argument was not opened', () => {
    touch('picture.png');
    mkdirSync(join(dir, 'folder'));
    const { files, refused } = requestsFromArgv(
      ['x', '--flag', 'ok.fountain', 'picture.png', 'missing.md', 'folder', '-x'],
      dir,
    );
    expect(files).toEqual([]);
    expect(refused.map((r) => r.name)).toEqual([
      'ok.fountain',
      'picture.png',
      'missing.md',
      'folder',
    ]);
    expect(refused.map((r) => r.reason)).toEqual([
      'it isn’t there',
      'it isn’t a script (.fountain, .md, .markdown, or .txt)',
      'it isn’t there',
      'it isn’t a script (.fountain, .md, .markdown, or .txt)',
    ]);
    expect(refusalMessage(refused[1] as Refusal)).toBe(
      'Drafter can’t open “picture.png”: it isn’t a script (.fountain, .md, .markdown, or .txt).',
    );
  });

  test('a script that is a folder, or can’t be read, is refused', () => {
    mkdirSync(join(dir, 'dir.fountain'));
    const { files, refused } = requestsFromArgv(['x', 'dir.fountain'], dir);
    expect(files).toEqual([]);
    expect(refused).toEqual([{ name: 'dir.fountain', reason: 'it isn’t a file' }]);
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

  test('says when a request comes in, so the window can be brought forward', () => {
    const seen = vi.fn();
    const inbox = new OpenInbox('open', seen);
    inbox.add({ path: '/a.md' });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
