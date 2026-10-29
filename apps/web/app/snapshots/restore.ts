import { replaceText } from '../editor/replace-text';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { useGuard } from '../storage/guard';
import { useScript } from '../storage/script';
import { listSnapshots, type SnapshotInfo, snapshotText } from '../storage/snapshots';
import { snapshotTime } from './history';
import { useSnapshots } from './use-snapshots';

// Restore (Phase 2 design §11.1): a snapshot's text back in the editor, as one change one undo
// takes back, after a snapshot of the text it replaces. It writes no file: the writer saves or not.

export const GONE = 'That snapshot isn’t there any more, so nothing was changed.';

/**
 * Why History's Restore, Label…, Delete, and Take snapshot are off, or null (Call 25): another tab
 * is editing the script, or its file is being checked. The Outline's words for the same states.
 */
export function historyReadOnly(): string | null {
  if (useGuard().readOnly.value || useEditor().locked.value) {
    return 'This script is open for editing in another tab.';
  }
  if (useScript().fileLocked.value) return 'Drafter is checking this script’s file first.';
  return null;
}

/** The open script's snapshot `id` as it is listed now, or undefined when it is gone. */
export async function snapshotNow(id: string): Promise<SnapshotInfo | undefined> {
  const project = useScript().project.value;
  if (!project) return undefined;
  return (await listSnapshots(project.id)).find((info) => info.id === id);
}

/**
 * Takes a `before-restore` snapshot, then puts the snapshot's text in the editor with
 * `replaceText`, and says "Restored the snapshot from 10:42. Undo brings back what it replaced."
 * False, changing nothing, when it is gone, can't be read, or the tab is read-only, and says why.
 */
export async function restoreSnapshot(id: string): Promise<boolean> {
  const script = useScript();
  const editor = useEditor();
  const stop = async (message: string) => {
    await sayOutline(message);
    return false;
  };
  const why = historyReadOnly();
  if (why) return stop(why);
  const project = script.project.value?.id;
  const info = await snapshotNow(id);
  if (!info) return stop(GONE);
  const when = snapshotTime(info.createdAt);
  const text = info.readable ? await snapshotText(id) : null;
  if (text === null) {
    return stop(`The snapshot from ${when} can’t be read, so nothing was changed.`);
  }
  // The reads took a moment: the script and the tab are checked again before anything changes.
  if (script.project.value?.id !== project) return stop(GONE);
  const late = historyReadOnly();
  if (late || editor.view.state.readOnly) return stop(late ?? 'The script can’t be changed now.');
  if (editor.view.state.doc.toString() === text) {
    return stop(`The script is already as it was in the snapshot from ${when}.`);
  }
  // The text as it is now, captured before it is replaced and kept in the background.
  useSnapshots().before('before-restore');
  if (!replaceText(editor.view, text)) return stop('The script can’t be changed now.');
  await sayOutline(`Restored the snapshot from ${when}. Undo brings back what it replaced.`);
  return true;
}
