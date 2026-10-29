import { ref } from 'vue';
import { useEditor } from '../editor/session';
import { markdownTitle } from '../markdown/title';
import { renderExport } from './export-client';
import { useFiles } from './files';
import { timedSay } from './say';
import { useScript } from './script';
import { encodeFile, fileBaseName, fileNameFor, titleOf } from './text';
import { whenIdle } from './turn';

/**
 * Export to PDF or plain text (Phase 1 design §9.7). The text is laid out and drawn in a worker,
 * and saved only through `useFiles()`: where the browser has a save picker it asks where, else
 * the file downloads. The export commands (`commands/builtin.ts`) call `exportScript`; the toolbar's
 * Export menu, the app menu, and the palette run them.
 */

/**
 * `pdf` and `txt` are a screenplay's or a stage play's; a Markdown document's are `md` (the
 * Markdown file) and `txt` (the same text, as a plain text file). PDF for Markdown is deferred.
 */
export type ExportKind = 'pdf' | 'txt' | 'md';

/** "Exported The Call.pdf.": a toast, and a live region. Empty after a few seconds. */
export const exportNotice = ref('');
/** "Couldn’t export The Call.pdf: …": a toast, and an alert. Empty after a few seconds. */
export const exportError = ref('');

const TOAST_MS = 8000;

const announceReady = timedSay(exportNotice, TOAST_MS);
const announceError = timedSay(exportError, TOAST_MS);

const MIME: Record<ExportKind, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
};
const EXTENSION = { pdf: '.pdf', txt: '.txt', md: '.md' } as const;

async function run(kind: ExportKind): Promise<'saved' | 'cancelled'> {
  const files = useFiles();
  const editor = useEditor();
  const script = useScript();
  // A switch under way finishes first: the export is of the script that is open when it starts.
  await whenIdle(script.busy);
  // The name, the text, and the template are taken together, here, so they are one script's.
  const source = editor.view.state.doc.toString();
  const template = editor.template.value;
  const markdown = editor.kind.value === 'markdown';
  // A document with no title is called after its file, as the project's own title is.
  const fallback = fileBaseName(script.project.value?.fileName);
  const title = markdown
    ? (markdownTitle(source) ?? fallback)
    : titleOf(editor.doc.value, fallback);
  const name = fileNameFor(title, EXTENSION[kind]);
  exportNotice.value = '';
  exportError.value = '';
  try {
    // The menu offers only what applies; a command or a stale menu can still ask for the other.
    if (markdown ? kind === 'pdf' : kind === 'md') {
      await announceError(
        markdown
          ? 'A PDF of a Markdown document isn’t available yet. Export the Markdown file or plain text.'
          : 'Only a Markdown document exports as a Markdown file.',
      );
      return 'cancelled';
    }
    // Nothing to put on a page: say so before a picker or a file.
    if (source.trim() === '') {
      await announceError('Nothing to export yet.');
      return 'cancelled';
    }
    // The picker comes first: it needs the click that started this, which a long render could outlast.
    let target: Awaited<ReturnType<typeof files.pickToSave>> = null;
    if (files.canSaveInPlace) {
      target = await files.pickToSave(name, kind === 'md' ? 'markdown' : kind);
      if (!target) return 'cancelled';
    }
    // A Markdown document is already text: both of its exports are the text as it stands, written
    // as Save writes it (the file's line breaks, and its byte order mark if it had one).
    const data = markdown
      ? encodeFile(
          source,
          script.project.value?.lineBreak ?? '\n',
          script.project.value?.bom ?? false,
        )
      : await renderExport({ kind: kind as 'pdf' | 'txt', source, template });
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

/**
 * Saves `text`, a Markdown file Drafter made (a treatment), as `name`: where the browser has a save
 * picker it asks where, else the file downloads. The Export toast says how it went. Never throws.
 */
export async function exportMarkdownFile(
  name: string,
  text: string,
): Promise<'saved' | 'cancelled'> {
  const files = useFiles();
  exportNotice.value = '';
  exportError.value = '';
  try {
    let target: Awaited<ReturnType<typeof files.pickToSave>> = null;
    if (files.canSaveInPlace) {
      target = await files.pickToSave(name, 'markdown');
      if (!target) return 'cancelled';
    }
    const data = encodeFile(text, '\n', false);
    if (target) await files.write(target, data);
    else files.download(name, data, MIME.md);
    await announceReady(`Exported ${target?.name ?? name}.`);
    return 'saved';
  } catch (error) {
    const why = error instanceof Error && error.message ? `: ${error.message}` : '.';
    await announceError(`Couldn’t export ${name}${why}`);
    return 'cancelled';
  }
}
