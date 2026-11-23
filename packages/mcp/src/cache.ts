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
  readonly #entries = new Map<string, { size: number; mtimeMs: number; cost: number; value: T }>();

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
      this.#bytes -= entry.cost;
      return undefined;
    }
    // Used again: to the back of the queue.
    this.#entries.set(real, entry);
    return entry.value;
  }

  /**
   * `size` and `mtimeMs` say which version of the file this is. `cost` is what it is charged
   * against the size limit: the length of the text that was parsed, which for a packed file (a
   * `.highland`, an e-book) is many times its size on disk.
   */
  set(real: string, size: number, mtimeMs: number, value: T, cost: number = size): void {
    const before = this.#entries.get(real);
    if (before) {
      this.#bytes -= before.cost;
      this.#entries.delete(real);
    }
    this.#entries.set(real, { size, mtimeMs, cost, value });
    this.#bytes += cost;
    // The oldest go until it fits, by count and by size; the one just put in always stays.
    while (
      this.#entries.size > 1 &&
      (this.#entries.size > this.#max || this.#bytes > this.#maxBytes)
    ) {
      const oldest = this.#entries.keys().next().value as string;
      this.#bytes -= (this.#entries.get(oldest) as { cost: number }).cost;
      this.#entries.delete(oldest);
    }
  }

  /** What it holds, as charged: the length of the text behind each entry. */
  get bytes(): number {
    return this.#bytes;
  }

  get size(): number {
    return this.#entries.size;
  }
}
