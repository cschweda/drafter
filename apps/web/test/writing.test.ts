import 'fake-indexeddb/auto';
import { isolateHistory } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import { appChange } from '../app/editor/typewriter';
import type { DayStart } from '../app/stats/goal';
import { createWritingStats, WRITE_MS, type WritingStore, writersEdit } from '../app/stats/writing';
import { db } from '../app/storage/db';
import { createProject, removeProject } from '../app/storage/projects';

const SEC = 1000;
const MIN = 60 * SEC;
/** Local time, which is what a day is. */
const at = (h: number, min = 0, s = 0, d = 27) => new Date(2026, 9, d, h, min, s);

/** A fresh set of what the store reads, as a test stands for it. */
function setup(id: string | null = 'p1') {
  const project = ref<string | null>(id);
  const sample = ref(false);
  const readOnly = ref(false);
  const words = ref<number | null>(1000);
  const pages = ref<number | null>(10);
  const start = ref<DayStart | null>({ words: 1000, pages: 10 });
  const loaded = ref(0);
  const made: WritingStore[] = [];
  const make = () => {
    const store = createWritingStats({
      project: () => project.value,
      sample: () => sample.value,
      readOnly: () => readOnly.value,
      counts: () => ({ words: words.value, pages: pages.value }),
      dayStart: () => start.value,
      loaded: () => loaded.value,
    });
    made.push(store);
    return store;
  };
  return { project, sample, readOnly, words, pages, start, loaded, make, made };
}

const rows = async () =>
  Object.fromEntries((await db.settings.toArray()).map((r) => [r.key, r.value]));

/** Moves the clock, running the timers that fall due. */
async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  // Only the clock is faked: fake-indexeddb waits on setImmediate.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(at(9));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('writersEdit', () => {
  const base = EditorState.create({ doc: 'one two' });
  test("is the writer's typing, deleting, pasting, undoing, and dragging", () => {
    for (const userEvent of [
      'input.type',
      'input.paste',
      'delete.backward',
      'undo',
      'redo',
      'move.drop',
    ]) {
      expect(
        writersEdit(base.update({ changes: { from: 0, insert: 'x' }, userEvent })),
        userEvent,
      ).toBe(true);
    }
  });

  test("is not the app's own change, a file's text put in, a load, or a move of the cursor", () => {
    const change = { from: 0, insert: 'x' };
    // A template block, a fix, a module's changes.
    expect(
      writersEdit(
        base.update({
          changes: change,
          userEvent: 'input',
          annotations: [isolateHistory.of('full'), appChange.of(true)],
        }),
      ),
    ).toBe(false);
    // Reset sample, Start blank, a file reloaded, Revert to Saved.
    expect(writersEdit(base.update({ changes: change, userEvent: 'input.replace' }))).toBe(false);
    // No user event: loading, a change made by code.
    expect(writersEdit(base.update({ changes: change }))).toBe(false);
    expect(writersEdit(base.update({ selection: { anchor: 3 }, userEvent: 'select' }))).toBe(false);
  });
});

describe('writing time', () => {
  test('counts the writer’s time and growth today, and keeps it at most every few seconds', async () => {
    const t = setup();
    const store = t.make();
    await store.settled();
    expect(store.today.value).toEqual({ ms: 0, words: 0, pages: 0 });

    store.edit();
    // One edit is a burst of 30 seconds, shown at once.
    expect(store.today.value?.ms).toBe(30 * SEC);
    // Nothing is written yet.
    expect(await rows()).toEqual({});

    await wait(2 * SEC);
    t.words.value = 1012;
    store.edit();
    await wait(WRITE_MS - 2 * SEC - 1);
    await store.settled();
    expect(await rows()).toEqual({});
    await wait(1);
    await store.settled();
    expect(await rows()).toEqual({
      'stats-day:p1:2026-10-27': { ms: 30 * SEC, words: 12, pages: 0 },
    });

    // A minute of typing, then a pause: written once more after the last edit.
    for (let i = 0; i < 12; i++) {
      await wait(5 * SEC);
      store.edit();
    }
    t.pages.value = 10.3;
    await wait(WRITE_MS);
    await store.settled();
    expect(await rows()).toEqual({
      'stats-day:p1:2026-10-27': { ms: 65 * SEC, words: 12, pages: 0.3 },
    });
    // A write brings the time shown up to the second.
    expect(store.today.value).toEqual({ ms: 65 * SEC, words: 12, pages: 0.3 });
  });

  test('a later visit adds to the day kept', async () => {
    const t = setup();
    await db.settings.put({ key: 'stats-day:p1:2026-10-27', value: { ms: 10 * MIN, words: 50 } });
    const store = t.make();
    await store.settled();
    expect(store.today.value?.ms).toBe(10 * MIN);
    store.edit();
    await store.flush();
    expect((await rows())['stats-day:p1:2026-10-27']).toEqual({
      ms: 10 * MIN + 30 * SEC,
      words: 0,
      pages: 0,
    });
  });

  test('shows the time only as the minute changes, so a key costs the status bar nothing', async () => {
    const t = setup();
    const store = t.make();
    await store.settled();
    store.edit();
    const first = store.today.value;
    await wait(2 * SEC);
    store.edit();
    // Still the burst: the same object.
    expect(store.today.value).toBe(first);
    await wait(8 * SEC);
    await wait(25 * SEC);
    const before = store.today.value;
    store.edit();
    // 35 seconds: still under a minute, so nothing new to show.
    expect(store.today.value).toBe(before);
    await wait(30 * SEC);
    store.edit();
    expect(store.today.value?.ms).toBe(65 * SEC);
  });

  test('keeps nothing for a sample, in a read-only tab, or with no script', async () => {
    for (const which of ['sample', 'readOnly', 'none'] as const) {
      const t = setup(which === 'none' ? null : 'p1');
      if (which === 'sample') t.sample.value = true;
      if (which === 'readOnly') t.readOnly.value = true;
      const store = t.make();
      await store.settled();
      store.edit();
      await store.flush();
      expect(store.today.value, which).toBeNull();
      expect(await rows(), which).toEqual({});
      store.stop();
    }
  });

  test('a hidden tab ends the stretch at the last edit and writes it', async () => {
    const t = setup();
    const store = t.make();
    await store.settled();
    store.edit();
    await wait(50 * SEC);
    store.edit();
    store.end();
    await store.settled();
    expect((await rows())['stats-day:p1:2026-10-27']).toMatchObject({ ms: 50 * SEC });
    // Back a minute later: a new stretch, the time away not counted.
    await wait(MIN);
    store.edit();
    await store.flush();
    expect((await rows())['stats-day:p1:2026-10-27']).toMatchObject({ ms: 80 * SEC });
  });

  test("another script opening writes the last one's time, and its growth as it was", async () => {
    const t = setup();
    const store = t.make();
    await store.settled();
    store.edit();
    t.words.value = 1005;
    // Another script's text is loaded first (its counts arrive), then it becomes the open one.
    t.loaded.value++;
    t.words.value = 40;
    t.start.value = null;
    t.project.value = 'p2';
    await store.settled();
    expect(await rows()).toEqual({
      'stats-day:p1:2026-10-27': { ms: 30 * SEC, words: 5, pages: 0 },
    });
    expect(store.today.value).toEqual({ ms: 0, words: null, pages: null });
    t.start.value = { words: 40 };
    t.pages.value = null;
    store.edit();
    t.words.value = 42;
    await store.flush();
    expect((await rows())['stats-day:p2:2026-10-27']).toEqual({ ms: 30 * SEC, words: 2 });
  });

  test('splits time over midnight, and today starts again at nothing', async () => {
    vi.setSystemTime(at(23, 59, 0, 26));
    const t = setup();
    const store = t.make();
    await store.settled();
    store.edit();
    await wait(30 * SEC);
    store.edit();
    await wait(60 * SEC);
    store.edit();
    // 00:00:30: the day is new, and its start is the goal's to take.
    t.start.value = { words: t.words.value as number, pages: 10 };
    expect(store.today.value?.ms).toBe(30 * SEC);
    await store.flush();
    expect(await rows()).toEqual({
      'stats-day:p1:2026-10-26': { ms: 60 * SEC, words: 0, pages: 0 },
      'stats-day:p1:2026-10-27': { ms: 30 * SEC, words: 0, pages: 0 },
    });
  });

  test('a new day shows nothing for today, without an edit', async () => {
    vi.setSystemTime(at(23, 59, 0, 26));
    const t = setup();
    const store = t.make();
    await store.settled();
    store.edit();
    expect(store.today.value?.ms).toBe(30 * SEC);
    await wait(2 * MIN);
    expect(store.today.value?.ms).toBe(0);
  });

  test('lists the script’s days, this visit’s time included', async () => {
    const t = setup();
    await db.settings.put({ key: 'stats-day:p1:2025-01-05', value: { ms: 5 * MIN, words: 40 } });
    await db.settings.put({ key: 'stats-day:p2:2026-10-27', value: { ms: MIN, words: 1 } });
    // A damaged row is read as far as it can be.
    await db.settings.put({ key: 'stats-day:p1:2026-10-01', value: { ms: 'x', words: 3 } });
    const store = t.make();
    await store.settled();
    store.edit();
    const days = await store.days();
    expect(Object.fromEntries(days)).toEqual({
      '2025-01-05': { ms: 5 * MIN, words: 40 },
      '2026-10-01': { ms: 0, words: 3 },
      '2026-10-27': { ms: 30 * SEC, words: 0, pages: 0 },
    });
    // A sample has none.
    t.sample.value = true;
    expect((await store.days()).size).toBe(0);
  });

  test('removing a script removes its days', async () => {
    const p = await createProject({ source: 'Hello.' });
    const t = setup(p.id);
    const store = t.make();
    await store.settled();
    store.edit();
    await store.flush();
    expect(Object.keys(await rows())).toContain(`stats-day:${p.id}:2026-10-27`);
    store.stop();
    await removeProject(p.id);
    expect(Object.keys(await rows()).filter((key) => key.startsWith('stats-day:'))).toEqual([]);
  });
});
