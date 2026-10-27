// Drafter's main process: one instance, one window, the web build served from the app's own files
// at app://drafter/ (docs/drafter-desktop-design.md §2). Built to dist/main.cjs by tsdown.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow, dialog, ipcMain, protocol } from 'electron';
import { CHANNELS, type RendererReport } from './channels';
import { appHandler, cspFromHeaders, SCHEME } from './protocol';
import { CONTINUE, QUIT, rememberAnswer, sandboxNotice } from './sandbox';
import { createMainWindow, fromApp, guard } from './window';

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
]);

/** The preload, beside this file in dist/. */
const PRELOAD = join(__dirname, 'preload.cjs');
/** The web build, copied into the app by `pnpm build:web`. */
const WEB = join(app.getAppPath(), 'web');

/** What each renderer's preload reported, by webContents id (read by the e2e suite). */
const renderers = new Map<number, RendererReport>();
Object.assign(globalThis, { drafterShell: { renderers: () => [...renderers.values()] } });

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

  // A second launch focuses the window this one already has (Task 3 opens its files here).
  app.on('second-instance', () => {
    if (!main || main.isDestroyed()) return;
    if (main.isMinimized()) main.restore();
    main.focus();
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

  app.on('window-all-closed', () => app.quit());

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
    protocol.handle(SCHEME, appHandler(WEB, csp));
    main = createMainWindow(PRELOAD);
  });
}

if (app.requestSingleInstanceLock()) askAboutSandbox(sandboxQuestion, start);
else app.quit();
