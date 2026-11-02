import { beforeEach, describe, expect, test, vi } from 'vitest';

// The open script's project, and whether this tab can write it.
const held = vi.hoisted(() => ({
  project: null as null | Record<string, unknown>,
  readOnly: false,
  kept: [] as Array<Record<string, unknown>>,
}));
vi.mock('../app/storage/script', () => ({
  useScript: () => ({
    project: {
      get value() {
        return held.project;
      },
    },
    async keepOnProject(change: (project: Record<string, unknown>) => Record<string, unknown>) {
      if (!held.project || held.readOnly) return;
      const fields = change(held.project);
      held.kept.push(fields);
      held.project = { ...held.project, ...fields };
    },
  }),
}));
vi.mock('../app/storage/guard', () => ({
  useGuard: () => ({
    readOnly: {
      get value() {
        return held.readOnly;
      },
    },
  }),
}));

const {
  DEFAULT_EXPLAIN,
  DEFAULT_GREETING,
  setStoryMapOptions,
  STORY_MAP_DEFAULTS,
  storyMapOptionsOf,
} = await import('../app/story-map/options');

describe('story map options', () => {
  beforeEach(() => {
    held.project = { id: 'p1' };
    held.readOnly = false;
    held.kept = [];
  });

  test('defaults when nothing is kept', () => {
    const expected = {
      status: null,
      greeting: "What I'm writing",
      explain:
        'A picture of my script: its shape, its people, and every scene in order. Just scroll.',
      include: { summaries: true, lines: true, threads: true, contact: false },
      contact: null,
    };
    expect(storyMapOptionsOf(null)).toEqual(expected);
    expect(storyMapOptionsOf(undefined)).toEqual(expected);
    expect(storyMapOptionsOf({})).toEqual(expected);
    expect(STORY_MAP_DEFAULTS).toEqual(expected);
    expect(DEFAULT_GREETING).toBe(expected.greeting);
    expect(DEFAULT_EXPLAIN).toBe(expected.explain);
  });

  test('kept choices read back', () => {
    const kept = {
      status: 'finished' as const,
      greeting: 'My play',
      explain: null,
      include: { summaries: false, lines: true, threads: false, contact: true },
      contact: 'me@example.com',
    };
    expect(storyMapOptionsOf({ storyMap: kept })).toEqual(kept);
  });

  test('an emptied contact is kept empty', () => {
    expect(storyMapOptionsOf({ storyMap: { contact: '' } }).contact).toBe('');
  });

  test('unknown values read as defaults', () => {
    const odd = {
      status: 'done',
      greeting: 7,
      explain: { x: 1 },
      include: { summaries: 'yes', lines: false, threads: null, contact: 1, extra: true },
      contact: ['a'],
    } as unknown as Record<string, unknown>;
    expect(storyMapOptionsOf({ storyMap: odd })).toEqual({
      ...STORY_MAP_DEFAULTS,
      include: { summaries: true, lines: false, threads: true, contact: false },
    });
    // Not an object at all.
    expect(storyMapOptionsOf({ storyMap: 'x' as never })).toEqual(STORY_MAP_DEFAULTS);
    // Too long to be a line: the default.
    expect(storyMapOptionsOf({ storyMap: { greeting: 'g'.repeat(500) } }).greeting).toBe(
      DEFAULT_GREETING,
    );
  });

  test('keeps choices on the project, merged with what is kept', async () => {
    await setStoryMapOptions({ status: 'finished' });
    await setStoryMapOptions({ greeting: 'Hi' });
    expect(storyMapOptionsOf(held.project as never)).toMatchObject({
      status: 'finished',
      greeting: 'Hi',
    });
  });

  test('read-only tabs keep nothing', async () => {
    held.readOnly = true;
    await setStoryMapOptions({ status: 'finished' });
    expect(held.kept).toEqual([]);
    held.readOnly = false;
    held.project = null;
    await setStoryMapOptions({ status: 'finished' });
    expect(held.kept).toEqual([]);
  });
});
