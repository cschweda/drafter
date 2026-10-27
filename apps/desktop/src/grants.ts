// The files the page may read and write: only those the writer chose. The page is the app's own
// (sandboxed, with a strict CSP, loading nothing from the network), but if it were ever made to
// run someone else's script, the main process must not become a way to read ~/.ssh or rewrite
// ~/.bashrc. So a path is granted only by the main process itself, when:
//   - the Open or Save dialog returns it;
//   - the preload hands over a dropped file's path (`webUtils.getPathForFile`: a page can't make a
//     File with a path on disk) and it is an existing script;
//   - the command line or a second launch names it (Task 3, through `grant`).
// Each grant records the file's real path (every link followed). Every use works the real path
// out again and refuses if it changed: a chosen file swapped for a link to another (or a folder on
// its way swapped for one) is not the file the writer chose.
//
// Grants are kept in a JSON file in the profile, so a script bound to its file still saves after a
// restart. The list is capped (the oldest go first), and entries whose file is gone are dropped
// when it is read.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { checkPath, FileError, targetOf, writeAtomic } from './files';

interface Grant {
  /** The path as the page knows it (absolute, resolved). */
  path: string;
  /** Its real path when granted. */
  real: string;
}

/** How many grants are kept: far more scripts than anyone keeps open. */
export const MAX_GRANTS = 1000;

const isGrant = (value: unknown): value is Grant =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as Grant).path === 'string' &&
  typeof (value as Grant).real === 'string' &&
  isAbsolute((value as Grant).path) &&
  isAbsolute((value as Grant).real);

export class Grants {
  readonly #file: string;
  readonly #max: number;
  /** By path, oldest first. */
  #entries: Map<string, Grant> | undefined;
  /** Grants under way (a drop's), which a check waits for. */
  readonly #pending = new Set<Promise<unknown>>();
  #saving: Promise<void> = Promise.resolve();

  constructor(file: string, options: { max?: number } = {}) {
    this.#file = file;
    this.#max = options.max ?? MAX_GRANTS;
  }

  #load(): Map<string, Grant> {
    if (this.#entries) return this.#entries;
    let listed: unknown[] = [];
    try {
      const parsed = JSON.parse(readFileSync(this.#file, 'utf8')) as { files?: unknown };
      if (Array.isArray(parsed?.files)) listed = parsed.files;
    } catch {
      // None yet, or damaged: nothing is granted.
    }
    const entries = new Map<string, Grant>();
    let dropped = false;
    for (const entry of listed) {
      // A file that is gone is no longer the writer's: whatever appears there later isn't either.
      if (!isGrant(entry) || !existsSync(entry.real)) {
        dropped = true;
        continue;
      }
      entries.set(entry.path, { path: entry.path, real: entry.real });
    }
    this.#entries = entries;
    if (dropped) void this.#save();
    return entries;
  }

  #save(): Promise<void> {
    const files = [...(this.#entries?.values() ?? [])];
    const text = `${JSON.stringify({ files })}\n`;
    // One write at a time, in order.
    this.#saving = this.#saving
      .catch(() => {})
      .then(() => {
        mkdirSync(dirname(this.#file), { recursive: true });
        return writeAtomic(this.#file, new TextEncoder().encode(text));
      });
    return this.#saving;
  }

  /** Grants `path` (an absolute path); resolves with it as the page should use it. */
  async grant(path: string): Promise<string> {
    const key = resolve(checkPath(path));
    const real = await targetOf(key);
    const entries = this.#load();
    entries.delete(key);
    entries.set(key, { path: key, real });
    while (entries.size > this.#max) {
      const oldest = entries.keys().next().value as string;
      entries.delete(oldest);
    }
    await this.#save().catch(() => {
      // Not kept for the next start, but granted for this one.
    });
    return key;
  }

  /** Keeps a grant under way (a drop's) for the checks that follow it to wait for. */
  pend(grant: Promise<unknown>): Promise<unknown> {
    const kept = grant.catch(() => {}).finally(() => this.#pending.delete(kept));
    this.#pending.add(kept);
    return kept;
  }

  /**
   * The real path to use for `path`, if it was granted and still leads where it did; otherwise a
   * `FileError('not-allowed')`.
   */
  async allowed(path: unknown): Promise<string> {
    const key = resolve(checkPath(path));
    await Promise.all(this.#pending);
    const entry = this.#load().get(key);
    await this.#saving.catch(() => {});
    if (!entry) throw new FileError('not-allowed', 'not chosen');
    if ((await targetOf(key)) !== entry.real) throw new FileError('not-allowed', 'moved');
    return entry.real;
  }
}
