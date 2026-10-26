import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/** A small stand-in for Web Locks: exclusive locks by name, `ifAvailable`, and a gate that delays grants. */
function fakeLocks() {
  const held = new Set<string>();
  const gates = new Map<string, Promise<void>>();
  const waiting = new Map<string, Array<() => void>>();
  return {
    held,
    gates,
    /** Requests without `ifAvailable` wait for the lock (off, they throw: the tests don't expect to). */
    waits: false,
    /** Another tab lets go of `name`. */
    free(name: string) {
      held.delete(name);
      for (const wake of waiting.get(name)?.splice(0) ?? []) wake();
    },
    async request(
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: object | null) => Promise<unknown> | undefined,
    ) {
      await gates.get(name);
      while (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        if (!this.waits) throw new Error('the tests never wait for a lock');
        await new Promise<void>((wake) => {
          waiting.set(name, [...(waiting.get(name) ?? []), wake]);
        });
      }
      held.add(name);
      try {
        return await callback({ name });
      } finally {
        held.delete(name);
      }
    },
  };
}

let locks: ReturnType<typeof fakeLocks>;

beforeEach(() => {
  vi.resetModules();
  locks = fakeLocks();
  vi.stubGlobal('navigator', { locks });
});
afterEach(() => vi.unstubAllGlobals());

const lockOf = (id: string) => `drafter:project:${id}`;

describe('claim', () => {
  test('takes a free script and reports it editable', async () => {
    const { guardControl, useGuard } = await import('../app/storage/guard');
    expect(await guardControl.claim('a')).toBe(true);
    expect(useGuard().readOnly.value).toBe(false);
    expect(locks.held.has(lockOf('a'))).toBe(true);
  });

  test('finds a script another tab holds and opens it read-only', async () => {
    const { guardControl, useGuard } = await import('../app/storage/guard');
    locks.held.add(lockOf('a'));
    expect(await guardControl.claim('a')).toBe(false);
    expect(useGuard().readOnly.value).toBe(true);
  });

  test('switching scripts never leaves the old one writable without its lock', async () => {
    const { guardControl, useGuard } = await import('../app/storage/guard');
    await guardControl.claim('a');
    let open: () => void = () => {};
    locks.gates.set(
      lockOf('b'),
      new Promise<void>((resolve) => {
        open = resolve;
      }),
    );
    const claiming = guardControl.claim('b');
    await Promise.resolve();
    // While the new lock is being got, the old one is still held.
    expect(locks.held.has(lockOf('a'))).toBe(true);
    open();
    expect(await claiming).toBe(true);
    // The new lock is held, and the old one is not let go until the new script is shown.
    expect(locks.held.has(lockOf('b'))).toBe(true);
    expect(locks.held.has(lockOf('a'))).toBe(true);
    guardControl.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(locks.held.has(lockOf('a'))).toBe(false);
    expect(locks.held.has(lockOf('b'))).toBe(true);
    expect(useGuard().readOnly.value).toBe(false);
  });

  test('lets go of the old script once the new one turns out to be held elsewhere', async () => {
    const { guardControl, useGuard } = await import('../app/storage/guard');
    await guardControl.claim('a');
    locks.held.add(lockOf('b'));
    expect(await guardControl.claim('b')).toBe(false);
    expect(locks.held.has(lockOf('a'))).toBe(true);
    guardControl.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(locks.held.has(lockOf('a'))).toBe(false);
    expect(useGuard().readOnly.value).toBe(true);
  });
});

describe('handing a script over', () => {
  test('lets go of the lock it was asked about, not the one a switch took meanwhile', async () => {
    const { guardControl, useGuard } = await import('../app/storage/guard');
    await guardControl.claim('a');
    guardControl.bind({
      // The flush takes a while, and a switch to b finishes its claim in the middle of it.
      async giveUp() {
        await guardControl.claim('b');
        return true;
      },
      async takeOver() {},
      taken() {},
    });
    const asker = new BroadcastChannel('drafter');
    asker.postMessage({ type: 'release', id: 'a' });
    await vi.waitFor(() => expect(locks.held.has(lockOf('a'))).toBe(false));
    // b is the lock this tab holds now, and it is still editable.
    expect(locks.held.has(lockOf('b'))).toBe(true);
    expect(useGuard().readOnly.value).toBe(false);
    asker.close();
  });
});

describe('taking a script over', () => {
  test('is for the script that was shown when it was asked, not one shown while it waited', async () => {
    const { guardControl, useGuard } = await import('../app/storage/guard');
    locks.waits = true;
    locks.held.add(lockOf('a'));
    expect(await guardControl.claim('a')).toBe(false);
    const takeOver = vi.fn(async () => {});
    guardControl.bind({ giveUp: async () => true, takeOver, taken() {} });

    const guard = useGuard();
    const taking = guard.editHere();
    await vi.waitFor(() => expect(guard.taking.value).toBe(true));
    // The writer shows another script while the other tab is still deciding.
    expect(await guardControl.claim('b')).toBe(true);
    guardControl.finish();
    locks.free(lockOf('a'));
    await taking;

    expect(takeOver).not.toHaveBeenCalled();
    // The lock it was granted for a is let go, and b's is kept.
    await vi.waitFor(() => expect(locks.held.has(lockOf('a'))).toBe(false));
    expect(locks.held.has(lockOf('b'))).toBe(true);
    expect(guard.readOnly.value).toBe(false);
    expect(guard.taking.value).toBe(false);
  });

  test('hands the script it was asked for to takeOver', async () => {
    const { guardControl, useGuard } = await import('../app/storage/guard');
    locks.waits = true;
    locks.held.add(lockOf('a'));
    await guardControl.claim('a');
    const takeOver = vi.fn(async () => {});
    const taken = vi.fn();
    guardControl.bind({ giveUp: async () => true, takeOver, taken });
    const taking = useGuard().editHere();
    await vi.waitFor(() => expect(useGuard().taking.value).toBe(true));
    locks.free(lockOf('a'));
    await taking;
    expect(takeOver).toHaveBeenCalledWith('a');
    expect(taken).toHaveBeenCalled();
    expect(useGuard().readOnly.value).toBe(false);
  });
});
