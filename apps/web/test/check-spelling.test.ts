import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type CheckSpellingDeps, makeCheckSpelling, STILL_CHECKING } from '../app/spell/check';
import { SPELL_FAILED as FAILED } from '../app/spell/notice';
import type { SpellState } from '../app/spell/spell-client';

// Check spelling (Plan D, Call 13): it waits for the check under way, then shows Problems and says
// what it found, and never says "No misspelled words." about a check that hasn't come back.

function setup(state: SpellState = 'ready', count = 3) {
  let finish: () => void = () => {};
  const said: string[] = [];
  const deps = {
    on: vi.fn(() => true),
    settled: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
    state: vi.fn(() => state),
    count: vi.fn(() => count),
    show: vi.fn(async () => {}),
    say: vi.fn((message: string) => void said.push(message)),
  } satisfies CheckSpellingDeps;
  return { deps, said, finish: () => finish(), check: makeCheckSpelling(deps) };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Check spelling', () => {
  test('with spellcheck off, says so and shows nothing', async () => {
    const { deps, said, check } = setup();
    deps.on.mockReturnValue(false);
    await check();
    expect(said).toEqual(['Spellcheck is off. Turn it on in Settings.']);
    expect(deps.settled).not.toHaveBeenCalled();
    expect(deps.show).not.toHaveBeenCalled();
  });

  test('a check that settles at once shows Problems and says the count', async () => {
    const { deps, said, finish, check } = setup('ready', 3);
    const done = check();
    finish();
    await done;
    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(said).toEqual(['3 misspelled words.']);
  });

  test('says it is checking when the wait passes 300 ms', async () => {
    const { deps, said, finish, check } = setup('ready', 1);
    const done = check();
    await vi.advanceTimersByTimeAsync(299);
    expect(said).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(said).toEqual(['Checking spelling…']);
    expect(deps.show).not.toHaveBeenCalled();
    finish();
    await done;
    expect(said).toEqual(['Checking spelling…', '1 misspelled word.']);
  });

  test('a check that hasn’t come back in 10 s is still checking, not none found', async () => {
    const { deps, said, check } = setup('loading', 0);
    const done = check();
    await vi.advanceTimersByTimeAsync(10_000);
    await done;
    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(said.at(-1)).toBe(STILL_CHECKING);
    expect(said).not.toContain('No misspelled words.');
  });

  test('settled but not ready is still checking; failed says so', async () => {
    const loading = setup('loading', 0);
    const first = loading.check();
    loading.finish();
    await first;
    expect(loading.said.at(-1)).toBe(STILL_CHECKING);

    const failed = setup('failed', 0);
    const second = failed.check();
    failed.finish();
    await second;
    expect(failed.said.at(-1)).toBe(FAILED);
  });

  test('a second Check spelling while one waits is ignored', async () => {
    const { deps, said, finish, check } = setup('ready', 2);
    const first = check();
    await check();
    expect(deps.settled).toHaveBeenCalledTimes(1);
    finish();
    await first;
    expect(deps.show).toHaveBeenCalledTimes(1);
    expect(said).toEqual(['2 misspelled words.']);
    // Once it's done, another runs.
    const again = check();
    finish();
    await again;
    expect(deps.show).toHaveBeenCalledTimes(2);
  });
});
