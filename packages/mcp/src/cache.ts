// Parsed files, kept in memory only (§7.2): keyed by real path, size, and modified time, so a
// changed file is parsed again; the least recently used goes first when it is full. Nothing is
// ever written anywhere.

export const CACHE_MAX = 20;

/**
 * The most source text the cache holds, in bytes of the files it was parsed from. A parsed script
 * takes many times its file's size in memory, so a count alone let twenty long scripts (twelve of
 * 700 KB were enough) fill the reader's 512 MB, and a folder of them could never be searched
 * (red/blue audit of 23 November 2026, M3).
 */
export const CACHE_MAX_BYTES = 4 * 1024 * 1024;

export class LoadCache<T> {
  readonly #max: number;
  readonly #maxBytes: number;
  #bytes = 0;
  readonly #entries = new Map<string, { size: number; mtimeMs: number; value: T }>();

  constructor(max: number = CACHE_MAX, maxBytes: number = CACHE_MAX_BYTES) {
    this.#max = max;
    this.#maxBytes = maxBytes;
  }

  /** The value for this file as it is now, or undefined (a changed file's value is dropped). */
  get(real: string, size: number, mtimeMs: number): T | undefined {
    const entry = this.#entries.get(real);
    if (!entry) return undefined;
    this.#entries.delete(real);
    if (entry.size !== size || entry.mtimeMs !== mtimeMs) {
      this.#bytes -= entry.size;
      return undefined;
    }
    // Used again: to the back of the queue.
    this.#entries.set(real, entry);
    return entry.value;
  }

  set(real: string, size: number, mtimeMs: number, value: T): void {
    const before = this.#entries.get(real);
    if (before) {
      this.#bytes -= before.size;
      this.#entries.delete(real);
    }
    this.#entries.set(real, { size, mtimeMs, value });
    this.#bytes += size;
    // The oldest go until it fits, by count and by size; the one just put in always stays.
    while (
      this.#entries.size > 1 &&
      (this.#entries.size > this.#max || this.#bytes > this.#maxBytes)
    ) {
      const oldest = this.#entries.keys().next().value as string;
      this.#bytes -= (this.#entries.get(oldest) as { size: number }).size;
      this.#entries.delete(oldest);
    }
  }

  /** The bytes of source text behind what it holds. */
  get bytes(): number {
    return this.#bytes;
  }

  get size(): number {
    return this.#entries.size;
  }
}
