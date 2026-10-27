// Closing with unsaved changes (docs/drafter-desktop-design.md §5), without Electron: the rules for
// what happens when a window is closed or the app is quit, so they can be tested on their own.
// close.ts is the Electron half: it finds the editor's page, shows the native dialog, and closes.
//
// The page is asked three things (`ClosePage`): whether it has changes that are in no file
// (`state`), to run Save (`save`), and to write its recovery copy now (`flush`). The recovery copy
// is flushed before the window goes in every case that closes it, and the window closes after a
// Save only if the Save worked: no path loses the writer's text.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

/** What the writer chose in the dialog. */
export type CloseChoice = 'save' | 'discard' | 'cancel';

/** What the editor's page says about its script. */
export interface CloseState {
  /** Changes that are in no file (not for a sample, a script another tab edits, or a clean one). */
  unsaved: boolean;
  /** The script's title, for the dialog. */
  title: string;
  /** Whether a recovery copy is being kept, so the dialog may say the changes stay in it. */
  recoverable: boolean;
}

/** The editor's page, as the flow asks it. Any call may reject or never answer (a hung page). */
export interface ClosePage {
  state(): Promise<CloseState>;
  /** Runs Save (a new script asks where). True only if the text reached its file. */
  save(): Promise<boolean>;
  /** Writes the recovery copy's pending text now. */
  flush(): Promise<void>;
}

/**
 * What a dialog is about: a script with changes, or a page that isn't answering (with whether its
 * recovery copy worked when it last said, false if it never has, so nothing missing is promised).
 */
export type CloseAbout =
  | { title: string; recoverable: boolean }
  | { unresponsive: true; recoverable: boolean };

export interface CloseDeps {
  /** The editor's page, or null when there is none to ask (no window, crashed, not up yet). */
  page(): ClosePage | null;
  /** Shows the dialog and resolves to the choice; Escape is Cancel. */
  dialog(about: CloseAbout): Promise<CloseChoice>;
  /** Quits the app (`app.quit()`): for a quit that waited for a Save. */
  quit(): void;
  /**
   * Reports trouble with the editor's page while a Save is under way: the window went
   * `unresponsive`, or the page is `gone` (crashed, or navigated away). Returns the function that
   * stops watching. Save has no time limit (a Save As dialog can take minutes); this is how a
   * hung page is told from a slow one.
   */
  watchPage?(onTrouble: (kind: 'unresponsive' | 'gone') => void): () => void;
  /** How long the page has to say whether it has changes (default 3000 ms). */
  askMs?: number;
  /** How long the recovery copy has to be flushed (default 2000 ms). */
  flushMs?: number;
}

export const ASK_MS = 3000;
export const FLUSH_MS = 2000;

const TIMED_OUT = Symbol('timed out');

/** `promise`'s value, or TIMED_OUT if it hasn't settled in `ms` (or it rejects). */
function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(TIMED_OUT);
      },
    );
  });
}

export class CloseFlow {
  /** Where a request in progress is; `idle` when none is. */
  phase: 'idle' | 'asking' | 'saving' = 'idle';
  private waitingToQuit = false;
  /** Ends the Save in progress with a verdict about the page (set while saving). */
  private abortSave: ((result: 'unresponsive') => void) | null = null;
  private probing = false;
  /** What the page last said about its recovery copy (false until it says). */
  private recoverable = false;

  constructor(private readonly deps: CloseDeps) {}

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /**
   * Whether to close, after asking if there is something to lose. A request while another is under
   * way does nothing ('stay'), except a quit during a Save: it waits for the Save, then quits
   * again, which asks afresh if there is still something unsaved.
   */
  async decide(source: 'close' | 'quit'): Promise<'close' | 'stay'> {
    if (this.busy) {
      if (source === 'quit' && this.phase === 'saving') this.waitingToQuit = true;
      // A close or quit while a Save is under way may be the writer's way of saying the window has
      // hung (Chromium's own `unresponsive` event comes from input to the page, not from the
      // title bar): ask the page, and if it doesn't answer, say so.
      if (this.phase === 'saving') await this.probe();
      return 'stay';
    }
    this.phase = 'asking';
    try {
      return await this.run();
    } finally {
      this.phase = 'idle';
      if (this.waitingToQuit) {
        this.waitingToQuit = false;
        setTimeout(() => this.deps.quit(), 0);
      }
    }
  }

  /** Asks the page whether it is there, within the usual bound; no answer ends the Save as hung. */
  private async probe(): Promise<void> {
    if (this.probing) return;
    this.probing = true;
    try {
      const page = this.deps.page();
      if (!page) return;
      const state = await within(page.state(), this.deps.askMs ?? ASK_MS);
      if (state !== TIMED_OUT) this.recoverable = state.recoverable;
      else if (this.phase === 'saving') this.abortSave?.('unresponsive');
    } finally {
      this.probing = false;
    }
  }

  /** The OS is ending the session: no questions. Writes the recovery copy, within a bound. */
  async flushForExit(): Promise<void> {
    await this.flush();
  }

  private async flush(): Promise<void> {
    const page = this.deps.page();
    if (!page) return;
    await within(page.flush(), this.deps.flushMs ?? FLUSH_MS);
  }

  private async run(): Promise<'close' | 'stay'> {
    const page = this.deps.page();
    if (!page) return 'close';
    const state = await within(page.state(), this.deps.askMs ?? ASK_MS);
    if (state === TIMED_OUT) {
      // The page can't say what it holds, so it can't be asked to save: only leave or stay.
      const choice = await this.choose({ unresponsive: true, recoverable: this.recoverable });
      if (choice !== 'discard') return 'stay';
      await this.flush();
      return 'close';
    }
    this.recoverable = state.recoverable;
    if (!state.unsaved) {
      await this.flush();
      return 'close';
    }
    const choice = await this.choose({ title: state.title, recoverable: state.recoverable });
    if (choice === 'cancel') return 'stay';
    if (choice === 'save') {
      this.phase = 'saving';
      const result = await this.saving(page);
      if (result === 'gone') return 'stay';
      if (result === 'unresponsive') {
        // The page hung mid-Save: like one that doesn't answer at all, only leave or stay.
        const leave = await this.choose({ unresponsive: true, recoverable: this.recoverable });
        if (leave !== 'discard') return 'stay';
        await this.flush();
        return 'close';
      }
      if (result !== 'saved') return 'stay';
    }
    await this.flush();
    return 'close';
  }

  /**
   * Runs Save with no time limit, but gives up on it when the page is in trouble: the window goes
   * unresponsive, or the page goes away.
   */
  private saving(page: ClosePage): Promise<'saved' | 'failed' | 'unresponsive' | 'gone'> {
    return new Promise((resolve) => {
      let stop = () => {};
      const settle = (result: 'saved' | 'failed' | 'unresponsive' | 'gone') => {
        stop();
        this.abortSave = null;
        resolve(result);
      };
      this.abortSave = settle;
      stop = this.deps.watchPage?.((kind) => settle(kind)) ?? stop;
      page.save().then(
        (saved) => settle(saved ? 'saved' : 'failed'),
        // The page says why (the status bar); the window stays.
        () => settle('failed'),
      );
    });
  }

  private async choose(about: CloseAbout): Promise<CloseChoice> {
    try {
      return await this.deps.dialog(about);
    } catch {
      return 'cancel';
    }
  }
}

// ---- The dialogs -------------------------------------------------------------------------------

export const CLOSE_DIALOG = {
  buttons: ['Save', "Don't Save", 'Cancel'],
  choices: ['save', 'discard', 'cancel'] as CloseChoice[],
};

/** What a native message box shows. */
export interface DialogText {
  message: string;
  detail: string;
  buttons: string[];
  /** Cancel: Enter does nothing risky. */
  defaultId: number;
  /** Escape. */
  cancelId: number;
}

/** A title kept to one short line. */
function oneLine(title: string): string {
  const flat = title.replace(/\s+/g, ' ').trim();
  if (!flat) return 'Untitled';
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

export function closeDialogText(title: string, recoverable = true): DialogText {
  return {
    message: `Save the changes to “${oneLine(title)}” before closing?`,
    detail: recoverable
      ? "Your unsaved changes stay in Drafter's recovery copy either way."
      : "These changes are in no file and no recovery copy, so Don't Save loses them.",
    buttons: CLOSE_DIALOG.buttons,
    defaultId: 2,
    cancelId: 2,
  };
}

/** `recoverable`: the page's recovery copy worked when it last said (else none is promised). */
export function unresponsiveDialogText(recoverable = false): DialogText {
  return {
    message: 'Drafter isn’t responding.',
    detail: recoverable
      ? "Closing now may lose the last few seconds of typing. The rest stays in Drafter's recovery copy."
      : "Closing now may lose changes that are in no file: Drafter can't say whether its recovery copy has them.",
    buttons: ["Don't Save", 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  };
}

/** The page's answer to `state`, or null if it isn't one. */
export function parseCloseState(value: unknown): CloseState | null {
  if (typeof value !== 'object' || value === null) return null;
  const { unsaved, title, recoverable } = value as Record<string, unknown>;
  if (typeof unsaved !== 'boolean') return null;
  // Only a page that says its recovery copy works is believed: otherwise nothing is promised.
  return {
    unsaved,
    title: typeof title === 'string' ? title : '',
    recoverable: recoverable === true,
  };
}

// ---- The e2e hook ------------------------------------------------------------------------------

/** What a dialog said, as the hook logs it. */
export interface DialogShown {
  message: string;
  detail: string;
  buttons: string[];
}

/**
 * The next answer in the hook's queue (`DRAFTER_E2E_CLOSE`: a JSON array of `save`, `discard`, or
 * `cancel`), written back without it. Each dialog is logged, one JSON line each, to `<file>.log`.
 * An empty or missing queue says Don't Save, so a test that ends with changes can still quit;
 * anything unknown is a Cancel.
 */
export function nextCloseAnswer(file: string, shown: DialogShown): CloseChoice {
  appendFileSync(`${file}.log`, `${JSON.stringify(shown)}\n`);
  let queue: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (Array.isArray(parsed)) queue = parsed;
  } catch {
    return 'discard';
  }
  if (queue.length === 0) return 'discard';
  const answer = queue.shift();
  writeFileSync(file, JSON.stringify(queue));
  return answer === 'save' || answer === 'discard' ? answer : 'cancel';
}
