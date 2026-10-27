// updates.ts is pure (no Electron, no electron-updater): the rules for when a check happens and
// what is offered are tested here with a fake updater.
import { describe, expect, test, vi } from 'vitest';
import {
  RELEASES_URL,
  type UpdaterLike,
  Updates,
  type UpdatesDeps,
  updateMode,
  validFeed,
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
    const base = { isPackaged: false, platform: 'darwin' } as const;
    expect(updateMode({ ...base })).toBe('off');
    expect(updateMode({ ...base, appImage: '/x/D.AppImage' })).toBe('off');
    expect(updateMode({ ...base, feed: 'http://127.0.0.1:1' })).toBe('deb');
    expect(updateMode({ ...base, feed: 'http://127.0.0.1:1', appImage: '/x/D.AppImage' })).toBe(
      'appimage',
    );
  });

  test('ignores the test feed in a packaged app', () => {
    expect(updateMode({ isPackaged: true, platform: 'linux', feed: 'http://127.0.0.1:1' })).toBe(
      'deb',
    );
  });

  test('is off on a packaged platform other than Linux (their builds come later)', () => {
    expect(updateMode({ isPackaged: true, platform: 'win32' })).toBe('off');
    expect(updateMode({ isPackaged: true, platform: 'darwin' })).toBe('off');
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
