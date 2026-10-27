// The app's windows and the rules every one of them follows (docs/drafter-desktop-design.md §2;
// Plan 6's Global Constraints): sandboxed and context-isolated, no Node in the page, nothing loaded
// but app://drafter/, and nothing opened but the app's own pages (in a window of their own) and
// https addresses (in the system browser).
import { appendFileSync } from 'node:fs';
import {
  app,
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  shell,
  type WebContents,
} from 'electron';
import { VERSION_ARG } from './channels';
import { APP_URL, navigationFor } from './protocol';

/** The brand's dark chrome, so a window never flashes white before the page draws. */
const BACKGROUND = '#0F1013';

/** The options every app window gets: the main one, and a help page opened from it. */
export function windowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    title: 'Drafter',
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 480,
    backgroundColor: BACKGROUND,
    show: false,
    webPreferences: {
      preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      // macOS checks spelling with the system's checker; Linux with the dictionary the app brings
      // (spellcheck.ts), never one downloaded. The Spellcheck setting turns it off in the editor.
      spellcheck: true,
      additionalArguments: [`${VERSION_ARG}${app.getVersion()}`],
    },
  };
}

/** Opens the main window on the app. */
export function createMainWindow(preload: string): BrowserWindow {
  const window = new BrowserWindow(windowOptions(preload));
  window.once('ready-to-show', () => window.show());
  void window.loadURL(APP_URL);
  return window;
}

/**
 * Hands an https address to the system browser, and nothing else. An unpackaged app run by the
 * e2e suite writes it to `DRAFTER_E2E_EXTERNAL_LOG` instead, so a test never opens a browser.
 */
export function openExternal(url: string): void {
  if (navigationFor(url) !== 'external') return;
  const log = app.isPackaged ? undefined : process.env.DRAFTER_E2E_EXTERNAL_LOG;
  if (log) {
    appendFileSync(log, `${url}\n`);
    return;
  }
  void shell.openExternal(url);
}

/**
 * Applies the navigation rules to a window's contents: it stays on app://drafter/; an https link
 * goes to the system browser; `window.open` of an app page opens a window of the app's own (with
 * these same rules), and of anything else, nothing. main.ts calls this for every window created.
 */
export function guard(contents: WebContents, preload: string): void {
  contents.on('will-frame-navigate', (event) => {
    const where = navigationFor(event.url);
    if (where === 'app') return;
    event.preventDefault();
    if (where === 'external' && event.isMainFrame) openExternal(event.url);
  });
  contents.on('will-redirect', (event) => {
    if (navigationFor(event.url) !== 'app') event.preventDefault();
  });
  contents.setWindowOpenHandler(({ url }) => {
    const where = navigationFor(url);
    if (where === 'app') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { ...windowOptions(preload), show: true },
      };
    }
    if (where === 'external') openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
}

/** Whether an IPC message came from one of the app's own pages (not a frame from elsewhere). */
export function fromApp(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return navigationFor(event.senderFrame?.url ?? '') === 'app';
}

/**
 * Whether an IPC message came from the editor's own page: its main frame, not a help window or a
 * frame inside it. Only that page speaks for the script, so only it is asked or heard on closing.
 */
export function fromEditor(
  event: IpcMainEvent | IpcMainInvokeEvent,
  editor: WebContents | null | undefined,
): boolean {
  if (!editor || editor.isDestroyed()) return false;
  return fromApp(event) && event.sender === editor && event.senderFrame === editor.mainFrame;
}
