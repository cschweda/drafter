// window.ts's checks that need no window: which IPC senders are the app's own pages.
import type { IpcMainInvokeEvent } from 'electron';
import { describe, expect, test, vi } from 'vitest';

// window.ts imports Electron's main-process modules, which exist only inside Electron.
vi.mock('electron', () => ({ app: {}, BrowserWindow: class {}, shell: {} }));
const { fromApp } = await import('../src/window');

const from = (frame: { url: string } | null | undefined) =>
  ({ senderFrame: frame }) as unknown as IpcMainInvokeEvent;

describe('fromApp', () => {
  test('takes messages from the app’s own pages only', () => {
    expect(fromApp(from({ url: 'app://drafter/' }))).toBe(true);
    expect(fromApp(from({ url: 'app://drafter/docs/saving/' }))).toBe(true);
    for (const url of [
      'https://drafter.dev/',
      'https://example.com/',
      'app://evil/',
      'file:///etc/passwd',
      'about:blank',
      'data:text/html,x',
      '',
    ]) {
      expect(fromApp(from({ url })), url).toBe(false);
    }
  });

  test('refuses a message whose frame is gone', () => {
    expect(fromApp(from(null))).toBe(false);
    expect(fromApp(from(undefined))).toBe(false);
  });
});
