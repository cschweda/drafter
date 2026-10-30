import { describe, expect, test, vi } from 'vitest';
import {
  type CheckDeps,
  checkMessage,
  createUpdateCheck,
  type DesktopCheckResult,
  type RegistrationLike,
} from '../app/update/check';

// Help → Check for updates: what it asks (the service worker's registration on the web, the
// desktop app's updater there) and what it says. Both are faked here.

/** A fake service worker registration: `update()` may find a new worker, which installs or not. */
function registration(
  options: { waiting?: boolean; finds?: 'installed' | 'redundant' | 'never'; fails?: boolean } = {},
) {
  let waiting: unknown = options.waiting ? {} : null;
  let installing: (EventTarget & { state: string }) | null = null;
  const reg: RegistrationLike & { updates: number } = {
    updates: 0,
    get waiting() {
      return waiting;
    },
    get installing() {
      return installing;
    },
    async update() {
      reg.updates++;
      if (options.fails) throw new TypeError('Failed to fetch');
      if (!options.finds) return;
      const worker = Object.assign(new EventTarget(), { state: 'installing' });
      installing = worker;
      if (options.finds === 'never') return;
      setTimeout(() => {
        worker.state = options.finds as string;
        installing = null;
        if (options.finds === 'installed') waiting = worker;
        worker.dispatchEvent(new Event('statechange'));
      }, 10);
    },
  };
  return reg;
}

const web = (reg: RegistrationLike | undefined, more: Partial<CheckDeps> = {}): CheckDeps => ({
  current: '0.13.1',
  serviceWorker: { getRegistration: async () => reg },
  offered: () => null,
  ...more,
});

const desktop = (result: DesktopCheckResult | Error): CheckDeps => ({
  current: '0.13.1',
  desktop: {
    check: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  },
  offered: () => null,
});

describe('checking on the web', () => {
  test('says Checking… while it asks, then that this is the latest version', async () => {
    const reg = registration();
    const check = createUpdateCheck(web(reg));
    expect(check.state.value.status).toBe('idle');
    const done = check.run();
    expect(check.state.value.status).toBe('checking');
    expect(checkMessage(check.state.value, '0.13.1', 'web')).toBe('Checking for updates…');
    expect(await done).toEqual({ status: 'latest' });
    expect(reg.updates).toBe(1);
    expect(checkMessage(check.state.value, '0.13.1', 'web')).toBe(
      'You’re on the latest version (v0.13.1).',
    );
  });

  test('offers Reload when a new version is already waiting', async () => {
    const check = createUpdateCheck(web(registration({ waiting: true })));
    expect(await check.run()).toEqual({ status: 'ready', how: 'reload' });
    expect(checkMessage(check.state.value, '0.13.1', 'web')).toBe(
      'A new version of Drafter is ready. Reload to use it.',
    );
  });

  test('waits for a new version it found to install, then offers Reload', async () => {
    const check = createUpdateCheck(web(registration({ finds: 'installed' })));
    expect(await check.run()).toEqual({ status: 'ready', how: 'reload' });
  });

  test('a new version that fails to install is no new version', async () => {
    const check = createUpdateCheck(web(registration({ finds: 'redundant' })));
    expect(await check.run()).toEqual({ status: 'latest' });
  });

  test('a new version that takes too long to install is an error, not a hang', async () => {
    const check = createUpdateCheck(web(registration({ finds: 'never' }), { installMs: 30 }));
    expect((await check.run()).status).toBe('error');
  });

  test('says so plainly when it can’t reach drafter.dev', async () => {
    const check = createUpdateCheck(web(registration({ fails: true })));
    expect(await check.run()).toEqual({ status: 'error' });
    expect(checkMessage(check.state.value, '0.13.1', 'web')).toBe(
      'Drafter couldn’t check for updates. You may be offline; try again later.',
    );
  });

  test('says there is no service worker (development, or a browser without one)', async () => {
    for (const deps of [
      web(undefined),
      { current: '0.13.1', serviceWorker: null, offered: () => null },
      {
        current: '0.13.1',
        serviceWorker: { getRegistration: () => Promise.reject(new Error('SecurityError')) },
        offered: () => null,
      },
    ] satisfies CheckDeps[]) {
      const check = createUpdateCheck(deps);
      expect(await check.run()).toEqual({ status: 'unavailable' });
      expect(checkMessage(check.state.value, '0.13.1', 'web')).toMatch(
        /^This copy of Drafter has no service worker/,
      );
    }
  });

  test('an offer already made is the answer, without asking again', async () => {
    const reg = registration();
    const check = createUpdateCheck(
      web(reg, { offered: () => ({ version: '', how: 'reload' as const }) }),
    );
    expect(await check.run()).toEqual({ status: 'ready', how: 'reload' });
    expect(reg.updates).toBe(0);
  });

  test('a second run while one is under way is the same check', async () => {
    const reg = registration({ finds: 'installed' });
    const check = createUpdateCheck(web(reg));
    const [a, b] = await Promise.all([check.run(), check.run()]);
    expect(a).toEqual(b);
    expect(reg.updates).toBe(1);
  });
});

describe('checking in the desktop app', () => {
  test('says the version is up to date', async () => {
    const check = createUpdateCheck(desktop({ status: 'latest' }));
    expect(await check.run()).toEqual({ status: 'latest' });
    expect(checkMessage(check.state.value, '0.13.1', 'desktop')).toBe(
      'Drafter v0.13.1 is up to date.',
    );
  });

  test('passes on the offer: Restart, or Get it', async () => {
    const restart = createUpdateCheck(
      desktop({ status: 'found', version: '0.14.0', how: 'restart' }),
    );
    expect(await restart.run()).toEqual({ status: 'ready', version: '0.14.0', how: 'restart' });
    expect(checkMessage(restart.state.value, '0.13.1', 'desktop')).toBe(
      'Drafter v0.14.0 is ready. Restart to use it.',
    );
    const get = createUpdateCheck(desktop({ status: 'found', version: '0.14.0', how: 'get' }));
    expect(await get.run()).toEqual({ status: 'ready', version: '0.14.0', how: 'get' });
    expect(checkMessage(get.state.value, '0.13.1', 'desktop')).toBe(
      'Drafter v0.14.0 is available. Get it from the release page.',
    );
  });

  test('says a found version is downloading', async () => {
    const check = createUpdateCheck(desktop({ status: 'downloading', version: '0.14.0' }));
    expect(await check.run()).toEqual({ status: 'downloading', version: '0.14.0' });
    expect(checkMessage(check.state.value, '0.13.1', 'desktop')).toBe(
      'Drafter v0.14.0 is downloading. Drafter will offer to restart when it’s ready.',
    );
  });

  test('says an unpackaged build can’t check, and an error plainly', async () => {
    const off = createUpdateCheck(desktop({ status: 'off' }));
    expect(await off.run()).toEqual({ status: 'unavailable' });
    expect(checkMessage(off.state.value, '0.13.1', 'desktop')).toBe(
      'This copy of Drafter can’t check for updates: it isn’t an installed build.',
    );
    for (const result of [{ status: 'error' } as const, new Error('gone')]) {
      const failed = createUpdateCheck(desktop(result));
      expect(await failed.run()).toEqual({ status: 'error' });
      expect(checkMessage(failed.state.value, '0.13.1', 'desktop')).toBe(
        'Drafter couldn’t check for updates. You may be offline; try again later.',
      );
    }
  });

  test('takes nothing it doesn’t understand from the bridge', async () => {
    const odd = createUpdateCheck(
      desktop({ status: 'found', version: 42, how: 'explode' } as unknown as DesktopCheckResult),
    );
    expect(await odd.run()).toEqual({ status: 'error' });
  });

  test('uses the desktop app’s updater, never the service worker, when both are there', async () => {
    const getRegistration = vi.fn(async () => registration());
    const check = createUpdateCheck({
      ...desktop({ status: 'latest' }),
      serviceWorker: { getRegistration },
    });
    await check.run();
    expect(getRegistration).not.toHaveBeenCalled();
  });
});
