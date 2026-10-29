import { ref } from 'vue';
import { useEditor } from '../editor/session';
import { markdownTitle } from '../markdown/title';
import { type Settings, useSettings } from '../settings/settings';
import { renderExport } from './export-client';
import { useFiles } from './files';
import { timedSay } from './say';
import { useScript } from './script';
import { encodeFile, fileBaseName, fileNameFor, titleFileOf, titleOf } from './text';
import { whenIdle } from './turn';

/**
 * Export to PDF, plain text, or Final Draft (Phase 1 design §9.7; Phase 2 design §22), and a
 * Markdown document to PDF (Markdown PDF design). The text
 * is laid out and drawn in a worker, and saved only through `useFiles()`: where the browser has a
 * save picker it asks where, else the file downloads. The export commands (`commands/builtin.ts`) call `exportScript`; the toolbar's
 * Export menu, the app menu, and the palette run them.
 */

/**
 * `pdf`, `txt`, and `fdx` (a Final Draft file) are a screenplay's or a stage play's; a Markdown
 * document's are `pdf` (drawn in Inter Tight, Markdown PDF design), `md` (the Markdown file), and
 * `txt` (the same text, as a plain text file).
 */
export type ExportKind = 'pdf' | 'txt' | 'md' | 'fdx';

/** What each kind of document exports, in the order the menus list them: the PDF first in both. */
export const EXPORTS: Readonly<Record<'fountain' | 'markdown', readonly ExportKind[]>> = {
  fountain: ['pdf', 'txt', 'fdx'],
  markdown: ['pdf', 'md', 'txt'],
};

/** Whether a document of `documentKind` exports as `kind`: the menus and the commands ask this. */
export function exportApplies(kind: ExportKind, documentKind: 'fountain' | 'markdown'): boolean {
  return EXPORTS[documentKind].includes(kind);
}

/** The toast's sentence after "Exported Notes.pdf." when the fonts lack some of its characters. */
export const MISSING_GLYPHS = 'Some characters aren’t in Drafter’s fonts and print as ?: ';
/** How many of the missing characters the toast names. */
const MISSING_SHOWN = 5;
/** How long an export runs before the toast says it is under way, so a quick one doesn't flash. */
const SLOW_MS = 500;

/**
 * "Exported The Call.pdf.": a toast, and a live region. Empty after a few seconds. An import says
 * what came in here too ("Imported “The Call.fdx”.", `storage/open.ts`).
 */
export const exportNotice = ref('');
/** "Couldn’t export The Call.pdf: …": a toast, and an alert. Empty after a few seconds. */
export const exportError = ref('');
/**
 * The export the toast says is under way ("Exporting The Call.pdf…"), and how far it is, from 0 to
 * 1, or null while the worker can't say (the bar moves without a number). Null when none is shown.
 */
export const exportProgress = ref<{ name: string; fraction: number | null } | null>(null);
/**
 * "Export 50% done.": said to a screen reader as an export under way passes each quarter, once
 * (the toast's "Exporting …" says it started, and "Exported …" that it finished; the bar's every
 * step is never said). Empty otherwise.
 */
export const exportMilestone = ref('');

const TOAST_MS = 8000;

const announceReady = timedSay(exportNotice, TOAST_MS);
const announceError = timedSay(exportError, TOAST_MS);

const MIME: Record<ExportKind, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  fdx: 'application/xml',
};
const EXTENSION = { pdf: '.pdf', txt: '.txt', md: '.md', fdx: '.fdx' } as const;

/** Why a kind of export doesn't apply to the open script, or null when it does. */
function notFor(kind: ExportKind, markdown: boolean): string | null {
  if (markdown && kind === 'fdx') {
    return 'Only a screenplay or a stage play exports as a Final Draft file.';
  }
  if (!markdown && kind === 'md') return 'Only a Markdown document exports as a Markdown file.';
  return null;
}

async function run(asked: Asked): Promise<'saved' | 'cancelled'> {
  const { kind } = asked;
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
  const fallback = fileBaseName(titleFileOf(script.project.value));
  const title = markdown
    ? (markdownTitle(source) ?? fallback)
    : titleOf(editor.doc.value, fallback);
  const name = fileNameFor(title, EXTENSION[kind]);
  exportNotice.value = '';
  exportError.value = '';
  let slow: ReturnType<typeof setTimeout> | undefined;
  let progress = '';
  /** How far the worker says it is, kept from the start so the bar shows it at once. */
  let fraction: number | null = null;
  /** The last quarter said (1 to 3), or passed before the bar showed. */
  let quarter = 0;
  const onProgress = (next: number | null) => {
    fraction = next;
    if (!exportProgress.value) return;
    exportProgress.value = { ...exportProgress.value, fraction: next };
    const passed = next === null ? quarter : Math.min(3, Math.floor(next * 4));
    if (passed > quarter) {
      quarter = passed;
      exportMilestone.value = `Export ${passed * 25}% done.`;
    }
  };
  const endProgress = () => {
    exportProgress.value = null;
    exportMilestone.value = '';
  };
  try {
    // The menu offers only what applies; a command or a stale menu can still ask for the other.
    const refusal = notFor(kind, markdown);
    if (refusal) {
      await announceError(refusal);
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
    let data: Uint8Array | string;
    let missing: string[] = [];
    if (markdown && kind !== 'pdf') {
      // A Markdown document is already text: its Markdown and plain text exports are the text as
      // it stands, written as Save writes it (the file's line breaks, and its byte order mark).
      data = encodeFile(
        source,
        script.project.value?.lineBreak ?? '\n',
        script.project.value?.bom ?? false,
      );
    } else {
      // A Markdown PDF carries the title the file is named by, and the spellcheck's language,
      // with the paper, as they were when it was asked for.
      const request = markdown
        ? {
            kind: 'markdown-pdf' as const,
            source,
            paper: asked.paper,
            title,
            lang: asked.lang,
          }
        : { kind: kind as 'pdf' | 'txt' | 'fdx', source, template };
      // A long document takes a while (some 20 ms a page): the toast says it is under way.
      slow = setTimeout(() => {
        progress = `Exporting ${target?.name ?? name}…`;
        exportProgress.value = { name: target?.name ?? name, fraction };
        quarter = fraction === null ? 0 : Math.min(3, Math.floor(fraction * 4));
        void announceReady(progress, { keep: true });
      }, SLOW_MS);
      ({ data, missing } = await renderExport(request, onProgress));
      clearTimeout(slow);
      endProgress();
    }
    if (target) await files.write(target, data);
    else files.download(name, data, MIME[kind]);
    const lacking =
      missing.length > 0 ? ` ${MISSING_GLYPHS}${missing.slice(0, MISSING_SHOWN).join(', ')}.` : '';
    await announceReady(`Exported ${target?.name ?? name}.${lacking}`);
    return 'saved';
  } catch (error) {
    clearTimeout(slow);
    endProgress();
    if (progress && exportNotice.value === progress) exportNotice.value = '';
    const why = error instanceof Error && error.message ? `: ${error.message}` : '.';
    await announceError(`Couldn’t export ${name}${why}`);
    return 'cancelled';
  }
}

/** Says `message` in the Export toast, as a finished export does (an import's "Imported …"). */
export function sayInToast(message: string): Promise<void> {
  exportError.value = '';
  return announceReady(message);
}

/** What an export was asked for: its kind, of which script and text, with which template and settings. */
interface Asked {
  kind: ExportKind;
  script: unknown;
  source: string;
  template: unknown;
  paper: Settings['markdownPaper'];
  lang: Settings['spellLanguage'];
}

function askedFor(kind: ExportKind): Asked {
  const editor = useEditor();
  const project = useScript().project.value;
  const { settings } = useSettings();
  return {
    kind,
    script: project?.id ?? project,
    source: editor.view.state.doc.toString(),
    template: editor.template.value,
    paper: settings.value.markdownPaper,
    lang: settings.value.spellLanguage,
  };
}

const sameExport = (a: Asked, b: Asked) =>
  (Object.keys(a) as (keyof Asked)[]).every((key) => a[key] === b[key]);

let last: { asked: Asked; done: Promise<'saved' | 'cancelled'> } | undefined;

/**
 * Exports the open script. `'cancelled'`: the writer cancelled the picker, there was nothing to
 * export, or the export failed (the toast says so; this never throws). Exports run one at a time,
 * so the worker answers them in order: the same export as the last one asked for (its kind, of
 * the same script and text, with the same template and settings) is joined, not repeated, and any
 * other waits its turn, so another script's PDF is its own.
 */
export function exportScript(kind: ExportKind): Promise<'saved' | 'cancelled'> {
  const asked = askedFor(kind);
  if (last && sameExport(last.asked, asked)) return last.done;
  const entry = {
    asked,
    done: (last?.done ?? Promise.resolve('cancelled' as const)).then(() => run(asked)),
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
