import 'fake-indexeddb/auto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { db } from '../app/storage/db';
import { checkRecovery } from '../app/storage/health';

function stubStorage(storage: Partial<StorageManager> | undefined) {
  vi.stubGlobal('navigator', { storage });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  db.close();
});

describe('checkRecovery', () => {
  test('is persistent when the browser says storage is persisted', async () => {
    stubStorage({ persisted: async () => true });
    expect(await checkRecovery()).toBe('persistent');
  });

  test('is not persistent when it says false', async () => {
    stubStorage({ persisted: async () => false });
    expect(await checkRecovery()).toBe('not-persistent');
  });

  test('is not persistent when the browser has no way to ask', async () => {
    stubStorage(undefined);
    expect(await checkRecovery()).toBe('not-persistent');
    stubStorage({});
    expect(await checkRecovery()).toBe('not-persistent');
  });

  test('is not persistent when asking fails', async () => {
    stubStorage({
      persisted: async () => {
        throw new Error('no');
      },
    });
    expect(await checkRecovery()).toBe('not-persistent');
  });

  test('is unavailable when IndexedDB will not open, and clears once it does', async () => {
    stubStorage({ persisted: async () => true });
    const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    db.close();
    expect(await checkRecovery()).toBe('unavailable');
    open.mockRestore();
    expect(await checkRecovery()).toBe('persistent');
  });
});
