// instance.ts: the single-instance lock around an update's restart, without Electron.
import { describe, expect, test, vi } from 'vitest';
import { onSecondInstance, RESTART_LOCK_WAIT_MS, takeInstanceLock } from '../src/instance';

/** A clock that `wait` moves forward, so the retries run at once. */
function clock() {
  let now = 0;
  return {
    now: () => now,
    wait: async (ms: number) => {
      now += ms;
    },
  };
}

describe('takeInstanceLock', () => {
  test('starts when it has the lock, and quits when another Drafter has it', () => {
    const got = vi.fn();
    const lost = vi.fn();
    takeInstanceLock({ request: () => true, env: {}, ...clock() }, { got, lost });
    expect(got).toHaveBeenCalledOnce();
    expect(lost).not.toHaveBeenCalled();

    const request = vi.fn(() => false);
    takeInstanceLock({ request, env: {}, ...clock() }, { got, lost });
    expect(lost).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });

  test('after an update’s restart, waits for the old Drafter to let go of the lock', async () => {
    // electron-updater starts the new AppImage with APPIMAGE_SILENT_INSTALL=true, then quits the old
    // one: the new one may ask for the lock while the old one still holds it.
    let held = 3;
    const request = vi.fn(() => held-- <= 0);
    const env: Record<string, string | undefined> = { APPIMAGE_SILENT_INSTALL: 'true' };
    const done = new Promise<string>((resolve) => {
      takeInstanceLock(
        { request, env, ...clock() },
        { got: () => resolve('got'), lost: () => resolve('lost') },
      );
    });
    expect(await done).toBe('got');
    expect(request).toHaveBeenCalledTimes(4);
    // Only this start is an update's: the variable isn't passed on to what Drafter starts later.
    expect(env.APPIMAGE_SILENT_INSTALL).toBeUndefined();
  });

  test('gives up after a few seconds if the old Drafter never lets go', async () => {
    const c = clock();
    const request = vi.fn(() => false);
    const result = await new Promise<string>((resolve) => {
      takeInstanceLock(
        { request, env: { APPIMAGE_SILENT_INSTALL: 'true' }, ...c },
        { got: () => resolve('got'), lost: () => resolve('lost') },
      );
    });
    expect(result).toBe('lost');
    expect(c.now()).toBeGreaterThanOrEqual(RESTART_LOCK_WAIT_MS);
    expect(c.now()).toBeLessThan(RESTART_LOCK_WAIT_MS + 1000);
  });

  test('waits only for exactly APPIMAGE_SILENT_INSTALL=true', () => {
    for (const value of ['', '1', 'TRUE', 'yes']) {
      const lost = vi.fn();
      takeInstanceLock(
        { request: () => false, env: { APPIMAGE_SILENT_INSTALL: value }, ...clock() },
        { got: vi.fn(), lost },
      );
      expect(lost, value).toHaveBeenCalledOnce();
    }
  });
});

describe('onSecondInstance', () => {
  test('brings the window forward and opens the files a second launch names', () => {
    const bringForward = vi.fn();
    const open = vi.fn();
    const handler = onSecondInstance({ quitting: () => false, bringForward, open });
    handler({}, ['/opt/Drafter/drafterdev', 'a.fountain'], '/home/a');
    expect(bringForward).toHaveBeenCalledOnce();
    expect(open).toHaveBeenCalledWith(['a.fountain'], '/home/a');
  });

  test('does nothing once the app is quitting (an update’s restart: the new Drafter asks for the lock)', () => {
    // Bringing the window forward would open it again mid-quit and stop the quit.
    const bringForward = vi.fn();
    const open = vi.fn();
    const handler = onSecondInstance({ quitting: () => true, bringForward, open });
    handler({}, ['/tmp/.mount_x/drafterdev'], '/home/a');
    expect(bringForward).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
  });
});
