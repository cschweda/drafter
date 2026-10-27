// The names the preload and the main process share: IPC channels and the preload's arguments.
// Plain constants, so the preload's bundle takes nothing else from the main process.

export const CHANNELS = {
  /** preload → main, once per renderer: how it was started (`RendererReport`). */
  rendererReport: 'drafter:renderer-report',
  /** Files (files-ipc.ts): invoked by the preload, all paths absolute. */
  filesShowOpen: 'drafter:files:show-open',
  filesShowSave: 'drafter:files:show-save',
  filesRead: 'drafter:files:read',
  filesWrite: 'drafter:files:write',
  filesRealPath: 'drafter:files:real-path',
  /** preload → main: watch `(id, path)`; stop `(id)`. */
  filesWatch: 'drafter:files:watch',
  filesUnwatch: 'drafter:files:unwatch',
  /** main → preload: the watched file `id` changed. */
  filesChanged: 'drafter:files:changed',
} as const;

/** What a preload says about its renderer: the e2e suite's evidence that it is sandboxed. */
export interface RendererReport {
  sandboxed: boolean;
  contextIsolated: boolean;
}

/**
 * The argument (`webPreferences.additionalArguments`) that hands the app's version to the preload,
 * which can't ask Electron's `app` and shouldn't block on a synchronous IPC call for it.
 */
export const VERSION_ARG = '--drafter-version=';
