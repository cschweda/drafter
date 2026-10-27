// Closing and quitting (docs/drafter-desktop-design.md §5), the Electron half; close-flow.ts holds
// the rules. The editor's window can't be closed, and the app can't quit, until the editor's page
// has been asked whether closing would lose text, and has written its recovery copy. The window's
// `close` event (the close button, the window manager, Alt+F4) and `before-quit` (File → Quit,
// Ctrl+Q, a help window being the last to go) both stop and ask first. Help windows hold no script
// and just close.
//
// The page's own `beforeunload` question would stop `close()` from ever finishing in a desktop
// window, so the desktop build has none (storage/script.ts) and `will-prevent-unload` lets any
// page that still asks go. When the OS ends the session (SIGTERM, SIGINT, SIGHUP, a shutdown, a
// Windows session end) there is no time to ask: the recovery copy is written, within a bound, and
// the app quits.
import { appendFileSync } from 'node:fs';
import {
  app,
  type BrowserWindow,
  dialog,
  type IpcMainEvent,
  ipcMain,
  powerMonitor,
  type WebContents,
} from 'electron';
import { CHANNELS, type CloseRequestKind } from './channels';
import {
  ASK_MS,
  type CloseAbout,
  type CloseChoice,
  CloseFlow,
  type ClosePage,
  closeDialogText,
  type DialogText,
  nextCloseAnswer,
  parseCloseState,
  unresponsiveDialogText,
} from './close-flow';
import { fromEditor } from './window';

/** Where the e2e suite's dialog answers are (`DRAFTER_E2E_CLOSE`), only for an unpackaged app. */
function closeHook(): string | null {
  if (app.isPackaged) return null;
  const file = process.env.DRAFTER_E2E_CLOSE;
  return file?.startsWith('/') ? file : null;
}

/** How long the page has to answer, shortened by the e2e suite to test a page that doesn't. */
function askMs(): number {
  if (app.isPackaged) return ASK_MS;
  const given = Number(process.env.DRAFTER_E2E_CLOSE_ASK_MS);
  return Number.isFinite(given) && given >= 50 ? given : ASK_MS;
}

/**
 * The native dialog: "Save the changes to “The Call” before closing?" with Save, Don't Save, and
 * Cancel (the default, and what Escape does). An unresponsive page gets Don't Save and Cancel.
 * Brings the window forward first: a quit may come from the menu while it is behind others.
 */
export async function closeDialog(
  about: CloseAbout,
  parent?: BrowserWindow | null,
): Promise<CloseChoice> {
  const text: DialogText =
    'title' in about ? closeDialogText(about.title) : unresponsiveDialogText();
  const choices: CloseChoice[] =
    'title' in about ? ['save', 'discard', 'cancel'] : ['discard', 'cancel'];
  const hook = closeHook();
  if (hook) {
    return nextCloseAnswer(hook, {
      message: text.message,
      detail: text.detail,
      buttons: text.buttons,
    });
  }
  if (parent && !parent.isDestroyed()) {
    if (parent.isMinimized()) parent.restore();
    parent.show();
    parent.focus();
  }
  const options = {
    type: 'question' as const,
    title: 'Drafter',
    message: text.message,
    detail: text.detail,
    buttons: text.buttons,
    defaultId: text.defaultId,
    cancelId: text.cancelId,
    noLink: true,
  };
  const { response } =
    parent && !parent.isDestroyed()
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
  return choices[response] ?? 'cancel';
}

/** Asks the editor's page its three questions, over IPC, and settles when it answers or goes. */
class PageLink {
  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  constructor(readonly contents: WebContents) {
    const gone = () => this.rejectAll();
    contents.once('destroyed', gone);
    contents.on('render-process-gone', gone);
    // A reload or a new page: whatever was asked of the old one will not be answered.
    contents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) gone();
    });
  }

  request(kind: CloseRequestKind): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.contents.isDestroyed() || this.contents.isCrashed()) {
        reject(new Error('The page is gone.'));
        return;
      }
      const id = ++this.nextId;
      // The e2e suite reads what the page was asked, in order, after the app has gone.
      const hook = closeHook();
      if (hook) appendFileSync(`${hook}.requests`, `${kind}\n`);
      this.pending.set(id, { resolve, reject });
      this.contents.send(CHANNELS.closeRequest, id, kind);
    });
  }

  reply(id: unknown, ok: unknown, value: unknown): void {
    if (typeof id !== 'number') return;
    const waiting = this.pending.get(id);
    if (!waiting) return;
    this.pending.delete(id);
    if (ok === true) waiting.resolve(value);
    else waiting.reject(new Error('The page could not answer.'));
  }

  private rejectAll(): void {
    for (const [id, waiting] of this.pending) {
      this.pending.delete(id);
      waiting.reject(new Error('The page is gone.'));
    }
  }
}

export interface Closing {
  /** Call for the editor's window when it is made: its close is asked about. */
  attach(window: BrowserWindow): void;
  /** The last window is gone: the app quits without asking again (there is no page to ask). */
  quitNow(): void;
}

/**
 * Sets up closing for the editor's window (`editor()` returns the current one) and quitting for
 * the app. Call once, on `ready`, before the first window opens.
 */
export function setUpClosing(editor: () => BrowserWindow | null): Closing {
  /** The editor's page, while it answers close requests (it says so; a reload says it again). */
  let listening: PageLink | null = null;
  /** Windows whose close was agreed to (closing them is no longer asked about). */
  const approved = new WeakSet<BrowserWindow>();
  /** Quitting was agreed to, or the session is ending. */
  let leaving = false;

  const editorContents = () => {
    const window = editor();
    return window && !window.isDestroyed() ? window.webContents : null;
  };

  const page = (): ClosePage | null => {
    const contents = editorContents();
    if (!contents || contents.isCrashed() || !listening || listening.contents !== contents) {
      return null;
    }
    const link = listening;
    return {
      async state() {
        const state = parseCloseState(await link.request('state'));
        if (!state) throw new Error('The page gave no answer to use.');
        return state;
      },
      async save() {
        return (await link.request('save')) === true;
      },
      async flush() {
        await link.request('flush');
      },
    };
  };

  /** True while the last question went unanswered: the page, not the writer, is why we closed. */
  let unresponsive = false;

  const flow = new CloseFlow({
    page,
    dialog: (about) => {
      unresponsive = 'unresponsive' in about;
      return closeDialog(about, editor());
    },
    quit: () => app.quit(),
    askMs: askMs(),
  });

  ipcMain.on(CHANNELS.closeReady, (event: IpcMainEvent, on: unknown) => {
    const contents = editorContents();
    if (!contents || !fromEditor(event, contents)) return;
    listening = on === true ? new PageLink(contents) : null;
    // A fresh link for each registration; the old one's waiting questions are answered or lost
    // with its page, never mixed with the new one's.
  });
  ipcMain.on(
    CHANNELS.closeReply,
    (event: IpcMainEvent, id: unknown, ok: unknown, value: unknown) => {
      const contents = editorContents();
      if (!contents || !fromEditor(event, contents)) return;
      listening?.reply(id, ok, value);
    },
  );

  /** Decides, and then closes the window or quits the app, or leaves them as they are. */
  async function request(source: 'close' | 'quit'): Promise<void> {
    const window = editor();
    unresponsive = false;
    const result = await flow.decide(source);
    if (result === 'stay') {
      // A Save that failed shows its error on the page: bring it where it can be seen.
      if (window && !window.isDestroyed() && source === 'close') window.focus();
      return;
    }
    if (window && !window.isDestroyed()) {
      approved.add(window);
      // A page that doesn't answer may not finish unloading, so it is not waited for.
      if (unresponsive) window.destroy();
    }
    if (source === 'quit') {
      leaving = true;
      app.quit();
    } else if (window && !window.isDestroyed()) {
      window.close();
    }
  }

  // Quit from the menu, Ctrl+Q, a dock or launcher: ask first.
  app.on('before-quit', (event) => {
    if (leaving) return;
    event.preventDefault();
    void request('quit');
  });

  // The OS ends the session: no dialog. The recovery copy is written (bounded), then the app goes.
  let ending = false;
  const endSession = async () => {
    if (ending) return;
    ending = true;
    leaving = true;
    try {
      await flow.flushForExit();
    } finally {
      app.quit();
      // Should a window refuse to go, the app still does.
      setTimeout(() => app.exit(0), 3000).unref();
    }
  };
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(signal, () => void endSession());
  }
  // Linux and macOS: delays the shutdown just long enough for the above. (Untested here.)
  powerMonitor.on('shutdown', ((event: { preventDefault(): void }) => {
    event.preventDefault();
    void endSession();
  }) as () => void);

  // A page that still vetoes its unload (the web's own question, in an older build) must not
  // keep a window from closing; this app asked already.
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-prevent-unload', (event) => event.preventDefault());
  });

  return {
    attach(window) {
      window.on('close', (event) => {
        if (leaving || approved.has(window)) return;
        event.preventDefault();
        void request('close');
      });
      // Windows: the session is ending. (Untested until the Windows build.)
      window.on('session-end', () => void endSession());
    },
    quitNow() {
      leaving = true;
    },
  };
}
