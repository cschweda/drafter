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
  /** preload → main: a dropped file's path, to be granted if it is a script (grants.ts). */
  filesGrantDropped: 'drafter:files:grant-dropped',
  /** preload → main: watch `(id, path)`; stop `(id)`. */
  filesWatch: 'drafter:files:watch',
  filesUnwatch: 'drafter:files:unwatch',
  /** main → preload: the watched file `id` changed. */
  filesChanged: 'drafter:files:changed',
  /** preload → main: the page is listening for files the system names (open-files.ts). */
  openReady: 'drafter:open:ready',
  /** main → preload: one `OpenItem`: a file (already granted) to open, or why one wasn't. */
  openItem: 'drafter:open:item',
  /** preload → main: the page's command list for the menu bar (menu.ts `parseCommands` checks it). */
  menuCommands: 'drafter:menu:commands',
  /** main → preload: the id of the command a menu item stands for, chosen in the menu bar. */
  menuRun: 'drafter:menu:run',
  /** preload → main: whether the page answers close requests (`true` once it listens, `false` when it stops). */
  closeReady: 'drafter:close:ready',
  /** main → preload: `(id, 'state' | 'save' | 'flush')`: a question for the page before the window closes. */
  closeRequest: 'drafter:close:request',
  /** preload → main: `(id, ok, value)`: the page's answer to the request `id`. */
  closeReply: 'drafter:close:reply',
  /** Updates (updates-main.ts). preload → main: the page listens for offers (`true`), or stops (`false`). */
  updateListen: 'drafter:update:listen',
  /** main → preload: `(version, how)`: a newer version was found (`how` is `restart` or `get`). */
  updateOffer: 'drafter:update:offer',
  /** preload → main: Restart (invoke). */
  updateInstall: 'drafter:update:install',
  /** preload → main: Get it. */
  updateOpenRelease: 'drafter:update:open-release',
  /** preload → main: a help window's Back to Drafter: focus the editor, close the sender. */
  backToEditor: 'drafter:back-to-editor',
  /** preload → main: whether Check for updates is on. */
  updateEnabled: 'drafter:update:enabled',
  /** preload → main: Help → Check for updates, now, whatever the setting (invoke; a `CheckResult`). */
  updateCheck: 'drafter:update:check',
  /** The modules folder (module-folder.ts). preload → main: the modules read at start, and what was skipped (invoke). */
  modulesList: 'drafter:modules:list',
  /** preload → main: `(id, origins)`: the network origins the writer agreed to for a module (invoke). */
  modulesSetNetwork: 'drafter:modules:set-network',
} as const;

/** What main may ask the page before it closes (close-flow.ts `ClosePage`). */
export type CloseRequestKind = 'state' | 'save' | 'flush';

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
