// The preload: the only bridge between the page and the main process. It runs sandboxed and
// context-isolated, before the page's scripts, and puts one object on the page's window:
// `window.drafterDesktop`, typed by apps/web/app/desktop.ts (`DesktopBridge`), which is where the
// web app reads it. Plain data and named calls only; the page never gets `ipcRenderer` itself.
//
// Later tasks add calls here (the menu, closing, updates), each a named `ipcRenderer.invoke`
// or a listener that hands the page plain data, never Electron's event object.
import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  DesktopBridge,
  DesktopCloseHandlers,
  DesktopFilesBridge,
} from '../../web/app/desktop';
import { CHANNELS, type CloseRequestKind, type RendererReport, VERSION_ARG } from './channels';

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

/** What main sends on `openItem` (open-files.ts `OpenItem`): a file to open, or why one wasn't. */
function itemOf(value: unknown): { path?: string; problem?: string } {
  if (typeof value !== 'object' || value === null) return {};
  const { path, problem } = value as Record<string, unknown>;
  return {
    ...(typeof path === 'string' ? { path } : {}),
    ...(typeof problem === 'string' ? { problem } : {}),
  };
}

/** The page's answers to close requests (DesktopCloseHandlers), while it listens. */
let closing: DesktopCloseHandlers | null = null;
ipcRenderer.on(CHANNELS.closeRequest, async (_event, id: unknown, kind: unknown) => {
  if (typeof id !== 'number') return;
  const handlers = closing;
  try {
    if (!handlers) throw new Error('not listening');
    const asked = kind as CloseRequestKind;
    let value: unknown;
    if (asked === 'state') value = await handlers.state();
    else if (asked === 'save') value = await handlers.save();
    else if (asked === 'flush') {
      await handlers.flush();
      value = true;
    } else throw new Error('unknown request');
    ipcRenderer.send(CHANNELS.closeReply, id, true, value);
  } catch {
    ipcRenderer.send(CHANNELS.closeReply, id, false, null);
  }
});

const bridge: DesktopBridge = {
  version,
  platform: process.platform,
  // For About Drafter: the processor, and the Electron and Chromium this is.
  runtime: {
    arch: process.arch,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
  },
  files,
  // The menu bar: the page sends its commands (which of them apply, and their keys), main builds
  // the menu from them, and the id of a chosen item comes back for the page to run.
  menu: {
    setCommands(list) {
      ipcRenderer.send(CHANNELS.menuCommands, list);
    },
    onCommand(onRun) {
      const listener = (_event: unknown, id: unknown) => {
        if (typeof id === 'string') onRun(id);
      };
      ipcRenderer.on(CHANNELS.menuRun, listener);
      return () => {
        ipcRenderer.removeListener(CHANNELS.menuRun, listener);
      };
    },
  },
  // Closing: main asks, the page answers (and Saves or flushes when told to). Telling main we
  // answer is what lets it ask rather than close at once.
  onCloseRequest(handlers) {
    closing = handlers;
    ipcRenderer.send(CHANNELS.closeReady, true);
    return () => {
      if (closing !== handlers) return;
      closing = null;
      ipcRenderer.send(CHANNELS.closeReady, false);
    };
  },
  // A help window's Back to Drafter: main focuses the editor's window and closes this one.
  backToEditor() {
    ipcRenderer.send(CHANNELS.backToEditor);
  },
  // Updates: main finds a newer version once, when the app starts (if the setting is on), or when
  // the writer asks (Help → Check for updates), and says so; Restart and Get it are the writer's
  // choices, sent back. Nothing installs by itself.
  updates: {
    onAvailable(cb) {
      const listener = (_event: unknown, version: unknown, how: unknown) => {
        if (typeof version === 'string' && (how === 'restart' || how === 'get')) cb(version, how);
      };
      ipcRenderer.on(CHANNELS.updateOffer, listener);
      ipcRenderer.send(CHANNELS.updateListen, true);
      return () => {
        ipcRenderer.removeListener(CHANNELS.updateOffer, listener);
        ipcRenderer.send(CHANNELS.updateListen, false);
      };
    },
    install: () => invoke<void>(CHANNELS.updateInstall),
    openReleasePage() {
      ipcRenderer.send(CHANNELS.updateOpenRelease);
    },
    setEnabled(on) {
      ipcRenderer.send(CHANNELS.updateEnabled, on === true);
    },
    // Help → Check for updates: a check now, answered with what it found (plain data).
    check: () => invoke(CHANNELS.updateCheck),
  },
  // The modules folder: what main read at start, and the origins the writer agreed to for a module
  // (main keeps only those its module.json declares, and lets only that module's frames reach them).
  modules: {
    list: () => invoke(CHANNELS.modulesList),
    setNetwork: (id, origins) => invoke<void>(CHANNELS.modulesSetNetwork, id, [...origins]),
  },
  // Files the system names (the command line, a second launch, macOS's open-file): main granted
  // each before sending it. Telling main we listen is what lets it send those it was holding.
  onOpenFile(onPath, onProblem) {
    const listener = (_event: unknown, value: unknown) => {
      const item = itemOf(value);
      if (item.path !== undefined) onPath(item.path);
      else if (item.problem !== undefined) onProblem?.(item.problem);
    };
    ipcRenderer.on(CHANNELS.openItem, listener);
    ipcRenderer.send(CHANNELS.openReady);
    return () => {
      ipcRenderer.removeListener(CHANNELS.openItem, listener);
    };
  },
};

contextBridge.exposeInMainWorld('drafterDesktop', bridge);

const report: RendererReport = {
  sandboxed: process.sandboxed === true,
  contextIsolated: process.contextIsolated === true,
};
ipcRenderer.send(CHANNELS.rendererReport, report);
