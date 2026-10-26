import { ref, watch } from 'vue';
import { fileKeys } from '../editor/extensions';
import { useEditor } from '../editor/session';
import { FileGoneError, type FileRef, useFiles } from './files';
import { useGuard } from './guard';
import { getHandle } from './projects';
import { useScript } from './script';
import { encodeFile, fileNameFor, titleOf } from './text';

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

let queue: Promise<unknown> = Promise.resolve();

/** One save at a time: a second request made while one is under way waits for it. */
function inTurn<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

function messageFor(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Drafter isn’t allowed to write that file. Choose Save As to save it somewhere else.';
  }
  return 'Couldn’t save the file.';
}

/** Resolves once no switch of scripts is under way. */
function idle(script: ReturnType<typeof useScript>): Promise<void> {
  if (!script.busy.value) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = watch(script.busy, (on) => {
      if (on) return;
      stop();
      resolve();
    });
  });
}

async function run(ask: boolean): Promise<'saved' | 'cancelled'> {
  const files = useFiles();
  const script = useScript();
  const editor = useEditor();
  // A switch under way finishes first: the save is of the script that is open when it starts.
  await idle(script);
  const held = script.project.value;
  const id = held?.id;
  const title = titleOf(editor.doc.value);
  const name = held?.fileName ?? fileNameFor(title, '.fountain');
  const lineBreak = held?.lineBreak ?? '\n';
  const bom = held?.bom ?? false;
  // The text is read as late as it can be, so what is written is what the editor shows.
  const shown = () => editor.view.state.doc.toString();

  if (!files.canSaveInPlace) {
    const text = shown();
    files.download(name, encodeFile(text, lineBreak, bom), 'text/plain');
    await script.saved({ text, fileName: name, ref: null, ...(id ? { id } : {}) });
    return 'saved';
  }

  // Save writes to the file the script is bound to; a sample, or a script with no file, asks.
  let target: FileRef | undefined;
  if (!ask && held && !held.sample && held.fsHandleId) target = await getHandle(held.fsHandleId);
  let picked = false;
  const pick = async () => {
    target = (await files.pickToSave(name, 'fountain')) ?? undefined;
    picked = true;
    return target !== undefined;
  };
  if (!target && !(await pick())) return 'cancelled';

  for (;;) {
    const text = shown();
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
    readOnlyHint.value = READ_ONLY_HINT;
    return 'cancelled';
  }
  return inTurn(async () => {
    saveError.value = '';
    try {
      const result = await run(ask);
      if (result === 'saved') announceSave();
      return result;
    } catch (error) {
      saveError.value = messageFor(error);
      throw error;
    }
  });
}

/** Saves to the script's file; asks where first for a sample or a script with no file. Mod-s. */
export const save = (): Promise<'saved' | 'cancelled'> => attempt(false);

/** Asks where to save, and the script follows the new file. Mod-Shift-s. */
export const saveAs = (): Promise<'saved' | 'cancelled'> => attempt(true);

/**
 * Mod-s and Mod-Shift-s from anywhere on the page, so the browser's own Save Page never opens. A
 * capture listener on the window sees the keys before anything in the page does; the editor's
 * keymap has the same two as a second way in. Returns the function that removes it. Plan 4's
 * command registry takes the keys over and lists them.
 */
export function installSaveKeys(): () => void {
  const quietly = (action: () => Promise<unknown>) => () => void action().catch(() => {});
  fileKeys.save = quietly(save);
  fileKeys.saveAs = quietly(saveAs);
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 's' || event.altKey) return;
    if (!(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (event.shiftKey) fileKeys.saveAs();
    else fileKeys.save();
  };
  window.addEventListener('keydown', onKeydown, true);
  // What went wrong with one script's save isn't news about the next one.
  const stop = watch(
    () => useScript().project.value?.id,
    () => {
      saveError.value = '';
    },
  );
  return () => {
    window.removeEventListener('keydown', onKeydown, true);
    stop();
  };
}
