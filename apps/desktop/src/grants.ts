// The files the page may read and write: only those the writer chose. The page is the app's own
// (sandboxed, with a strict CSP, loading nothing from the network), but if it were ever made to
// run someone else's script, the main process must not become a way to read ~/.ssh or rewrite
// ~/.bashrc. So a path is granted only by the main process itself, when:
//   - the Open or Save dialog returns it;
//   - a drop: the preload's own listener, on the window in the capture phase and added before the
//     page's scripts run, sees the browser's trusted `drop` event and tells main the dropped files'
//     paths (`webUtils.getPathForFile`; a page can't make a File with a path). Main answers an
//     opaque id for each, and grants the file only when the page claims that id, once, from the
//     same window, within a minute, and only if it is an existing script or a file to import. The
//     page's bridge has no call that takes a dropped path (file-handlers.ts `registerDrop`,
//     `claimDrop`; the security audit of 2026-11-01, F2);
//   - the command line or a second launch names it (Task 3, through `grant`).
// A dropped or named file is a script by where it leads, not by its name: a link `x.md` to a
// private key has the name of a script and is refused (the real path's extension is checked, and
// recorded, in one step). A file the writer picked in a dialog is theirs whatever its kind.
//
// What this does not stop: main still can't see the drop itself (Electron gives the main process
// no drop event for a page), so it trusts the preload to report only real ones. Script in the
// page can't reach that report (context isolation; a drop it dispatches is untrusted, and the
// preload ignores it), but a renderer process compromised below the page (a bug in Chromium
// itself) could send it. That would put in reach any file with a script's or an import's
// extension that the writer's own account can read: `.fountain` and `.md`, `.markdown`, and `.txt`
// of every kind (a project’s README, notes, an AI tool’s instructions) to read and rewrite, and
// `.fdx`, `.highland`, and `.fadein` to read; never ~/.ssh or ~/.bashrc. That is accepted: it takes a compromised renderer
// to begin with, which the sandbox, the CSP, the absence of v-html in Drafter's own code (the one
// library component that has it is given text only), and the network block all stand against.
// A granted script also lets the page write its own drafts and cuts beside it (beside.ts), and
// nothing else there: the names are worked out in main from the script's real name (its cuts
// file, `<name>.cuts.md`; its drafts folder, `<stem> drafts`; and draft files in it named
// `<stem> – Draft NN`), never taken from the page, so a page granted one script can't reach the
// drafts or cuts of another work in the same folder, nor make a file there of any other name.
// Each grant records the file's real path (every link followed). Every use works the real path
// out again and refuses if it changed: a chosen file swapped for a link to another (or a folder on
// its way swapped for one) is not the file the writer chose.
//
// Grants are kept in a JSON file in the profile, so a script bound to its file still saves after a
// restart. The list is capped (the oldest go first), and entries whose file is gone from a folder
// that is there and has other things in it are dropped when it is read (a drive that isn't
// mounted, whose empty mount point is still there, keeps its grants).
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { checkPath, FileError, hasExtension, targetOf, writeAtomic } from './files';
import { windowsPathProblem } from './windows-paths';

interface Grant {
  /** The path as the page knows it (absolute, resolved). */
  path: string;
  /** Its real path when granted. */
  real: string;
}

/** How many grants are kept: far more scripts than anyone keeps open. */
export const MAX_GRANTS = 1000;

/**
 * Whether a folder is there and has something in it. An unmounted drive leaves its mount point
 * (`/media/me/DRIVE`) behind, empty, so an empty folder is treated like one that isn't there: the
 * grants under it are kept. (A folder the writer emptied keeps theirs too, which only matters if a
 * file of that name appears again.)
 */
function folderInUse(folder: string): boolean {
  try {
    return readdirSync(folder).length > 0;
  } catch {
    return false;
  }
}

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
  /** On Windows, a real path Windows would read as another name, a stream, or a device is refused. */
  readonly #windows: boolean;
  /** By path, oldest first. */
  #entries: Map<string, Grant> | undefined;
  #saving: Promise<void> = Promise.resolve();

  constructor(file: string, options: { max?: number; platform?: string } = {}) {
    this.#file = file;
    this.#max = options.max ?? MAX_GRANTS;
    this.#windows = (options.platform ?? process.platform) === 'win32';
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
      // But if its folder is gone too (a drive or share not mounted yet), it may come back as it was.
      if (!isGrant(entry) || (!existsSync(entry.real) && folderInUse(dirname(entry.real)))) {
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

  /**
   * Grants `path` (an absolute path); resolves with it as the page should use it. With
   * `extensions`, the real path (every link followed) must end in one of them, else `not-allowed`.
   */
  async grant(path: string, extensions?: readonly string[]): Promise<string> {
    const key = resolve(checkPath(path));
    const real = await targetOf(key);
    // `checkPath` saw the name asked for; a link can lead to one Windows reads differently.
    if (this.#windows && windowsPathProblem(real)) {
      throw new FileError('not-allowed', 'a name Windows reads differently');
    }
    if (extensions && !hasExtension(real, extensions)) {
      throw new FileError('not-allowed', 'not a script');
    }
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

  /**
   * The real path to use for `path`, if it was granted and still leads where it did; otherwise a
   * `FileError('not-allowed')`.
   */
  async allowed(path: unknown): Promise<string> {
    const key = resolve(checkPath(path));
    const entry = this.#load().get(key);
    await this.#saving.catch(() => {});
    if (!entry) throw new FileError('not-allowed', 'not chosen');
    if (this.#windows && windowsPathProblem(entry.real)) {
      throw new FileError('not-allowed', 'a name Windows reads differently');
    }
    if ((await targetOf(key)) !== entry.real) throw new FileError('not-allowed', 'moved');
    return entry.real;
  }
}
