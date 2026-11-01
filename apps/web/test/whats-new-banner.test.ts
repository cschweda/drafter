import { beforeEach, describe, expect, test } from 'vitest';
import {
  type BannerState,
  bannerEntry,
  dismissedWith,
  forgetVisit,
  readSeen,
  rememberSeen,
  WHATS_NEW_SEEN,
} from '../app/whats-new/banner';
import type { WhatsNewEntry } from '../app/whats-new/entries';

// The banner's rules (docs/DECISIONS.md, What's new): the newest banner entry, once, never on a
// first visit, in focus mode, while the tour is up, or while the update prompt shows.

const entry = (id: string, banner = false): WhatsNewEntry => ({
  id,
  date: '2026-11-01',
  version: '0.23.2',
  kind: 'New',
  title: id,
  text: 'Text.',
  ...(banner && { banner }),
});

const ENTRIES = [
  entry('v3-plain'),
  entry('v3-big', true),
  entry('v2-plain'),
  entry('v1-big', true),
  entry('v0-plain'),
];

const state = (over: Partial<BannerState> = {}): BannerState => ({
  seen: new Set(),
  firstVisit: false,
  focus: false,
  updateShowing: false,
  tourShowing: false,
  ...over,
});

/** A localStorage stand-in. */
function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  };
}

const throwing = {
  getItem(): string | null {
    throw new Error('blocked');
  },
  setItem(): void {
    throw new Error('blocked');
  },
};

beforeEach(() => forgetVisit());

describe('which entry the banner shows', () => {
  test('the newest one marked for the banner, skipping plain ones', () => {
    expect(bannerEntry(ENTRIES, state())?.id).toBe('v3-big');
  });

  test('none once that one is seen, and never an older one', () => {
    expect(bannerEntry(ENTRIES, state({ seen: new Set(['v3-big']) }))).toBeNull();
  });

  test('none on a first visit, in focus mode, during the tour, or while an update is offered', () => {
    expect(bannerEntry(ENTRIES, state({ firstVisit: true }))).toBeNull();
    expect(bannerEntry(ENTRIES, state({ focus: true }))).toBeNull();
    expect(bannerEntry(ENTRIES, state({ tourShowing: true }))).toBeNull();
    expect(bannerEntry(ENTRIES, state({ updateShowing: true }))).toBeNull();
  });

  test('none when nothing is marked', () => {
    expect(bannerEntry([entry('a'), entry('b')], state())).toBeNull();
  });

  test('the newer one when a newer banner entry arrives after one was dismissed', () => {
    const newer = [entry('v4-big', true), ...ENTRIES];
    expect(bannerEntry(newer, state({ seen: new Set(['v3-big', 'v1-big']) }))?.id).toBe('v4-big');
  });
});

describe('dismissing', () => {
  test('marks the entry and every older banner entry', () => {
    expect(dismissedWith(ENTRIES, 'v3-big')).toEqual(['v3-big', 'v1-big']);
    expect(dismissedWith(ENTRIES, 'v1-big')).toEqual(['v1-big']);
    expect(dismissedWith(ENTRIES, 'unknown')).toEqual(['unknown']);
  });

  test('is remembered in localStorage, beside what was there', () => {
    const storage = memoryStorage({ [WHATS_NEW_SEEN]: JSON.stringify(['old']) });
    rememberSeen(['v3-big', 'v1-big'], storage);
    expect(JSON.parse(storage.items.get(WHATS_NEW_SEEN) ?? '[]')).toEqual([
      'v3-big',
      'v1-big',
      'old',
    ]);
    forgetVisit();
    expect(readSeen(storage)).toEqual(new Set(['old', 'v3-big', 'v1-big']));
  });

  test('stays dismissed for the visit when storage throws', () => {
    expect(() => rememberSeen(['v3-big'], throwing)).not.toThrow();
    expect(readSeen(throwing)).toEqual(new Set(['v3-big']));
    expect(bannerEntry(ENTRIES, state({ seen: readSeen(throwing) }))).toBeNull();
  });

  test('reads junk, or nothing, as nothing seen', () => {
    expect(readSeen(memoryStorage({ [WHATS_NEW_SEEN]: '{not json' }))).toEqual(new Set());
    expect(readSeen(memoryStorage({ [WHATS_NEW_SEEN]: '{"a":1}' }))).toEqual(new Set());
    expect(readSeen(memoryStorage({ [WHATS_NEW_SEEN]: '[1, "a"]' }))).toEqual(new Set(['a']));
    expect(readSeen(undefined)).toEqual(new Set());
  });
});

describe('a first visit', () => {
  test('marks every banner entry seen, so the next visit shows nothing old', () => {
    const storage = memoryStorage();
    rememberSeen(
      ENTRIES.filter((e) => e.banner).map((e) => e.id),
      storage,
    );
    forgetVisit();
    expect(bannerEntry(ENTRIES, state({ seen: readSeen(storage) }))).toBeNull();
  });
});
