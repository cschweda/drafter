// Drafter's main process: one instance, one window, the web build served from the app's own files
// at app://drafter/ (docs/drafter-desktop-design.md §2). Built to dist/main.cjs by tsdown.
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  app,
  type BrowserWindow,
  dialog,
  ipcMain,
  protocol,
  session,
  type WebContents,
} from 'electron';
import { CHANNELS, type RendererReport } from './channels';
import { type Closing, setUpClosing } from './close';
import { FileError } from './files';
import { type FileAccessMain, registerFileIpc } from './files-ipc';
import { setUpMenu } from './menu-main';
import { refuseNetwork } from './network';
import { NOT_A_SCRIPT, OpenInbox, refusalsMessage, requestsFromArgs } from './open-files';
import { denyPermissions } from './permissions';
import { appHandler, cspFromHeaders, forwardedHeaders, SCHEME } from './protocol';
import { type Spellcheck, setUpSpellcheck } from './spellcheck';
import { createMainWindow, fromApp, guard } from './window';

// The e2e suite gives each test its own profile. Only an unpackaged app honours it, so an
// installed Drafter's profile can't be moved by an environment variable.
if (!app.isPackaged && process.env.DRAFTER_USER_DATA) {
  app.setPath('userData', process.env.DRAFTER_USER_DATA);
}

// Every renderer sandboxed, whatever a window's options say.
app.enableSandbox();

// Before `ready`: `standard` gives the scheme an origin (app://drafter), so IndexedDB,
// localStorage, and relative URLs work; `secure` makes it a secure context; `supportFetchAPI` lets
// fetch() and module workers load from it. No service workers (the desktop build has none).
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      codeCache: true,
    },
  },
]);

/** The preload, beside this file in dist/. */
const PRELOAD = join(__dirname, 'preload.cjs');
/** The web build, copied into the app by `pnpm build:web`. */
const WEB = join(app.getAppPath(), 'web');
/** The spellchecker's dictionaries, for Linux (spellcheck.ts). */
const DICTIONARIES = join(app.getAppPath(), 'dictionaries');

/** What each renderer's preload reported, by webContents id (read by the e2e suite). */
const renderers = new Map<number, RendererReport>();
/** How spelling is checked, and the dictionary downloads Chromium began (none, ever). */
const spelling = { mode: 'off' as Spellcheck, downloads: [] as string[] };
Object.assign(globalThis, {
  drafterShell: {
    renderers: () => [...renderers.values()],
    spellcheck: () => ({ ...spelling, downloads: [...spelling.downloads] }),
  },
});

function start() {
  let main: BrowserWindow | null = null;
  let started = false;

  /** Brings the editor's window forward: restored, shown, focused (opened again if it is gone). */
  const bringForward = () => {
    if (!started) return;
    if (!main || main.isDestroyed()) {
      openMain();
      return;
    }
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
  };

  // What the system asks to open waits here until the editor's page is listening for it.
  const inbox = new OpenInbox(CHANNELS.openItem, bringForward);
  let files: FileAccessMain | null = null;
  let begin: () => void = () => {};
  const begun = new Promise<void>((resolve) => {
    begin = resolve;
  });
  let queue: Promise<void> = Promise.resolve();

  /**
   * Opens the scripts among `args` (relative paths from `cwd`): each is granted to the page first
   * (the page may read only what the writer chose), then sent; the others are said, with why.
   * One request at a time, in the order they came.
   */
  const openFromSystem = (args: string[], cwd: string) => {
    queue = queue
      .then(async () => {
        await begun;
        if (!files) return;
        const ignore = [app.getAppPath(), process.execPath, process.env.APPIMAGE ?? ''].filter(
          Boolean,
        );
        const { files: scripts, refused } = requestsFromArgs(args, cwd, ignore);
        for (const path of scripts) {
          try {
            await files.grant(path);
            inbox.add({ path });
          } catch (error) {
            const notScript = error instanceof FileError && error.code === 'not-allowed';
            refused.push({
              name: basename(path),
              reason: notScript ? NOT_A_SCRIPT : 'it can’t be read',
            });
          }
        }
        // After the files: opening one clears the status bar's message. One message for all
        // the refusals, since the status bar shows one.
        if (refused.length > 0) inbox.add({ problem: refusalsMessage(refused) });
      })
      .catch(() => {});
  };

  // macOS: a file double-clicked, dropped on the Dock icon, or opened with Drafter. It can arrive
  // before `ready`, which is why requests wait for `begun`. (Untested until the macOS build.)
  app.on('open-file', (event, path) => {
    event.preventDefault();
    openFromSystem([path], process.cwd());
  });

  // Only the editor's own window takes what the system names (not a help window), and not while
  // it is navigating: a reload begins, and what arrives meanwhile waits for the next openReady.
  const navigating = new WeakSet<WebContents>();
  ipcMain.on(CHANNELS.openReady, (event) => {
    if (!fromApp(event) || !main || main.isDestroyed()) return;
    const page = event.sender;
    if (page !== main.webContents) return;
    if (!navigating.has(page)) {
      navigating.add(page);
      page.on('did-start-navigation', (details) => {
        if (details.isMainFrame && !details.isSameDocument) inbox.forget(page);
      });
    }
    inbox.listen(page);
  });

  // Closing the editor's window and quitting ask the page first (close.ts). Set up on `ready`.
  let closing: Closing | null = null;

  /** Opens the editor's window, and keeps it as the one a second launch brings forward. */
  const openMain = () => {
    const window = createMainWindow(PRELOAD);
    closing?.attach(window);
    window.on('closed', () => {
      if (main === window) main = null;
    });
    main = window;
    return window;
  };

  // A second launch brings the editor's window forward, or opens it again if it was closed while
  // another window (a help page) kept the app running, and opens the files it names there.
  app.on('second-instance', (_event, argv, workingDirectory) => {
    bringForward();
    openFromSystem(argv.slice(1), workingDirectory);
  });

  app.on('web-contents-created', (_event, contents) => {
    if (contents.getType() === 'window') guard(contents, PRELOAD);
    contents.on('destroyed', () => renderers.delete(contents.id));
  });

  ipcMain.on(CHANNELS.rendererReport, (event, report: RendererReport) => {
    if (!fromApp(event)) return;
    renderers.set(event.sender.id, {
      sandboxed: report?.sandboxed === true,
      contextIsolated: report?.contextIsolated === true,
    });
  });

  app.on('window-all-closed', () => {
    // No window is left to hold a script, so there is nothing to ask.
    closing?.quitNow();
    app.quit();
  });

  void app.whenReady().then(() => {
    let csp: string | null = null;
    try {
      csp = cspFromHeaders(readFileSync(join(WEB, '_headers'), 'utf8'));
    } catch {
      // Reported below.
    }
    if (!csp) {
      dialog.showErrorBox(
        'Drafter can’t start',
        `Its files are missing or incomplete (no content security policy in ${join(WEB, '_headers')}). Reinstall Drafter, or run \`pnpm build:web\` in apps/desktop.`,
      );
      app.exit(1);
      return;
    }
    // Before any page exists: what it may ask for, what it may reach, and the dictionary it
    // checks spelling with (Chromium would otherwise fetch one from Google for the first page).
    const ses = session.defaultSession;
    denyPermissions(ses);
    refuseNetwork(ses);
    ses.on('spellcheck-dictionary-download-begin', (_event, language) => {
      spelling.downloads.push(language);
    });
    try {
      spelling.mode = setUpSpellcheck(ses, {
        platform: process.platform,
        dictionaries: DICTIONARIES,
        userData: app.getPath('userData'),
      });
    } catch {
      ses.setSpellCheckerEnabled(false);
      spelling.mode = 'off';
    }
    let headers: Record<string, string> = {};
    try {
      headers = forwardedHeaders(readFileSync(join(WEB, '_headers'), 'utf8'));
    } catch {
      // The CSP was read above; without the others the app still runs as before.
    }
    protocol.handle(SCHEME, appHandler(WEB, csp, headers));
    files = registerFileIpc();
    setUpMenu(() => main);
    closing = setUpClosing(() => main);
    started = true;
    openMain();
    begin();
    // The files named on the command line: held until the page is up and listening.
    openFromSystem(process.argv.slice(1), process.cwd());
  });
}

if (app.requestSingleInstanceLock()) start();
else app.quit();
