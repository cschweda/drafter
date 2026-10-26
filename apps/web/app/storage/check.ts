import { parse } from '@drafter/fountain';
import { ref, watch } from 'vue';
import { useEditor } from '../editor/session';
import { FileGoneError, useFiles } from './files';
import { useGuard } from './guard';
import { hashText } from './hash';
import { getHandle } from './projects';
import { say } from './say';
import { type OpenedFile, useScript } from './script';
import { decodeFile, fileBaseName, NotUtf8Error, titleOf } from './text';
import { inTurn } from './turn';

/**
 * Checking for a file changed somewhere else, such as another computer syncing through Dropbox
 * (Phase 1 design §9.6). It runs when a script opens, when the window regains focus, and before
 * Save writes. The file is read only through `useFiles()`.
 */

export type Comparison = 'same' | 'file-changed' | 'browser-changed' | 'both-changed';

/**
 * `saved` is the hash of the text as last saved; the file and the browser each changed if their
 * hash differs from it. A file and a browser that changed to the same text have lost nothing to
 * each other, so that is `same`.
 */
export function compareVersions(hashes: {
  saved: string;
  file: string;
  browser: string;
}): Comparison {
  const file = hashes.file !== hashes.saved;
  const browser = hashes.browser !== hashes.saved;
  if (file && browser) return hashes.file === hashes.browser ? 'same' : 'both-changed';
  if (file) return 'file-changed';
  return browser ? 'browser-changed' : 'same';
}

/**
 * `source` with its Title set to `title`: the title field's lines are replaced, else a Title is
 * added to the title page, else a title page is made. A script is called by its Title, so this is
 * what names a copy.
 */
export function retitle(source: string, title: string): string {
  const doc = parse(source);
  const line = `Title: ${title}`;
  const field = doc.titlePage?.fields.find((f) => f.key.trim().toLowerCase() === 'title');
  if (field) return source.slice(0, field.span.from) + line + source.slice(field.span.to);
  if (doc.titlePage) return `${line}\n${source}`;
  return source === '' ? `${line}\n` : `${line}\n\n${source}`;
}

// ---- What the page shows -------------------------------------------------------------------------

/** Why the file can't be compared, for the bar. */
export interface FileTrouble {
  /** `permission`: the browser hasn't let Drafter read it. `gone`: moved or deleted. `not-text`: it no longer holds UTF-8 text. */
  kind: 'permission' | 'gone' | 'not-text';
  fileName: string;
}
export const fileTrouble = ref<FileTrouble | null>(null);

/** "Updated from The Call.fountain.": a toast, and a live region. Empty after a few seconds. */
export const updatedNotice = ref('');
const NOTICE_MS = 8000;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
async function announce(message: string) {
  clearTimeout(noticeTimer);
  await say(updatedNotice, message);
  noticeTimer = setTimeout(() => {
    updatedNotice.value = '';
  }, NOTICE_MS);
}

export type BothChangedChoice = 'file' | 'browser' | 'later';

/** The question "which to keep working on" while it waits; the dialog shows it and calls `answer`. */
export const bothChangedQuestion = ref<{
  title: string;
  fileName: string;
  answer(choice: BothChangedChoice): void;
} | null>(null);

function askWhichToKeep(title: string, fileName: string): Promise<BothChangedChoice> {
  return new Promise((resolve) => {
    bothChangedQuestion.value = {
      title,
      fileName,
      answer(choice) {
        bothChangedQuestion.value = null;
        resolve(choice);
      },
    };
  });
}

// ---- The check ---------------------------------------------------------------------------------------

/** `stop`: the file changed (or can't be read), so a save must not go on. */
type Outcome = 'clear' | 'stop';

/** How many times the check starts again because the text or the script changed while it read. */
const ATTEMPTS = 3;

function ready(script: ReturnType<typeof useScript>): Promise<void> {
  if (script.ready.value) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(script.ready, (on) => {
      if (!on) return;
      stop();
      resolve();
    });
  });
}

/**
 * `ask`: the permission may be asked for (a click or a save is behind this). `forSave`: a file
 * that is gone is left for Save's own handling, which asks where to save it.
 */
async function doCheck(ask: boolean, forSave: boolean): Promise<Outcome> {
  const script = useScript();
  const files = useFiles();
  const editor = useEditor();
  const guard = useGuard();
  await ready(script);

  const settle = (trouble: FileTrouble | null) => {
    fileTrouble.value = trouble;
    script.fileLocked.value = trouble?.kind === 'permission';
  };
  const text = () => editor.view.state.doc.toString();

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // Another tab edits it, and checks it: this one only shows it.
    if (guard.readOnly.value) return 'clear';
    const p = script.project.value;
    if (!p || p.sample || !p.fsHandleId) {
      settle(null);
      return 'clear';
    }
    const id = p.id;
    const handle = await getHandle(p.fsHandleId);
    if (!handle) {
      settle(null);
      return 'clear';
    }
    const name = handle.name;
    const gone = (): Outcome => {
      settle({ kind: 'gone', fileName: name });
      return forSave ? 'clear' : 'stop';
    };

    let permission: Awaited<ReturnType<typeof files.permission>>;
    try {
      permission = await files.permission(handle, ask);
    } catch (error) {
      if (error instanceof FileGoneError) return gone();
      throw error;
    }
    if (permission !== 'granted') {
      settle({ kind: 'permission', fileName: name });
      // Save asked, and was refused: the write says so itself.
      return ask ? 'clear' : 'stop';
    }

    let bytes: Uint8Array;
    try {
      bytes = (await files.read(handle)).bytes;
    } catch (error) {
      if (error instanceof FileGoneError) return gone();
      throw error;
    }
    let decoded: ReturnType<typeof decodeFile>;
    try {
      decoded = decodeFile(bytes, { strict: true });
    } catch (error) {
      if (!(error instanceof NotUtf8Error)) throw error;
      settle({ kind: 'not-text', fileName: name });
      return 'stop';
    }

    const browserText = text();
    const [fileHash, browserHash] = await Promise.all([
      hashText(decoded.text),
      hashText(browserText),
    ]);
    const now = script.project.value;
    // The writer typed, or switched scripts, while the file was read: look again.
    if (!now || now.id !== id || now.savedHash !== p.savedHash || text() !== browserText) continue;
    settle(null);
    if (now.savedHash === undefined) return 'clear';

    const opened: OpenedFile = {
      text: decoded.text,
      lineBreak: decoded.lineBreak,
      bom: decoded.bom,
      fileName: name,
      ref: handle,
    };
    const verdict = compareVersions({ saved: now.savedHash, file: fileHash, browser: browserHash });
    if (verdict === 'same' || verdict === 'browser-changed') {
      // Changed to the same text in both places: that text is what the file has, as saved.
      if (verdict === 'same' && fileHash !== now.savedHash) await script.saved(opened);
      return 'clear';
    }
    // A switch is under way: the text is about to be another script's.
    if (script.busy.value) return 'stop';

    if (verdict === 'file-changed') {
      // The file wins. One change, so undo brings the previous text back.
      if ((await script.replaceWith(id, opened)) === 'replaced') {
        await announce(`Updated from ${name}.`);
      }
      return 'stop';
    }

    return bothChanged(script, id, name, browserText, opened);
  }
  return 'stop';
}

/** Both changed: asks which to work on, and keeps the other as a script of its own. */
async function bothChanged(
  script: ReturnType<typeof useScript>,
  id: string,
  name: string,
  browserText: string,
  opened: OpenedFile,
): Promise<Outcome> {
  const title = titleOf(parse(browserText), fileBaseName(script.project.value?.fileName ?? name));
  const choice = await askWhichToKeep(title, name);
  // Dismissed: nothing changes, and the next check asks again.
  if (choice === 'later') return 'stop';
  // The dialog is modal, but a tab handover or a switch could still have moved on.
  if (script.project.value?.id !== id || script.busy.value) return 'stop';

  if (choice === 'file') {
    // The browser's text is kept first: if that fails, nothing is replaced.
    await script.addScript(retitle(browserText, `${title} (this browser's copy)`));
    if ((await script.replaceWith(id, opened)) === 'replaced') {
      await announce(
        `Updated from ${name}. Your version is kept as “${title} (this browser's copy)”.`,
      );
    }
  } else {
    await script.addScript(retitle(opened.text, `${title} (from the file)`));
    // The file's version is now the one that has been seen: saving writes this browser's text.
    await script.saved(opened);
    await announce(
      `Kept this browser's version. The file's is kept as “${title} (from the file)”.`,
    );
  }
  return 'stop';
}

// ---- The entry points -----------------------------------------------------------------------------

/** A check that is waiting its turn: a second request for one joins it. */
let waiting: Promise<void> | undefined;

const quietly = (run: Promise<unknown>) =>
  run.then(
    () => {},
    () => {},
  );

function check(options: { ask?: boolean } = {}): Promise<void> {
  if (options.ask) return quietly(inTurn(() => doCheck(true, false)));
  // Already asking which to keep: asking again would only repeat the question.
  if (bothChangedQuestion.value) return Promise.resolve();
  waiting ??= quietly(
    inTurn(() => {
      waiting = undefined;
      return doCheck(false, false);
    }),
  );
  return waiting;
}

/**
 * Save's check, inside Save's own turn. `stop`: the file changed (and was loaded, or the writer
 * was asked which to keep), so nothing is written. A file that can't be read for another reason
 * rejects, and Save says it couldn't save.
 */
function beforeSave(): Promise<Outcome> {
  return doCheck(true, true);
}

/** "Edit this browser's copy": the script lets go of its file, and the bar goes. */
async function editCopy(): Promise<void> {
  const script = useScript();
  const id = script.project.value?.id;
  if (!id) return;
  await script.unbindFile(id);
  fileTrouble.value = null;
  script.fileLocked.value = false;
}

export function useFileCheck(): {
  check(options?: { ask?: boolean }): Promise<void>;
  beforeSave(): Promise<Outcome>;
  editCopy(): Promise<void>;
} {
  return { check, beforeSave, editCopy };
}

/**
 * Starts checking: when the first script is ready and whenever another is shown or its file
 * changes, and when the window regains focus. Returns the function that stops it.
 */
export function installFileCheck(): () => void {
  const script = useScript();
  const guard = useGuard();
  const run = () => void check();
  const onVisible = () => {
    if (document.visibilityState === 'visible') run();
  };
  window.addEventListener('focus', run);
  document.addEventListener('visibilitychange', onVisible);
  const stop = watch(
    () =>
      [
        script.ready.value,
        script.project.value?.id,
        script.project.value?.fsHandleId,
        guard.readOnly.value,
      ] as const,
    run,
    { immediate: true },
  );
  return () => {
    window.removeEventListener('focus', run);
    document.removeEventListener('visibilitychange', onVisible);
    stop();
  };
}
