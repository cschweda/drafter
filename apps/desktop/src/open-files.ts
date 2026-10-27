// Files the system names: on the command line when Drafter starts, in a second launch's, or (macOS)
// by the `open-file` event. Pure Node, so it is unit-tested; main.ts does the Electron part.
//
// The launch's arguments are not only files. They hold the executable, Chromium's and Electron's
// flags, the app's own folder when run from source (`electron .`), and in an AppImage the
// AppImage's path. Only a script that exists is opened; any other plain argument is said to be one
// that Drafter couldn't open, and why.
import { statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
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

/** The same path, however it is spelled (`/a/./b/../c`). */
const same = (a: string, b: string) => resolve(a) === resolve(b);

/**
 * Sorts the arguments after the executable. Flags (anything starting with `-`, such as macOS's
 * `-psn_0_123`) and the paths in `ignore` (the app's own folder, the executable, the AppImage) are
 * dropped; relative paths are taken from `cwd`, the folder the launch happened in.
 */
export function requestsFromArgs(args: string[], cwd: string, ignore: string[] = []): OpenRequests {
  const files: string[] = [];
  const refused: Refusal[] = [];
  const seen = new Set<string>();
  for (const arg of args) {
    if (typeof arg !== 'string' || arg === '' || arg.startsWith('-') || arg.includes('\0'))
      continue;
    const path = resolve(cwd, arg);
    if (ignore.some((skip) => same(skip, path))) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    const name = basename(path);
    if (!hasExtension(path, SCRIPT_EXTENSIONS)) {
      refused.push({ name, reason: NOT_A_SCRIPT });
      continue;
    }
    let isFile: boolean;
    try {
      isFile = statSync(path).isFile();
    } catch {
      refused.push({ name, reason: 'it isn’t there' });
      continue;
    }
    if (isFile) files.push(path);
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
