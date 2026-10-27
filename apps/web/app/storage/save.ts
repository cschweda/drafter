import { isolateHistory } from '@codemirror/commands';
import { ref, watch } from 'vue';
import { useEditor } from '../editor/session';
import { appChange } from '../editor/typewriter';
import { kindOfFileName } from '../markdown/kind';
import { markdownTitle } from '../markdown/title';
import { CheckUnsettledError, useFileCheck } from './check';
import { FileGoneError, FileProblemError, type FileRef, useFiles } from './files';
import { useGuard } from './guard';
import { getHandle, getProject } from './projects';
import { say, timedSay } from './say';
import { useScript } from './script';
import { encodeFile, fileBaseName, fileNameFor, titleOf } from './text';
import { inTurn, whenIdle } from './turn';

/** What went wrong with the last save, for the status bar; empty after a save that worked. */
export const saveError = ref('');

/**
 * What a screen reader hears when a save lands: "Saved", then nothing again a moment later, so the
 * next save is a change in the live region and is heard too. Spoken from the save itself, not from
 * the script's record of it, so opening a saved script says nothing.
 */
export const saveAnnouncement = ref('');
let clearing: ReturnType<typeof setTimeout> | undefined;
let speaking: ReturnType<typeof setTimeout> | undefined;
function announceSave() {
  clearTimeout(clearing);
  clearTimeout(speaking);
  saveAnnouncement.value = '';
  // After the empty text has been drawn.
  speaking = setTimeout(() => {
    saveAnnouncement.value = 'Saved';
    clearing = setTimeout(() => {
      saveAnnouncement.value = '';
    }, 2000);
  }, 100);
}

/**
 * Said by the status bar after Save, Save As, or opening a file is tried in a tab that only shows
 * a script another tab is editing. That tab may show old text, so it writes nothing and opens
 * nothing until the writer chooses "Edit here instead".
 */
export const READ_ONLY_HINT =
  'This tab only shows a script that’s open for editing in another tab. Choose “Edit here instead” first.';
export const readOnlyHint = ref('');
// It goes away when the tab can edit.
watch(useGuard().readOnly, (on) => {
  if (!on) readOnlyHint.value = '';
});

function messageFor(error: unknown): string {
  if (error instanceof CheckUnsettledError) {
    return 'Couldn’t check the file for changes because the script kept changing. Nothing was saved. Try saving again.';
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Drafter isn’t allowed to write that file. Choose Save As to save it somewhere else.';
  }
  // The desktop app's writes replace the file whole or not at all (apps/desktop/src/files.ts).
  if (error instanceof FileProblemError) {
    return `Couldn’t save the file: ${error.message}. The file on disk is as it was.`;
  }
  return 'Couldn’t save the file.';
}

async function run(ask: boolean): Promise<'saved' | 'cancelled'> {
  const files = useFiles();
  const script = useScript();
  const editor = useEditor();
  // A switch under way finishes first: the save is of the script that is open when it starts.
  await whenIdle(script.busy);
  const held = script.project.value;
  const id = held?.id;
  // A Markdown document is called by its first heading and saved as `.md`; one with no title is
  // called after its file, as the project's own title is.
  const markdown = editor.kind.value === 'markdown';
  const fallback = fileBaseName(held?.fileName);
  const title = markdown
    ? (markdownTitle(editor.view.state.doc.toString()) ?? fallback)
    : titleOf(editor.doc.value, fallback);
  // A script whose kind changed since its file was made is no longer that file's: the file is a
  // .fountain and the text is Markdown, or the reverse. Saving would put one kind's text in the
  // other's file, so Save acts as Save As, suggesting the new kind's extension, and the file it
  // makes replaces the binding. The kind change itself unbinds nothing.
  const bound = !!held?.fileName && kindOfFileName(held.fileName) === editor.kind.value;
  const name = bound
    ? (held?.fileName as string)
    : fileNameFor(title, markdown ? '.md' : '.fountain');
  const lineBreak = held?.lineBreak ?? '\n';
  const bom = held?.bom ?? false;
  // The text is read as late as it can be, so what is written is what the editor shows.
  const shown = () => editor.view.state.doc.toString();
  const started = shown();
  /**
   * What to write: the editor's text while the script the save started on is the one open. If
   * another was opened meanwhile (while the picker was up), the editor shows that one, so the
   * starting script's own text is read from storage (opening the other flushed it there), or, if
   * it is gone, is what the save started with.
   */
  const textToWrite = async () => {
    if (!id || script.project.value?.id === id) return shown();
    return (await getProject(id))?.source ?? started;
  };

  if (!files.canSaveInPlace) {
    const text = shown();
    files.download(name, encodeFile(text, lineBreak, bom), 'text/plain');
    await script.saved({ text, fileName: name, ref: null, ...(id ? { id } : {}) });
    return 'saved';
  }

  // Save writes to the file the script is bound to; a sample, or a script with no file, asks.
  let target: FileRef | undefined;
  if (!ask && held && !held.sample && held.fsHandleId && bound) {
    target = await getHandle(held.fsHandleId);
  }
  let picked = false;
  const pick = async () => {
    target = (await files.pickToSave(name, markdown ? 'markdown' : 'fountain')) ?? undefined;
    picked = true;
    return target !== undefined;
  };
  if (!target && !(await pick())) return 'cancelled';

  // Never overwrite a file that changed somewhere else: if it did, the check has dealt with it
  // (loaded it, or asked which version to keep), and the writer saves again knowing what is there.
  if (!picked && (await useFileCheck().beforeSave()) === 'stop') return 'cancelled';

  for (;;) {
    const text = await textToWrite();
    try {
      await files.write(target as FileRef, encodeFile(text, lineBreak, bom));
      await script.saved({
        text,
        fileName: (target as FileRef).name,
        ref: target as FileRef,
        ...(id ? { id } : {}),
      });
      return 'saved';
    } catch (error) {
      // The file the script came from has moved or gone: where to now?
      if (!(error instanceof FileGoneError) || picked) throw error;
      if (!(await pick())) return 'cancelled';
    }
  }
}

async function attempt(ask: boolean): Promise<'saved' | 'cancelled'> {
  if (useGuard().readOnly.value) {
    await say(readOnlyHint, READ_ONLY_HINT);
    return 'cancelled';
  }
  return inTurn(async () => {
    saveError.value = '';
    try {
      const result = await run(ask);
      if (result === 'saved') {
        announceSave();
        // The file is the one that was just written: a bar about the old one (it was gone) is stale.
        void useFileCheck().check();
      }
      return result;
    } catch (error) {
      await say(saveError, messageFor(error));
      throw error;
    }
  });
}

/** Saves to the script's file; asks where first for a sample or a script with no file. Mod-s. */
export const save = (): Promise<'saved' | 'cancelled'> => attempt(false);

/** Asks where to save, and the script follows the new file. Mod-Shift-s. */
export const saveAs = (): Promise<'saved' | 'cancelled'> => attempt(true);

/**
 * Clears what went wrong with one script's save when another script is opened: it isn't news
 * about the next one. Returns the function that stops it. The keys for Save and Save As belong to
 * the command registry (`commands/registry.ts`), which binds them on the whole page.
 */
export function watchSaveError(): () => void {
  return watch(
    () => useScript().project.value?.id,
    () => {
      saveError.value = '';
    },
  );
}

// ---- Revert to Saved ---------------------------------------------------------------------------

/**
 * "Reverted to the text last saved to The Call.fountain. Undo brings your changes back.": a toast,
 * and a polite live region. Empty after a few seconds.
 */
export const revertNotice = ref('');
const announceRevert = timedSay(revertNotice, 8000);

/**
 * Whether there is something to go back to: the script has changes, and the text last saved to its
 * file is known. Not for a sample or a script never saved to a file; not in a tab that only shows
 * the script or while a switch of scripts is under way (the editor is locked then); and not when
 * the script's kind is no longer its file's (the saved text is the other kind's).
 */
export function canRevert(): boolean {
  const script = useScript();
  return (
    script.dirty.value &&
    script.savedText.value !== null &&
    fitsFile() &&
    !useEditor().locked.value &&
    !useGuard().taking.value &&
    !script.busy.value
  );
}

/** The script is Fountain or Markdown as its file's name says. */
function fitsFile(): boolean {
  const file = useScript().project.value?.fileName;
  return file !== undefined && kindOfFileName(file) === useEditor().kind.value;
}

/**
 * Why Revert to Saved is off when it isn't obvious: the script has changes and a saved file, but
 * its type was changed since (the file is a .fountain and the text is Markdown, or the reverse),
 * so the saved text is the other type's. Undefined otherwise. The app menu shows it beside the
 * disabled item.
 */
export function revertWhy(): string | undefined {
  const script = useScript();
  if (!script.dirty.value || script.savedText.value === null) return undefined;
  if (script.project.value?.fileName === undefined || fitsFile()) return undefined;
  return 'The saved file is a different type of document';
}

/**
 * Puts the text last saved to the script's file back in the editor, as one change: one undo brings
 * every change since back. Writes nothing. Does nothing when `canRevert` is false.
 */
export function revertToSaved(): void {
  if (!canRevert()) return;
  const script = useScript();
  const { view } = useEditor();
  const target = script.savedText.value as string;
  const file = script.project.value?.fileName as string;
  const current = view.state.doc.toString();
  // Only the part that differs is replaced, so the cursor, the folds, and the scroll stay where they are.
  let from = 0;
  const shortest = Math.min(current.length, target.length);
  while (from < shortest && current.charCodeAt(from) === target.charCodeAt(from)) from++;
  let end = 0;
  while (
    end < shortest - from &&
    current.charCodeAt(current.length - 1 - end) === target.charCodeAt(target.length - 1 - end)
  ) {
    end++;
  }
  view.dispatch({
    changes: { from, to: current.length - end, insert: target.slice(from, target.length - end) },
    // Its own undo step, not joined to the typing before it.
    // Drafter's change, not the writer's: no writing time for it (stats/writing.ts).
    annotations: [isolateHistory.of('full'), appChange.of(true)],
    userEvent: 'input.replace',
  });
  void announceRevert(`Reverted to the text last saved to ${file}. Undo brings your changes back.`);
}
