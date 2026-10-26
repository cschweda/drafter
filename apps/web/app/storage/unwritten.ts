/**
 * The text a closing page couldn't be sure of writing to IndexedDB.
 *
 * A page that is going away can start an IndexedDB write but not wait for it: the browser closes
 * the page's connections, and a transaction that hasn't committed is aborted. `localStorage` is
 * synchronous, so `pagehide` leaves the pending text here as well, the next launch writes it, and
 * a write that completes takes it away again. It holds one script's text for a moment; nothing
 * reads it but the next launch.
 */
export interface Unwritten {
  id: string;
  source: string;
  at: number;
}

const KEY = 'drafter:unwritten';

export function stash(id: string, source: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, source, at: Date.now() } satisfies Unwritten));
  } catch {
    // No storage, or no room: the IndexedDB write is all there is.
  }
}

export function clearStash(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** What was left, if anything; it stays until `clearStash`. */
export function readStash(): Unwritten | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (typeof value !== 'object' || value === null) return null;
    const { id, source, at } = value as Partial<Unwritten>;
    return typeof id === 'string' && typeof source === 'string' && typeof at === 'number'
      ? { id, source, at }
      : null;
  } catch {
    return null;
  }
}
