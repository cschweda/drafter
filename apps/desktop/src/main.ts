// Drafter's main process: one instance, one window, the web build served from the app's own files
// at app://drafter/ (docs/drafter-desktop-design.md §2). Built to dist/main.cjs by tsdown.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
  type WebContents,
} from 'electron';
import { CHANNELS, type RendererReport } from './channels';
import { type Closing, setUpClosing } from './close';
import { contextMenuTemplate } from './context-menu';
import { FileError } from './files';
import { type FileAccessMain, registerFileIpc } from './files-ipc';
import { heldLaunches, onSecondInstance, takeInstanceLock } from './instance';
import { setUpMenu } from './menu-main';
import {
  agreedOrigins,
  appCspWithModules,
  type LoadedModule,
  MODULE_SCHEME,
  moduleHandler,
  readModulesFolder,
} from './module-folder';
import { refuseNetwork } from './network';
import {
  heldOpenFiles,
  NOT_A_SCRIPT,
  OpenInbox,
  refusalsMessage,
  requestsFromArgs,
} from './open-files';
import { denyPermissions } from './permissions';
import { appHandler, cspFromHeaders, forwardedHeaders, SCHEME } from './protocol';
import { CONTINUE, QUIT, rememberAnswer, sandboxNotice } from './sandbox';
import { type Spellcheck, seedDictionaries, setUpSpellcheck } from './spellcheck';
import { setUpUpdates } from './updates-main';
import { proxyForGrants, WEBRTC_POLICY } from './webrtc';
import { createMainWindow, fromApp, guard } from './window';

// The app's name, before anything asks for it: the profile folder (userData), the macOS menu's
// Hide/Quit items, and About. package.json's productName says the same; this holds however the app
// is started (`electron .`, `electron dist/main.cjs`). An unpackaged app on macOS still shows
// "Electron" as the menu bar's bold title, which comes from Electron.app's own bundle.
app.setName('Drafter');

// The e2e suite gives each test its own profile. Only an unpackaged app honours it, so an
// installed Drafter's profile can't be moved by an environment variable.
if (!app.isPackaged && process.env.DRAFTER_USER_DATA) {
  app.setPath('userData', process.env.DRAFTER_USER_DATA);
}

// A packaged app whose sandbox was turned off (an AppImage launcher does it on a system that blocks
// user namespaces) explains, and asks once whether to continue (see `askAboutSandbox`).
// Looked at before `enableSandbox`, which hides `--no-sandbox` from `app.commandLine` without
// turning it off: the switch still reaches Chromium's child processes.
const sandboxQuestion = sandboxNotice(
  {
    platform: process.platform,
    packaged: app.isPackaged,
    hasSwitch: (name) => app.commandLine.hasSwitch(name),
    argv: process.argv,
    env: process.env,
  },
  app.getPath('userData'),
);

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
  // The modules folder's scheme (module-folder.ts): each module at its own origin. Fetch and CORS,
  // so a module's frame (an opaque origin) can load its own scripts; never `bypassCSP`.
  {
    scheme: MODULE_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

/** The preload, beside this file in dist/. */
const PRELOAD = join(__dirname, 'preload.cjs');
/** The web build, copied into the app by `pnpm build:web`. */
const WEB = join(app.getAppPath(), 'web');
/** The frame runtime for folder modules, beside this file in dist/ (module-runtime.ts). */
const MODULE_RUNTIME = join(__dirname, 'module-runtime.js');
/** The spellchecker's dictionaries, for Linux (spellcheck.ts). */
const DICTIONARIES = join(app.getAppPath(), 'dictionaries');

// Into the profile now, before `ready`: Chromium's spellchecker opens `<userData>/Dictionaries` on a
// thread of its own as soon as the session exists, and a copy made at `ready` lost that race (an
// strace in CI showed it reading while the copy was written), so a first start had no dictionary
// and tried to download one. setUpSpellcheck seeds again, which finds the copy and leaves it.
if (process.platform !== 'darwin') {
  try {
    seedDictionaries(DICTIONARIES, app.getPath('userData'));
  } catch {
    // setUpSpellcheck tries again, and turns spelling off if there is still no dictionary.
  }
}

/** What each renderer's preload reported, by webContents id (read by the e2e suite). */
const renderers = new Map<number, RendererReport>();
/**
 * How spelling is checked, the dictionary downloads Chromium began (none, ever), and what it said
 * about its dictionaries (`initialized en-US`, `download-failure en-US`), for the e2e suite.
 */
const spelling = { mode: 'off' as Spellcheck, downloads: [] as string[], events: [] as string[] };
/** The editor's last right-click menu, kept only by an unpackaged app (the e2e suite chooses from it). */
let lastContextMenu: Electron.Menu | null = null;
Object.assign(globalThis, {
  drafterShell: {
    contextMenu: () => lastContextMenu,
    renderers: () => [...renderers.values()],
    spellcheck: () => ({
      ...spelling,
      downloads: [...spelling.downloads],
      events: [...spelling.events],
    }),
  },
});

/**
 * Runs `carryOn` at once, unless the sandbox is off: then it explains and asks, once. Continue is
 * remembered (a file in userData named for the reason; if it can't be written, the app starts anyway) and carries on; Quit exits. The caller has
 * the single-instance lock already, so a second launch can't ask a second time.
 */
function askAboutSandbox(question: typeof sandboxQuestion, carryOn: () => void) {
  if (!question) return carryOn();
  if (existsSync(question.marker)) return carryOn();
  console.error(`${question.message}\n\n${question.detail}`);
  // Asynchronous, so the process stays responsive while the question is open.
  void app
    .whenReady()
    .then(() =>
      dialog.showMessageBox({
        type: 'warning',
        title: 'Drafter',
        message: question.message,
        detail: question.detail,
        buttons: [CONTINUE, QUIT],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      }),
    )
    .then(({ response }) => {
      if (response !== 0) return app.exit(0);
      // If the answer can't be written the question will come again next time; the app starts anyway.
      rememberAnswer(question.marker);
      carryOn();
    })
    .catch(() => app.exit(1));
}

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

  // macOS: a file double-clicked in Finder, dropped on the Dock icon, or opened with Drafter. Those
  // that came before now were held (`openFiles`); requests wait for `begun` either way. The path is
  // a path, whatever it starts with (`--`), and goes the way a launch's files go: granted, then sent.
  openFiles.deliver((path) => openFromSystem(['--', path], process.cwd()));

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

  // The modules folder, read once on `ready` (restart to add a module), and the network origins the
  // writer agreed to for each module that is on.
  let loaded: LoadedModule[] = [];
  let skipped: string[] = [];
  const grants = new Map<string, string[]>();
  const modulesDir = () => join(app.getPath('userData'), 'modules');
  const knownModule = (id: string) => loaded.some((m) => m.id === id);
  /** Help → Open Modules Folder: made if it is missing, then shown in the file manager. */
  const openModulesFolder = () => {
    const dir = modulesDir();
    try {
      // Private to the writer: a folder another user could write would be refused (module-folder.ts).
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch {
      // Shown anyway: the file manager says what is wrong.
    }
    const log = app.isPackaged ? undefined : process.env.DRAFTER_E2E_OPENED_FOLDER;
    if (log && isAbsolute(log)) {
      appendFileSync(log, `${dir}\n`);
      return;
    }
    void shell.openPath(dir);
  };
  /** Only the app's own pages, in their main frame, ask about modules. */
  const fromAppPage = (event: Electron.IpcMainInvokeEvent) =>
    fromApp(event) && event.senderFrame === event.sender.mainFrame;
  ipcMain.handle(CHANNELS.modulesList, (event) => {
    if (!fromAppPage(event)) throw new Error('not-allowed');
    return {
      modules: loaded.map(({ root: _root, ...module }) => module),
      problems: [...skipped],
    };
  });
  ipcMain.handle(CHANNELS.modulesSetNetwork, async (event, id: unknown, origins: unknown) => {
    if (!fromAppPage(event)) throw new Error('not-allowed');
    const module = loaded.find((m) => m.id === id);
    if (!module) return;
    grants.set(module.id, agreedOrigins(module.permissions.network, origins));
    // The proxy that keeps a module's frame off TURN-over-TCP bypasses the granted hosts, so a
    // module reaches its consented origins and nothing else (webrtc.ts). Awaited, so the page loads
    // the module's frames only once the proxy is in force.
    await applyModuleProxy();
  });

  /** Refuses every renderer connection but the hosts a module was granted (webrtc.ts). */
  const applyModuleProxy = () =>
    session.defaultSession.setProxy(proxyForGrants(grants)).catch(() => {});

  // Closing the editor's window and quitting ask the page first (close.ts). Set up on `ready`.
  let closing: Closing | null = null;

  /** Opens the editor's window, and keeps it as the one a second launch brings forward. */
  const openMain = () => {
    const window = createMainWindow(PRELOAD);
    closing?.attach(window);
    // The right-click menu (context-menu.ts), in the editor's window only.
    const contents = window.webContents;
    contents.on('context-menu', (_event, params) => {
      const template = contextMenuTemplate(params, {
        replace: (word) => contents.replaceMisspelling(word),
        addWord: (word) => contents.session.addWordToSpellCheckerDictionary(word),
      });
      if (template.length === 0) return;
      const menu = Menu.buildFromTemplate(template);
      if (!app.isPackaged) lastContextMenu = menu;
      menu.popup({ window });
    });
    window.on('closed', () => {
      if (main === window) main = null;
    });
    main = window;
    return window;
  };

  // A second launch brings the editor's window forward, or opens it again if it was closed while
  // another window (a help page) kept the app running, and opens the files it names there. Not
  // while quitting: that is an update's new Drafter asking for the lock (instance.ts). Launches
  // that came while the sandbox question was open were held, and are handled now.
  launches.deliver(
    onSecondInstance({
      quitting: () => closing?.quitting() ?? false,
      bringForward,
      open: openFromSystem,
    }),
  );

  app.on('web-contents-created', (_event, contents) => {
    // No renderer uses WebRTC; a module frame could otherwise reach a STUN/TURN server over UDP
    // past the CSP and the webRequest backstop (webrtc.ts). `disable_non_proxied_udp` stops that.
    contents.setWebRTCIPHandlingPolicy(WEBRTC_POLICY);
    if (contents.getType() === 'window') guard(contents, PRELOAD, knownModule);
    contents.on('destroyed', () => renderers.delete(contents.id));
  });

  // A help window's Back to Drafter: the editor's window comes forward (opened again if it was
  // closed while the help window kept the app running) and the help window goes. The editor's own
  // window is never closed by this.
  ipcMain.on(CHANNELS.backToEditor, (event) => {
    if (!fromApp(event) || event.senderFrame !== event.sender.mainFrame) return;
    if (main && !main.isDestroyed() && event.sender === main.webContents) return;
    bringForward();
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.on(CHANNELS.rendererReport, (event, report: RendererReport) => {
    if (!fromApp(event)) return;
    renderers.set(event.sender.id, {
      sandboxed: report?.sandboxed === true,
      contextIsolated: report?.contextIsolated === true,
    });
  });

  app.on('window-all-closed', () => {
    // A Mac app keeps running with no window: the Dock icon, a file opened from Finder, or Quit
    // (which asks nothing then: no page holds a script) is how it goes on.
    if (process.platform === 'darwin') return;
    // No window is left to hold a script, so there is nothing to ask.
    closing?.quitNow();
    app.quit();
  });

  // macOS: the Dock icon was clicked (or the app opened again from Finder) with no window on show:
  // the editor's window comes back.
  app.on('activate', (_event, hasVisibleWindows) => {
    if (!hasVisibleWindows) bringForward();
  });

  void app.whenReady().then(() => {
    // An unpackaged run on a Mac is Electron's own app, with Electron's Dock icon; a built Drafter.app
    // carries Drafter's. (Linux and Windows set it per window: window.ts's windowIcon.)
    if (process.platform === 'darwin' && !app.isPackaged) {
      const icon = join(WEB, 'icon-512.png');
      if (existsSync(icon)) app.dock?.setIcon(icon);
    }
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
    refuseNetwork(ses, (id) => grants.get(id) ?? []);
    // TURN over TCP isn't a UDP request, so the policy above doesn't stop it: a proxy refuses every
    // renderer connection but the granted hosts. The updater has its own session, so it is unaffected.
    void applyModuleProxy();
    ses.on('spellcheck-dictionary-download-begin', (_event, language) => {
      spelling.downloads.push(language);
    });
    for (const name of ['initialized', 'download-success', 'download-failure'] as const) {
      ses.on(
        `spellcheck-dictionary-${name}` as 'spellcheck-dictionary-initialized',
        (_event, language) => {
          spelling.events.push(`${name} ${language}`);
        },
      );
    }
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
    // The modules folder, before the first page: the scheme serves exactly the modules read now.
    ({ modules: loaded, problems: skipped } = readModulesFolder(modulesDir()));
    for (const problem of skipped) console.warn(problem);
    if (loaded.length > 0) csp = appCspWithModules(csp);
    protocol.handle(SCHEME, appHandler(WEB, csp, headers));
    protocol.handle(
      MODULE_SCHEME,
      moduleHandler({
        modules: new Map(loaded.map((m) => [m.id, m.root])),
        files: new Map(loaded.map((m) => [m.id, m.files])),
        runtime: MODULE_RUNTIME,
        origins: (id) => grants.get(id) ?? [],
      }),
    );
    files = registerFileIpc();
    setUpMenu(() => main, { modulesFolder: openModulesFolder, bringForward });
    closing = setUpClosing(() => main);
    const updates = setUpUpdates(
      () => main,
      // Restart was chosen after the page asked about unsaved changes: the quit it starts needs no
      // second question, but only that quit (an install that fails leaves closing as it was).
      () => closing?.allowQuit() ?? (() => {}),
    );
    started = true;
    const window = openMain();
    // The check waits a few seconds after the first page has loaded (and for the page to say
    // Check for updates is on).
    window.webContents.once('did-finish-load', () => updates.start());
    begin();
    // The files named on the command line: held until the page is up and listening.
    openFromSystem(process.argv.slice(1), process.cwd());
  });
}

// macOS names files to open with `open-file`, the first of them before `ready`: listened for now,
// before anything else can happen, and held until the app has started (`start`). Each is taken
// (preventDefault), so should this Drafter not start after all (another one has the lock, or the
// sandbox question is answered Quit), what it held is dropped without a word: rare on a Mac, where
// LaunchServices hands a file to the Drafter already running.
const openFiles = heldOpenFiles();
app.on('open-file', openFiles.listener);

// One Drafter at a time; one just started by an update's Restart waits for the old one to go.
// Second launches are held from the moment the lock is ours until the app has started.
const launches = heldLaunches();
takeInstanceLock(
  {
    request: () => app.requestSingleInstanceLock(),
    env: process.env,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  },
  {
    got: () => {
      app.on('second-instance', launches.listener);
      askAboutSandbox(sandboxQuestion, start);
    },
    lost: () => app.quit(),
  },
);
