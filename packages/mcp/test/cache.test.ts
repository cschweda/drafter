import { describe, expect, it } from 'vitest';
import { CACHE_MAX, CACHE_MAX_BYTES, LoadCache } from '../src/cache';

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

  it('holds no more source text than its size limit, whatever the count', () => {
    // Red/blue audit, 2026-11-23 (M3): twelve long scripts, well inside the count, filled the
    // reader's memory.
    const cache = new LoadCache<string>();
    const size = 700 * 1024;
    for (let i = 0; i < 12; i++) cache.set(`/long${i}`, size, 1, `parsed ${i}`);
    expect(cache.bytes).toBeLessThanOrEqual(CACHE_MAX_BYTES);
    expect(cache.size).toBe(Math.floor(CACHE_MAX_BYTES / size));
    // The newest are kept, the oldest gone.
    expect(cache.get('/long11', size, 1)).toBe('parsed 11');
    expect(cache.get('/long0', size, 1)).toBeUndefined();
    // One file larger than the whole limit is still kept, alone: the call that parsed it uses it.
    cache.set('/huge', CACHE_MAX_BYTES * 2, 1, 'huge');
    expect(cache.size).toBe(1);
    expect(cache.get('/huge', CACHE_MAX_BYTES * 2, 1)).toBe('huge');
    // Replacing a file's entry, or dropping a changed one, keeps the count of bytes right.
    // A packed file is charged by the text inside it, not its size on disk.
    const packed = new LoadCache<string>();
    packed.set('/a.highland', 1000, 1, 'a', CACHE_MAX_BYTES - 10);
    packed.set('/b.highland', 1000, 1, 'b', 20);
    expect(packed.size).toBe(1);
    expect(packed.get('/b.highland', 1000, 1)).toBe('b');
    cache.set('/huge', 10, 2, 'small now');
    expect(cache.bytes).toBe(10);
    expect(cache.get('/huge', 11, 3)).toBeUndefined();
    expect(cache.bytes).toBe(0);
  });

  it('makes room before a file is parsed, so the peak is the limit and not the limit and a file', () => {
    // The audit of the red/blue audit of 23 November 2026 (M3).
    const cache = new LoadCache<string>(20, 100);
    cache.set('/a', 40, 1, 'a');
    cache.set('/b', 40, 1, 'b');
    cache.makeRoom(50);
    expect(cache.bytes).toBe(40);
    expect(cache.get('/a', 40, 1)).toBeUndefined();
    expect(cache.get('/b', 40, 1)).toBe('b');
    cache.makeRoom(500);
    expect(cache.size).toBe(0);
  });

  it('a page of a search parses no more than the cache holds', async () => {
    const { PAGE_PARSE_BYTES } = await import('../src/names');
    const { CACHE_MAX_BYTES } = await import('../src/cache');
    expect(PAGE_PARSE_BYTES).toBeLessThanOrEqual(CACHE_MAX_BYTES);
  });
});
