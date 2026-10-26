import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ref } from 'vue';
import type { DocumentKind } from '../app/markdown/kind';
import {
  createGoal,
  dateKey,
  type Goal,
  type GoalStore,
  KEEP_DAYS,
  progressLabel,
} from '../app/stats/goal';
import { db } from '../app/storage/db';
import { createProject, removeProject } from '../app/storage/projects';

/** Local time, which is what "today" is. */
const at = (y: number, m: number, d: number, h = 12, min = 0, s = 0) =>
  new Date(y, m - 1, d, h, min, s);

/** A fresh set of the things the goal reads, as a test stands for them. */
function setup(id: string | null = 'p1') {
  const project = ref<string | null>(id);
  const sample = ref(false);
  const kind = ref<DocumentKind>('fountain');
  const words = ref<number | null>(1000);
  const pages = ref<number | null>(10);
  const made: GoalStore[] = [];
  const make = () => {
    const store = createGoal({
      project: () => project.value,
      sample: () => sample.value,
      kind: () => kind.value,
      counts: () => ({ pages: pages.value, words: words.value }),
    });
    made.push(store);
    return store;
  };
  return { project, sample, kind, words, pages, make, made };
}

const rows = async () =>
  Object.fromEntries((await db.settings.toArray()).map((r) => [r.key, r.value]));

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  // Only the clock is faked: fake-indexeddb waits on setImmediate.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(at(2026, 10, 26));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('a daily goal', () => {
  test('measures progress as growth since the day began', async () => {
    const t = setup();
    const store = t.make();
    await store.settled();
    // The day's start is what the script held when it was first seen today, kept per script and date.
    expect(await rows()).toEqual({ 'day:p1:2026-10-26': { pages: 10, words: 1000 } });
    expect(store.progress.value).toBeNull(); // no goal yet

    await store.setGoal({ unit: 'words', target: 1000 });
    expect(store.progress.value).toEqual({ done: 0, target: 1000, unit: 'words' });
    t.words.value = 1420;
    expect(store.progress.value).toEqual({ done: 420, target: 1000, unit: 'words' });
    expect(progressLabel(store.progress.value)).toBe('420 of 1,000 words today');

    // Pages are to one decimal.
    await store.setGoal({ unit: 'pages', target: 3 });
    t.pages.value = 11.5;
    expect(store.progress.value).toEqual({ done: 1.5, target: 3, unit: 'pages' });
    expect(progressLabel(store.progress.value)).toBe('1.5 of 3 pages today');
    t.pages.value = 10.3;
    expect(store.progress.value?.done).toBe(0.3); // not 0.30000000000000071

    // A later visit reads the goal and the day's start back, and measures from that start.
    const later = t.make();
    await later.settled();
    expect(later.goal.value).toEqual({ unit: 'pages', target: 3 });
    expect(later.progress.value).toEqual({ done: 0.3, target: 3, unit: 'pages' });
    expect(await rows()).toMatchObject({
      'goal:p1': { unit: 'pages', target: 3 },
      'day:p1:2026-10-26': { pages: 10, words: 1000 },
    });
  });

  test('measures progress for the script that is open, each with its own goal and start', async () => {
    const t = setup('a');
    const store = t.make();
    await store.setGoal({ unit: 'words', target: 500 });
    t.project.value = 'b';
    t.words.value = 40;
    expect(store.goal.value).toBeNull();
    expect(store.progress.value).toBeNull();
    await store.settled();
    expect(store.goal.value).toBeNull();
    await store.setGoal({ unit: 'words', target: 100 });
    t.words.value = 60;
    expect(store.progress.value).toEqual({ done: 20, target: 100, unit: 'words' });
    t.project.value = 'a';
    t.words.value = 1100;
    await store.settled();
    expect(store.goal.value).toEqual({ unit: 'words', target: 500 });
    expect(store.progress.value).toEqual({ done: 100, target: 500, unit: 'words' });
  });

  test('counts a cut against the goal', async () => {
    const t = setup();
    const store = t.make();
    await store.setGoal({ unit: 'words', target: 1000 });
    t.words.value = 1400;
    expect(store.progress.value?.done).toBe(400);
    t.words.value = 1250; // cut a scene
    expect(store.progress.value?.done).toBe(250);
    // Cut below where the day began: the real number is negative, and the status bar shows 0.
    t.words.value = 900;
    expect(store.progress.value?.done).toBe(-100);
    expect(progressLabel(store.progress.value)).toBe('0 of 1,000 words today');
    // Writing it back is growth again, from where the day began.
    t.words.value = 1100;
    expect(store.progress.value?.done).toBe(100);
  });

  test('starts a new day at local midnight', async () => {
    vi.setSystemTime(at(2026, 10, 26, 23, 59, 50));
    const t = setup();
    const store = t.make();
    await store.setGoal({ unit: 'words', target: 1000 });
    t.words.value = 1300;
    expect(store.progress.value?.done).toBe(300);

    // Ten seconds pass with no key pressed: the day rolls over by itself.
    await vi.advanceTimersByTimeAsync(11_000);
    await store.settled();
    expect(dateKey(new Date())).toBe('2026-10-27');
    expect(store.progress.value).toEqual({ done: 0, target: 1000, unit: 'words' });
    t.words.value = 1350;
    expect(store.progress.value?.done).toBe(50);
    expect(await rows()).toMatchObject({
      'day:p1:2026-10-26': { words: 1000 },
      'day:p1:2026-10-27': { words: 1300 },
    });

    // And again the next midnight, a day later.
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    await store.settled();
    expect(store.progress.value?.done).toBe(0);
    expect(Object.keys(await rows()).filter((k) => k.startsWith('day:p1:'))).toHaveLength(3);
  });

  test('notices a new day when the next key is pressed, if no timer ran', async () => {
    const t = setup();
    const store = t.make();
    await store.setGoal({ unit: 'words', target: 1000 });
    t.words.value = 1200;
    // A sleeping computer runs no timers: the clock just jumps.
    vi.setSystemTime(at(2026, 10, 28, 9));
    t.words.value = 1210;
    await store.settled();
    expect(store.progress.value?.done).toBe(0);
    t.words.value = 1230;
    expect(store.progress.value?.done).toBe(20);
  });

  test('waits for a count that isn’t known yet, and takes the start when it is', async () => {
    const t = setup();
    t.pages.value = null; // the layout hasn't come back
    const store = t.make();
    await store.setGoal({ unit: 'pages', target: 3 });
    await store.settled();
    expect(store.progress.value).toBeNull();
    expect(await rows()).toMatchObject({ 'day:p1:2026-10-26': { words: 1000 } });
    expect((await rows())['day:p1:2026-10-26']).not.toHaveProperty('pages');
    t.pages.value = 4;
    await store.settled();
    t.pages.value = 5.5;
    expect(store.progress.value).toEqual({ done: 1.5, target: 3, unit: 'pages' });
    // The words were not held up by the pages.
    expect((await rows())['day:p1:2026-10-26']).toEqual({ pages: 4, words: 1000 });
  });

  test('keeps a goal off a sample', async () => {
    const t = setup('s');
    t.sample.value = true;
    const store = t.make();
    await store.setGoal({ unit: 'words', target: 100 });
    await store.settled();
    expect(store.canSet.value).toBe(false);
    expect(store.goal.value).toBeNull();
    expect(await rows()).toEqual({}); // and no day's start is kept for it either
  });

  test('sets a goal in words only on a Markdown document', async () => {
    const t = setup();
    t.kind.value = 'markdown';
    t.pages.value = null;
    const store = t.make();
    await store.setGoal({ unit: 'pages', target: 3 });
    expect(store.goal.value).toBeNull();
    await store.setGoal({ unit: 'words', target: 300 });
    t.words.value = 1100;
    expect(store.progress.value).toEqual({ done: 100, target: 300, unit: 'words' });
    // A script made Markdown after it was given a goal in pages has no progress to show.
    await db.settings.put({ key: 'goal:p1', value: { unit: 'pages', target: 3 } });
    const fresh = t.make();
    await fresh.settled();
    expect(fresh.progress.value).toBeNull();
  });

  test('clears a goal, and keeps the day’s start for the next one', async () => {
    const t = setup();
    const store = t.make();
    await store.setGoal({ unit: 'words', target: 1000 });
    expect(await db.settings.get('goal:p1')).toBeDefined();
    await store.setGoal(null);
    expect(store.goal.value).toBeNull();
    expect(store.progress.value).toBeNull();
    expect(await db.settings.get('goal:p1')).toBeUndefined();
    t.words.value = 1500;
    await store.setGoal({ unit: 'words', target: 1000 });
    expect(store.progress.value?.done).toBe(500);
  });

  test('ignores a goal it can’t hold, stored or given', async () => {
    await db.settings.bulkPut([
      { key: 'goal:p1', value: { unit: 'lines', target: 5 } },
      { key: 'day:p1:2026-10-26', value: { words: 'lots', pages: 12 } },
    ]);
    const t = setup();
    const store = t.make();
    await store.settled();
    expect(store.goal.value).toBeNull();
    const bad: unknown[] = [
      { unit: 'words', target: 0 },
      { unit: 'words', target: -5 },
      { unit: 'words', target: 1.5 },
      { unit: 'words', target: Number.NaN },
      { unit: 'words', target: 2_000_000 },
      { unit: 'pages', target: 0.04 },
      { unit: 'pages', target: 2.25 },
      { unit: 'chapters', target: 3 },
      { unit: 'words' },
      'words',
    ];
    for (const goal of bad) await store.setGoal(goal as Goal);
    expect(store.goal.value).toBeNull();
    await store.setGoal({ unit: 'pages', target: 2.5 });
    expect(store.goal.value).toEqual({ unit: 'pages', target: 2.5 });
    // The damaged day row's good half is kept (10 pages now, 12 when the day began), the rest is taken.
    expect(store.progress.value).toEqual({ done: -2, target: 2.5, unit: 'pages' });
    expect((await rows())['day:p1:2026-10-26']).toEqual({ pages: 12, words: 1000 });
  });

  test('keeps the days of the last month and prunes the older ones', async () => {
    expect(KEEP_DAYS).toBe(30);
    await db.settings.bulkPut([
      { key: 'day:p1:2026-09-26', value: { words: 1 } }, // 30 days ago: kept
      { key: 'day:p1:2026-09-25', value: { words: 2 } }, // 31 days ago: gone
      { key: 'day:other:2025-01-01', value: { words: 3 } }, // another script's, long ago: gone
      { key: 'day:other:2026-10-01', value: { words: 4 } },
      { key: 'goal:other', value: { unit: 'words', target: 9 } },
      { key: 'textSize', value: 1.3 },
      { key: 'module:cast:day:2020-01-01', value: 'mine' },
    ]);
    const store = setup().make();
    await store.settled();
    expect(Object.keys(await rows()).sort()).toEqual([
      'day:other:2026-10-01',
      'day:p1:2026-09-26',
      'day:p1:2026-10-26',
      'goal:other',
      'module:cast:day:2020-01-01',
      'textSize',
    ]);
  });

  test('is removed with its script', async () => {
    const project = await createProject({ source: 'Hello.\n' });
    const t = setup(project.id);
    const store = t.make();
    await store.setGoal({ unit: 'words', target: 10 });
    await store.settled();
    await db.settings.put({ key: 'goal:keep', value: { unit: 'words', target: 1 } });
    await removeProject(project.id);
    expect(Object.keys(await rows())).toEqual(['goal:keep']);
  });

  test('goes on, in memory, when the table can’t be written', async () => {
    const t = setup();
    const store = t.make();
    await store.settled();
    const put = vi.spyOn(db.settings, 'put').mockRejectedValue(new Error('full'));
    await expect(store.setGoal({ unit: 'words', target: 50 })).resolves.toBeUndefined();
    t.words.value = 1030;
    expect(store.progress.value).toEqual({ done: 30, target: 50, unit: 'words' });
    put.mockRestore();
  });
});

describe('progressLabel', () => {
  test('reads like the status bar says it', () => {
    expect(progressLabel(null)).toBe('');
    expect(progressLabel({ done: 1.5, target: 3, unit: 'pages' })).toBe('1.5 of 3 pages today');
    expect(progressLabel({ done: 2, target: 3, unit: 'pages' })).toBe('2 of 3 pages today');
    expect(progressLabel({ done: 0.5, target: 1, unit: 'pages' })).toBe('0.5 of 1 page today');
    expect(progressLabel({ done: 420, target: 1000, unit: 'words' })).toBe(
      '420 of 1,000 words today',
    );
    expect(progressLabel({ done: 1, target: 1, unit: 'words' })).toBe('1 of 1 word today');
    expect(progressLabel({ done: -4, target: 3, unit: 'pages' })).toBe('0 of 3 pages today');
  });
});

describe('dateKey', () => {
  test('is the local date, not the UTC one', () => {
    expect(dateKey(at(2026, 1, 5, 0, 0, 1))).toBe('2026-01-05');
    expect(dateKey(at(2026, 12, 31, 23, 59, 59))).toBe('2026-12-31');
  });
});
