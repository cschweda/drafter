import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createSettings, DEFAULT_SETTINGS, TEXT_SIZES } from '../app/settings/settings';
import { db } from '../app/storage/db';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('settings', () => {
  test('starts from the defaults', async () => {
    const store = createSettings();
    expect(store.settings.value).toEqual(DEFAULT_SETTINGS);
    await store.ready;
    expect(store.settings.value).toEqual({
      matchSystem: false,
      textSize: 1,
      spellcheck: true,
      strict: false,
      lineNumbers: false,
    });
  });

  test('keeps a change in the settings table', async () => {
    const first = createSettings();
    await first.ready;
    await first.set('textSize', 1.3);
    await first.set('lineNumbers', true);
    await first.set('spellcheck', false);
    expect(first.settings.value).toMatchObject({
      textSize: 1.3,
      lineNumbers: true,
      spellcheck: false,
    });
    expect(await db.settings.get('textSize')).toEqual({ key: 'textSize', value: 1.3 });
    expect(await db.settings.get('lineNumbers')).toEqual({ key: 'lineNumbers', value: true });

    // A new visit reads them back.
    const second = createSettings();
    await second.ready;
    expect(second.settings.value).toEqual({
      ...DEFAULT_SETTINGS,
      textSize: 1.3,
      lineNumbers: true,
      spellcheck: false,
    });
  });

  test('ignores an unknown or malformed value', async () => {
    await db.settings.bulkPut([
      { key: 'textSize', value: 2 },
      { key: 'spellcheck', value: 'yes' },
      { key: 'matchSystem', value: 1 },
      { key: 'lineNumbers', value: null },
      { key: 'toString', value: true },
      { key: 'bogus', value: true },
      { key: 'strict', value: true },
    ]);
    const store = createSettings();
    await store.ready;
    expect(store.settings.value).toEqual({ ...DEFAULT_SETTINGS, strict: true });

    // set() ignores them too: nothing changes and nothing is written.
    const set = store.set as (key: string, value: unknown) => Promise<void>;
    await set('textSize', 1.2);
    await set('textSize', '1.3');
    await set('spellcheck', 'no');
    await set('bogus', true);
    await set('constructor', true);
    expect(store.settings.value).toEqual({ ...DEFAULT_SETTINGS, strict: true });
    expect(await db.settings.get('bogus')).toEqual({ key: 'bogus', value: true }); // the old row, untouched
    expect((await db.settings.get('textSize'))?.value).toBe(2);
    expect(await db.settings.get('constructor')).toBeUndefined();
  });

  test('accepts each of the five text sizes', async () => {
    expect([...TEXT_SIZES]).toEqual([0.9, 1, 1.15, 1.3, 1.5]);
    const store = createSettings();
    await store.ready;
    for (const size of TEXT_SIZES) {
      await store.set('textSize', size);
      expect(store.settings.value.textSize).toBe(size);
    }
  });

  test('a change made while the table is still being read is not overwritten by it', async () => {
    await db.settings.put({ key: 'lineNumbers', value: false });
    await db.settings.put({ key: 'strict', value: true });
    const store = createSettings();
    // Before the read finishes.
    const changed = store.set('lineNumbers', true);
    await store.ready;
    await changed;
    expect(store.settings.value).toMatchObject({ lineNumbers: true, strict: true });
    expect((await db.settings.get('lineNumbers'))?.value).toBe(true);
  });

  test('works from memory when the database is unavailable', async () => {
    const toArray = vi.spyOn(db.settings, 'toArray').mockRejectedValue(new Error('no database'));
    const put = vi.spyOn(db.settings, 'put').mockRejectedValue(new Error('no database'));
    try {
      const store = createSettings();
      await store.ready;
      expect(store.settings.value).toEqual(DEFAULT_SETTINGS);
      await expect(store.set('strict', true)).resolves.toBeUndefined();
      expect(store.settings.value.strict).toBe(true);
    } finally {
      toArray.mockRestore();
      put.mockRestore();
    }
  });
});
