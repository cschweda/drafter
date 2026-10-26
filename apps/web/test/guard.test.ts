import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/** A small stand-in for Web Locks: exclusive locks by name, `ifAvailable`, and a gate that delays grants. */
function fakeLocks() {
  const held = new Set<string>();
  const gates = new Map<string, Promise<void>>();
  return {
    held,
    gates,
    async request(
      name: string,
      options: { ifAvailable?: boolean },
      callback: (lock: object | null) => Promise<unknown> | undefined,
    ) {
      await gates.get(name);
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error('the tests never wait for a lock');
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
