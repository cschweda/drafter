import { parse } from '@drafter/fountain';
import { ref, watch } from 'vue';
import { useEditor } from '../editor/session';
import { type PickedFile, useFiles } from './files';
import { useGuard } from './guard';
import { getHandle, listProjects } from './projects';
import { READ_ONLY_HINT, readOnlyHint } from './save';
import { say } from './say';
import { useScript } from './script';
import { decodeFile, fileBaseName, NotUtf8Error, titleOf } from './text';

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
    const script = useScript();
    const opened = { ...decoded, fileName: file.name, ref: file.ref };

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
      const title = titleOf(parse(decoded.text), fileBaseName(file.name));
      const twin = (await listProjects()).find(
        (p) => !p.sample && nameKey(p.title) === nameKey(title),
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
