// close.ts's Electron half, with Electron's modules faked: when the app counts as quitting.
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const app = Object.assign(new EventEmitter(), { quit: vi.fn(), exit: vi.fn(), isPackaged: true });
const powerMonitor = new EventEmitter();
vi.mock('electron', () => ({
  app,
  powerMonitor,
  ipcMain: { on: vi.fn() },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 1 })) },
}));
const { setUpClosing } = await import('../src/close');

const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
let before: Map<string, ((...args: never[]) => unknown)[]>;
beforeEach(() => {
  before = new Map(signals.map((signal) => [signal, process.listeners(signal)]));
});
afterEach(() => {
  // setUpClosing listens for the session's end; this test process keeps its own handlers only.
  for (const signal of signals) {
    for (const listener of process.listeners(signal)) {
      if (!before.get(signal)?.includes(listener))
        process.removeListener(signal, listener as never);
    }
  }
  app.removeAllListeners();
  powerMonitor.removeAllListeners();
});

const quitEvent = () => ({ preventDefault: vi.fn() });

describe('Closing.quitting', () => {
  test('is false until a quit is under way', () => {
    const closing = setUpClosing(() => null);
    expect(closing.quitting()).toBe(false);
  });

  test('is true once an update’s approved quit has begun', () => {
    const closing = setUpClosing(() => null);
    closing.allowQuit();
    const event = quitEvent();
    app.emit('before-quit', event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(closing.quitting()).toBe(true);
  });

  test('is false while an approval waits for a quit that hasn’t begun, or was taken back', () => {
    const closing = setUpClosing(() => null);
    const revoke = closing.allowQuit();
    expect(closing.quitting()).toBe(false);
    revoke();
    expect(closing.quitting()).toBe(false);
  });

  test('is true when the last window has gone', () => {
    const closing = setUpClosing(() => null);
    closing.quitNow();
    expect(closing.quitting()).toBe(true);
  });
});
