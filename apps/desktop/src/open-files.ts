// Files the system names: on the command line when Drafter starts, in a second launch's, or (macOS)
// by the `open-file` event. Pure Node, so it is unit-tested; main.ts does the Electron part.
//
// The launch's arguments are not only files. They hold the executable, Chromium's and Electron's
// flags, the app's own folder when run from source (`electron .`), and in an AppImage the
// AppImage's path. Only a script that exists is opened. A script that isn't there, and any other
// file that exists, is said to be one Drafter couldn't open, and why. Anything else (a folder, a
// name with no file behind it) is left out in silence: it is most likely the value of a switch
// (`--user-data-dir /x`), not something the writer asked to open. The residual case is a switch's
// value that happens to be an existing file (`--log-file ~/notes.md` opens it; `--log-file a.png`
// is said to be refused).
import { type Stats, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasExtension, SCRIPT_EXTENSIONS } from './files';

/** Why an argument wasn't opened. */
export interface Refusal {
  /** The file's name as it was written (its last part). */
  name: string;
  /** Said after the name: "it isn’t there". */
  reason: string;
}

export interface OpenRequests {
  /** Existing script files, as absolute paths (a link is kept as written), each once. */
  files: string[];
  refused: Refusal[];
}

export const NOT_A_SCRIPT = 'it isn’t a script (.fountain, .md, .markdown, or .txt)';

/** The status-bar message for a refusal. */
export const refusalMessage = ({ name, reason }: Refusal) =>
  `Drafter can’t open “${name}”: ${reason}.`;

/** The message for several refusals at once: the first three by name, then how many more. */
export function refusalsMessage(refusals: readonly Refusal[]): string {
  if (refusals.length === 0) return '';
  const [only] = refusals;
  if (refusals.length === 1 && only) return refusalMessage(only);
  const shown = refusals.slice(0, 3).map(({ name, reason }) => `“${name}” (${reason})`);
  const more = refusals.length - shown.length;
  return `Drafter can’t open ${refusals.length} files: ${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}.`;
}

/** The same path, however it is spelled (`/a/./b/../c`). */
const same = (a: string, b: string) => resolve(a) === resolve(b);

/**
 * An argument as a path: itself, or for a URL (`scheme://…`) the local file a `file:` URL names, as a
 * desktop entry's `%U` passes it (`file:///home/a/My%20Script.fountain`). Any other URL, a `file:`
 * URL on another host, or one that doesn't decode is null: not a request.
 */
function fromUrl(arg: string): string | null {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(arg)) return arg;
  try {
    const url = new URL(arg);
    if (url.protocol !== 'file:' || (url.host !== '' && url.host !== 'localhost')) return null;
    return fileURLToPath(new URL(`file://${url.pathname}`));
  } catch {
    return null;
  }
}

/**
 * Sorts the arguments after the executable. Flags (anything starting with `-`, such as macOS's
 * `-psn_0_123`) and URLs other than a local `file:` one and the paths in `ignore` (the app's own folder, the executable, the AppImage) are
 * dropped; relative paths are taken from `cwd`, the folder the launch happened in.
 */
export function requestsFromArgs(args: string[], cwd: string, ignore: string[] = []): OpenRequests {
  const files: string[] = [];
  const refused: Refusal[] = [];
  const seen = new Set<string>();
  // After a bare `--` every argument is a path, even one that starts with a dash.
  let paths = false;
  for (const arg of args) {
    if (typeof arg !== 'string' || arg === '' || arg.includes('\0')) continue;
    if (!paths && arg === '--') {
      paths = true;
      continue;
    }
    if (!paths && arg.startsWith('-')) continue;
    const named = !paths ? fromUrl(arg) : arg;
    if (named === null) continue;
    const path = resolve(cwd, named);
    if (ignore.some((skip) => same(skip, path))) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const name = basename(path);
    let info: Stats | undefined;
    try {
      info = statSync(path);
    } catch {
      info = undefined;
    }
    if (!hasExtension(path, SCRIPT_EXTENSIONS)) {
      // Only an existing file is said to be refused; the rest is not a request.
      if (info?.isFile()) refused.push({ name, reason: NOT_A_SCRIPT });
      continue;
    }
    if (!info) refused.push({ name, reason: 'it isn’t there' });
    else if (info.isFile()) files.push(path);
    else refused.push({ name, reason: 'it isn’t a file' });
  }
  return { files, refused };
}

/** `requestsFromArgs` for `process.argv` (or a second launch's): its first item is the executable. */
export function requestsFromArgv(argv: string[], cwd: string, ignore: string[] = []): OpenRequests {
  return requestsFromArgs(argv.slice(1), cwd, ignore);
}

/** The scripts a launch's `argv` names: existing `.fountain`, `.md`, `.markdown`, `.txt` files. */
export function filesFromArgv(argv: string[], cwd: string, ignore: string[] = []): string[] {
  return requestsFromArgv(argv, cwd, ignore).files;
}

/** What the page is told: a file it may open (already granted), or why one wasn't opened. */
export type OpenItem = { path: string } | { problem: string };

/** The part of a `WebContents` the inbox needs. */
export interface OpenTarget {
  isDestroyed(): boolean;
  send(channel: string, item: OpenItem): void;
}

/**
 * Holds what the system asked to open until the editor's page is listening (a launch's files
 * arrive long before the page has loaded), then sends it, in order and once. A page that is gone
 * leaves the rest for the next one.
 */
export class OpenInbox {
  #waiting: OpenItem[] = [];
  #page: OpenTarget | null = null;
  readonly #channel: string;
  readonly #onRequest: (() => void) | undefined;

  /** `onRequest` is called for each request: main brings the window forward. */
  constructor(channel: string, onRequest?: () => void) {
    this.#channel = channel;
    this.#onRequest = onRequest;
  }

  /**
   * The page is navigating (or reloading) and can't be sent to: requests wait for the next
   * `listen`. Only the page that is listening now is forgotten.
   */
  forget(page: OpenTarget): void {
    if (this.#page === page) this.#page = null;
  }

  /** The page that is listening now. Whatever was waiting is sent to it. */
  listen(page: OpenTarget): void {
    this.#page = page;
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const item of waiting) this.#send(item);
  }

  add(item: OpenItem): void {
    this.#send(item);
    this.#onRequest?.();
  }

  #send(item: OpenItem): void {
    const page = this.#page;
    if (page && !page.isDestroyed()) page.send(this.#channel, item);
    else this.#waiting.push(item);
  }
}
