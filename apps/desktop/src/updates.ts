// Updates from GitHub Releases (docs/drafter-desktop-design.md §7), the rules without Electron or
// electron-updater so they can be tested: when the one check happens, what is offered, and what a
// press of Restart or Get it does. updates-main.ts wires it to the real updater and the IPC.
//
// Drafter never installs or restarts by itself. The AppImage downloads in the background only
// after a check found a newer version, and then offers Restart. A .deb can't update itself, so it
// offers Get it (the release page). Nor can the Mac app, built on the writer's own Mac and signed
// by no one (electron-updater installs only a signed one): it reads the release's version itself
// (`ReleaseCheck`) and offers Get it. Anything that goes wrong is logged and nothing else.

/** Where a .deb's Get it goes. */
export const RELEASES_URL = 'https://github.com/cschweda/drafter/releases/latest';

/** How long after the window is ready the one check waits. */
export const CHECK_DELAY_MS = 5000;

/** How long after quitAndInstall the app may keep running before the install counts as failed. */
export const INSTALL_WAIT_MS = 3000;

/** `appimage`: check, download, Restart. `deb` and `mac`: check, Get it. `off`: no check. */
export type UpdateMode = 'appimage' | 'deb' | 'mac' | 'off';

export interface ModeInputs {
  isPackaged: boolean;
  platform: string;
  /** `process.env.APPIMAGE`: the AppImage file, set by an AppImage's runtime. */
  appImage?: string;
  /** Whether `appImage` names an existing regular file. */
  appImageIsFile?: boolean;
  /** `process.env.APPDIR`: where the AppImage's runtime mounted it. */
  appDir?: string;
  /** `process.execPath`: the running executable. */
  execPath?: string;
  /** `DRAFTER_UPDATE_FEED`, honoured only when not packaged. */
  feed?: string;
}

/**
 * Whether this process is really running from an AppImage. `APPIMAGE` alone isn't proof: it is
 * inherited by anything started from an AppImage's terminal, and a .deb launched there would then
 * overwrite that other file on Restart. The runtime also sets `APPDIR` (the mount) and runs the
 * executable from inside it; `APPIMAGE` must name a file.
 */
export function runsFromAppImage(inputs: ModeInputs): boolean {
  const { appImage, appDir, execPath } = inputs;
  if (!appImage || !appDir || !execPath || inputs.appImageIsFile !== true) return false;
  const root = appDir.endsWith('/') ? appDir : `${appDir}/`;
  return execPath.startsWith(root);
}

/**
 * Which kind of install this is. A packaged Linux build is an AppImage when it really runs from
 * one (`runsFromAppImage`) and a .deb when it doesn't; a packaged Mac build is the Mac app.
 * Unpackaged (development, the e2e suite) there is no check unless the test feed is set. The
 * Windows build comes later: no check there yet.
 */
export function updateMode(inputs: ModeInputs): UpdateMode {
  // The test feed (unpackaged only) plays an AppImage by APPIMAGE alone, and otherwise the
  // package of the system the tests run on.
  if (!inputs.isPackaged) {
    if (!inputs.feed) return 'off';
    if (inputs.appImage) return 'appimage';
    return inputs.platform === 'darwin' ? 'mac' : 'deb';
  }
  if (inputs.platform === 'darwin') return 'mac';
  if (inputs.platform !== 'linux') return 'off';
  return runsFromAppImage(inputs) ? 'appimage' : 'deb';
}

/** The test feed if it is an http(s) URL, else null. */
export function validFeed(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** What the page is told: `restart` (downloaded; Restart installs) or `get` (open the release page). */
export type OfferHow = 'restart' | 'get';
export interface Offer {
  version: string;
  how: OfferHow;
}

/** The part of electron-updater's updater that is used. */
export interface UpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  on(
    event: 'update-available' | 'update-downloaded',
    listener: (info: { version: string }) => void,
  ): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  /** Downloads the version a check found (autoDownload stays off so the download can be cancelled). */
  downloadUpdate(token?: unknown): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

export interface UpdatesDeps {
  mode: UpdateMode;
  delayMs: number;
  /** Makes the updater (set up as the mode needs: this only sets the flags that must hold). */
  createUpdater(): Promise<UpdaterLike>;
  /** Sends the offer to the editor's page, if it is listening. */
  publish(offer: Offer): void;
  openExternal(url: string): void;
  /**
   * Lets the app quit without asking about unsaved changes (the page already asked), until the
   * returned function is called. The approval is meant for one quit: it must end if the install
   * fails and the app keeps running.
   */
  approveQuit(): () => void;
  /** A token that cancels the download. */
  newCancellation(): { cancel(): void };
  log(message: string): void;
}

export class Updates {
  private enabled: boolean | null = null;
  private waited = false;
  private began = false;
  private offer: Offer | null = null;
  private downloaded = false;
  private updater: UpdaterLike | null = null;
  private listening = false;
  private download: { cancel(): void } | null = null;
  /** Set while an install is under way: an updater error then means it failed. */
  private installFailed: ((message: string) => void) | null = null;

  constructor(private readonly deps: UpdatesDeps) {}

  /** The window is ready: starts the wait before the one check. */
  start(): void {
    if (this.deps.mode === 'off') return;
    const timer = setTimeout(() => {
      this.waited = true;
      void this.maybeCheck();
    }, this.deps.delayMs);
    timer.unref?.();
  }

  /** The page says whether Check for updates is on (when it has read the setting, and when it changes). */
  setEnabled(on: boolean): void {
    this.enabled = on === true;
    // Turned off: a download under way stops, and nothing more is offered.
    if (!this.enabled && this.download) {
      this.download.cancel();
      this.download = null;
    }
    void this.maybeCheck();
  }

  /** The page listens for offers (again, after a reload): it is told the one it hasn't had. */
  listen(): void {
    this.listening = true;
    if (this.offer && this.enabled === true) this.deps.publish(this.offer);
  }

  /**
   * Restart: installs the downloaded update and restarts. `nothing`: there is nothing to install.
   * `failed`: the updater said it couldn't, or the app is still running a few seconds after
   * `quitAndInstall` (electron-updater reports a failed install as an error and does not quit);
   * the quit approval is taken back, so closing with unsaved changes asks again. When it works the
   * app quits, and this never settles.
   */
  async install(): Promise<'nothing' | 'failed'> {
    if (this.deps.mode !== 'appimage' || !this.downloaded || !this.updater) return 'nothing';
    if (this.installFailed) return 'failed';
    const updater = this.updater;
    const revoke = this.deps.approveQuit();
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const fail = (message: string) => {
        clearTimeout(timer);
        this.installFailed = null;
        revoke();
        this.deps.log(`update: install failed: ${message}`);
        resolve('failed');
      };
      this.installFailed = fail;
      timer = setTimeout(() => fail('the app did not quit'), INSTALL_WAIT_MS);
      timer.unref?.();
      try {
        updater.quitAndInstall(false, true);
      } catch (error) {
        fail(errorText(error));
      }
    });
  }

  /** Get it: opens the release page, for a .deb that was offered an update. */
  openReleasePage(): void {
    if (this.offer?.how === 'get') this.deps.openExternal(RELEASES_URL);
  }

  private async maybeCheck(): Promise<void> {
    if (this.began || !this.waited || this.enabled !== true || this.deps.mode === 'off') return;
    this.began = true;
    try {
      const updater = await this.deps.createUpdater();
      this.updater = updater;
      const appImage = this.deps.mode === 'appimage';
      // Never automatic: a found version starts the download below, with a token that setEnabled(false) can cancel.
      updater.autoDownload = false;
      updater.autoInstallOnAppQuit = false;
      updater.on('error', (error) => {
        this.deps.log(`update: ${errorText(error)}`);
        this.installFailed?.(errorText(error));
      });
      updater.on('update-available', (info) => {
        if (appImage) {
          this.deps.log(`update: ${info.version} found, downloading`);
          if (this.enabled !== true) return;
          const token = this.deps.newCancellation();
          this.download = token;
          updater.downloadUpdate(token).catch((error) => {
            this.deps.log(`update: ${errorText(error)}`);
          });
          return;
        }
        this.make({ version: info.version, how: 'get' });
      });
      updater.on('update-downloaded', (info) => {
        if (!appImage) return;
        this.downloaded = true;
        this.make({ version: info.version, how: 'restart' });
      });
      await updater.checkForUpdates();
    } catch (error) {
      this.deps.log(`update: ${errorText(error)}`);
    }
  }

  private make(offer: Offer): void {
    this.offer = offer;
    if (this.listening && this.enabled === true) this.deps.publish(offer);
  }
}

// ---- The Mac app's check --------------------------------------------------------------------------

/**
 * Where the Mac app reads the latest release's version: its `latest-linux.yml`, the file the Linux
 * app's updater reads too. A release has one version for every system, and the Mac app has no
 * file of its own there (nothing for macOS is published until it can be signed).
 */
export const MAC_FEED = 'https://github.com/cschweda/drafter/releases/latest/download/';
export const FEED_FILE = 'latest-linux.yml';
/** The most of a feed file the check reads: one is under a kilobyte. */
export const MAX_FEED_BYTES = 64 * 1024;
/** How long the check waits for the release before it gives up (for the log). */
export const FEED_TIMEOUT_MS = 15_000;

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/**
 * Whether version `latest` is newer than `current` (`0.7.0` than `0.6.0`; `0.7.0` than
 * `0.7.0-beta.1`). Anything that isn't a version is never newer.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = VERSION.exec(latest);
  const b = VERSION.exec(current);
  if (!a || !b) return false;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(a[i]) - Number(b[i]);
    if (diff !== 0) return diff > 0;
  }
  // The same numbers: a release is newer than a pre-release of it, and nothing else is.
  return a[4] === undefined && b[4] !== undefined;
}

/** The top-level `version:` in an electron-builder feed file, or null. */
export function versionInFeed(text: string): string | null {
  const match = /^version:[ \t]*(['"]?)([^'"\s]+)\1[ \t]*\r?$/m.exec(text);
  return match?.[2] ?? null;
}

export interface ReleaseCheckDeps {
  /** The folder the feed file is in: MAC_FEED, or the e2e suite's test feed. */
  feed: string;
  /** The running app's version. */
  current: string;
  /**
   * Fetches a URL's text, rejecting when it can't (not found, offline, longer than
   * FEED_TIMEOUT_MS, or plainly more than MAX_FEED_BYTES).
   */
  fetchText(url: string): Promise<string>;
}

/**
 * The Mac app's updater: it reads the latest release's version and says when it is newer, as
 * electron-updater's `update-available` does; Updates then offers Get it. It downloads and installs
 * nothing.
 */
export class ReleaseCheck implements UpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  private readonly found: Array<(info: { version: string }) => void> = [];

  constructor(private readonly deps: ReleaseCheckDeps) {}

  on(
    event: 'update-available' | 'update-downloaded',
    listener: (info: { version: string }) => void,
  ): this;
  on(event: 'error', listener: (error: unknown) => void): this;
  on(event: string, listener: (arg: never) => void): this {
    if (event === 'update-available') {
      this.found.push(listener as (info: { version: string }) => void);
    }
    return this;
  }

  async checkForUpdates(): Promise<{ version: string }> {
    const base = this.deps.feed.endsWith('/') ? this.deps.feed : `${this.deps.feed}/`;
    const text = await this.deps.fetchText(new URL(FEED_FILE, base).href);
    if (text.length > MAX_FEED_BYTES) throw new Error(`${FEED_FILE} is too big`);
    const version = versionInFeed(text);
    if (!version) throw new Error(`no version in ${FEED_FILE}`);
    if (isNewer(version, this.deps.current)) {
      for (const listener of this.found) listener({ version });
    }
    return { version };
  }

  async downloadUpdate(): Promise<never> {
    throw new Error('The Mac app downloads nothing.');
  }

  quitAndInstall(): never {
    throw new Error('The Mac app installs nothing.');
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
