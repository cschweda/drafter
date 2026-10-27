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
