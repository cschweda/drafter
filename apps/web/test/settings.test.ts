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
      typewriter: false,
      sprintSound: false,
      checkForUpdates: true,
      scrollSync: true,
      elementBar: true,
      cardSize: 'medium',
      spellLanguage: 'en-US',
      spellNotes: false,
      personalDictionary: [],
    });
  });

  test('keeps the language, the notes setting, and My dictionary', async () => {
    const first = createSettings();
    await first.ready;
    await first.set('spellLanguage', 'en-GB');
    await first.set('spellNotes', true);
    await first.set('personalDictionary', ['Zephyrine', 'Ormsby']);
    expect(await db.settings.get('personalDictionary')).toEqual({
      key: 'personalDictionary',
      value: ['Zephyrine', 'Ormsby'],
    });
    const second = createSettings();
    await second.ready;
    expect(second.settings.value).toMatchObject({
      spellLanguage: 'en-GB',
      spellNotes: true,
      personalDictionary: ['Zephyrine', 'Ormsby'],
    });
    // A language Drafter doesn't have changes nothing.
    await second.set('spellLanguage', 'fr-FR' as never);
    expect(second.settings.value.spellLanguage).toBe('en-GB');
  });

  test('ignores a damaged personal dictionary', async () => {
    for (const value of [
      'Zephyrine',
      ['Zephyrine', 4],
      ['Zephyrine', ''],
      ['two words'],
      [' Zephyrine'],
      { 0: 'Zephyrine' },
      null,
    ]) {
      await db.settings.clear();
      await db.settings.bulkPut([
        { key: 'personalDictionary', value },
        { key: 'spellLanguage', value: 'en-AU' },
        { key: 'spellNotes', value: 'yes' },
      ]);
      const store = createSettings();
      await store.ready;
      expect(store.settings.value, JSON.stringify(value)).toEqual(DEFAULT_SETTINGS);
      await store.set('personalDictionary', value as never);
      expect(store.settings.value.personalDictionary).toEqual([]);
    }
  });

  test('cardSize defaults to medium', async () => {
    const store = createSettings();
    await store.ready;
    expect(store.settings.value.cardSize).toBe('medium');
    await store.set('cardSize', 'large');
    expect(store.settings.value.cardSize).toBe('large');
    expect(await db.settings.get('cardSize')).toEqual({ key: 'cardSize', value: 'large' });
    // A size it doesn't have changes nothing.
    await store.set('cardSize', 'huge' as never);
    expect(store.settings.value.cardSize).toBe('large');
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

  test('keeps the defaults when what was read is not a list of rows', async () => {
    // A merge that throws must not reject `ready`: the page waits on it to apply anything.
    const toArray = vi.spyOn(db.settings, 'toArray').mockResolvedValue(42 as never);
    try {
      const store = createSettings();
      await expect(store.ready).resolves.toBeUndefined();
      expect(store.settings.value).toEqual(DEFAULT_SETTINGS);
      expect(store.read.value).toBe(false);
    } finally {
      toArray.mockRestore();
    }
  });

  test('says whether the table was read', async () => {
    const store = createSettings();
    expect(store.read.value).toBe(false);
    await store.ready;
    expect(store.read.value).toBe(true);

    const toArray = vi.spyOn(db.settings, 'toArray').mockRejectedValue(new Error('no database'));
    try {
      const failed = createSettings();
      await failed.ready;
      expect(failed.read.value).toBe(false);
    } finally {
      toArray.mockRestore();
    }
  });

  test('skips a damaged row and keeps the others', async () => {
    const toArray = vi
      .spyOn(db.settings, 'toArray')
      .mockResolvedValue([null, { key: 'strict', value: true }, 7] as never);
    try {
      const store = createSettings();
      await store.ready;
      expect(store.settings.value).toEqual({ ...DEFAULT_SETTINGS, strict: true });
      expect(store.read.value).toBe(true);
    } finally {
      toArray.mockRestore();
    }
  });
});
