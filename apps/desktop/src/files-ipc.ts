// The page's file calls (DesktopFilesBridge, apps/web/app/desktop.ts), answered by the main
// process: the OS's own Open and Save dialogs, and files.ts's reads and atomic writes. Every call
// comes from one of the app's own pages (`fromApp`) and has its arguments checked before anything
// touches the disk; an error reaches the page as its code (`gone`, `failed: EIO`), nothing more.
import { dirname, join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  type FileFilter,
  type IpcMainInvokeEvent,
  ipcMain,
  type WebContents,
} from 'electron';
import { CHANNELS } from './channels';
import {
  checkBytes,
  checkPath,
  dialogHook,
  FileError,
  fileErrorOf,
  nextDialogAnswer,
  readFileAt,
  realPathOf,
  rememberFolder,
  saveTarget,
  startFolder,
  watchFile,
  writeAtomic,
} from './files';
import { fromApp } from './window';

type SaveExtension = '.fountain' | '.md' | '.txt' | '.pdf';

const SAVE_FILTERS: Record<SaveExtension, FileFilter> = {
  '.fountain': { name: 'Fountain script', extensions: ['fountain'] },
  '.md': { name: 'Markdown document', extensions: ['md', 'markdown'] },
  '.txt': { name: 'Plain text', extensions: ['txt'] },
  '.pdf': { name: 'PDF', extensions: ['pdf'] },
};
const ALL_FILES: FileFilter = { name: 'All files', extensions: ['*'] };
const OPEN_FILTERS: FileFilter[] = [
  {
    name: 'Fountain script, Markdown document, or text',
    extensions: ['fountain', 'md', 'markdown', 'txt'],
  },
  ALL_FILES,
];

const isExtension = (value: unknown): value is SaveExtension =>
  typeof value === 'string' && Object.hasOwn(SAVE_FILTERS, value);

/** A file name the page suggests: its last part only, never a path; at most 255 characters. */
function checkName(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\0')) {
    throw new FileError('failed', 'not a file name');
  }
  const name = value.split(/[\\/]/).at(-1)?.slice(0, 255) ?? '';
  return name === '' || name === '.' || name === '..' ? 'Untitled' : name;
}

/** How many files one page may watch at once (it watches one: the open script's). */
const MAX_WATCHES = 32;

/**
 * Registers the handlers. Call once, on `ready`, before the first window opens. An unpackaged app
 * run by the e2e suite answers its dialogs from `DRAFTER_E2E_DIALOG`'s queue instead of showing them.
 */
export function registerFileIpc(): void {
  const settings = join(app.getPath('userData'), 'desktop-settings.json');
  const hook = dialogHook(app.isPackaged, process.env);

  const folder = () => {
    let documents = app.getPath('home');
    try {
      documents = app.getPath('documents');
    } catch {
      // No Documents folder on this system: home.
    }
    return startFolder(settings, documents, app.getPath('home'));
  };
  const remember = (path: string) => rememberFolder(settings, dirname(path)).catch(() => {});

  /** An invoke handler that answers only the app's pages, and says only an error's code. */
  function handle(
    channel: string,
    answer: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>,
  ) {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!fromApp(event)) throw new Error('not-allowed');
      try {
        return await answer(event, ...args);
      } catch (error) {
        // A new Error with the code alone: the page never sees a stack, or a path it didn't send.
        throw new Error(fileErrorOf(error).message);
      }
    });
  }

  const windowOf = (event: IpcMainInvokeEvent) => BrowserWindow.fromWebContents(event.sender);

  handle(CHANNELS.filesShowOpen, async (event) => {
    const defaultPath = folder();
    let chosen: string | null;
    if (hook) {
      chosen = nextDialogAnswer(hook, { kind: 'open', defaultPath });
    } else {
      const options = {
        title: 'Open',
        defaultPath,
        properties: ['openFile' as const],
        filters: OPEN_FILTERS,
      };
      const window = windowOf(event);
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      chosen = result.canceled ? null : (result.filePaths[0] ?? null);
    }
    if (chosen === null) return null;
    const path = checkPath(chosen);
    await remember(path);
    return path;
  });

  handle(CHANNELS.filesShowSave, async (event, suggestedName, extension) => {
    if (!isExtension(extension)) throw new FileError('failed', 'not a file type');
    const defaultPath = join(folder(), checkName(suggestedName));
    let chosen: string | null;
    if (hook) {
      chosen = nextDialogAnswer(hook, { kind: 'save', defaultPath, extension });
    } else {
      const options = {
        title: 'Save',
        defaultPath,
        filters: [SAVE_FILTERS[extension], ALL_FILES],
        properties: ['createDirectory' as const, 'showOverwriteConfirmation' as const],
      };
      const window = windowOf(event);
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      chosen = result.canceled || !result.filePath ? null : result.filePath;
    }
    if (chosen === null) return null;
    const path = saveTarget(checkPath(chosen), extension);
    await remember(path);
    return path;
  });

  handle(CHANNELS.filesRead, async (_event, path) => readFileAt(checkPath(path)));

  handle(CHANNELS.filesWrite, async (_event, path, bytes) => {
    await writeAtomic(checkPath(path), checkBytes(bytes));
  });

  handle(CHANNELS.filesRealPath, async (_event, path) => realPathOf(checkPath(path)));

  // Watches, by page: each stops when the page asks, reloads, or goes.
  const watches = new Map<WebContents, Map<number, () => void>>();
  const stopAll = (contents: WebContents) => {
    for (const stop of watches.get(contents)?.values() ?? []) stop();
    watches.delete(contents);
  };
  const watchesOf = (contents: WebContents) => {
    let mine = watches.get(contents);
    if (!mine) {
      mine = new Map();
      watches.set(contents, mine);
      contents.once('destroyed', () => stopAll(contents));
      contents.on('did-navigate', () => stopAll(contents));
    }
    return mine;
  };
  const checkId = (value: unknown): number => {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      throw new FileError('failed', 'not a watch');
    }
    return value as number;
  };

  handle(CHANNELS.filesWatch, async (event, id, path) => {
    const key = checkId(id);
    const file = checkPath(path);
    const contents = event.sender;
    const mine = watchesOf(contents);
    mine.get(key)?.();
    if (mine.size >= MAX_WATCHES) throw new FileError('failed', 'too many watches');
    mine.set(
      key,
      watchFile(file, () => {
        if (!contents.isDestroyed()) contents.send(CHANNELS.filesChanged, key);
      }),
    );
  });

  handle(CHANNELS.filesUnwatch, async (event, id) => {
    const key = checkId(id);
    const mine = watches.get(event.sender);
    mine?.get(key)?.();
    mine?.delete(key);
  });
}
