// The file system, for the main process: the only part of the app that touches it
// (docs/drafter-desktop-design.md §3). Pure Node, with no Electron, so the unit tests run it on
// real temp folders; files-ipc.ts hands these to the page through IPC, behind the OS's dialogs.
//
// A writer's script is at stake in every call here, so a write replaces the file whole or not at
// all: the new bytes go to a temp file beside it, flushed to disk, then renamed over it.
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  type FSWatcher,
  readFileSync,
  realpathSync,
  statSync,
  watch,
  writeFileSync,
} from 'node:fs';
import {
  access,
  constants,
  type FileHandle,
  lstat,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, resolve, win32 } from 'node:path';
import { windowsPathProblem } from './windows-paths';

/** What went wrong, as the page is told it (the codes `DesktopFilesBridge` documents). */
export type FileErrorCode =
  | 'gone'
  | 'not-allowed'
  | 'disk-full'
  | 'too-big'
  | 'not-a-file'
  | 'failed';

export class FileError extends Error {
  readonly code: FileErrorCode;
  /** The system's own code (`EIO`), for `failed`. */
  readonly detail?: string;
  constructor(code: FileErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'FileError';
    this.code = code;
    this.detail = detail;
  }
}

/** Far more than any script (the web app refuses over 5 MB): a read stops here. */
export const MAX_READ_BYTES = 64 * 1024 * 1024;
/** A PDF of a very long script is a few megabytes; a write bigger than this is a mistake. */
export const MAX_WRITE_BYTES = 256 * 1024 * 1024;
/** Linux's PATH_MAX. */
const MAX_PATH = 4096;

/** The page's error for a Node one; a FileError as it is; anything else `failed`. */
export function fileErrorOf(error: unknown): FileError {
  if (error instanceof FileError) return error;
  const code = (error as NodeJS.ErrnoException | null)?.code;
  switch (code) {
    case 'ENOENT':
    case 'ENOTDIR':
      return new FileError('gone');
    case 'EACCES':
    case 'EPERM':
    case 'EROFS':
      return new FileError('not-allowed');
    case 'ENOSPC':
    case 'EDQUOT':
      return new FileError('disk-full');
    case 'EFBIG':
      return new FileError('too-big');
    case 'EISDIR':
      return new FileError('not-a-file');
    default:
      return new FileError('failed', typeof code === 'string' ? code : undefined);
  }
}

/**
 * An absolute path, from the page (or a launch's arguments): a string, with no NUL, no longer than
 * a path can be. On Windows, also none that Windows reads as another name, a stream inside a file,
 * or a device (`windowsPathProblem`): `notes.md.` would open `notes.md`, and `x.exe:a.md` a stream
 * of `x.exe`, past the checks made on the name.
 */
export function checkPath(value: unknown, platform: string = process.platform): string {
  const windows = platform === 'win32';
  if (
    typeof value !== 'string' ||
    value === '' ||
    value.length > MAX_PATH ||
    value.includes('\0') ||
    !(windows ? win32.isAbsolute(value) : isAbsolute(value))
  ) {
    throw new FileError('failed', 'not an absolute path');
  }
  if (windows && windowsPathProblem(value)) {
    throw new FileError('failed', 'a name Windows reads differently');
  }
  return value;
}

/** Bytes, from the page, up to `max`. */
export function checkBytes(value: unknown, max = MAX_WRITE_BYTES): Uint8Array {
  if (!(value instanceof Uint8Array)) throw new FileError('failed', 'not bytes');
  if (value.byteLength > max) throw new FileError('too-big');
  return value;
}

/** How many links a path may go through before it is a loop (Linux's own limit). */
const MAX_LINKS = 40;

/**
 * The file a write to `path` replaces. A symlink is written through: its target is replaced, and
 * the link stays a link (replacing the link with a file would cut it from what it points to). A
 * link to a file that doesn't exist yet makes that file. Anything else, `path` itself.
 */
export async function targetOf(path: string, links = 0): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(path);
  } catch {
    // No such file: a new one, in its folder, named by the folder's own real path (so the target
    // has no link left in it, and is the same string every time it is worked out).
    try {
      return join(await realpath(dirname(path)), basename(path));
    } catch {
      return path;
    }
  }
  if (!info.isSymbolicLink()) return path;
  if (links >= MAX_LINKS) throw new FileError('failed', 'ELOOP');
  return targetOf(resolve(dirname(path), await readlink(path)), links + 1);
}

/** The extensions of the files the app opens as scripts. */
export const SCRIPT_EXTENSIONS: readonly string[] = ['.fountain', '.md', '.markdown', '.txt'];
/**
 * The extensions of the files the app imports: a Final Draft, Highland, or Fade In file opens as a
 * new script, never as its file. A `.fdx` is written only as an export, where the writer chose it
 * in a Save dialog for one; a `.highland` or `.fadein` never is (it isn't in `WRITE_EXTENSIONS`).
 */
export const IMPORT_EXTENSIONS: readonly string[] = ['.fdx', '.highland', '.fadein'];
/**
 * The extensions the app writes only as an export, where the writer chose the file in a Save
 * dialog for one: a Final Draft file, and an HTML page. One that was opened (an import, or a page
 * picked with All files) is never written.
 */
export const EXPORT_ONLY_EXTENSIONS: readonly string[] = ['.fdx', '.html'];
/** The extensions of the files the app opens: scripts, and the files it imports. */
export const OPEN_EXTENSIONS: readonly string[] = [...SCRIPT_EXTENSIONS, ...IMPORT_EXTENSIONS];
/** The extensions of the files the app writes: scripts, and the exports. */
export const WRITE_EXTENSIONS: readonly string[] = [...SCRIPT_EXTENSIONS, '.pdf', '.html', '.fdx'];

/** Whether `path`'s extension is one of `extensions` (in any case). */
export const hasExtension = (path: string, extensions: readonly string[]) =>
  extensions.includes(extname(basename(path)).toLowerCase());

/** Flushes a folder's entries (the rename) to disk where the OS can; Windows can't, and needn't. */
async function syncFolder(folder: string): Promise<void> {
  let handle: FileHandle | undefined;
  try {
    handle = await open(folder, 'r');
    await handle.sync();
  } catch {
    // Not supported here (Windows, some network file systems): the rename is still atomic.
  } finally {
    await handle?.close().catch(() => {});
  }
}

/** Writes all of `chunk`, however many calls it takes. */
async function writeAll(handle: FileHandle, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
    offset += bytesWritten;
  }
}

export type Bytes = Uint8Array | Iterable<Uint8Array> | AsyncIterable<Uint8Array>;

async function* chunksOf(data: Bytes): AsyncIterable<Uint8Array> {
  if (data instanceof Uint8Array) yield data;
  else yield* data;
}

const TEMP_MARK = '.drafter-tmp-';
/** A file name is at most 255 bytes: a dot, the name's start, the mark, and 12 hex digits. */
const MAX_TEMP_BASE_BYTES = 255 - 1 - TEMP_MARK.length - 12;
/** A temp file older than this is left from a write that never finished. */
const STALE_TEMP_MS = 60_000;

/** The start of `name`, whole characters, in at most `bytes` bytes of UTF-8. */
function truncateBytes(name: string, bytes: number): string {
  let used = 0;
  let out = '';
  for (const char of name) {
    const size = Buffer.byteLength(char);
    if (used + size > bytes) break;
    used += size;
    out += char;
  }
  return out;
}

/** What every temp file of writes to `target` starts with (the name cut so the whole fits). */
const tempPrefix = (target: string) =>
  `.${truncateBytes(basename(target), MAX_TEMP_BASE_BYTES)}${TEMP_MARK}`;

/** The folders whose old temp files have been looked for in this run of the app. */
const sweptFolders = new Set<string>();
/** Any temp file of ours: `.<name>.drafter-tmp-<12 hex>`. */
const TEMP_NAME = /^\..+\.drafter-tmp-[0-9a-f]{12}$/;

/**
 * Removes the temp files that writes in `folder` left long ago (the app was killed mid-write), for
 * any file in it. Once per folder in a run of the app, not at every save: a save is not made to
 * read the folder each time, and the files such a write leaves are found at the next start.
 */
async function sweepTemps(folder: string): Promise<void> {
  if (sweptFolders.has(folder)) return;
  sweptFolders.add(folder);
  try {
    for (const name of await readdir(folder)) {
      if (!TEMP_NAME.test(name)) continue;
      const path = join(folder, name);
      try {
        const info = await lstat(path);
        if (info.isFile() && Date.now() - info.mtimeMs > STALE_TEMP_MS)
          await rm(path, { force: true });
      } catch {
        // Gone already, or not ours to remove.
      }
    }
  } catch {
    // The sweep is a courtesy; the write has succeeded.
  }
}

/**
 * Replaces the file at `path` with `data`, atomically: the bytes go to `.<name>.drafter-tmp-<hex>`
 * in the same folder (its name cut to fit if the file's is very long), are flushed to disk, and the temp file is renamed over the file (then the
 * folder is flushed, where the OS supports it). The file keeps its permissions. If anything fails
 * (the folder is read-only, the disk is full, the bytes stop coming) the temp file is removed and
 * the file is as it was. A file made read-only is refused, not replaced.
 *
 * Rejects with a `FileError`.
 */
export async function writeAtomic(path: string, data: Bytes): Promise<void> {
  let temp: string | undefined;
  let handle: FileHandle | undefined;
  try {
    const target = await targetOf(path);
    let mode: number | undefined;
    try {
      const info = await stat(target);
      if (!info.isFile()) throw new FileError('not-a-file');
      mode = info.mode & 0o7777;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    // The folder may let a rename replace a file the writer made read-only; the app doesn't.
    if (mode !== undefined) await access(target, constants.W_OK);

    const folder = dirname(target);
    temp = join(folder, `${tempPrefix(target)}${randomBytes(6).toString('hex')}`);
    // `wx`: never an existing file. A new file gets the usual permissions (0666 less the umask).
    handle = await open(temp, 'wx', mode ?? 0o666);
    // The umask applied to `open`'s mode; the file's own permissions are put back exactly.
    if (mode !== undefined) await handle.chmod(mode);
    for await (const chunk of chunksOf(data)) await writeAll(handle, chunk);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temp, target);
    temp = undefined;
    await syncFolder(folder);
    await sweepTemps(folder);
  } catch (error) {
    await handle?.close().catch(() => {});
    if (temp) await rm(temp, { force: true }).catch(() => {});
    throw fileErrorOf(error);
  }
}

/** A file's bytes and modification time (whole milliseconds, as a browser's `File` gives it). */
export async function readFileAt(
  path: string,
): Promise<{ bytes: Uint8Array; lastModified: number }> {
  try {
    // Checked before it is opened: opening a FIFO would wait for a writer.
    const info = await stat(path);
    if (!info.isFile()) throw new FileError('not-a-file');
    if (info.size > MAX_READ_BYTES) throw new FileError('too-big');
    const buffer = await readFile(path);
    return {
      bytes: new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      lastModified: Math.floor(info.mtimeMs),
    };
  } catch (error) {
    throw fileErrorOf(error);
  }
}

/** `path` with every symlink followed; a path that doesn't exist (or can't be followed), resolved. */
export async function realPathOf(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Calls `onChange` when the file at `path` changes, once the changes have stopped for
 * `debounceMs`. The file's folder is watched, not the file, for the file's name: many programs
 * save by renaming a new file over the old one, which gives the file a new inode that a watch on
 * the file itself would never hear from again, while the folder's watch sees each replacement as
 * it sees each write. A symlink is watched at its target. Returns the function that stops it.
 */
export function watchFile(
  path: string,
  onChange: () => void,
  options: { debounceMs?: number } = {},
): () => void {
  const debounce = options.debounceMs ?? 300;
  let real = path;
  try {
    real = realpathSync.native(path);
  } catch {
    // Not there (yet): its folder is watched for it.
  }
  const name = basename(real);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let watcher: FSWatcher | undefined;
  // What the file was when last told of: an event that leaves it the same (one from before the
  // watch began, which macOS delivers late, or another file's when the system names none) is not
  // a change. A replacement changes the inode; a write, the size or the times.
  const signature = () => {
    try {
      const info = statSync(real, { bigint: true });
      return `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
    } catch {
      return 'gone';
    }
  };
  let seen = signature();
  const changed = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (stopped) return;
      const now = signature();
      if (now === seen) return;
      seen = now;
      onChange();
    }, debounce);
  };
  try {
    watcher = watch(dirname(real), { persistent: false }, (_event, filename) => {
      // Some systems don't say which file: then any change in the folder may be it.
      if (filename === null || filename.toString() === name) changed();
    });
    // The folder went away, or the system stopped watching: nothing more is heard.
    watcher.on('error', () => watcher?.close());
  } catch {
    // A folder that can't be watched: the check on focus and before Save still runs.
  }
  return () => {
    stopped = true;
    clearTimeout(timer);
    watcher?.close();
  };
}

// ---- Dialogs --------------------------------------------------------------------------------------

/**
 * The e2e suite's dialog answers (`DRAFTER_E2E_DIALOG=<json file>`): honoured only by an
 * unpackaged app, as the other test hooks are, so an installed Drafter's dialogs are always shown.
 */
export function dialogHook(isPackaged: boolean, env: NodeJS.ProcessEnv): string | null {
  if (isPackaged) return null;
  const file = env.DRAFTER_E2E_DIALOG;
  return file && isAbsolute(file) ? file : null;
}

/** What a dialog was asked, as the hook logs it. */
export interface DialogRequest {
  kind: 'open' | 'save';
  defaultPath: string;
  extension?: string;
}

/**
 * The next answer in the hook's queue (a JSON array of paths, or null for Cancel), which is
 * written back without it; an empty or missing queue cancels. Each request is logged, one JSON
 * line each, to `<file>.log`.
 */
export function nextDialogAnswer(file: string, request: DialogRequest): string | null {
  appendFileSync(`${file}.log`, `${JSON.stringify(request)}\n`);
  let queue: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) queue = parsed;
  } catch {
    return null;
  }
  const answer = queue.shift();
  writeFileSync(file, JSON.stringify(queue));
  return typeof answer === 'string' ? answer : null;
}

/**
 * Where a Save dialog's answer saves. Linux's dialogs don't add the extension of the type chosen,
 * so a name without an extension of the kind being saved gets `extension`: a script keeps any
 * script extension the writer typed (they are all plain text), and an export must be a `.pdf`
 * (`Notes` → `Notes.md`, `Notes.rtf` → `Notes.rtf.md`, `Notes.fountain` saved as a PDF →
 * `Notes.fountain.pdf`, so PDF bytes never land under a script's name, nor a script's under a
 * PDF's). If a file already has that name a number is added (`Notes (2).md`): the writer agreed to
 * replace only the name they typed.
 */
export function saveTarget(path: string, extension: string): string {
  const kind = SCRIPT_EXTENSIONS.includes(extension.toLowerCase())
    ? SCRIPT_EXTENSIONS
    : [extension.toLowerCase()];
  if (hasExtension(path, kind)) return path;
  let candidate = `${path}${extension}`;
  for (let n = 2; existsSync(candidate) && n < 1000; n++) candidate = `${path} (${n})${extension}`;
  return candidate;
}

const isFolder = (path: unknown): path is string => {
  if (typeof path !== 'string' || !isAbsolute(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

function readSettings(file: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** The folder a dialog opens in: the one last used, else Documents, else home. */
export function startFolder(settingsFile: string, documents: string, home: string): string {
  const last = readSettings(settingsFile).lastFolder;
  if (isFolder(last)) return last;
  return isFolder(documents) ? documents : home;
}

/** Remembers `folder` as the one last used, in the app's settings file (written atomically). */
export async function rememberFolder(settingsFile: string, folder: string): Promise<void> {
  const settings = { ...readSettings(settingsFile), lastFolder: folder };
  await writeAtomic(settingsFile, new TextEncoder().encode(`${JSON.stringify(settings)}\n`));
}
