// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { allStashes, clearStash, readStash, stash } from '../app/storage/unwritten';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the unwritten stash', () => {
  test('keeps a script’s text until it is cleared', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5_000);
    expect(readStash('abc')).toBeNull();
    stash('abc', 'Title: A\n');
    expect(readStash('abc')).toEqual({ id: 'abc', source: 'Title: A\n', at: 5_000 });
    clearStash('abc');
    expect(readStash('abc')).toBeNull();
  });

  test('a later stash for a script replaces its earlier one', () => {
    stash('a', 'one');
    stash('a', 'two');
    expect(readStash('a')).toMatchObject({ source: 'two' });
  });

  test('two scripts keep their stashes apart', () => {
    stash('a', 'one');
    stash('b', 'two');
    expect(readStash('a')).toMatchObject({ id: 'a', source: 'one' });
    expect(readStash('b')).toMatchObject({ id: 'b', source: 'two' });
    clearStash('a');
    expect(readStash('a')).toBeNull();
    expect(readStash('b')).toMatchObject({ source: 'two' });
  });

  test('lists every stash and nothing else in localStorage', () => {
    localStorage.setItem('something:else', JSON.stringify({ id: 'x', source: 'y', at: 1 }));
    stash('a', 'one');
    stash('b', 'two');
    expect(
      allStashes()
        .map((s) => s.id)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  test('ignores a value that is not a stash', () => {
    for (const bad of ['not json', '5', 'null', '{"id":1}', '{"id":"a","source":"x"}']) {
      localStorage.setItem('drafter:unwritten:a', bad);
      expect(readStash('a')).toBeNull();
      expect(allStashes()).toEqual([]);
    }
  });

  test('ignores a stash filed under another script’s key', () => {
    localStorage.setItem('drafter:unwritten:a', JSON.stringify({ id: 'b', source: 'x', at: 1 }));
    expect(readStash('a')).toBeNull();
    expect(allStashes()).toEqual([]);
  });

  test('goes on when localStorage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(() => stash('a', 'x')).not.toThrow();
    expect(() => clearStash('a')).not.toThrow();
    expect(readStash('a')).toBeNull();
    expect(allStashes()).toEqual([]);
  });
});
