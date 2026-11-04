import { savedText } from '@drafter/cm-fountain';
import type { MapOptions } from '@drafter/story-map';
import type { Template } from '@drafter/templates';
import { ref } from 'vue';
import { buildInfo } from '../about/info';
import { useEditor } from '../editor/session';
import { previewProblem } from '../markdown/preview';
import { markdownTitle } from '../markdown/title';
import { type Settings, useSettings } from '../settings/settings';
import { ratesOf } from '../stats/timing';
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportOptions,
  type ExportRequest,
} from '../workers/export-compute';
import { renderExport } from './export-client';
import { exportOptionsOf, optionsPhrase } from './export-options';
import { useFiles } from './files';
import { timedSay } from './say';
import { useScript } from './script';
import { encodeFile, fileBaseName, fileNameFor, titleFileOf, titleOf } from './text';
import { whenIdle } from './turn';

/**
 * Export to PDF, HTML, EPUB, plain text, Final Draft, or Markdown (Phase 1 design §9.7; Phase 2
 * design §22; Imports plan Call 24; HTML export design §1, §10a), and a Markdown document to PDF
 * (Markdown PDF design), HTML, and EPUB. The text
 * is laid out and drawn in a worker, and saved only through `useFiles()`: where the browser has a
 * save picker it asks where, else the file downloads. The export commands (`commands/builtin.ts`) call `exportScript`; the toolbar's
 * Export menu, the app menu, and the palette run them.
 */

/**
 * `pdf`, `html` (one self-contained page: the printed pages and a Reading view), `epub` (the
 * Reading view as an e-book), `fountain` (a copy of the script's own text, as Save writes it, that
 * the script does not follow as it does a Save As), `txt`, `fdx` (a Final Draft file), and `md` (the whole script as
 * Markdown, written in the worker) are a screenplay's or a stage play's; a Markdown document's are
 * `pdf` (drawn in Inter Tight, Markdown PDF design), `html` (the document as the Preview draws
 * it, in one page), `epub` (the same, as an e-book), `md` (its own text), and `txt` (the same
 * text, as a plain text file). `story-map` (story-map design) is a script's too, but made after
 * its dialog (`exportStoryMap`), so it isn't one of `EXPORTS`' files.
 */
export type ExportKind = 'pdf' | 'html' | 'epub' | 'fountain' | 'txt' | 'md' | 'fdx' | 'story-map';

/**
 * What each kind of document exports, in the order the menus list them: the PDF first in both,
 * then the HTML page and the EPUB, the other files made to be read as they are.
 */
export const EXPORTS: Readonly<Record<'fountain' | 'markdown', readonly ExportKind[]>> = {
  fountain: ['pdf', 'html', 'epub', 'fountain', 'txt', 'fdx', 'md'],
  markdown: ['pdf', 'html', 'epub', 'md', 'txt'],
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
/** How long a quarter's "Export 50% done." stays in its live region: time to be said, then gone. */
const MILESTONE_MS = 2000;

const announceReady = timedSay(exportNotice, TOAST_MS);
const announceError = timedSay(exportError, TOAST_MS);

const MIME: Record<ExportKind, string> = {
  pdf: 'application/pdf',
  html: 'text/html',
  epub: 'application/epub+zip',
  fountain: 'text/plain',
  txt: 'text/plain',
  md: 'text/markdown',
  fdx: 'application/xml',
  'story-map': 'text/html',
};
const EXTENSION = {
  pdf: '.pdf',
  html: '.html',
  epub: '.epub',
  fountain: '.fountain',
  txt: '.txt',
  md: '.md',
  fdx: '.fdx',
  'story-map': '.html',
} as const satisfies Record<ExportKind, string>;

/** What a save picker offers each kind as. */
const PICKER_KIND = { md: 'markdown', 'story-map': 'html' } as const;

/** "Signal Hill – story map.html" (design §1.1); the other kinds are the title and the extension. */
function exportName(title: string, kind: ExportKind): string {
  const name = fileNameFor(title, EXTENSION[kind]);
  return kind === 'story-map' ? `${name.slice(0, -'.html'.length)} – story map.html` : name;
}

/** "Drafter 0.22.0", an HTML file's generator line; "Drafter" where the build named no version. */
const generator = () => `Drafter ${buildInfo().version}`.trim();

/**
 * The end of "Couldn’t export The Call.pdf…": the reason, in the writer's words. A document nested
 * too deeply runs the layout out of stack, which the engine words its own way ("Maximum call stack
 * size exceeded"); it is said as the Preview says it (`previewProblem`). Drafter's own messages
 * ("Couldn’t load the font …") are said as they are, and an error with none is a plain full stop.
 */
function reason(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  // By its words only: a RangeError of another kind ("Invalid string length") says what it is.
  if (previewProblem(message) === 'deep') return ': this document is nested too deeply to lay out.';
  return message ? `: ${message}` : '.';
}

/** Why a kind of export doesn't apply to the open script, or null when it does. */
function notFor(kind: ExportKind, markdown: boolean): string | null {
  if (markdown && kind === 'fdx') {
    return 'Only a screenplay or a stage play exports as a Final Draft file.';
  }
  if (markdown && kind === 'fountain') {
    return 'Only a screenplay or a stage play exports as a Fountain file.';
  }
  if (markdown && kind === 'story-map') {
    return 'Only a screenplay or a stage play makes a story map.';
  }
  return null;
}

/**
 * ", with scene numbers as written and no title page" in "Exported The Call.pdf, ….", naming the
 * options that aren't the default (Call 11); nothing for the defaults or a Markdown document. A
 * Final Draft file keeps its written numbers whatever the option says (Call 8), so its toast
 * names only the title page; only a Markdown file, an HTML file, and an EPUB carry notes (Call 28;
 * HTML export design §3.3, §10a), so only their toasts say "notes".
 */
function withOptions(kind: ExportKind, markdown: boolean, options: ExportOptions): string {
  // A story map has its own choices, in its dialog, and never carries the script (Call 20). A
  // Fountain file is the script's text as written: the options shape how it is drawn, not the text.
  if (kind === 'story-map' || kind === 'fountain') return '';
  // Only an HTML file and an EPUB carry the script inside (reopenable exports), a document's too.
  const inside = options.reopenable && carriesSource(kind) ? { reopenable: true as const } : {};
  if (markdown) {
    return inside.reopenable ? `, ${optionsPhrase({ ...DEFAULT_EXPORT_OPTIONS, ...inside })}` : '';
  }
  const { reopenable: _, ...rest } = options;
  const honoured: ExportOptions = {
    ...rest,
    sceneNumbers: kind === 'fdx' ? 'none' : options.sceneNumbers,
    notes: kind === 'md' || kind === 'html' || kind === 'epub' ? options.notes : 'leave-out',
    ...inside,
  };
  const phrase = optionsPhrase(honoured);
  return phrase ? `, ${phrase}` : '';
}

/** The exports that can carry the script inside, for Drafter to reopen: the HTML file and the EPUB. */
const carriesSource = (kind: ExportKind) => kind === 'html' || kind === 'epub';

/**
 * What the worker is asked to make. A Markdown PDF carries the title the file is named by, and the
 * spellcheck's language, with the paper, as they were when it was asked for; an HTML file carries
 * the title and the language too, the app's name and version, and, for a script, its own page
 * rate, for the kind line over its title. An EPUB carries the same, but for the rate (it has no
 * kind line), and the time it was asked for, its package's modified date, and the project's id,
 * the book's identity.
 */
function requestFor(
  asked: Asked,
  open: {
    source: string;
    template: Template;
    options: ExportOptions;
    title: string;
    markdown: boolean;
    /** The open project's id, an EPUB's identity; none when nothing is saved. */
    projectId: string | undefined;
    /** The text to carry inside an HTML file or an EPUB, as Save writes it; none when off. */
    embed: string | undefined;
  },
): ExportRequest {
  const { kind } = asked;
  // Made by `storyMapRequest`, after its dialog's changes.
  if (kind === 'story-map') throw new Error('A story map is made from its dialog.');
  // The script's own text, written as Save writes it (`run`): never the worker's.
  if (kind === 'fountain') throw new Error('A Fountain file is the script’s own text.');
  const { source, template, options, title, markdown } = open;
  // Only when there is one, so a request without a project has no such key.
  const work = {
    ...(open.projectId === undefined ? {} : { projectId: open.projectId }),
    ...(open.embed === undefined || !carriesSource(kind) ? {} : { embed: open.embed }),
  };
  const lang = asked.lang;
  if (markdown) {
    if (kind === 'epub') {
      return {
        kind: 'markdown-epub',
        source,
        title,
        lang,
        generator: generator(),
        modified: Date.now(),
        ...work,
      };
    }
    const inside = work.embed === undefined ? {} : { embed: work.embed };
    return kind === 'html'
      ? { kind: 'markdown-html', source, title, lang, generator: generator(), ...inside }
      : { kind: 'markdown-pdf', source, paper: asked.paper, title, lang };
  }
  if (kind === 'epub') {
    const book = { title, lang, generator: generator(), modified: Date.now(), ...work };
    return { kind, source, template, options, ...book };
  }
  if (kind === 'html') {
    return {
      kind,
      source,
      template,
      options,
      title,
      lang,
      generator: generator(),
      minutesPerPage: asked.minutesPerPage,
      ...(work.embed === undefined ? {} : { embed: work.embed }),
    };
  }
  return { kind, source, template, options };
}

/**
 * A story map's part of an export (`exportStoryMap`): the text changes its dialog asked for, made
 * after the picker (it needs the click) and before the page is made; and the page's options, from
 * the text as it then is. `write` answers what the toast adds after "Exported …." ('' for nothing).
 */
export interface StoryMapJob {
  /** The dialog's choices, so two different maps are never joined as one export. */
  key: string;
  write(): string;
  options(source: string, title: string): Promise<MapOptions>;
}

async function run(asked: Asked, job?: StoryMapJob): Promise<'saved' | 'cancelled'> {
  const { kind } = asked;
  const files = useFiles();
  const editor = useEditor();
  const script = useScript();
  // A switch under way finishes first: the export is of the script that is open when it starts.
  await whenIdle(script.busy);
  // The name, the text, the template, and the export options are taken together, here, so they
  // are one script's: never the options of the script that was open before a switch.
  const source = savedText(editor.view.state).toString();
  const template = editor.template.value;
  const markdown = editor.kind.value === 'markdown';
  const options = exportOptionsOf(script.project.value);
  // A document with no title is called after its file, as the project's own title is.
  const fallback = fileBaseName(titleFileOf(script.project.value));
  const title = markdown
    ? (markdownTitle(source) ?? fallback)
    : titleOf(editor.doc.value, fallback);
  const name = exportName(title, kind);
  exportNotice.value = '';
  exportError.value = '';
  let slow: ReturnType<typeof setTimeout> | undefined;
  let progress = '';
  /** How far the worker says it is, kept from the start so the bar shows it at once. */
  let fraction: number | null = null;
  /** The last quarter said (1 to 3), or passed before the bar showed. */
  let quarter = 0;
  let said: ReturnType<typeof setTimeout> | undefined;
  const onProgress = (next: number | null) => {
    fraction = next;
    if (!exportProgress.value) return;
    exportProgress.value = { ...exportProgress.value, fraction: next };
    // The end is no quarter: "Exported …" says it, so "75% done" isn't said beside it.
    const passed = next === null || next === 1 ? quarter : Math.min(3, Math.floor(next * 4));
    if (passed > quarter) {
      quarter = passed;
      exportMilestone.value = `Export ${passed * 25}% done.`;
      // Once it has been said, the hidden text goes, so no stale quarter stays in the toast.
      clearTimeout(said);
      said = setTimeout(() => {
        exportMilestone.value = '';
      }, MILESTONE_MS);
    }
  };
  const endProgress = () => {
    clearTimeout(said);
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
      target = await files.pickToSave(
        name,
        kind === 'md' || kind === 'story-map' ? PICKER_KIND[kind] : kind,
      );
      if (!target) return 'cancelled';
    }
    // A story map's text changes, after the picker and before the page (one undo).
    const after = job ? job.write() : '';
    let data: Uint8Array | string;
    let missing: string[] = [];
    if (kind === 'fountain' || (markdown && (kind === 'md' || kind === 'txt'))) {
      // A Markdown document is already text: its Markdown and plain text exports are the text as
      // it stands, written as Save writes it (the file's line breaks, and its byte order mark). A
      // script's Fountain file is the same: a copy of what Save writes, and the script stays bound
      // to its own file (Save As is the one that moves it).
      data = encodeFile(
        source,
        script.project.value?.lineBreak ?? '\n',
        script.project.value?.bom ?? false,
      );
    } else {
      const project = script.project.value;
      const projectId = project?.id;
      // "Let Drafter reopen this file": the text as Save would write it, line breaks and BOM too.
      // Never a story map's: it never carries the script (Call 20).
      const embed =
        options.reopenable && !job
          ? encodeFile(source, project?.lineBreak ?? '\n', project?.bom ?? false)
          : undefined;
      const request: ExportRequest = job
        ? await storyMapRequest(asked, job, source, template, title)
        : requestFor(asked, {
            source,
            template,
            options,
            title,
            markdown,
            projectId,
            embed,
          });
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
    await announceReady(
      `Exported ${target?.name ?? name}${withOptions(kind, markdown, options)}.${lacking}${after}`,
    );
    return 'saved';
  } catch (error) {
    clearTimeout(slow);
    endProgress();
    if (progress && exportNotice.value === progress) exportNotice.value = '';
    await announceError(`Couldn’t export ${name}${reason(error)}`);
    return 'cancelled';
  }
}

/** A story map's request: the text as it is after its changes, never with the script inside. */
async function storyMapRequest(
  asked: Asked,
  job: StoryMapJob,
  source: string,
  template: Template,
  title: string,
): Promise<ExportRequest> {
  return {
    kind: 'story-map',
    source,
    template,
    title,
    lang: asked.lang,
    generator: generator(),
    options: await job.options(source, title),
  };
}

/** Says `message` in the Export toast, as a finished export does (an import's "Imported …"). */
export function sayInToast(message: string): Promise<void> {
  exportError.value = '';
  return announceReady(message);
}

/**
 * What an export was asked for: its kind, of which script and text, with which template, export
 * options, and settings.
 */
interface Asked {
  kind: ExportKind;
  script: unknown;
  source: string;
  template: unknown;
  sceneNumbers: ExportOptions['sceneNumbers'];
  titlePage: ExportOptions['titlePage'];
  notes: ExportOptions['notes'];
  /** "Let Drafter reopen this file": an export with the script inside is never joined to one without. */
  reopenable: boolean;
  paper: Settings['markdownPaper'];
  lang: Settings['spellLanguage'];
  /** The script's own page rate, for an HTML file's running time. */
  minutesPerPage: number;
  /** A story map's choices (`StoryMapJob.key`); '' for the other kinds. */
  storyMap: string;
}

function askedFor(kind: ExportKind, job?: StoryMapJob): Asked {
  const editor = useEditor();
  const project = useScript().project.value;
  const { settings } = useSettings();
  const options = exportOptionsOf(project);
  return {
    kind,
    script: project?.id ?? project,
    source: savedText(editor.view.state).toString(),
    template: editor.template.value,
    sceneNumbers: options.sceneNumbers,
    titlePage: options.titlePage,
    notes: options.notes,
    reopenable: options.reopenable === true,
    paper: settings.value.markdownPaper,
    lang: settings.value.spellLanguage,
    minutesPerPage: ratesOf(project).minutesPerPage,
    storyMap: job?.key ?? '',
  };
}

const sameExport = (a: Asked, b: Asked) =>
  (Object.keys(a) as (keyof Asked)[]).every((key) => a[key] === b[key]);

let last: { asked: Asked; done: Promise<'saved' | 'cancelled'> } | undefined;

/**
 * Exports the open script. `'cancelled'`: the writer cancelled the picker, there was nothing to
 * export, or the export failed (the toast says so; this never throws). Exports run one at a time,
 * so the worker answers them in order: the same export as the last one asked for (its kind, of
 * the same script and text, with the same template, export options, and settings) is joined, not
 * repeated, and any other waits its turn, so another script's PDF is its own (and an export asked
 * for after the options changed is its own too).
 */
export function exportScript(
  kind: Exclude<ExportKind, 'story-map'>,
): Promise<'saved' | 'cancelled'> {
  return queued(askedFor(kind));
}

/**
 * Exports the open script's story map (story-map design §7), after its dialog: the picker, then
 * `job`'s text changes, then the page, in the same turn as the other exports, with the same
 * progress bar and toast.
 */
export function exportStoryMap(job: StoryMapJob): Promise<'saved' | 'cancelled'> {
  return queued(askedFor('story-map', job), job);
}

function queued(asked: Asked, job?: StoryMapJob): Promise<'saved' | 'cancelled'> {
  if (last && sameExport(last.asked, asked)) return last.done;
  const entry = {
    asked,
    done: (last?.done ?? Promise.resolve('cancelled' as const)).then(() => run(asked, job)),
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
    await announceError(`Couldn’t export ${name}${reason(error)}`);
    return 'cancelled';
  }
}
