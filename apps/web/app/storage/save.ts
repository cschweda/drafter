import { ref } from 'vue';
import { fileKeys } from '../editor/extensions';
import { useEditor } from '../editor/session';
import { FileGoneError, type FileRef, useFiles } from './files';
import { getHandle } from './projects';
import { useScript } from './script';
import { encodeFile, fileNameFor, titleOf } from './text';

/** What went wrong with the last save, for the status bar; empty after a save that worked. */
export const saveError = ref('');

let queue: Promise<unknown> = Promise.resolve();

/** One save at a time: a second request made while one is under way waits for it. */
function inTurn<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

function messageFor(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Drafter isn’t allowed to write that file.';
  }
  return 'Couldn’t save the file.';
}

async function run(ask: boolean): Promise<'saved' | 'cancelled'> {
  const files = useFiles();
  const script = useScript();
  const editor = useEditor();
  const held = script.project.value;
  const title = titleOf(editor.doc.value);
  const name = held?.fileName ?? fileNameFor(title, '.fountain');
  const lineBreak = held?.lineBreak ?? '\n';
  const bom = held?.bom ?? false;
  // The text is read as late as it can be, so what is written is what the editor shows.
  const shown = () => editor.view.state.doc.toString();

  if (!files.canSaveInPlace) {
    const text = shown();
    files.download(name, encodeFile(text, lineBreak, bom), 'text/plain');
    await script.saved({ text, fileName: name, ref: null });
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
      await script.saved({ text, fileName: (target as FileRef).name, ref: target as FileRef });
      return 'saved';
    } catch (error) {
      // The file the script came from has moved or gone: where to now?
      if (!(error instanceof FileGoneError) || picked) throw error;
      if (!(await pick())) return 'cancelled';
    }
  }
}

async function attempt(ask: boolean): Promise<'saved' | 'cancelled'> {
  return inTurn(async () => {
    saveError.value = '';
    try {
      return await run(ask);
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
  return () => window.removeEventListener('keydown', onKeydown, true);
}
