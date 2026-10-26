import { type Ref, ref } from 'vue';
import { useEditor } from '../editor/session';
import { renderExport } from './export-client';
import { useFiles } from './files';
import { say } from './say';
import { fileNameFor, titleOf } from './text';

/**
 * Export to PDF or plain text (Phase 1 design §9.7). The text is laid out and drawn in a worker,
 * and saved only through `useFiles()`: where the browser has a save picker it asks where, else
 * the file downloads. Plan 4's commands and app menu call `exportScript`; the toolbar's Export
 * menu does until they exist.
 */

export type ExportKind = 'pdf' | 'txt';

/** "Exported The Call.pdf.": a toast, and a live region. Empty after a few seconds. */
export const exportNotice = ref('');
/** "Couldn’t export The Call.pdf: …": a toast, and an alert. Empty after a few seconds. */
export const exportError = ref('');

const TOAST_MS = 8000;

/** Sets a toast's text, and empties it after a few seconds. */
function toast(target: Ref<string>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return async (message: string) => {
    clearTimeout(timer);
    await say(target, message);
    timer = setTimeout(() => {
      target.value = '';
    }, TOAST_MS);
  };
}
const announceReady = toast(exportNotice);
const announceError = toast(exportError);

const MIME: Record<ExportKind, string> = { pdf: 'application/pdf', txt: 'text/plain' };

async function run(kind: ExportKind): Promise<'saved' | 'cancelled'> {
  const files = useFiles();
  const editor = useEditor();
  const extension = kind === 'pdf' ? '.pdf' : '.txt';
  const name = fileNameFor(titleOf(editor.doc.value), extension);
  exportNotice.value = '';
  exportError.value = '';
  try {
    // The picker comes first: it needs the click that started this, which a long render could outlast.
    let target: Awaited<ReturnType<typeof files.pickToSave>> = null;
    if (files.canSaveInPlace) {
      target = await files.pickToSave(name, kind);
      if (!target) return 'cancelled';
    }
    // The text is read when the render starts, so the file is what the editor showed then.
    const data = await renderExport({
      kind,
      source: editor.view.state.doc.toString(),
      template: editor.template.value,
    });
    if (target) await files.write(target, data);
    else files.download(name, data, MIME[kind]);
    await announceReady(`Exported ${target?.name ?? name}.`);
    return 'saved';
  } catch (error) {
    const why = error instanceof Error && error.message ? `: ${error.message}` : '.';
    await announceError(`Couldn’t export ${name}${why}`);
    return 'cancelled';
  }
}

let running: Promise<'saved' | 'cancelled'> | undefined;

/**
 * Exports the open script. `'cancelled'`: the writer cancelled the picker, or the export failed
 * (the toast says so; this never throws). An export already under way is joined, not repeated.
 */
export function exportScript(kind: ExportKind): Promise<'saved' | 'cancelled'> {
  running ??= run(kind).finally(() => {
    running = undefined;
  });
  return running;
}
