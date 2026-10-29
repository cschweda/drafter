import { FdxError, type FdxImport, fromFdx } from '@drafter/fdx';
import { ref, watch } from 'vue';
import { desktop } from '../desktop';
import { useEditor } from '../editor/session';
import { isFinalDraftName, kindOfFileName } from '../markdown/kind';
import { nameOfPath } from './desktop-files';
import { sayInToast } from './export';
import { FileGoneError, FileProblemError, type PickedFile, useFiles } from './files';
import { useGuard } from './guard';
import { getHandle, kindOf, listProjects } from './projects';
import { READ_ONLY_HINT, readOnlyHint } from './save';
import { say } from './say';
import { useScript } from './script';
import { decodeFile, fileBaseName, NotUtf8Error, titleFor } from './text';

/** Bigger than this isn't a script (a feature film is well under 1 MB). */
export const MAX_BYTES = 5 * 1024 * 1024;
/** A NUL byte in this many leading bytes means the file is not text. */
const SNIFF_BYTES = 8 * 1024;

/** Why the last file wasn't opened, for the status bar; empty after one that was. */
export const openError = ref('');

export type SameTitleChoice = 'replace' | 'beside' | 'cancel';

/**
 * The question "a script with this title is already here" while it waits for an answer; the
 * dialog shows it and calls `answer`. Null when nothing is being asked.
 */
export const sameTitleQuestion = ref<{
  title: string;
  answer(choice: SameTitleChoice): void;
} | null>(null);

function ask(title: string): Promise<SameTitleChoice> {
  return new Promise((resolve) => {
    sameTitleQuestion.value = {
      title,
      answer(choice) {
        sameTitleQuestion.value = null;
        resolve(choice);
      },
    };
  });
}

const MESSAGES = {
  tooBig: 'This file is too big to be a script (over 5 MB), so Drafter didn’t open it.',
  binary: 'This file isn’t a script: it holds more than text, so Drafter didn’t open it.',
  notUtf8:
    'This file isn’t UTF-8 text, so Drafter didn’t open it: saving would change its characters. Save it as UTF-8 in the app that made it, then open it again.',
  busy: 'Another script is still opening. Try again in a moment.',
  held: 'That script is open for editing in another tab, so it can’t be replaced here. Close it there first.',
  failed: 'Couldn’t open the file. Your current script is unchanged.',
};

/** What a file is: the problem with it, or null when it can be opened. */
function problemWith(bytes: Uint8Array): string | null {
  if (bytes.byteLength > MAX_BYTES) return MESSAGES.tooBig;
  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) return MESSAGES.binary;
  return null;
}

const nameKey = (title: string) => title.trim().toLowerCase();

/** What an import says: "Imported “The Call.fdx”.", and how many paragraphs came in as notes. */
function importedMessage(name: string, mapped: FdxImport['mapped']): string {
  const notes = mapped.reduce((sum, { count }) => sum + count, 0);
  const said = `Imported “${name}”.`;
  if (notes === 0) return said;
  return notes === 1
    ? `${said} 1 paragraph came in as a note marked [[fdx: …]].`
    : `${said} ${notes} paragraphs came in as notes marked [[fdx: …]].`;
}

/**
 * Imports a Final Draft file's text (Phase 2 design §22) as a new Fountain script with no file:
 * unsaved, so Save asks for a `.fountain` and never writes over the `.fdx`. A file `fromFdx`
 * refuses is said in the status bar, and nothing opens.
 */
async function importFinalDraft(name: string, xml: string): Promise<void> {
  let imported: FdxImport;
  try {
    imported = fromFdx(xml);
  } catch (error) {
    if (!(error instanceof FdxError)) throw error;
    await say(openError, error.message);
    return;
  }
  if (!(await useScript().openImported(imported.text, name))) {
    await say(openError, MESSAGES.busy);
    return;
  }
  useEditor().view.focus();
  await sayInToast(importedMessage(name, imported.mapped));
}

/** The script already open for this file, if it came from the same file on disk. */
async function openedAlready(file: PickedFile) {
  if (!file.ref) return undefined;
  const files = useFiles();
  for (const project of await listProjects()) {
    if (!project.fsHandleId) continue;
    const held = await getHandle(project.fsHandleId);
    if (held && (await files.sameFile(file.ref, held))) return project;
  }
  return undefined;
}

/** Waits for the first project, so a file dropped as the page starts isn't lost. */
function ready(): Promise<void> {
  const script = useScript();
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
 * Opens a picked file (from `useFiles().pickToOpen`, `fromDrop`, or a file input) as a script.
 * Never rejects: a file that can't be opened leaves the open script alone and sets `openError`.
 */
export async function openFile(file: PickedFile): Promise<void> {
  openError.value = '';
  try {
    // A tab that only shows a script may show old text, and opening replaces what it shows.
    if (useGuard().readOnly.value) {
      await say(readOnlyHint, READ_ONLY_HINT);
      return;
    }
    const problem = problemWith(file.bytes);
    if (problem) {
      await say(openError, problem);
      return;
    }
    let decoded: ReturnType<typeof decodeFile>;
    try {
      decoded = decodeFile(file.bytes, { strict: true });
    } catch (error) {
      if (!(error instanceof NotUtf8Error)) throw error;
      await say(openError, MESSAGES.notUtf8);
      return;
    }
    await ready();
    // A Final Draft file is never a script's file: it comes in as a new one.
    if (isFinalDraftName(file.name)) {
      await importFinalDraft(file.name, decoded.text);
      return;
    }
    const script = useScript();
    const kind = kindOfFileName(file.name);
    const opened = { ...decoded, fileName: file.name, ref: file.ref, kind };

    // The same file on disk is the same script.
    const already = await openedAlready(file);
    if (already) {
      await script.open(already.id);
      if (script.project.value?.id === already.id) useEditor().view.focus();
      else await say(openError, MESSAGES.busy);
      return;
    }

    // Where saving downloads, nothing says two files are one script but their titles (§9.6).
    let replacing: string | undefined;
    if (!useFiles().canSaveInPlace) {
      const title = titleFor(kind, decoded.text, fileBaseName(file.name));
      // A Markdown file is never the twin of a screenplay with the same title, nor the reverse.
      const twin = (await listProjects()).find(
        (p) => !p.sample && kindOf(p) === kind && nameKey(p.title) === nameKey(title),
      );
      if (twin) {
        const choice = await ask(title);
        if (choice === 'cancel') return;
        if (choice === 'replace') replacing = twin.id;
      }
    }

    if (replacing) {
      const result = await script.replaceWith(replacing, opened);
      if (result === 'held') await say(openError, MESSAGES.held);
      else if (result === 'busy') await say(openError, MESSAGES.busy);
    } else if (!(await script.openedFile(opened))) {
      await say(openError, MESSAGES.busy);
      return;
    }
    if (!openError.value) useEditor().view.focus();
    if (file.notice) await say(openError, file.notice);
  } catch {
    await say(openError, MESSAGES.failed);
  }
}

/** Opens the file the writer picks, with the picker where the browser has one, else a file input. */
export async function pickAndOpen(): Promise<void> {
  // Ask before the picker: a read-only tab opens nothing, so don't make the writer choose a file for it.
  if (useGuard().readOnly.value) {
    await say(readOnlyHint, READ_ONLY_HINT);
    return;
  }
  let file: PickedFile | null;
  try {
    file = await useFiles().pickToOpen();
  } catch {
    await say(openError, MESSAGES.failed);
    return;
  }
  if (file) await openFile(file);
}

/** Why a file the system named couldn't be read, said after "Drafter can’t open “x”: ". */
function reasonFor(error: unknown): string {
  if (error instanceof FileGoneError) return 'it isn’t there';
  if (error instanceof FileProblemError) return error.message;
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Drafter isn’t allowed to read it';
  }
  return 'it can’t be read';
}

/**
 * Opens a script the system named (the desktop app: the command line, a second launch), the way
 * Open from the menu does: a file that is already open is shown, the script on show stays in the
 * browser store, and a file that can't be read is said so in the status bar. Never rejects.
 */
export async function openPath(path: string): Promise<void> {
  const files = useFiles();
  if (!files.fromPath) return;
  let file: PickedFile;
  try {
    file = await files.fromPath(path);
  } catch (error) {
    await say(openError, `Drafter can’t open “${nameOfPath(path)}”: ${reasonFor(error)}.`);
    return;
  }
  await openFile(file);
}

/**
 * Listens for the scripts the desktop app is asked to open, one after another in the order named.
 * Does nothing in a browser. Returns the function that stops it.
 */
export function installSystemOpen(): () => void {
  const bridge = desktop();
  if (!bridge) return () => {};
  let queue: Promise<void> = Promise.resolve();
  return bridge.onOpenFile(
    (path) => {
      queue = queue.then(() => openPath(path));
    },
    (message) => {
      queue = queue.then(() => say(openError, message));
    },
  );
}
