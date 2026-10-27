// What the session allows the page (permissions, the network) and the spellchecker's dictionary,
// against a stand-in session: the handlers are what Electron would call.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Session } from 'electron';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { refuseNetwork, refusesRequest } from '../src/network';
import { allowsPermission, denyPermissions } from '../src/permissions';
import { seedDictionaries, setUpSpellcheck } from '../src/spellcheck';

type Handler = (...args: never[]) => unknown;

/** A session that keeps what it is given. */
function fakeSession() {
  const handlers: Record<string, Handler> = {};
  const events: Record<string, Handler> = {};
  const calls: [string, ...unknown[]][] = [];
  const session = {
    setPermissionRequestHandler: (h: Handler) => {
      handlers.request = h;
    },
    setPermissionCheckHandler: (h: Handler) => {
      handlers.check = h;
    },
    setDevicePermissionHandler: (h: Handler) => {
      handlers.device = h;
    },
    setDisplayMediaRequestHandler: (h: Handler) => {
      handlers.display = h;
    },
    on: (name: string, h: Handler) => {
      events[name] = h;
      return session;
    },
    webRequest: {
      onBeforeRequest: (filter: unknown, h: Handler) => {
        calls.push(['onBeforeRequest', filter]);
        handlers.beforeRequest = h;
      },
    },
    setSpellCheckerDictionaryDownloadURL: (url: string) => calls.push(['downloadURL', url]),
    setSpellCheckerLanguages: (languages: string[]) => calls.push(['languages', languages]),
    setSpellCheckerEnabled: (on: boolean) => calls.push(['enabled', on]),
  };
  return { session: session as unknown as Session, handlers, events, calls };
}

describe('permissions', () => {
  test('allows the app only what it uses, and nothing to anyone else', () => {
    for (const permission of ['persistent-storage', 'clipboard-sanitized-write']) {
      expect(allowsPermission(permission, 'app://drafter/'), permission).toBe(true);
      expect(allowsPermission(permission, 'app://drafter'), permission).toBe(true);
      expect(allowsPermission(permission, 'https://example.com/'), permission).toBe(false);
      expect(allowsPermission(permission, undefined), permission).toBe(false);
    }
    for (const permission of [
      'media',
      'geolocation',
      'notifications',
      'midi',
      'midiSysex',
      'pointerLock',
      'keyboardLock',
      'fullscreen',
      'openExternal',
      'clipboard-read',
      'display-capture',
      'idle-detection',
      'window-management',
      'fileSystem',
      'hid',
      'serial',
      'usb',
      'storage-access',
      'top-level-storage-access',
      'speaker-selection',
      'mediaKeySystem',
      'unknown',
    ]) {
      expect(allowsPermission(permission, 'app://drafter/'), permission).toBe(false);
    }
  });

  test('denies a request that is not allowed', () => {
    const { session, handlers, events } = fakeSession();
    denyPermissions(session);
    const answers: boolean[] = [];
    const ask = (permission: string, url: string) =>
      (handlers.request as (...a: unknown[]) => void)(
        {},
        permission,
        (granted: boolean) => answers.push(granted),
        { requestingUrl: url },
      );
    ask('notifications', 'app://drafter/');
    ask('media', 'app://drafter/');
    ask('geolocation', 'app://drafter/');
    ask('persistent-storage', 'app://drafter/');
    ask('persistent-storage', 'https://example.com/');
    expect(answers).toEqual([false, false, false, true, false]);

    const check = handlers.check as (...a: unknown[]) => boolean;
    expect(check({}, 'notifications', 'app://drafter', { requestingUrl: 'app://drafter/' })).toBe(
      false,
    );
    expect(check({}, 'clipboard-sanitized-write', 'app://drafter', {})).toBe(true);
    expect((handlers.device as () => boolean)()).toBe(false);

    let display: unknown = 'unanswered';
    (handlers.display as (...a: unknown[]) => void)({}, (streams: unknown) => {
      display = streams;
    });
    expect(display).toBeNull();

    // Device pickers are cancelled before one is shown.
    const cancelled: unknown[] = [];
    let prevented = 0;
    const event = { preventDefault: () => prevented++ };
    (events['select-hid-device'] as (...a: unknown[]) => void)(event, {}, (id?: string) =>
      cancelled.push(id),
    );
    (events['select-usb-device'] as (...a: unknown[]) => void)(event, {}, (id?: string) =>
      cancelled.push(id),
    );
    (events['select-serial-port'] as (...a: unknown[]) => void)(event, [], {}, (id: string) =>
      cancelled.push(id),
    );
    expect(prevented).toBe(3);
    expect(cancelled).toEqual([undefined, undefined, '']);
  });
});

describe('the network', () => {
  test('refuses web and socket requests from a page, and leaves the main process alone', () => {
    for (const url of [
      'https://example.com/',
      'http://127.0.0.1:8080/',
      'ws://example.com/socket',
      'wss://example.com/socket',
      'HTTPS://EXAMPLE.COM/',
    ]) {
      expect(refusesRequest({ url, webContentsId: 1 }), url).toBe(true);
      // The main process's own (the update check, Task 6) has no page.
      expect(refusesRequest({ url }), url).toBe(false);
    }
    for (const url of ['app://drafter/index.html', 'devtools://devtools/', 'data:text/plain,x']) {
      expect(refusesRequest({ url, webContentsId: 1 }), url).toBe(false);
    }
  });

  test('cancels what it refuses', () => {
    const { session, handlers, calls } = fakeSession();
    refuseNetwork(session);
    expect(calls[0]?.[0]).toBe('onBeforeRequest');
    const answers: unknown[] = [];
    const before = handlers.beforeRequest as (...a: unknown[]) => void;
    before({ url: 'https://example.com/', webContentsId: 3 }, (r: unknown) => answers.push(r));
    before({ url: 'https://example.com/' }, (r: unknown) => answers.push(r));
    expect(answers).toEqual([{ cancel: true }, { cancel: false }]);
  });
});

describe('the spellchecker’s dictionary', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'drafter-spell-'));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  test('is copied from the app into the profile, where Chromium looks before downloading', async () => {
    const bundled = join(dir, 'dictionaries');
    await mkdir(bundled);
    await writeFile(join(bundled, 'en-US-10-2.bdic'), 'BDIC');
    await writeFile(join(bundled, 'README_en_US.txt'), 'licence');
    const userData = join(dir, 'user-data');
    expect(seedDictionaries(bundled, userData)).toEqual(['en-US-10-2.bdic']);
    expect(await readdir(join(userData, 'Dictionaries'))).toEqual(['en-US-10-2.bdic']);
    // A damaged copy (another size) is replaced; a good one is left alone.
    await writeFile(join(userData, 'Dictionaries', 'en-US-10-2.bdic'), 'BD');
    seedDictionaries(bundled, userData);
    expect(await readFile(join(userData, 'Dictionaries', 'en-US-10-2.bdic'), 'utf8')).toBe('BDIC');
  });

  test('is the bundled one on Linux, never downloaded', async () => {
    const bundled = join(dir, 'dictionaries');
    await mkdir(bundled);
    await writeFile(join(bundled, 'en-US-10-2.bdic'), 'BDIC');
    const { session, calls } = fakeSession();
    expect(
      setUpSpellcheck(session, { platform: 'linux', dictionaries: bundled, userData: dir }),
    ).toBe('bundled');
    expect(calls).toEqual([
      ['downloadURL', `${pathToFileURL(bundled).href}/`],
      ['languages', ['en-US']],
      ['enabled', true],
    ]);
  });

  test('is the system’s on macOS', () => {
    const { session, calls } = fakeSession();
    expect(setUpSpellcheck(session, { platform: 'darwin', dictionaries: dir, userData: dir })).toBe(
      'system',
    );
    expect(calls).toEqual([]);
  });

  test('is off, not downloaded, when the app has no dictionary', () => {
    const { session, calls } = fakeSession();
    expect(
      setUpSpellcheck(session, {
        platform: 'linux',
        dictionaries: join(dir, 'missing'),
        userData: dir,
      }),
    ).toBe('off');
    expect(calls).toEqual([
      ['downloadURL', `${pathToFileURL(join(dir, 'missing')).href}/`],
      ['enabled', false],
    ]);
  });
});
