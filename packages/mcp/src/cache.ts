// Parsed files, kept in memory only (§7.2): keyed by real path, size, and modified time, so a
// changed file is parsed again; the least recently used goes first when it is full. Nothing is
// ever written anywhere.

export const CACHE_MAX = 20;

export class LoadCache<T> {
  readonly #max: number;
  readonly #entries = new Map<string, { size: number; mtimeMs: number; value: T }>();

  constructor(max: number = CACHE_MAX) {
    this.#max = max;
  }

  /** The value for this file as it is now, or undefined (a changed file's value is dropped). */
  get(real: string, size: number, mtimeMs: number): T | undefined {
    const entry = this.#entries.get(real);
    if (!entry) return undefined;
    this.#entries.delete(real);
    if (entry.size !== size || entry.mtimeMs !== mtimeMs) return undefined;
    // Used again: to the back of the queue.
    this.#entries.set(real, entry);
    return entry.value;
  }

  set(real: string, size: number, mtimeMs: number, value: T): void {
    this.#entries.delete(real);
    this.#entries.set(real, { size, mtimeMs, value });
    while (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next().value as string;
      this.#entries.delete(oldest);
    }
  }

  get size(): number {
    return this.#entries.size;
  }
}
