// Updates, the Electron half (updates.ts holds the rules). The updater runs here in the main
// process, so the network backstop (network.ts), which cancels only requests a page made, leaves
// it alone. Only the editor's page may speak to it.
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, type BrowserWindow, ipcMain } from 'electron';
import { CHANNELS } from './channels';
import { CHECK_DELAY_MS, type UpdaterLike, Updates, updateMode, validFeed } from './updates';
import { fromEditor, openExternal } from './window';

/** Unpackaged only (the e2e suite): the fake release server, the wait, and what replaces installing. */
function hooks() {
  if (app.isPackaged) return { feed: null, delay: CHECK_DELAY_MS, install: null };
  const delay = Number(process.env.DRAFTER_E2E_UPDATE_DELAY_MS);
  const install = process.env.DRAFTER_E2E_UPDATE_INSTALL;
  return {
    feed: validFeed(process.env.DRAFTER_UPDATE_FEED),
    delay: Number.isFinite(delay) && delay >= 0 ? delay : CHECK_DELAY_MS,
    install: install?.startsWith('/') ? install : null,
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
  beforeInstall: () => void,
): UpdatesMain {
  const hook = hooks();
  const mode = updateMode({
    isPackaged: app.isPackaged,
    platform: process.platform,
    appImage: process.env.APPIMAGE,
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
    async createUpdater() {
      const { AppImageUpdater } = await import('electron-updater');
      const updater = new AppImageUpdater();
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
      // The e2e suite never replaces a file: `beforeInstall` below records and quits instead.
      if (hook.install) updater.quitAndInstall = () => {};
      updater.logger = console;
      return updater as unknown as UpdaterLike;
    },
    publish(offer) {
      const page = listening;
      if (page && !page.isDestroyed()) page.send(CHANNELS.updateOffer, offer.version, offer.how);
    },
    openExternal,
    beforeInstall() {
      beforeInstall();
      if (hook.install) {
        // The e2e suite: say it, and quit the way quitAndInstall does, without installing.
        appendFileSync(hook.install, 'install\n');
        setImmediate(() => app.quit());
      }
    },
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
  ipcMain.handle(CHANNELS.updateInstall, (event) => {
    if (!fromEditor(event, contents())) throw new Error('not allowed');
    if (!updates.install()) throw new Error('nothing to install');
  });

  return { start: () => updates.start(), mode };
}
