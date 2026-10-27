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
  test('is the AppImage’s with APPIMAGE set, the .deb’s without, on a packaged Linux build', () => {
    const base = { isPackaged: true, platform: 'linux' } as const;
    expect(updateMode({ ...base, appImage: '/home/a/Drafter.AppImage' })).toBe('appimage');
    expect(updateMode({ ...base })).toBe('deb');
    expect(updateMode({ ...base, appImage: '' })).toBe('deb');
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
    },
  };
  return fake as unknown as Fake & { checks: number };
}
type Fake = UpdaterLike & {
  emit(event: string, arg?: unknown): void;
  quits: unknown[][];
};

interface Rig {
  updates: Updates;
  published: Array<{ version: string; how: string }>;
  opened: string[];
  log: string[];
  before: ReturnType<typeof vi.fn>;
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
  const before = vi.fn();
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
    beforeInstall: before,
    log: (message) => log.push(message),
  });
  return {
    updates,
    published,
    opened,
    log,
    before,
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
    expect(u?.autoDownload).toBe(true);
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

  test('installs only when asked: quitAndInstall, after the close flow is told', async () => {
    const r = rig({ script: downloaded });
    r.updates.start();
    r.updates.setEnabled(true);
    r.updates.listen();
    await r.advance(5000);
    expect(r.created[0]?.quits).toEqual([]);
    expect(r.before).not.toHaveBeenCalled();
    expect(r.updates.install()).toBe(true);
    expect(r.before).toHaveBeenCalledTimes(1);
    expect(r.created[0]?.quits).toEqual([[false, true]]);
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
    expect(r.updates.install()).toBe(false);
    expect(r.updates.install()).toBe(false);
    expect(r.before).not.toHaveBeenCalled();
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
    expect(r.updates.install()).toBe(false);
    expect(r.created[0]?.quits).toEqual([]);
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
