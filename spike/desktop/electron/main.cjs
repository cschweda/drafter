// Drafter in Electron: the built static site (apps/web/.output/public, copied to ./web at package
// time) served from a privileged custom scheme, app://drafter/. Spike code: no menus, no updater.
const STARTED = Date.now();
const { app, BrowserWindow, protocol, ipcMain, dialog, session } = require('electron');
const { readFile, writeFile, stat } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const path = require('node:path');

const WEB =
  process.env.DRAFTER_WEB ??
  [path.join(__dirname, 'web'), path.join(__dirname, '../../../apps/web/.output/public')].find((p) =>
    existsSync(path.join(p, 'index.html')),
  );

// The spike points each run at its own profile (IndexedDB, localStorage live there).
if (process.env.SPIKE_USER_DATA) app.setPath('userData', process.env.SPIKE_USER_DATA);

// Must run before `ready`. `standard` gives the scheme an origin (app://drafter) so IndexedDB,
// localStorage, and relative URLs work; `secure` makes it a secure context; `supportFetchAPI` lets
// fetch() and module workers load from it; `allowServiceWorkers` lets the app's sw.js try to register.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
      allowServiceWorkers: process.env.SPIKE_NO_SW !== '1',
    },
  },
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

/** The CSP the site sends (apps/web/.output/public/_headers, rule `/*`), applied to every response. */
async function cspOf() {
  try {
    const text = await readFile(path.join(WEB, '_headers'), 'utf8');
    const m = text.match(/^\/\*\s*\n(?:\s+.*\n)*?\s+Content-Security-Policy:\s*(.+)$/m);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function serve(request, csp) {
  const url = new URL(request.url);
  if (url.host !== 'drafter') return new Response('not found', { status: 404 });
  let rel = decodeURIComponent(url.pathname);
  // Resolve inside WEB only: no `..` escapes.
  let file = path.resolve(WEB, `.${rel}`);
  if (file !== WEB && !file.startsWith(WEB + path.sep)) return new Response('forbidden', { status: 403 });
  try {
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
  } catch {
    // Not a file: an app route gets the shell (as Netlify's 200.html does), a missing file a 404.
    if (/\.[^/]+$/.test(rel)) return new Response('not found', { status: 404 });
    file = path.join(WEB, 'index.html');
    rel = '/';
  }
  try {
    const body = await readFile(file);
    const headers = {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    };
    if (csp && process.env.SPIKE_NO_CSP !== '1') headers['content-security-policy'] = csp;
    return new Response(body, { status: 200, headers });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

// ---- FileAccess over IPC: the renderer asks, the main process shows the dialog and does the I/O.
// A FileRef is { name, path }: plain data, structured-cloneable, kept in Dexie's `handles` table.
const FILTERS = {
  fountain: [{ name: 'Fountain script', extensions: ['fountain'] }],
  markdown: [{ name: 'Markdown document', extensions: ['md', 'markdown'] }],
  txt: [{ name: 'Text', extensions: ['txt'] }],
  pdf: [{ name: 'PDF', extensions: ['pdf'] }],
};
// CI can't click a native dialog: SPIKE_STUB_DIALOG=<file> makes the dialogs answer with it.
const stub = process.env.SPIKE_STUB_DIALOG;
const showOpen = (win, opts) =>
  stub ? Promise.resolve({ canceled: false, filePaths: [stub] }) : dialog.showOpenDialog(win, opts);
const showSave = (win, opts) =>
  stub
    ? Promise.resolve({ canceled: false, filePath: `${stub}.saved` })
    : dialog.showSaveDialog(win, opts);
// Paths the writer picked this session (or that came back from Dexie and were re-granted).
// The renderer may only touch these: a compromised page can't read ~/.ssh by naming it.
const granted = new Set();

function registerFileIpc() {
  ipcMain.handle('files:pickToOpen', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await showOpen(win, {
      properties: ['openFile'],
      filters: [
        { name: 'Fountain script, Markdown document, or text', extensions: ['fountain', 'txt', 'md', 'markdown'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    granted.add(p);
    const [bytes, st] = await Promise.all([readFile(p), stat(p)]);
    return { ref: { name: path.basename(p), path: p }, name: path.basename(p), bytes, lastModified: st.mtimeMs };
  });
  ipcMain.handle('files:pickToSave', async (event, suggestedName, kind) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await showSave(win, { defaultPath: suggestedName, filters: FILTERS[kind] });
    if (r.canceled || !r.filePath) return null;
    granted.add(r.filePath);
    return { name: path.basename(r.filePath), path: r.filePath };
  });
  ipcMain.handle('files:read', async (_e, ref) => {
    if (!granted.has(ref.path)) throw new Error('not granted');
    const [bytes, st] = await Promise.all([readFile(ref.path), stat(ref.path)]);
    return { bytes, lastModified: st.mtimeMs };
  });
  ipcMain.handle('files:write', async (_e, ref, data) => {
    if (!granted.has(ref.path)) throw new Error('not granted');
    await writeFile(ref.path, data);
  });
  ipcMain.handle('spike:startedAt', () => STARTED);
  // The spike's document-start script (bench/startup.js), handed to the preload.
  ipcMain.on('spike:startupScript', (event) => {
    const file = [path.join(__dirname, 'startup.js'), path.join(__dirname, '../bench/startup.js')].find(existsSync);
    event.returnValue = file ? require('node:fs').readFileSync(file, 'utf8') : '';
  });
  // The spike's check that the real dialog functions are there and callable from main.
  ipcMain.handle('spike:dialogInfo', () => ({
    showOpenDialog: typeof dialog.showOpenDialog,
    showSaveDialog: typeof dialog.showSaveDialog,
    stubbed: !!stub,
  }));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: '#0F1013',
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  // Links out of the app open in the system browser, never in the app's window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('app://drafter/')) require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://drafter/')) e.preventDefault();
  });
  win.loadURL('app://drafter/');
  return win;
}

app.whenReady().then(async () => {
  const csp = await cspOf();
  protocol.handle('app', (req) => serve(req, csp));
  // The browser build's downloads (export fallback): saved to a temp path in the spike, rather than
  // Chromium's own save dialog. A real build would route `download` through pickToSave instead.
  session.defaultSession.on('will-download', (_e, item) => {
    item.setSavePath(path.join(app.getPath('temp'), item.getFilename()));
  });
  registerFileIpc();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
