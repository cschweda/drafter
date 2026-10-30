// What the main process answers to the page's file calls (DesktopFilesBridge,
// apps/web/app/desktop.ts), without Electron: files-ipc.ts registers these with ipcMain (after
// checking the sender is an app page) and supplies the OS's dialogs. The unit tests call them as
// ipcMain would, with a stand-in event, so they are what a compromised page could ask for.
//
// Every argument is checked before anything touches the disk, and every path must have been
// granted (grants.ts): chosen in a dialog, dropped, or named on the command line. A write also
// goes only to a regular file with a script's or an export's extension, and a Final Draft file
// only where the writer chose one in a Save dialog (an export, never an imported file). A Highland
// or Fade In file is never written at all.
import { dirname, join } from 'node:path';
import {
  checkBytes,
  checkPath,
  dialogHook,
  FileError,
  fileErrorOf,
  hasExtension,
  IMPORT_EXTENSIONS,
  nextDialogAnswer,
  OPEN_EXTENSIONS,
  readFileAt,
  rememberFolder,
  saveTarget,
  startFolder,
  targetOf,
  WRITE_EXTENSIONS,
  watchFile,
  writeAtomic,
} from './files';
import type { Grants } from './grants';

export { dialogHook };

export type SaveExtension = '.fountain' | '.md' | '.txt' | '.pdf' | '.fdx';
const SAVE_EXTENSIONS: readonly string[] = ['.fountain', '.md', '.txt', '.pdf', '.fdx'];
const isExtension = (value: unknown): value is SaveExtension =>
  typeof value === 'string' && SAVE_EXTENSIONS.includes(value);

/** The page a call came from: what the watches need of Electron's WebContents. */
export interface FileSender {
  isDestroyed(): boolean;
  send(channel: string, ...args: unknown[]): void;
  once(event: 'destroyed', listener: () => void): unknown;
  on(event: 'did-navigate', listener: () => void): unknown;
}
export interface FileEvent {
  sender: FileSender;
}

export interface FileHandlerDeps {
  grants: Grants;
  /** The app's settings file (the folder last used). */
  settingsFile: string;
  /** The Documents folder (a function: Electron may not know one). */
  documents(): string;
  home: string;
  /** The e2e suite's dialog queue (`dialogHook`), or null to show the dialogs. */
  hook: string | null;
  /** The OS's Open dialog: the chosen path, or null. */
  showOpenDialog(event: FileEvent, defaultPath: string): Promise<string | null>;
  /** The OS's Save dialog: the chosen path, or null. */
  showSaveDialog(
    event: FileEvent,
    defaultPath: string,
    extension: SaveExtension,
  ): Promise<string | null>;
  /** The channel a watched file's change is sent on. */
  changedChannel?: string;
}

/** A file name the page suggests: its last part only, never a path; at most 255 characters. */
function checkName(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new FileError('failed', 'not a file name');
  }
  const name = value.split(/[\\/]/).at(-1)?.slice(0, 255) ?? '';
  return name === '' || name === '.' || name === '..' ? 'Untitled' : name;
}

function checkId(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new FileError('failed', 'not a watch');
  }
  return value as number;
}

/** How many files one page may watch at once (it watches one: the open script's). */
const MAX_WATCHES = 32;

/** Runs `work`, turning whatever it throws into a `FileError`. */
async function coded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw fileErrorOf(error);
  }
}

export function fileHandlers(deps: FileHandlerDeps) {
  const { grants } = deps;
  const folder = () => startFolder(deps.settingsFile, deps.documents(), deps.home);
  const remember = (path: string) =>
    rememberFolder(deps.settingsFile, dirname(path)).catch(() => {});

  /**
   * Grants an existing script, or a Final Draft, Highland, or Fade In file to import, by its path
   * (a drop's, the command line's); refuses anything else.
   */
  async function grantScript(path: unknown): Promise<string> {
    const file = checkPath(path);
    if (!hasExtension(file, OPEN_EXTENSIONS)) throw new FileError('not-allowed', 'not a script');
    // By where it leads, too: a link named `x.md` to a private key is not a script. (`grant`
    // checks the real path again as it records it, so a swap in between is caught.)
    if (!hasExtension(await targetOf(file), OPEN_EXTENSIONS)) {
      throw new FileError('not-allowed', 'not a script');
    }
    // Read once to be sure it is a regular file the writer can read (not a folder, a FIFO).
    await readFileAt(file);
    return grants.grant(file, OPEN_EXTENSIONS);
  }

  // The Final Draft files the writer chose in a Save dialog for one (an export), by real path. Any
  // other `.fdx` was opened to be imported, and is never written: the import saves as a .fountain.
  const exportsChosen = new Set<string>();

  // Watches, by page: each stops when the page asks, reloads, or goes.
  const watches = new Map<FileSender, Map<number, () => void>>();
  const hooked = new WeakSet<FileSender>();
  const stopAll = (sender: FileSender) => {
    for (const stop of watches.get(sender)?.values() ?? []) stop();
    watches.delete(sender);
  };
  const watchesOf = (sender: FileSender) => {
    let mine = watches.get(sender);
    if (!mine) {
      mine = new Map();
      watches.set(sender, mine);
    }
    // Once per page, however often it reloads: each reload forgets its watches but not the page.
    if (!hooked.has(sender)) {
      hooked.add(sender);
      sender.once('destroyed', () => stopAll(sender));
      sender.on('did-navigate', () => stopAll(sender));
    }
    return mine;
  };

  return {
    /** For the command line and a second launch (Task 3): the path, once granted. */
    grantScript,

    showOpen: (event: FileEvent) =>
      coded(async () => {
        const defaultPath = folder();
        const chosen = deps.hook
          ? nextDialogAnswer(deps.hook, { kind: 'open', defaultPath })
          : await deps.showOpenDialog(event, defaultPath);
        if (chosen === null) return null;
        // Chosen by the writer: granted, whatever its kind (it may be read, and saved elsewhere).
        const path = await grants.grant(checkPath(chosen));
        await remember(path);
        return path;
      }),

    showSave: (event: FileEvent, suggestedName: unknown, extension: unknown) =>
      coded(async () => {
        if (!isExtension(extension)) throw new FileError('failed', 'not a file type');
        const defaultPath = join(folder(), checkName(suggestedName));
        const chosen = deps.hook
          ? nextDialogAnswer(deps.hook, { kind: 'save', defaultPath, extension })
          : await deps.showSaveDialog(event, defaultPath, extension);
        if (chosen === null) return null;
        const path = await grants.grant(saveTarget(checkPath(chosen), extension));
        if (extension === '.fdx') exportsChosen.add(await grants.allowed(path));
        await remember(path);
        return path;
      }),

    /**
     * The preload's: a dropped file's path. Granted only if it is an existing script; the read
     * that follows it waits for this (`Grants.pend`).
     */
    grantDropped: (_event: FileEvent, path: unknown) => grants.pend(grantScript(path)),

    read: (_event: FileEvent, path: unknown) =>
      coded(async () => readFileAt(await grants.allowed(path))),

    write: (_event: FileEvent, path: unknown, bytes: unknown) =>
      coded(async () => {
        const data = checkBytes(bytes);
        const real = await grants.allowed(path);
        // Only what the app makes: a script, or an export. (writeAtomic refuses a non-file.)
        if (!hasExtension(real, WRITE_EXTENSIONS)) {
          throw new FileError('not-allowed', 'not a script');
        }
        if (hasExtension(real, IMPORT_EXTENSIONS) && !exportsChosen.has(real)) {
          throw new FileError('not-allowed', 'an imported file');
        }
        // The real path as just worked out, so a link put in place after the file was chosen
        // can't redirect the write. (A swap in the instant between this check and the rename is
        // not guarded against: it takes another program running as the writer.)
        await writeAtomic(real, data);
      }),

    realPath: (_event: FileEvent, path: unknown) => coded(async () => grants.allowed(path)),

    watch: (event: FileEvent, id: unknown, path: unknown) =>
      coded(async () => {
        const key = checkId(id);
        const real = await grants.allowed(path);
        const sender = event.sender;
        const mine = watchesOf(sender);
        mine.get(key)?.();
        mine.delete(key);
        if (mine.size >= MAX_WATCHES) throw new FileError('failed', 'too many watches');
        mine.set(
          key,
          watchFile(real, () => {
            if (!sender.isDestroyed()) sender.send(deps.changedChannel ?? 'changed', key);
          }),
        );
      }),

    unwatch: (event: FileEvent, id: unknown) =>
      coded(async () => {
        const key = checkId(id);
        const mine = watches.get(event.sender);
        mine?.get(key)?.();
        mine?.delete(key);
      }),
  };
}

export type FileHandlers = ReturnType<typeof fileHandlers>;
