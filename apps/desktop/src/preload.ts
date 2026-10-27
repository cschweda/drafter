// The preload: the only bridge between the page and the main process. It runs sandboxed and
// context-isolated, before the page's scripts, and puts one object on the page's window:
// `window.drafterDesktop`, typed by apps/web/app/desktop.ts (`DesktopBridge`), which is where the
// web app reads it. Plain data and named calls only; the page never gets `ipcRenderer` itself.
//
// Later tasks add calls here (the menu, closing, updates), each a named `ipcRenderer.invoke`
// or a listener that hands the page plain data, never Electron's event object.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopBridge, DesktopFilesBridge } from '../../web/app/desktop';
import { CHANNELS, type RendererReport, VERSION_ARG } from './channels';

const version =
  process.argv.find((arg) => arg.startsWith(VERSION_ARG))?.slice(VERSION_ARG.length) ?? '';

/**
 * Invokes a main-process handler. Its error reaches the page as the main process's message alone
 * (`gone`, `failed: EIO`), without what Electron puts before it.
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, ''));
  }
}

/** The page's watch callbacks, by id; main says which changed (`filesChanged`). */
const watchers = new Map<number, () => void>();
let lastWatch = 0;
ipcRenderer.on(CHANNELS.filesChanged, (_event, id: unknown) => {
  if (typeof id === 'number') watchers.get(id)?.();
});

const files: DesktopFilesBridge = {
  showOpen: () => invoke(CHANNELS.filesShowOpen),
  showSave: (suggestedName, extension) => invoke(CHANNELS.filesShowSave, suggestedName, extension),
  read: (path) => invoke(CHANNELS.filesRead, path),
  write: (path, bytes) => invoke(CHANNELS.filesWrite, path, bytes),
  realPath: (path) => invoke(CHANNELS.filesRealPath, path),
  // A dropped file's path is known only here, in the renderer (Electron removed `File.path`), and
  // only for a real file on disk: a page can't make a File with a path. The main process is told,
  // so it may grant it (if it is a script) before the page reads it; the read waits for that.
  pathOfDropped: (file) => {
    let path = '';
    try {
      path = webUtils.getPathForFile(file);
    } catch {
      return '';
    }
    if (path) invoke(CHANNELS.filesGrantDropped, path).catch(() => {});
    return path;
  },
  watch(path, onChange) {
    const id = ++lastWatch;
    watchers.set(id, onChange);
    invoke(CHANNELS.filesWatch, id, path).catch(() => watchers.delete(id));
    return () => {
      if (!watchers.delete(id)) return;
      invoke(CHANNELS.filesUnwatch, id).catch(() => {});
    };
  },
};

const bridge: DesktopBridge = { version, platform: process.platform, files };

contextBridge.exposeInMainWorld('drafterDesktop', bridge);

const report: RendererReport = {
  sandboxed: process.sandboxed === true,
  contextIsolated: process.contextIsolated === true,
};
ipcRenderer.send(CHANNELS.rendererReport, report);
