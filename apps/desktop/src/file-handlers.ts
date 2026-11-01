// What the main process answers to the page's file calls (DesktopFilesBridge,
// apps/web/app/desktop.ts), without Electron: files-ipc.ts registers these with ipcMain (after
// checking the sender is an app page) and supplies the OS's dialogs. The unit tests call them as
// ipcMain would, with a stand-in event, so they are what a compromised page could ask for.
//
// Every argument is checked before anything touches the disk, and every path must have been
// granted (grants.ts): chosen in a dialog, dropped, or named on the command line. A drop is never
// granted by a path the page sends: the preload's own listener tells main what was dropped
// (`registerDrop`), and the page can only claim one of those by the opaque id it was given. A write also
// goes only to a regular file with a script's or an export's extension, and a Final Draft file
// only where the writer chose one in a Save dialog (an export, never an imported file). A Highland
// or Fade In file is never written at all.
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { besideHandlers } from './beside';
import {
  checkBytes,
  checkPath,
  dialogHook,
  EXPORT_ONLY_EXTENSIONS,
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

export type SaveExtension = '.fountain' | '.md' | '.txt' | '.pdf' | '.html' | '.epub' | '.fdx';
const SAVE_EXTENSIONS: readonly string[] = [
  '.fountain',
  '.md',
  '.txt',
  '.pdf',
  '.html',
  '.epub',
  '.fdx',
];
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

/** How many files one drop may hand over, and how many unclaimed drops a page may hold. */
const MAX_DROPS = 64;
/** How long a drop waits to be claimed: the page claims it in the same event, at once. */
const DROP_LIFETIME_MS = 60_000;

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
  const beside = besideHandlers(grants);
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

  // The Final Draft files, HTML pages, and EPUBs the writer chose in a Save dialog for one (an
  // export), by real path. Any other `.fdx` was opened to be imported, and any other `.html` or
  // `.epub` was opened by mistake (Open refuses it), and none is ever written: a script saves as a
  // .fountain.
  const exportsChosen = new Set<string>();

  // Drops the preload saw, by the id the page was given for each: whose page, which file, when.
  // Claimed once, by that page, within DROP_LIFETIME_MS.
  const drops = new Map<string, { sender: FileSender; path: string; at: number }>();
  const forgetStaleDrops = (now: number) => {
    for (const [id, drop] of drops) {
      if (now - drop.at > DROP_LIFETIME_MS || drop.sender.isDestroyed()) drops.delete(id);
    }
  };

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
        if (EXPORT_ONLY_EXTENSIONS.includes(extension)) {
          exportsChosen.add(await grants.allowed(path));
        }
        await remember(path);
        return path;
      }),

    /**
     * The preload's, from its own listener on the native `drop` event (a trusted one, run before
     * the page's): the dropped files' paths. Answers an opaque id for each (`''` for one that isn't
     * an absolute path); nothing is granted until the page claims the id. The page's bridge has no
     * way to call this.
     */
    registerDrop(event: FileEvent, paths: unknown): string[] {
      if (!Array.isArray(paths)) return [];
      const now = Date.now();
      forgetStaleDrops(now);
      const ids = paths.slice(0, MAX_DROPS).map((path) => {
        try {
          const id = randomUUID();
          drops.set(id, { sender: event.sender, path: checkPath(path), at: now });
          return id;
        } catch {
          return '';
        }
      });
      // At most MAX_DROPS waiting per page: the oldest go first.
      const mine = [...drops].filter(([, drop]) => drop.sender === event.sender);
      for (const [id] of mine.slice(0, Math.max(0, mine.length - MAX_DROPS))) drops.delete(id);
      return ids;
    },

    /**
     * The page's: claims a drop by its id, once. Granted only if it is an existing script (or a
     * file to import); resolves with its path, which the page then reads like an Open's.
     */
    claimDrop: (event: FileEvent, id: unknown) =>
      coded(async () => {
        forgetStaleDrops(Date.now());
        const drop = typeof id === 'string' ? drops.get(id) : undefined;
        if (!drop || drop.sender !== event.sender)
          throw new FileError('not-allowed', 'not dropped');
        drops.delete(id as string);
        return grantScript(drop.path);
      }),

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
        if (
          (hasExtension(real, IMPORT_EXTENSIONS) || hasExtension(real, EXPORT_ONLY_EXTENSIONS)) &&
          !exportsChosen.has(real)
        ) {
          throw new FileError('not-allowed', 'an imported file, a page, or a book');
        }
        // The real path as just worked out, so a link put in place after the file was chosen
        // can't redirect the write. (A swap in the instant between this check and the rename is
        // not guarded against: it takes another program running as the writer.)
        await writeAtomic(real, data);
      }),

    realPath: (_event: FileEvent, path: unknown) => coded(async () => grants.allowed(path)),

    /** Drafts and cuts beside a granted script, never through a link (beside.ts). */
    writeBeside: (
      _event: FileEvent,
      script: unknown,
      rel: unknown,
      bytes: unknown,
      mode: unknown,
    ) => beside.writeBeside(script, rel, bytes, mode),
    readBeside: (_event: FileEvent, script: unknown, rel: unknown) =>
      beside.readBeside(script, rel),
    listBeside: (_event: FileEvent, script: unknown, folder: unknown) =>
      beside.listBeside(script, folder),

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
