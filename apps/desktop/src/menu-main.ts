// The menu bar's Electron half (menu.ts lays it out): it holds the command list the editor's page
// sends, builds the application menu from it, and sends the id of a chosen item back to that page,
// which runs the command it registered. The page is the only place a command's behaviour lives.
import { appendFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, type WebContents } from 'electron';
import { CHANNELS } from './channels';
import {
  ABOUT_URL,
  aboutText,
  type MenuCommand,
  menuTemplate,
  parseCommands,
  RELEASES_URL,
} from './menu';
import { fromEditor, openExternal } from './window';

/**
 * Help → About Drafter: a native box with the version and a button to drafter.dev (opened in the
 * browser). An unpackaged app run by the e2e suite writes what the box says to
 * `DRAFTER_E2E_ABOUT` and presses the button instead, so a test never waits on a person.
 */
async function showAbout(parent: BrowserWindow | undefined): Promise<void> {
  const { message, detail } = aboutText(app.getVersion());
  const log = app.isPackaged ? undefined : process.env.DRAFTER_E2E_ABOUT;
  if (log && isAbsolute(log)) {
    appendFileSync(log, `${JSON.stringify({ message, detail })}\n`);
    openExternal(ABOUT_URL);
    return;
  }
  const options = {
    type: 'info' as const,
    title: 'About Drafter',
    message,
    detail,
    buttons: ['Visit drafter.dev', 'Close'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
  const { response } = parent
    ? await dialog.showMessageBox(parent, options)
    : await dialog.showMessageBox(options);
  if (response === 0) openExternal(ABOUT_URL);
}

/**
 * Builds the application menu now (with no commands, so About, the Releases page, and Quit work
 * before the page is up) and again whenever the editor's page sends a changed list. Only the
 * editor window's own page is heard (`editor()` is that window): a help window that navigated to
 * the editor (its “Back to Drafter” link with no opener) is an editor page too, but not the
 * editor, and must not take over where menu clicks go. Call once, after `ready`.
 */
export function setUpMenu(
  editor: () => BrowserWindow | null,
  more: { modulesFolder?: () => void } = {},
): void {
  let commands: MenuCommand[] = [];
  /** The page whose commands these are, and whose window runs them. */
  let source: WebContents | null = null;
  const watched = new WeakSet<WebContents>();
  let built = '';

  const windowOf = (contents: WebContents | null) =>
    contents && !contents.isDestroyed() ? BrowserWindow.fromWebContents(contents) : null;

  const run = (id: string) => {
    if (!source || source.isDestroyed()) return;
    // From a help window too: the editor's window comes forward to answer.
    const window = windowOf(source);
    if (window && !window.isFocused()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
    source.send(CHANNELS.menuRun, id);
  };

  const build = () => {
    const key = JSON.stringify(commands);
    if (key === built) return;
    built = key;
    const actions = {
      platform: process.platform,
      about: () =>
        void showAbout(BrowserWindow.getFocusedWindow() ?? windowOf(source) ?? undefined),
      releases: () => openExternal(RELEASES_URL),
      modulesFolder: more.modulesFolder,
      // Through app.quit(), so a before-quit handler (asking about unsaved changes) can stop it.
      quit: () => app.quit(),
    };
    try {
      Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(commands, run, actions)));
    } catch {
      // An accelerator Electron won't take must not leave the app with no menu: show none.
      const bare = commands.map(({ keys: _keys, ...rest }) => rest);
      Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate(bare, run, actions)));
    }
  };

  ipcMain.on(CHANNELS.menuCommands, (event, payload: unknown) => {
    const window = editor();
    if (!window || !fromEditor(event, window.webContents)) return;
    const parsed = parseCommands(payload);
    if (!parsed) return;
    const sender = event.sender;
    source = sender;
    commands = parsed;
    if (!watched.has(sender)) {
      watched.add(sender);
      // The editor's page is gone: nothing can run a command until another page sends its own.
      sender.once('destroyed', () => {
        if (source !== sender) return;
        source = null;
        commands = commands.map((c) => ({ ...c, enabled: false }));
        build();
      });
    }
    build();
  });

  build();
}
