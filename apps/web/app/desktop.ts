// The one place the web app asks whether it is running in the desktop app (apps/desktop), and the
// shape of what the desktop app gives it. Everywhere else calls `desktop()`; nothing else reads
// `window.drafterDesktop` or the build flag.
//
// The desktop app's preload script (apps/desktop/src/preload.ts) puts the bridge on the window with
// Electron's `contextBridge`, before the page's own scripts run. The bridge is honoured only in a
// build made for the desktop (`DRAFTER_DESKTOP=1`, which sets `__DRAFTER_DESKTOP__`): drafter.dev's
// own build ignores it, and its bundle keeps none of the desktop code.

/** Set by nuxt.config.ts (`vite.define`) from `DRAFTER_DESKTOP=1`; undefined in the unit tests. */
declare const __DRAFTER_DESKTOP__: boolean | undefined;

/** The platforms Node names (`process.platform`), where the desktop app runs. */
export type DesktopPlatform = NodeJS.Platform;

/** The extensions a Save dialog offers: a script, a Markdown document, and the exports. */
export type DesktopSaveExtension = '.fountain' | '.md' | '.txt' | '.pdf';

/**
 * The file system, through the main process (apps/desktop/src/files.ts), which is the only part of
 * the app that touches it. Every path is absolute. A call that fails rejects with an Error whose
 * message starts with a code: `gone` (no such file, or its folder is gone), `not-allowed`,
 * `disk-full`, `too-big`, `not-a-file`, or `failed` (`failed: EIO`). `storage/desktop-files.ts`
 * turns them into the errors the web app knows.
 */
export interface DesktopFilesBridge {
  /** The OS's Open dialog, in the folder last used (else Documents). Null: cancelled. */
  showOpen(): Promise<string | null>;
  /** The OS's Save dialog, suggesting `suggestedName` in the folder last used. Null: cancelled. */
  showSave(suggestedName: string, extension: DesktopSaveExtension): Promise<string | null>;
  /** The file's bytes and modification time (ms). Rejects `gone` when it is missing. */
  read(path: string): Promise<{ bytes: Uint8Array; lastModified: number }>;
  /**
   * Replaces the file atomically: a temp file beside it, flushed to disk, renamed over it. On
   * failure the file is as it was. A symlink is written through, and stays a link.
   */
  write(path: string, bytes: Uint8Array): Promise<void>;
  /** The path with every symlink followed; a path that doesn't exist, as it is. */
  realPath(path: string): Promise<string>;
  /** The path on disk of a dropped (or input-picked) file; empty for one that has none. */
  pathOfDropped(file: File): string;
  /**
   * Calls `onChange` (debounced, ~300 ms) when the file changes, including when another program
   * replaces it by renaming a new file over it. Returns the function that stops watching.
   */
  watch(path: string, onChange: () => void): () => void;
}

/** One command, as the menu bar needs it (apps/desktop/src/menu.ts `MenuCommand`). */
export interface DesktopMenuCommand {
  id: string;
  title: string;
  group: string;
  /** In CodeMirror's notation, such as `Mod-s`; the menu shows the first. */
  keys?: readonly string[];
  /** Whether the command applies right now. */
  enabled: boolean;
}

/** The menu bar, built by the main process from the page's own commands. */
export interface DesktopMenuBridge {
  /** Sends the commands the menu is built from, with which of them apply right now. */
  setCommands(list: readonly DesktopMenuCommand[]): void;
  /** Calls `onRun` with the id of each command chosen in the menu. Returns the function that stops listening. */
  onCommand(onRun: (id: string) => void): () => void;
}

/** What the page says when the desktop app is about to close its window (docs/drafter-desktop-design.md §5). */
export interface DesktopCloseState {
  /** The script has changes that are in no file (not a sample, not a read-only tab). */
  unsaved: boolean;
  /** The script's title, for the dialog the desktop app shows. */
  title: string;
}

/**
 * What the page does when the desktop app is about to close its window or quit. The desktop app
 * asks `state`, shows its own dialog (the page's `beforeunload` question would block the window
 * from closing, so on the desktop there is none), and may then ask for a `save`; every path that
 * closes the window first asks for a `flush`. Any of them may be asked more than once.
 */
export interface DesktopCloseHandlers {
  /** Whether closing would lose text that is in no file. */
  state(): Promise<DesktopCloseState>;
  /** Runs Save (a new script asks where). True only if the text reached its file. */
  save(): Promise<boolean>;
  /** Writes the recovery copy's pending text now. */
  flush(): Promise<void>;
}

/**
 * What the desktop app gives the page. Plain data and named calls only: never Electron's
 * `ipcRenderer` itself. Later tasks add to it (the menu, closing, updates).
 */
export interface DesktopBridge {
  /** The desktop app's version (`apps/desktop/package.json`). */
  version: string;
  /** The operating system. */
  platform: DesktopPlatform;
  /** Files: the OS's dialogs, and reading and writing by path. */
  files: DesktopFilesBridge;
  /** The menu bar. */
  menu: DesktopMenuBridge;
  /**
   * Calls `onPath` with the path of each script the system asks Drafter to open: named on the
   * command line, in a second launch, or double-clicked in a file manager. The desktop app has
   * already allowed the page to read it. What it holds from before the page listened is sent now.
   * `onProblem` gets the message for each one it won't open ("Drafter can’t open “x.png”: …").
   * Returns the function that stops listening.
   */
  onOpenFile(onPath: (path: string) => void, onProblem?: (message: string) => void): () => void;
  /**
   * Answers the desktop app when it closes the window or quits (see `DesktopCloseHandlers`).
   * Returns the function that stops answering. The page asks nothing of its own: closing is the
   * desktop app's to decide.
   */
  onCloseRequest(handlers: DesktopCloseHandlers): () => void;
}

declare global {
  interface Window {
    drafterDesktop?: DesktopBridge;
  }
}

/** Whether this is the desktop app's build of the web app (`DRAFTER_DESKTOP=1`). */
export function isDesktopBuild(): boolean {
  return typeof __DRAFTER_DESKTOP__ !== 'undefined' && __DRAFTER_DESKTOP__ === true;
}

/** The desktop app's bridge, or null in a browser (and while the page is prerendered). */
export function desktop(): DesktopBridge | null {
  if (!isDesktopBuild() || typeof window === 'undefined') return null;
  return window.drafterDesktop ?? null;
}
