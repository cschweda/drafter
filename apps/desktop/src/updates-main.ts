// Updates, the Electron half (updates.ts holds the rules). The updater runs here in the main
// process, so the network backstop (network.ts), which cancels only requests a page made, leaves
// it alone. Only the editor's page may speak to it.
import { appendFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { app, type BrowserWindow, ipcMain, session } from 'electron';
import { CHANNELS } from './channels';
import {
  CHECK_DELAY_MS,
  FEED_TIMEOUT_MS,
  MAC_FEED,
  MAX_FEED_BYTES,
  ReleaseCheck,
  type UpdaterLike,
  Updates,
  updateMode,
  validFeed,
} from './updates';
import { fromEditor, openExternal } from './window';

/** electron-updater's own CancellationToken, loaded with it (a transitive dependency isn't imported directly). */
let CancellationToken: new () => { cancel(): void } = class {
  cancel() {}
};

function isFile(path: string | undefined): boolean {
  try {
    return Boolean(path) && statSync(path as string).isFile();
  } catch {
    return false;
  }
}

/** Unpackaged only (the e2e suite): the fake release server, the wait, and what replaces installing. */
function hooks() {
  if (app.isPackaged) return { feed: null, delay: CHECK_DELAY_MS, install: null };
  const delay = Number(process.env.DRAFTER_E2E_UPDATE_DELAY_MS);
  const install = process.env.DRAFTER_E2E_UPDATE_INSTALL;
  return {
    feed: validFeed(process.env.DRAFTER_UPDATE_FEED),
    delay: Number.isFinite(delay) && delay >= 0 ? delay : CHECK_DELAY_MS,
    install: install && isAbsolute(install) ? install : null,
  };
}

export interface UpdatesMain {
  /** The editor's window is ready (its first load has finished): the wait for the check begins. */
  start(): void;
  /** The mode, for the e2e suite. */
  mode: string;
}

/**
 * Sets up updates. `editor()` is the editor's window; `beforeInstall` tells the close flow the
 * app is about to quit on purpose, so it doesn't ask again (the page already asked).
 */
export function setUpUpdates(
  editor: () => BrowserWindow | null,
  approveQuit: () => () => void,
): UpdatesMain {
  const hook = hooks();
  const mode = updateMode({
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImage: process.env.APPIMAGE,
    appImageIsFile: isFile(process.env.APPIMAGE),
    appDir: process.env.APPDIR,
    execPath: process.execPath,
    feed: hook.feed ?? undefined,
  });
  const contents = () => {
    const window = editor();
    return window && !window.isDestroyed() ? window.webContents : null;
  };
  /** The editor's page, while it listens for offers. */
  let listening: Electron.WebContents | null = null;

  const updates = new Updates({
    mode,
    delayMs: hook.delay,
    newCancellation: () => new CancellationToken(),
    async createUpdater() {
      if (mode === 'mac') {
        // A session of its own, as electron-updater's is: the default session's backstop and proxy
        // (network.ts, webrtc.ts) are for pages, and this is the app's one request.
        const net = session.fromPartition('drafter-update-check');
        return new ReleaseCheck({
          feed: hook.feed ?? MAC_FEED,
          current: app.getVersion(),
          async fetchText(url) {
            const response = await net.fetch(url, {
              cache: 'no-store',
              signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`${response.status} from ${url}`);
            // Not read at all when it says it is too big; ReleaseCheck checks what was read.
            if (Number(response.headers.get('content-length')) > MAX_FEED_BYTES) {
              throw new Error(`${url} is too big`);
            }
            return response.text();
          },
        });
      }
      const {
        AppImageUpdater,
        NsisUpdater,
        CancellationToken: Token,
      } = await import('electron-updater');
      CancellationToken = Token;
      const updater = mode === 'nsis' ? new NsisUpdater() : new AppImageUpdater();
      if (updater instanceof NsisUpdater) {
        // The release has no .blockmap files (electron-builder.config.cjs), so the whole installer
        // is downloaded, and checked against latest.yml's sha512 (fetched from the release over
        // https). Unsigned for now: with no publisherName in resources/app-update.yml,
        // electron-updater checks no Authenticode signature. Once Drafter is signed,
        // electron-builder writes the name there and electron-updater refuses an update not signed
        // by it; `verifyUpdateCodeSignature` is never replaced here, so that check stays its own
        // (scripts/check-update-config.mjs fails a signed build without the name).
        updater.disableDifferentialDownload = true;
        // Only the full installer: a web installer would fetch its package from elsewhere.
        updater.disableWebInstaller = true;
      }
      if (hook.feed) {
        // The test feed: a plain server, whole downloads (the old file is a fake).
        updater.forceDevUpdateConfig = true;
        updater.disableDifferentialDownload = true;
        // electron-updater reads its config (and the folder it caches downloads in) from a file,
        // which a packaged app has (resources/app-update.yml, written by electron-builder).
        const config = join(app.getPath('userData'), 'test-app-update.yml');
        writeFileSync(
          config,
          `provider: generic\nurl: ${JSON.stringify(hook.feed)}\nupdaterCacheDirName: drafter-updater\n`,
        );
        updater.updateConfigPath = config;
      } else if (mode === 'deb') {
        // AppImageUpdater only checks when APPIMAGE is set; a .deb checks the same way and never
        // downloads (autoDownload stays off), so it only needs to be let through.
        updater.forceDevUpdateConfig = true;
      }
      // The e2e suite never replaces a file: it records the install and quits (or fails) instead.
      if (hook.install) {
        const log = hook.install;
        updater.quitAndInstall = () => {
          appendFileSync(log, 'install\n');
          if (process.env.DRAFTER_E2E_UPDATE_INSTALL_FAILS === '1') {
            updater.emit('error', new Error('EACCES: the AppImage is in a read-only folder'));
            return;
          }
          setImmediate(() => app.quit());
        };
      }
      updater.logger = console;
      return updater as unknown as UpdaterLike;
    },
    publish(offer) {
      const page = listening;
      if (page && !page.isDestroyed()) page.send(CHANNELS.updateOffer, offer.version, offer.how);
    },
    openExternal,
    approveQuit,
    log: (message) => console.warn(message),
  });

  ipcMain.on(CHANNELS.updateListen, (event, on: unknown) => {
    const page = contents();
    if (!page || !fromEditor(event, page)) return;
    if (on === true) {
      listening = page;
      updates.listen();
    } else if (listening === page) {
      listening = null;
    }
  });
  ipcMain.on(CHANNELS.updateEnabled, (event, on: unknown) => {
    if (!fromEditor(event, contents())) return;
    updates.setEnabled(on === true);
  });
  ipcMain.on(CHANNELS.updateOpenRelease, (event) => {
    if (!fromEditor(event, contents())) return;
    updates.openReleasePage();
  });
  ipcMain.handle(CHANNELS.updateCheck, async (event) => {
    if (!fromEditor(event, contents())) throw new Error('not allowed');
    return updates.checkNow();
  });
  ipcMain.handle(CHANNELS.updateInstall, async (event) => {
    if (!fromEditor(event, contents())) throw new Error('not allowed');
    const result = await updates.install();
    throw new Error(result === 'nothing' ? 'nothing to install' : 'install-failed');
  });

  return { start: () => updates.start(), mode };
}
