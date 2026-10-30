// The window's own icon: Drafter's mark from the bundled web build, so a window never shows
// Electron's default (Linux's taskbar and switcher, Windows' title bar, and any unpackaged run).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';

const root = mkdtempSync(join(tmpdir(), 'drafter-icon-'));
vi.mock('electron', () => ({
  app: { getAppPath: () => root, getVersion: () => '0.0.0' },
  BrowserWindow: class {},
  shell: {},
}));
const { windowIcon, windowOptions } = await import('../src/window');

const platform = Object.getOwnPropertyDescriptor(process, 'platform');
const on = (name: NodeJS.Platform) => Object.defineProperty(process, 'platform', { value: name });
afterEach(() => {
  if (platform) Object.defineProperty(process, 'platform', platform);
});

describe('the window icon', () => {
  test('is the bundled mark on Linux and Windows', () => {
    mkdirSync(join(root, 'web'), { recursive: true });
    writeFileSync(join(root, 'web', 'icon-512.png'), 'png');
    for (const name of ['linux', 'win32'] as const) {
      on(name);
      expect(windowIcon()).toBe(join(root, 'web', 'icon-512.png'));
      expect(windowOptions('preload.cjs').icon).toBe(join(root, 'web', 'icon-512.png'));
    }
  });

  test('is left to the app bundle on a Mac', () => {
    on('darwin');
    expect(windowIcon()).toBeUndefined();
    expect('icon' in windowOptions('preload.cjs')).toBe(false);
  });

  test('is left out when the web build has no icon, rather than pointing at nothing', () => {
    on('linux');
    const empty = mkdtempSync(join(tmpdir(), 'drafter-noicon-'));
    expect(windowIcon(empty)).toBeUndefined();
  });
});
