import { type Ref, ref } from 'vue';
import { useEditor } from '../editor/session';
import { renderExport } from './export-client';
import { useFiles } from './files';
import { say } from './say';
import { useScript } from './script';
import { fileNameFor, titleOf } from './text';
import { whenIdle } from './turn';

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
  const script = useScript();
  // A switch under way finishes first: the export is of the script that is open when it starts.
  await whenIdle(script.busy);
  // The name, the text, and the template are taken together, here, so they are one script's.
  const source = editor.view.state.doc.toString();
  const template = editor.template.value;
  const name = fileNameFor(titleOf(editor.doc.value), kind === 'pdf' ? '.pdf' : '.txt');
  exportNotice.value = '';
  exportError.value = '';
  try {
    // Nothing to put on a page: say so before a picker or a file.
    if (source.trim() === '') {
      await announceError('Nothing to export yet.');
      return 'cancelled';
    }
    // The picker comes first: it needs the click that started this, which a long render could outlast.
    let target: Awaited<ReturnType<typeof files.pickToSave>> = null;
    if (files.canSaveInPlace) {
      target = await files.pickToSave(name, kind);
      if (!target) return 'cancelled';
    }
    const data = await renderExport({ kind, source, template });
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

let last: { kind: ExportKind; done: Promise<'saved' | 'cancelled'> } | undefined;

/**
 * Exports the open script. `'cancelled'`: the writer cancelled the picker, there was nothing to
 * export, or the export failed (the toast says so; this never throws). Exports run one at a time,
 * so the worker answers them in order: another of the same kind as the last one asked for is
 * joined, not repeated, and one of another kind waits its turn.
 */
export function exportScript(kind: ExportKind): Promise<'saved' | 'cancelled'> {
  if (last?.kind === kind) return last.done;
  const entry = {
    kind,
    done: (last?.done ?? Promise.resolve('cancelled' as const)).then(() => run(kind)),
  };
  last = entry;
  entry.done.finally(() => {
    if (last === entry) last = undefined;
  });
  return entry.done;
}
