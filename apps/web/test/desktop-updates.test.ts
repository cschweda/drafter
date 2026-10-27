// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type { DesktopBridge, DesktopUpdatesBridge } from '../app/desktop';
import { createSettings } from '../app/settings/settings';
import { db } from '../app/storage/db';
import { installDesktopUpdates } from '../app/update/desktop-source';
import {
  actionLabel,
  anywayLabel,
  INSTALL_FAILED,
  offerText,
  UPDATE_AVAILABLE,
  UPDATE_READY,
  unsavedMessage,
} from '../app/update/flow';
import {
  applyUpdate,
  availableVersion,
  installError,
  needRefresh,
  updateKind,
} from '../app/update/state';

const flush = vi.fn(async () => {});
vi.mock('../app/storage/script', () => ({ useScript: () => ({ flush }) }));

/** A bridge whose update calls are recorded; `offer` plays what the main process sends. */
function bridge(options: { installFails?: boolean } = {}) {
  const calls: string[] = [];
  let offer: ((version: string, how: 'restart' | 'get') => void) | undefined;
  let stops = 0;
  const updates: DesktopUpdatesBridge = {
    onAvailable(cb) {
      offer = cb;
      calls.push('listen');
      return () => {
        stops += 1;
        offer = undefined;
      };
    },
    install: async () => {
      calls.push('install');
      if (options.installFails) throw new Error('install-failed');
    },
    openReleasePage: () => {
      calls.push('open');
    },
    setEnabled: (on) => {
      calls.push(`enabled:${on}`);
    },
  };
  window.drafterDesktop = { version: '0', platform: 'linux', updates } as unknown as DesktopBridge;
  return { calls, offer: (v: string, h: 'restart' | 'get') => offer?.(v, h), stops: () => stops };
}

beforeEach(async () => {
  vi.stubGlobal('__DRAFTER_DESKTOP__', true);
  needRefresh.value = false;
  updateKind.value = 'reload';
  availableVersion.value = '';
  installError.value = false;
  flush.mockClear();
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => {
  delete window.drafterDesktop;
  vi.unstubAllGlobals();
});

describe('the wording', () => {
  test('is the web’s for a reload, and the brief’s for a restart and a .deb', () => {
    expect(UPDATE_READY).toBe('A new version of Drafter is ready');
    expect(UPDATE_AVAILABLE).toBe('A new version of Drafter is available');
    expect(offerText('reload')).toBe(UPDATE_READY);
    expect(offerText('restart')).toBe(UPDATE_READY);
    expect(offerText('get')).toBe(UPDATE_AVAILABLE);
    expect(actionLabel('reload')).toBe('Reload');
    expect(actionLabel('restart')).toBe('Restart');
    expect(actionLabel('get')).toBe('Get it');
    expect(anywayLabel('ok', 'reload')).toBe('Reload anyway');
    expect(anywayLabel('unavailable', 'reload')).toBe('Reload and lose them');
    expect(anywayLabel('ok', 'restart')).toBe('Restart anyway');
    expect(anywayLabel('unavailable', 'restart')).toBe('Restart and lose them');
  });

  test('says Drafter’s recovery copy on the desktop, the browser’s on the web', () => {
    expect(unsavedMessage('ok')).toMatch(/this browser’s recovery copy/);
    expect(unsavedMessage('ok', 'restart')).toBe(
      'Your unsaved changes stay in Drafter’s recovery copy, but they aren’t in your file yet.',
    );
    expect(unsavedMessage('unavailable', 'restart')).toMatch(/^Drafter can’t keep a recovery copy/);
    expect(unsavedMessage('unavailable', 'restart')).not.toMatch(/browser/);
  });
});

describe('the desktop update source', () => {
  test('does nothing in a browser (no bridge) and leaves the web’s flow alone', async () => {
    delete window.drafterDesktop;
    const settings = createSettings();
    const stop = installDesktopUpdates(settings);
    await settings.ready;
    expect(needRefresh.value).toBe(false);
    expect(updateKind.value).toBe('reload');
    stop();
  });

  test('raises the offer with its kind and version when the desktop app has one', async () => {
    const b = bridge();
    const stop = installDesktopUpdates(createSettings());
    b.offer('0.9.0', 'restart');
    expect(needRefresh.value).toBe(true);
    expect(updateKind.value).toBe('restart');
    expect(availableVersion.value).toBe('0.9.0');
    b.offer('0.9.0', 'get');
    expect(updateKind.value).toBe('get');
    stop();
    expect(b.stops()).toBe(1);
  });

  test('tells the desktop app the setting once it is read, and when it changes', async () => {
    const b = bridge();
    const settings = createSettings();
    const stop = installDesktopUpdates(settings);
    expect(b.calls).toEqual(['listen']);
    await settings.ready;
    await nextTick();
    expect(b.calls).toEqual(['listen', 'enabled:true']);
    await settings.set('checkForUpdates', false);
    await nextTick();
    expect(b.calls).toEqual(['listen', 'enabled:true', 'enabled:false']);
    stop();
  });

  test('says false when a stored setting says so', async () => {
    await db.settings.put({ key: 'checkForUpdates', value: false });
    const b = bridge();
    const settings = createSettings();
    const stop = installDesktopUpdates(settings);
    await settings.ready;
    await nextTick();
    expect(b.calls).toContain('enabled:false');
    expect(b.calls).not.toContain('enabled:true');
    stop();
  });

  test('a restart writes the recovery copy, then installs; Get it only opens the page', async () => {
    const b = bridge();
    const stop = installDesktopUpdates(createSettings());
    b.offer('0.9.0', 'restart');
    await applyUpdate({ anyway: true });
    expect(flush).toHaveBeenCalledTimes(1);
    expect(b.calls.filter((c) => c === 'install')).toHaveLength(1);
    b.offer('0.9.0', 'get');
    await applyUpdate();
    expect(b.calls).toContain('open');
    expect(b.calls.filter((c) => c === 'install')).toHaveLength(1);
    stop();
  });
});

describe('an install that fails', () => {
  test('is said, not thrown, and the offer stays for Later', async () => {
    const b = bridge({ installFails: true });
    const stop = installDesktopUpdates(createSettings());
    b.offer('0.9.0', 'restart');
    await expect(applyUpdate({ anyway: true })).resolves.toBeUndefined();
    expect(installError.value).toBe(true);
    expect(needRefresh.value).toBe(true);
    expect(INSTALL_FAILED).toBe(
      'Drafter couldn’t install the update, and is still the version you have. Nothing was lost.',
    );
    stop();
  });

  test('a restart that works leaves no error', async () => {
    const b = bridge();
    const stop = installDesktopUpdates(createSettings());
    b.offer('0.9.0', 'restart');
    await applyUpdate();
    expect(installError.value).toBe(false);
    stop();
  });
});

describe('the setting', () => {
  test('defaults to on and is kept', async () => {
    const first = createSettings();
    await first.ready;
    expect(first.settings.value.checkForUpdates).toBe(true);
    await first.set('checkForUpdates', false);
    const second = createSettings();
    await second.ready;
    expect(second.settings.value.checkForUpdates).toBe(false);
  });
});
