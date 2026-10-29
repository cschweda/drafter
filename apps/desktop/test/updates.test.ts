// updates.ts is pure (no Electron, no electron-updater): the rules for when a check happens and
// what is offered are tested here with a fake updater.
import { describe, expect, test, vi } from 'vitest';
import {
  FEED_FILE,
  isNewer,
  MAC_FEED,
  MAX_FEED_BYTES,
  RELEASES_URL,
  ReleaseCheck,
  type UpdaterLike,
  Updates,
  type UpdatesDeps,
  updateMode,
  validFeed,
  versionInFeed,
} from '../src/updates';

describe('updateMode', () => {
  /** A real AppImage run: APPIMAGE a file, APPDIR the mount, the executable inside it. */
  const real = {
    isPackaged: true,
    platform: 'linux',
    appImage: '/home/a/Drafter.AppImage',
    appImageIsFile: true,
    appDir: '/tmp/.mount_Drafte1',
    execPath: '/tmp/.mount_Drafte1/drafterdev',
  } as const;

  test('is the AppImage’s when it really is one, the .deb’s otherwise, on a packaged Linux build', () => {
    expect(updateMode({ ...real })).toBe('appimage');
    expect(updateMode({ isPackaged: true, platform: 'linux' })).toBe('deb');
    expect(updateMode({ ...real, appImage: '' })).toBe('deb');
  });

  test('does not trust an APPIMAGE inherited from another program (a .deb run from an AppImage’s terminal)', () => {
    // No APPDIR: the variable was not set by this app's own AppImage runtime.
    expect(updateMode({ ...real, appDir: undefined })).toBe('deb');
    expect(updateMode({ ...real, appDir: '' })).toBe('deb');
    // The executable is not inside APPDIR: the .deb's /opt binary, with the other AppImage's env.
    expect(updateMode({ ...real, execPath: '/opt/Drafter/drafterdev' })).toBe('deb');
    // A prefix that is not a directory boundary.
    expect(updateMode({ ...real, execPath: '/tmp/.mount_Drafte1x/drafterdev' })).toBe('deb');
    // The file it names is gone, or is not a regular file.
    expect(updateMode({ ...real, appImageIsFile: false })).toBe('deb');
  });

  test('checks nothing unpackaged unless the test feed is set, and then by APPIMAGE', () => {
    const base = { isPackaged: false, platform: 'linux' } as const;
    expect(updateMode({ ...base })).toBe('off');
    expect(updateMode({ ...base, appImage: '/x/D.AppImage' })).toBe('off');
    expect(updateMode({ ...base, feed: 'http://127.0.0.1:1' })).toBe('deb');
    expect(updateMode({ ...base, feed: 'http://127.0.0.1:1', appImage: '/x/D.AppImage' })).toBe(
      'appimage',
    );
    // On a Mac the test feed plays the Mac app, unless APPIMAGE asks for the AppImage.
    const mac = { isPackaged: false, platform: 'darwin' } as const;
    expect(updateMode({ ...mac })).toBe('off');
    expect(updateMode({ ...mac, feed: 'http://127.0.0.1:1' })).toBe('mac');
    expect(updateMode({ ...mac, feed: 'http://127.0.0.1:1', appImage: '/x/D.AppImage' })).toBe(
      'appimage',
    );
  });

  test('ignores the test feed in a packaged app', () => {
    expect(updateMode({ isPackaged: true, platform: 'linux', feed: 'http://127.0.0.1:1' })).toBe(
      'deb',
    );
  });

  test('is the Mac app’s on a packaged Mac (check, then Get it: it can’t update itself)', () => {
    expect(updateMode({ isPackaged: true, platform: 'darwin' })).toBe('mac');
    // An APPIMAGE inherited from somewhere is nothing to a Mac.
    expect(
      updateMode({
        isPackaged: true,
        platform: 'darwin',
        appImage: '/x/D.AppImage',
        appImageIsFile: true,
        appDir: '/x',
        execPath: '/x/Drafter',
      }),
    ).toBe('mac');
  });

  test('is the installer’s on a packaged Windows build (check, download, Restart)', () => {
    expect(updateMode({ isPackaged: true, platform: 'win32' })).toBe('nsis');
    // An APPIMAGE inherited from somewhere is nothing to Windows.
    expect(
      updateMode({
        isPackaged: true,
        platform: 'win32',
        appImage: 'C:\\x\\D.AppImage',
        appImageIsFile: true,
        appDir: 'C:\\x',
        execPath: 'C:\\x\\Drafter.exe',
      }),
    ).toBe('nsis');
  });

  test('on Windows the test feed plays the installer, unless APPIMAGE asks for the AppImage', () => {
    const win = { isPackaged: false, platform: 'win32' } as const;
    expect(updateMode({ ...win })).toBe('off');
    expect(updateMode({ ...win, feed: 'http://127.0.0.1:1' })).toBe('nsis');
    expect(updateMode({ ...win, feed: 'http://127.0.0.1:1', appImage: 'C:\\x\\D.AppImage' })).toBe(
      'appimage',
    );
  });

  test('is off on a packaged system with no build (FreeBSD, say)', () => {
    expect(updateMode({ isPackaged: true, platform: 'freebsd' })).toBe('off');
  });
});

describe('validFeed', () => {
  test('accepts an http or https URL and nothing else', () => {
    expect(validFeed('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080');
    expect(validFeed('https://example.test/x')).toBe('https://example.test/x');
    for (const bad of [undefined, '', 'file:///etc', 'javascript:1', 'nope', 'ftp://x/y']) {
      expect(validFeed(bad)).toBeNull();
    }
  });
});

/** A fake electron-updater: `check()` plays what the real one emits. */
function fakeUpdater(
  script: (u: Fake) => Promise<void> | void = () => {},
): Fake & { checks: number } {
  const listeners = new Map<string, (arg: never) => void>();
  const fake = {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    checks: 0,
    quits: [] as unknown[][],
    downloads: [] as unknown[],
    quitBehaviour: 'silent' as 'silent' | 'error' | 'throw',
    async downloadUpdate(token?: unknown) {
      fake.downloads.push(token);
      return [];
    },
    on(event: string, listener: (arg: never) => void) {
      listeners.set(event, listener);
      return fake;
    },
    emit(event: string, arg?: unknown) {
      listeners.get(event)?.(arg as never);
    },
    async checkForUpdates() {
      fake.checks++;
      await script(fake as unknown as Fake);
      return null;
    },
    quitAndInstall(...args: unknown[]) {
      fake.quits.push(args);
      if (fake.quitBehaviour === 'error') listeners.get('error')?.(new Error('EACCES') as never);
      if (fake.quitBehaviour === 'throw') throw new Error('boom');
    },
  };
  return fake as unknown as Fake & { checks: number };
}
type Fake = UpdaterLike & {
  emit(event: string, arg?: unknown): void;
  quits: unknown[][];
  downloads: unknown[];
  quitBehaviour: 'silent' | 'error' | 'throw';
};

interface Rig {
  updates: Updates;
  published: Array<{ version: string; how: string }>;
  opened: string[];
  log: string[];
  approve: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
  cancels: () => number;
  created: Array<Fake & { checks: number }>;
  advance(ms: number): Promise<void>;
}

function rig(
  options: {
    mode?: UpdatesDeps['mode'];
    script?: (u: Fake) => Promise<void> | void;
    createFails?: boolean;
  } = {},
): Rig {
  vi.useFakeTimers();
  const published: Rig['published'] = [];
  const opened: string[] = [];
  const log: string[] = [];
  const created: Rig['created'] = [];
  const revoke = vi.fn();
  const approve = vi.fn(() => revoke);
  let cancelled = 0;
  const updates = new Updates({
    mode: options.mode ?? 'appimage',
    delayMs: 5000,
    createUpdater: async () => {
      if (options.createFails) throw new Error('no updater');
      const fake = fakeUpdater(options.script);
      created.push(fake);
      return fake;
    },
    publish: (offer) => published.push({ version: offer.version, how: offer.how }),
    openExternal: (url) => opened.push(url),
    approveQuit: approve,
    newCancellation: () => ({
      cancel: () => {
        cancelled++;
      },
    }),
    log: (message) => log.push(message),
  });
  return {
    updates,
    published,
    opened,
    log,
    approve,
    revoke,
    cancels: () => cancelled,
    created,
    advance: async (ms) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
  };
}

describe('the check', () => {
  test('happens once, a few seconds after the window is ready, when the setting is on', async () => {
    const r = rig();
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(4999);
    expect(r.created).toHaveLength(0);
    await r.advance(2);
    expect(r.created).toHaveLength(1);
    expect(r.created[0]?.checks).toBe(1);
    r.updates.setEnabled(true);
    await r.advance(60_000);
    expect(r.created[0]?.checks).toBe(1);
    vi.useRealTimers();
  });

  test('waits for the page to say the setting is on, and does not check when it is off', async () => {
    const r = rig();
    r.updates.start();
    await r.advance(20_000);
    expect(r.created).toHaveLength(0);
    r.updates.setEnabled(false);
    await r.advance(20_000);
    expect(r.created).toHaveLength(0);
    r.updates.setEnabled(true);
    await r.advance(1);
    expect(r.created).toHaveLength(1);
    vi.useRealTimers();
  });

  test('is turned off before it happens: no check, ever', async () => {
    const r = rig();
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.setEnabled(false);
    await r.advance(60_000);
    expect(r.created).toHaveLength(0);
    vi.useRealTimers();
  });

  test('does nothing in mode off', async () => {
    const r = rig({ mode: 'off' });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(60_000);
    expect(r.created).toHaveLength(0);
    vi.useRealTimers();
  });

  test('never installs by itself, and downloads only after a check found a version', async () => {
    const r = rig();
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    const u = r.created[0];
    // Never on its own: a found version starts it (downloadUpdate), so it can be cancelled.
    expect(u?.autoDownload).toBe(false);
    expect(u?.downloads).toEqual([]);
    expect(u?.autoInstallOnAppQuit).toBe(false);
    vi.useRealTimers();
  });

  test('is silent when it fails: logged, nothing offered, no throw', async () => {
    const r = rig({
      script: () => {
        throw new Error('ENOTFOUND github.com');
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    expect(r.published).toEqual([]);
    expect(r.log.join('\n')).toMatch(/ENOTFOUND/);
    const failing = rig({ createFails: true });
    failing.updates.start();
    failing.updates.setEnabled(true);
    await failing.advance(5000);
    expect(failing.published).toEqual([]);
    expect(failing.log.join('\n')).toMatch(/no updater/);
    vi.useRealTimers();
  });
});

describe('the offer (AppImage)', () => {
  const downloaded = (u: Fake) => {
    u.emit('update-available', { version: '0.9.0' });
    u.emit('update-downloaded', { version: '0.9.0' });
  };

  test('comes when the download is done, as Restart, and not before', async () => {
    const r = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.published).toEqual([]);
    r.created[0]?.emit('update-downloaded', { version: '0.9.0' });
    expect(r.published).toEqual([{ version: '0.9.0', how: 'restart' }]);
    vi.useRealTimers();
  });

  test('waits for the page to listen, then comes once and again on a later listen', async () => {
    const r = rig({ script: downloaded });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    expect(r.published).toEqual([]);
    r.updates.listen();
    expect(r.published).toEqual([{ version: '0.9.0', how: 'restart' }]);
    r.updates.listen();
    expect(r.published).toHaveLength(2);
    vi.useRealTimers();
  });

  test('installs only when asked: quitAndInstall, with the quit approved first', async () => {
    const r = rig({ script: downloaded });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.created[0]?.quits).toEqual([]);
    expect(r.approve).not.toHaveBeenCalled();
    void r.updates.install();
    expect(r.approve).toHaveBeenCalledTimes(1);
    expect(r.created[0]?.quits).toEqual([[false, true]]);
    vi.useRealTimers();
  });

  /** An installed-and-downloaded rig whose quitAndInstall does `behaviour`. */
  async function readyToInstall(behaviour: 'silent' | 'error' | 'throw') {
    const r = rig({
      script: (u) => {
        u.quitBehaviour = behaviour;
        downloaded(u);
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    return r;
  }

  test('an install that fails (the updater says error and does not quit) takes the approval back', async () => {
    const r = await readyToInstall('error');
    expect(await r.updates.install()).toBe('failed');
    expect(r.approve).toHaveBeenCalledTimes(1);
    expect(r.revoke).toHaveBeenCalledTimes(1);
    expect(r.log.join('\n')).toMatch(/EACCES/);
    vi.useRealTimers();
  });

  test('an install that throws takes the approval back too', async () => {
    const r = await readyToInstall('throw');
    expect(await r.updates.install()).toBe('failed');
    expect(r.revoke).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('an install that never quits is a failure after a few seconds, and the approval ends', async () => {
    const r = await readyToInstall('silent');
    const result = r.updates.install();
    await r.advance(2999);
    expect(r.revoke).not.toHaveBeenCalled();
    await r.advance(2);
    expect(await result).toBe('failed');
    expect(r.revoke).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('refuses to install when nothing was downloaded', async () => {
    const r = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    expect(await r.updates.install()).toBe('nothing');
    expect(await r.updates.install()).toBe('nothing');
    expect(r.approve).not.toHaveBeenCalled();
    expect(r.created[0]?.quits).toEqual([]);
    vi.useRealTimers();
  });

  test('does not open the release page (that is the .deb’s)', async () => {
    const r = rig({ script: downloaded });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    r.updates.openReleasePage();
    expect(r.opened).toEqual([]);
    vi.useRealTimers();
  });
});

describe('the offer (Windows installer)', () => {
  const downloaded = (u: Fake) => {
    u.emit('update-available', { version: '0.9.0' });
    u.emit('update-downloaded', { version: '0.9.0' });
  };

  test('downloads in the background after a check found a version, then offers Restart', async () => {
    const r = rig({
      mode: 'nsis',
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.created[0]?.autoDownload).toBe(false);
    expect(r.created[0]?.autoInstallOnAppQuit).toBe(false);
    expect(r.created[0]?.downloads).toHaveLength(1);
    expect(r.published).toEqual([]);
    r.created[0]?.emit('update-downloaded', { version: '0.9.0' });
    expect(r.published).toEqual([{ version: '0.9.0', how: 'restart' }]);
    vi.useRealTimers();
  });

  test('installs only when asked, with the quit approved first, and runs the new version after', async () => {
    const r = rig({ mode: 'nsis', script: downloaded });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.created[0]?.quits).toEqual([]);
    void r.updates.install();
    expect(r.approve).toHaveBeenCalledTimes(1);
    // Not silent: the installer shows its progress while Drafter is gone, then starts it again.
    expect(r.created[0]?.quits).toEqual([[false, true]]);
    vi.useRealTimers();
  });

  test('an install that fails takes the approval back', async () => {
    const r = rig({
      mode: 'nsis',
      script: (u) => {
        u.quitBehaviour = 'error';
        downloaded(u);
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    expect(await r.updates.install()).toBe('failed');
    expect(r.revoke).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  test('a download stops when Check for updates is turned off, and never opens the release page', async () => {
    const r = rig({
      mode: 'nsis',
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    r.updates.setEnabled(false);
    expect(r.cancels()).toBe(1);
    r.updates.openReleasePage();
    expect(r.opened).toEqual([]);
    vi.useRealTimers();
  });
});

describe('the offer (.deb)', () => {
  const found = (u: Fake) => {
    u.emit('update-available', { version: '0.9.0' });
  };

  test('comes as Get it when a newer version is found, and nothing is downloaded', async () => {
    const r = rig({ mode: 'deb', script: found });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.created[0]?.autoDownload).toBe(false);
    expect(r.created[0]?.autoInstallOnAppQuit).toBe(false);
    expect(r.published).toEqual([{ version: '0.9.0', how: 'get' }]);
    vi.useRealTimers();
  });

  test('opens the release page, only when there is an offer, and never installs', async () => {
    const r = rig({ mode: 'deb', script: found });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.openReleasePage();
    expect(r.opened).toEqual([]);
    await r.advance(5000);
    r.updates.openReleasePage();
    expect(r.opened).toEqual([RELEASES_URL]);
    expect(RELEASES_URL).toBe('https://github.com/cschweda/drafter/releases/latest');
    expect(await r.updates.install()).toBe('nothing');
    expect(r.created[0]?.quits).toEqual([]);
    vi.useRealTimers();
  });
});

describe('the download', () => {
  test('starts only when a check found a version, with a token, and never for a .deb', async () => {
    const none = rig();
    none.updates.start();
    none.updates.setEnabled(true);
    await none.advance(5000);
    expect(none.created[0]?.downloads).toEqual([]);

    const found = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    found.updates.start();
    found.updates.setEnabled(true);
    await found.advance(5000);
    expect(found.created[0]?.downloads).toHaveLength(1);
    expect(found.created[0]?.downloads[0]).toBeTruthy();

    const deb = rig({
      mode: 'deb',
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    deb.updates.start();
    deb.updates.setEnabled(true);
    await deb.advance(5000);
    expect(deb.created[0]?.downloads).toEqual([]);
    vi.useRealTimers();
  });

  test('is cancelled when Check for updates is turned off', async () => {
    const r = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    expect(r.cancels()).toBe(0);
    r.updates.setEnabled(true);
    expect(r.cancels()).toBe(0);
    r.updates.setEnabled(false);
    expect(r.cancels()).toBe(1);
    vi.useRealTimers();
  });
});

describe('the setting turned off after an offer', () => {
  test('stops offering it', async () => {
    const r = rig({
      mode: 'deb',
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.published).toHaveLength(1);
    r.updates.setEnabled(false);
    r.updates.listen();
    expect(r.published).toHaveLength(1);
    vi.useRealTimers();
  });
});

describe('the offer (Mac)', () => {
  const found = (u: Fake) => {
    u.emit('update-available', { version: '0.9.0' });
  };

  test('comes as Get it, opens the release page, and never downloads or installs', async () => {
    const r = rig({ mode: 'mac', script: found });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.published).toEqual([{ version: '0.9.0', how: 'get' }]);
    expect(r.created[0]?.downloads).toEqual([]);
    r.updates.openReleasePage();
    expect(r.opened).toEqual([RELEASES_URL]);
    expect(await r.updates.install()).toBe('nothing');
    expect(r.created[0]?.quits).toEqual([]);
    vi.useRealTimers();
  });
});

describe('isNewer', () => {
  test('compares versions part by part, as numbers', () => {
    expect(isNewer('0.7.0', '0.6.0')).toBe(true);
    expect(isNewer('0.6.1', '0.6.0')).toBe(true);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('0.6.0', '0.6.0')).toBe(false);
    expect(isNewer('0.5.9', '0.6.0')).toBe(false);
    expect(isNewer('v0.7.0', '0.6.0')).toBe(true);
  });

  test('counts a release as newer than its own pre-release, and not the other way', () => {
    expect(isNewer('0.7.0', '0.7.0-beta.1')).toBe(true);
    expect(isNewer('0.7.0-beta.1', '0.7.0')).toBe(false);
    expect(isNewer('0.7.0-beta.1', '0.6.0')).toBe(true);
  });

  test('is false for anything that isn’t a version', () => {
    for (const bad of ['', 'latest', '1.2', '1.2.3.4', 'x.y.z', '1.2.3 ']) {
      expect(isNewer(bad, '0.0.1')).toBe(false);
      expect(isNewer('9.9.9', bad)).toBe(false);
    }
  });
});

describe('versionInFeed', () => {
  test('reads the version from latest-linux.yml, as electron-builder writes it', () => {
    expect(versionInFeed('version: 0.7.0\nfiles:\n  - url: x\n')).toBe('0.7.0');
    expect(versionInFeed("files: []\nversion: '0.7.1'\n")).toBe('0.7.1');
    expect(versionInFeed('version: "1.0.0"\r\n')).toBe('1.0.0');
  });

  test('is null when there is none', () => {
    expect(versionInFeed('')).toBeNull();
    expect(versionInFeed('files:\n  - version: 0.7.0\n')).toBeNull();
    expect(versionInFeed('<html>Not Found</html>')).toBeNull();
  });
});

describe('ReleaseCheck', () => {
  const check = (feed: string, current: string, text: string | Error) => {
    const asked: string[] = [];
    const updater = new ReleaseCheck({
      feed,
      current,
      fetchText: async (url) => {
        asked.push(url);
        if (text instanceof Error) throw text;
        return text;
      },
    });
    const found: string[] = [];
    updater.on('update-available', (info) => found.push(info.version));
    return { updater, asked, found };
  };

  test('reads the release’s latest-linux.yml and says when it is newer', async () => {
    const c = check(MAC_FEED, '0.6.0', 'version: 0.7.0\n');
    await c.updater.checkForUpdates();
    expect(c.asked).toEqual([`${MAC_FEED}${FEED_FILE}`]);
    expect(MAC_FEED).toBe('https://github.com/cschweda/drafter/releases/latest/download/');
    expect(FEED_FILE).toBe('latest-linux.yml');
    expect(c.found).toEqual(['0.7.0']);
  });

  test('says nothing when the release is not newer', async () => {
    const c = check(MAC_FEED, '0.7.0', 'version: 0.7.0\n');
    await c.updater.checkForUpdates();
    expect(c.found).toEqual([]);
  });

  test('takes a test feed with or without its last slash', async () => {
    const a = check('http://127.0.0.1:4000', '0.6.0', 'version: 0.6.0\n');
    await a.updater.checkForUpdates();
    const b = check('http://127.0.0.1:4000/feed/', '0.6.0', 'version: 0.6.0\n');
    await b.updater.checkForUpdates();
    expect([...a.asked, ...b.asked]).toEqual([
      'http://127.0.0.1:4000/latest-linux.yml',
      'http://127.0.0.1:4000/feed/latest-linux.yml',
    ]);
  });

  test('fails (for the log) when the release can’t be read or names no version', async () => {
    await expect(
      check(MAC_FEED, '0.6.0', new Error('offline')).updater.checkForUpdates(),
    ).rejects.toThrow('offline');
    const empty = check(MAC_FEED, '0.6.0', 'Not Found');
    await expect(empty.updater.checkForUpdates()).rejects.toThrow(/no version/);
    expect(empty.found).toEqual([]);
  });

  test('refuses a feed file far bigger than one is (it is under a kilobyte)', async () => {
    expect(MAX_FEED_BYTES).toBe(64 * 1024);
    const big = check(MAC_FEED, '0.6.0', `version: 9.9.9\n${'#'.repeat(MAX_FEED_BYTES)}`);
    await expect(big.updater.checkForUpdates()).rejects.toThrow(/too big/);
    expect(big.found).toEqual([]);
  });

  test('downloads and installs nothing', async () => {
    const c = check(MAC_FEED, '0.6.0', 'version: 0.7.0\n');
    await expect(c.updater.downloadUpdate()).rejects.toThrow();
    expect(() => c.updater.quitAndInstall()).toThrow();
  });
});

describe('a check the writer asks for (Help → Check for updates)', () => {
  test('checks now, with the setting off and before the start’s wait is over', async () => {
    const r = rig({ script: () => {} });
    r.updates.start();
    r.updates.setEnabled(false);
    const result = await r.updates.checkNow();
    expect(result).toEqual({ status: 'latest' });
    expect(r.created).toHaveLength(1);
    expect(r.created[0]?.checks).toBe(1);
    // The start's own check still never happens with the setting off.
    await r.advance(60_000);
    expect(r.created[0]?.checks).toBe(1);
    vi.useRealTimers();
  });

  test('an AppImage downloads what it found and offers Restart, even with the setting off', async () => {
    const r = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.listen();
    const result = await r.updates.checkNow();
    expect(result).toEqual({ status: 'downloading', version: '0.9.0' });
    expect(r.created[0]?.downloads).toHaveLength(1);
    r.created[0]?.emit('update-downloaded', { version: '0.9.0' });
    expect(r.published).toEqual([{ version: '0.9.0', how: 'restart' }]);
    // Asked again: the downloaded version is the answer, and nothing downloads twice.
    expect(await r.updates.checkNow()).toEqual({
      status: 'found',
      version: '0.9.0',
      how: 'restart',
    });
    expect(r.created[0]?.downloads).toHaveLength(1);
    vi.useRealTimers();
  });

  test('a .deb or the Mac app is offered Get it', async () => {
    for (const mode of ['deb', 'mac'] as const) {
      const r = rig({
        mode,
        script: (u) => {
          u.emit('update-available', { version: '0.9.0' });
        },
      });
      r.updates.listen();
      expect(await r.updates.checkNow()).toEqual({ status: 'found', version: '0.9.0', how: 'get' });
      expect(r.published).toEqual([{ version: '0.9.0', how: 'get' }]);
      r.updates.openReleasePage();
      expect(r.opened).toEqual([RELEASES_URL]);
      vi.useRealTimers();
    }
  });

  test('says error when the check fails, and off when this build can’t check', async () => {
    const failing = rig({
      script: () => {
        throw new Error('ENOTFOUND github.com');
      },
    });
    expect(await failing.updates.checkNow()).toEqual({ status: 'error' });
    expect(failing.log.join('\n')).toMatch(/ENOTFOUND/);
    vi.useRealTimers();
    const none = rig({ createFails: true });
    expect(await none.updates.checkNow()).toEqual({ status: 'error' });
    vi.useRealTimers();
    const off = rig({ mode: 'off' });
    expect(await off.updates.checkNow()).toEqual({ status: 'off' });
    expect(off.created).toHaveLength(0);
    vi.useRealTimers();
  });

  test('a check under way is the one asked for: one updater, one request', async () => {
    let release: () => void = () => {};
    const r = rig({
      script: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    const asked = r.updates.checkNow();
    await r.advance(10);
    release();
    expect(await asked).toEqual({ status: 'latest' });
    expect(r.created).toHaveLength(1);
    expect(r.created[0]?.checks).toBe(1);
    vi.useRealTimers();
  });

  test('a failed check can be asked again', async () => {
    let fail = true;
    const r = rig({
      script: () => {
        if (fail) throw new Error('offline');
      },
    });
    expect(await r.updates.checkNow()).toEqual({ status: 'error' });
    fail = false;
    expect(await r.updates.checkNow()).toEqual({ status: 'latest' });
    vi.useRealTimers();
  });
});

describe('a check the writer asked for, and the setting', () => {
  test('a download the writer asked for is not cancelled when the page says the setting is off', async () => {
    const r = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.setEnabled(false);
    expect(await r.updates.checkNow()).toEqual({ status: 'downloading', version: '0.9.0' });
    // The page starts again (a reload, a Mac window opened again) and says the setting is off.
    r.updates.setEnabled(false);
    expect(r.cancels()).toBe(0);
    r.created[0]?.emit('update-downloaded', { version: '0.9.0' });
    r.updates.listen();
    expect(r.published).toEqual([{ version: '0.9.0', how: 'restart' }]);
    vi.useRealTimers();
  });

  test('a download the start began is still cancelled when the setting is turned off', async () => {
    const r = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    r.updates.setEnabled(false);
    expect(r.cancels()).toBe(1);
    vi.useRealTimers();
  });

  test('a download the start began becomes the writer’s when they ask: the setting no longer stops it', async () => {
    const r = rig({
      script: (u) => {
        u.emit('update-available', { version: '0.9.0' });
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    await r.advance(5000);
    expect(r.created[0]?.downloads).toHaveLength(1);
    expect(await r.updates.checkNow()).toEqual({ status: 'downloading', version: '0.9.0' });
    r.updates.setEnabled(false);
    expect(r.cancels()).toBe(0);
    expect(r.created[0]?.downloads).toHaveLength(1);
    vi.useRealTimers();
  });

  test('a failed check the writer asked for doesn’t take the place of the start’s check', async () => {
    let fail = true;
    const r = rig({
      script: () => {
        if (fail) throw new Error('offline');
      },
    });
    r.updates.start();
    r.updates.setEnabled(true);
    expect(await r.updates.checkNow()).toEqual({ status: 'error' });
    fail = false;
    await r.advance(5000);
    expect(r.created[0]?.checks).toBe(2);
    vi.useRealTimers();
  });

  test('a check the writer asked for that worked is the start’s check', async () => {
    const r = rig({ script: () => {} });
    r.updates.start();
    r.updates.setEnabled(true);
    expect(await r.updates.checkNow()).toEqual({ status: 'latest' });
    await r.advance(60_000);
    expect(r.created[0]?.checks).toBe(1);
    vi.useRealTimers();
  });
});
