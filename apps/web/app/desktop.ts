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

/**
 * What the desktop app gives the page. Plain data and named calls only: never Electron's
 * `ipcRenderer` itself. Later tasks add to it (files, the menu, closing, updates).
 */
export interface DesktopBridge {
  /** The desktop app's version (`apps/desktop/package.json`). */
  version: string;
  /** The operating system. */
  platform: DesktopPlatform;
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
