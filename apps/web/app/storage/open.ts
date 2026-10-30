import {
  ArchiveError,
  fromFadeIn,
  fromHighland,
  MAX_SCRIPT_BYTES as MAX_BYTES,
  notAScript,
  refusalMessage,
  SNIFF_BYTES,
} from '@drafter/archive';
import { FdxError, type FdxImport, fromFdx } from '@drafter/fdx';
import { ref, watch } from 'vue';
import { desktop } from '../desktop';
import { useEditor } from '../editor/session';
import { type ImportKind, importKindOf, kindOfFileName } from '../markdown/kind';
import { useSnapshots } from '../snapshots/use-snapshots';
import { nameOfPath } from './desktop-files';
import { sayInToast } from './export';
import { FileGoneError, FileProblemError, type PickedFile, useFiles } from './files';
import { useGuard } from './guard';
import { getHandle, kindOf, listProjects } from './projects';
import { READ_ONLY_HINT, readOnlyHint } from './save';
import { say } from './say';
import { useScript } from './script';
import { decodeFile, fileBaseName, type LineBreak, NotUtf8Error, titleFor } from './text';

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
  importTooBig: 'The script in this file is too big (over 5 MB), so Drafter didn’t open it.',
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

/**
 * What an import says: "Imported “The Call.fdx”.", and how many items came in as notes
 * (`[[fdx: …]]`, `[[osf: …]]`, `[[highland: …]]`), which Problems lists. Items, not paragraphs:
 * `mapped` also counts a scene number Fountain can't hold and elements that aren't paragraphs.
 */
function importedMessage(name: string, mapped: FdxImport['mapped']): string {
  const notes = mapped.reduce((sum, { count }) => sum + count, 0);
  const said = `Imported “${name}”.`;
  if (notes === 0) return said;
  return notes === 1
    ? `${said} 1 item came in as a note; Problems lists it.`
    : `${said} ${notes} items came in as notes; Problems lists them.`;
}

/**
 * Imports another app's file (Phase 2 design §22; Imports and Markdown out) as a new Fountain
 * script with no file: unsaved, so Save asks for a `.fountain` and never writes over the file it
 * came from. `run` reads it; a file it refuses (`FdxError`, `ArchiveError`) is said in the status
 * bar, and so is a script over 5 MB, and nothing opens.
 */
async function importScript(
  name: string,
  run: () => FdxImport | Promise<FdxImport>,
): Promise<void> {
  let imported: FdxImport;
  try {
    imported = await run();
  } catch (error) {
    if (!(error instanceof FdxError || error instanceof ArchiveError)) throw error;
    await say(openError, error.message);
    return;
  }
  // The script inside is at most 5 MB, but a note naming what else came in can take it over.
  if (new TextEncoder().encode(imported.text).byteLength > MAX_BYTES) {
    await say(openError, MESSAGES.importTooBig);
    return;
  }
  await openAsNewScript(imported.text, name, importedMessage(name, imported.mapped));
}

/**
 * Opens `text`, from the file `name`, as a new Fountain script with no file (`openImported`): not
 * matched to any script, unsaved, with an `imported` snapshot, and `message` in the toast. `format`
 * is a text file's line break and BOM, kept for Save.
 */
async function openAsNewScript(
  text: string,
  name: string,
  message: string,
  format: { lineBreak?: LineBreak; bom?: boolean } = {},
): Promise<void> {
  if (!(await useScript().openImported(text, name, format))) {
    await say(openError, MESSAGES.busy);
    return;
  }
  useSnapshots().afterImport(text, name);
  useEditor().view.focus();
  await sayInToast(message);
}

/**
 * A file's text, decoded strictly, or null when it isn't a script's text (too big, not text, not
 * UTF-8), which is said in the status bar.
 */
async function textOf(bytes: Uint8Array): Promise<ReturnType<typeof decodeFile> | null> {
  const problem = problemWith(bytes);
  if (problem) {
    await say(openError, problem);
    return null;
  }
  try {
    return decodeFile(bytes, { strict: true });
  } catch (error) {
    if (!(error instanceof NotUtf8Error)) throw error;
    await say(openError, MESSAGES.notUtf8);
    return null;
  }
}

/**
 * How to read an import, or null when it can't be read (said in the status bar). A Final Draft file
 * is XML text, so it passes Open's text checks first. A Highland or Fade In file is a zip, with NUL
 * bytes and a cap of its own (the archive's 32 MB), so it skips them: only the script inside is
 * decoded, strictly.
 */
async function importerFor(
  kind: ImportKind,
  bytes: Uint8Array,
): Promise<(() => FdxImport | Promise<FdxImport>) | null> {
  if (kind === 'highland') return () => fromHighland(bytes);
  if (kind === 'fadein') return () => fromFadeIn(bytes);
  const decoded = await textOf(bytes);
  return decoded ? () => fromFdx(decoded.text) : null;
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
 * How to open a file. `as: 'fountain'` (Open as screenplay…): a `.md` or `.markdown` file comes in
 * as a new Fountain script, for a screenplay someone typed in a Markdown file; any other file opens
 * as Open opens it.
 */
export interface OpenAs {
  as?: 'fountain';
}

/**
 * Opens a picked file (from `useFiles().pickToOpen`, `fromDrop`, or a file input) as a script.
 * Never rejects: a file that can't be opened leaves the open script alone and sets `openError`.
 */
export async function openFile(file: PickedFile, how: OpenAs = {}): Promise<void> {
  openError.value = '';
  try {
    // A tab that only shows a script may show old text, and opening replaces what it shows.
    if (useGuard().readOnly.value) {
      await say(readOnlyHint, READ_ONLY_HINT);
      return;
    }
    // A known kind that isn't a script (a Word document, an RTF file) is named, with what to do.
    // It lets a zip through only when it is named `.highland` or `.fadein`.
    const refusal = notAScript(file.name, file.bytes);
    if (refusal) {
      await say(openError, refusalMessage(file.name, refusal));
      return;
    }
    // A file from another app comes in as a new script; anything else opens as itself.
    const importing = importKindOf(file.name);
    if (importing) {
      const read = await importerFor(importing, file.bytes);
      if (!read) return;
      await ready();
      await importScript(file.name, read);
      return;
    }
    const decoded = await textOf(file.bytes);
    if (!decoded) return;
    await ready();
    const kind = kindOfFileName(file.name);
    // Open as screenplay: the Markdown file's text, exactly as it is (its line break and BOM
    // too), as a new script that is never the file's, so Save asks for a .fountain and the .md is
    // never written as Fountain.
    if (how.as === 'fountain' && kind === 'markdown') {
      await openAsNewScript(decoded.text, file.name, `Opened “${file.name}” as a screenplay.`, {
        lineBreak: decoded.lineBreak,
        bom: decoded.bom,
      });
      return;
    }
    const script = useScript();
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
export async function pickAndOpen(how: OpenAs = {}): Promise<void> {
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
  if (file) await openFile(file, how);
}

/** Open as screenplay…: the same picker as Open; a .md or .markdown comes in as a new Fountain script. */
export async function pickAndOpenAs(as: 'fountain'): Promise<void> {
  await pickAndOpen({ as });
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
