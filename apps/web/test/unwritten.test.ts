// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { clearStash, readStash, stash } from '../app/storage/unwritten';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the unwritten stash', () => {
  test('keeps a script’s text until it is cleared', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5_000);
    expect(readStash()).toBeNull();
    stash('abc', 'Title: A\n');
    expect(readStash()).toEqual({ id: 'abc', source: 'Title: A\n', at: 5_000 });
    clearStash();
    expect(readStash()).toBeNull();
  });

  test('a later stash replaces an earlier one', () => {
    stash('a', 'one');
    stash('b', 'two');
    expect(readStash()).toMatchObject({ id: 'b', source: 'two' });
  });

  test('ignores a value that is not a stash', () => {
    for (const bad of ['not json', '5', 'null', '{"id":1}', '{"id":"a","source":"x"}']) {
      localStorage.setItem('drafter:unwritten', bad);
      expect(readStash()).toBeNull();
    }
  });

  test('goes on when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => stash('a', 'x')).not.toThrow();
    expect(() => clearStash()).not.toThrow();
    expect(readStash()).toBeNull();
  });
});
