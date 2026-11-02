import { describe, expect, it } from 'vitest';
import { CACHE_MAX, LoadCache } from '../src/cache';

describe('the parse cache', () => {
  it('keeps a value while the file is unchanged, and drops it when it changes', () => {
    const cache = new LoadCache<string>();
    cache.set('/a', 10, 1, 'parsed');
    expect(cache.get('/a', 10, 1)).toBe('parsed');
    expect(cache.get('/a', 11, 1)).toBeUndefined();
    // Dropped, not kept for the old size.
    expect(cache.get('/a', 10, 1)).toBeUndefined();
    cache.set('/b', 10, 1, 'b');
    expect(cache.get('/b', 10, 2)).toBeUndefined();
  });

  it('keeps 20, the least recently used going first', () => {
    expect(CACHE_MAX).toBe(20);
    const cache = new LoadCache<number>();
    for (let i = 0; i < 20; i++) cache.set(`/${i}`, 1, 1, i);
    expect(cache.get('/0', 1, 1)).toBe(0);
    cache.set('/20', 1, 1, 20);
    expect(cache.size).toBe(20);
    expect(cache.get('/1', 1, 1)).toBeUndefined();
    expect(cache.get('/0', 1, 1)).toBe(0);
    expect(cache.get('/20', 1, 1)).toBe(20);
  });
});
