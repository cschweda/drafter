// Updates from GitHub Releases (docs/drafter-desktop-design.md §7), the rules without Electron or
// electron-updater so they can be tested: when the one check happens, what is offered, and what a
// press of Restart or Get it does. updates-main.ts wires it to the real updater and the IPC.
//
// Drafter never installs or restarts by itself. The AppImage downloads in the background only
// after a check found a newer version, and then offers Restart. A .deb can't update itself, so it
// offers Get it (the release page). Anything that goes wrong is logged and nothing else.

/** Where a .deb's Get it goes. */
export const RELEASES_URL = 'https://github.com/cschweda/drafter/releases/latest';

/** How long after the window is ready the one check waits. */
export const CHECK_DELAY_MS = 5000;

/** `appimage`: check, download, Restart. `deb`: check, Get it. `off`: no check. */
export type UpdateMode = 'appimage' | 'deb' | 'off';

export interface ModeInputs {
  isPackaged: boolean;
  platform: string;
  /** `process.env.APPIMAGE`: set by an AppImage's launcher. */
  appImage?: string;
  /** `DRAFTER_UPDATE_FEED`, honoured only when not packaged. */
  feed?: string;
}

/**
 * Which kind of install this is. A packaged Linux build is an AppImage when `APPIMAGE` is set and
 * a .deb when it isn't. Unpackaged (development, the e2e suite) there is no check unless the test
 * feed is set. Windows and macOS builds come later: no check there yet.
 */
export function updateMode(inputs: ModeInputs): UpdateMode {
  const appImage = Boolean(inputs.appImage);
  if (!inputs.isPackaged) return inputs.feed ? (appImage ? 'appimage' : 'deb') : 'off';
  if (inputs.platform !== 'linux') return 'off';
  return appImage ? 'appimage' : 'deb';
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
  /** Called just before quitAndInstall, so the close flow doesn't ask again. */
  beforeInstall(): void;
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
    void this.maybeCheck();
  }

  /** The page listens for offers (again, after a reload): it is told the one it hasn't had. */
  listen(): void {
    this.listening = true;
    if (this.offer && this.enabled === true) this.deps.publish(this.offer);
  }

  /** Restart: installs the downloaded update and restarts. False when there is nothing to install. */
  install(): boolean {
    if (this.deps.mode !== 'appimage' || !this.downloaded || !this.updater) return false;
    this.deps.beforeInstall();
    this.updater.quitAndInstall(false, true);
    return true;
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
      updater.autoDownload = appImage;
      updater.autoInstallOnAppQuit = false;
      updater.on('error', (error) => this.deps.log(`update: ${errorText(error)}`));
      updater.on('update-available', (info) => {
        if (appImage) {
          this.deps.log(`update: ${info.version} found, downloading`);
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

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
