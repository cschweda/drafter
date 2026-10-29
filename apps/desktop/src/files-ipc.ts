// The page's file calls (DesktopFilesBridge, apps/web/app/desktop.ts), registered with ipcMain:
// file-handlers.ts answers them; this file adds Electron's part, the OS's own Open and Save
// dialogs, and refuses a call from anything but one of the app's own pages (`fromApp`). An error
// reaches the page as its code (`gone`, `not-allowed: not chosen`, `failed: EIO`), nothing more.
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  type FileFilter,
  type IpcMainInvokeEvent,
  ipcMain,
} from 'electron';
import { CHANNELS } from './channels';
import { type FileEvent, fileHandlers, type SaveExtension } from './file-handlers';
import { dialogHook, fileErrorOf } from './files';
import { Grants } from './grants';
import { fromApp } from './window';

const SAVE_FILTERS: Record<SaveExtension, FileFilter> = {
  '.fountain': { name: 'Fountain script', extensions: ['fountain'] },
  '.md': { name: 'Markdown document', extensions: ['md', 'markdown'] },
  '.txt': { name: 'Plain text', extensions: ['txt'] },
  '.pdf': { name: 'PDF', extensions: ['pdf'] },
  '.fdx': { name: 'Final Draft file', extensions: ['fdx'] },
};
const ALL_FILES: FileFilter = { name: 'All files', extensions: ['*'] };
const OPEN_FILTERS: FileFilter[] = [
  {
    name: 'Fountain script, Markdown document, text, or Final Draft file',
    extensions: ['fountain', 'md', 'markdown', 'txt', 'fdx'],
  },
  ALL_FILES,
];

const windowOf = (event: FileEvent) =>
  BrowserWindow.fromWebContents((event as IpcMainInvokeEvent).sender);

/** What the rest of the main process may do with files: grant one the writer named (Task 3). */
export interface FileAccessMain {
  /**
   * Grants an existing script the writer named outside the page (the command line, a second
   * launch, a file double-clicked): the page may then open and save it. Rejects anything that
   * isn't a readable script (`.fountain`, `.md`, `.markdown`, `.txt`) or Final Draft file (`.fdx`).
   */
  grant(path: string): Promise<string>;
}

/**
 * Registers the handlers. Call once, on `ready`, before the first window opens. An unpackaged app
 * run by the e2e suite answers its dialogs from `DRAFTER_E2E_DIALOG`'s queue instead of showing them.
 */
export function registerFileIpc(): FileAccessMain {
  const userData = app.getPath('userData');
  const handlers = fileHandlers({
    grants: new Grants(join(userData, 'granted-files.json')),
    settingsFile: join(userData, 'desktop-settings.json'),
    documents: () => {
      try {
        return app.getPath('documents');
      } catch {
        return app.getPath('home');
      }
    },
    home: app.getPath('home'),
    hook: dialogHook(app.isPackaged, process.env),
    changedChannel: CHANNELS.filesChanged,
    async showOpenDialog(event, defaultPath) {
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
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    async showSaveDialog(event, defaultPath, extension) {
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
      return result.canceled || !result.filePath ? null : result.filePath;
    },
  });

  /** An invoke handler that answers only the app's pages, and says only an error's code. */
  function handle(channel: string, answer: (event: FileEvent, ...args: unknown[]) => unknown) {
    ipcMain.handle(channel, async (event, ...args: unknown[]) => {
      if (!fromApp(event)) throw new Error('not-allowed');
      try {
        return await answer(event as unknown as FileEvent, ...args);
      } catch (error) {
        // A new Error with the code alone: the page never sees a stack, or a path it didn't send.
        throw new Error(fileErrorOf(error).message);
      }
    });
  }

  handle(CHANNELS.filesShowOpen, (event) => handlers.showOpen(event));
  handle(CHANNELS.filesShowSave, (event, name, extension) =>
    handlers.showSave(event, name, extension),
  );
  // Answered at once (the grant is kept pending); a refused drop opens unbound, from its bytes.
  handle(CHANNELS.filesGrantDropped, (event, path) => {
    void handlers.grantDropped(event, path);
  });
  handle(CHANNELS.filesRead, (event, path) => handlers.read(event, path));
  handle(CHANNELS.filesWrite, (event, path, bytes) => handlers.write(event, path, bytes));
  handle(CHANNELS.filesRealPath, (event, path) => handlers.realPath(event, path));
  handle(CHANNELS.filesWatch, (event, id, path) => handlers.watch(event, id, path));
  handle(CHANNELS.filesUnwatch, (event, id) => handlers.unwatch(event, id));

  return { grant: (path) => handlers.grantScript(path) };
}
