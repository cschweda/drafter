/**
 * The text a closing page couldn't be sure of writing to IndexedDB.
 *
 * A page that is going away can start an IndexedDB write but not wait for it: the browser closes
 * the page's connections, and a transaction that hasn't committed is aborted. `localStorage` is
 * synchronous, so `pagehide` leaves the pending text here as well, the next launch writes it, and
 * a write that completes takes it away again. Each script has its own key, so two tabs on two
 * scripts never overwrite each other's. It holds one script's text for a moment; nothing reads it
 * but the next launch and a tab taking a script over.
 */
export interface Unwritten {
  id: string;
  source: string;
  at: number;
}

const PREFIX = 'drafter:unwritten:';

function parse(raw: string | null, id?: string): Unwritten | null {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (typeof value !== 'object' || value === null) return null;
    const found = value as Partial<Unwritten>;
    if (typeof found.id !== 'string' || typeof found.source !== 'string') return null;
    if (typeof found.at !== 'number' || (id !== undefined && found.id !== id)) return null;
    return { id: found.id, source: found.source, at: found.at };
  } catch {
    return null;
  }
}

export function stash(id: string, source: string): void {
  try {
    localStorage.setItem(
      PREFIX + id,
      JSON.stringify({ id, source, at: Date.now() } satisfies Unwritten),
    );
  } catch {
    // No storage, or no room: the IndexedDB write is all there is.
  }
}

export function clearStash(id: string): void {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    // Nothing to clear.
  }
}

/** What was left for script `id`, if anything; it stays until `clearStash`. */
export function readStash(id: string): Unwritten | null {
  try {
    return parse(localStorage.getItem(PREFIX + id), id);
  } catch {
    return null;
  }
}

/** Every script's stash. */
export function allStashes(): Unwritten[] {
  const found: Unwritten[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const left = parse(localStorage.getItem(key), key.slice(PREFIX.length));
      if (left) found.push(left);
    }
  } catch {
    // Blocked.
  }
  return found;
}
