import type { SceneNumbering, TitlePageMode } from '@drafter/layout';
import { ref } from 'vue';
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from '../workers/export-compute';
import { useGuard } from './guard';
import type { Project } from './projects';
import { useScript } from './script';

/**
 * Export options (out-the-door design §2): how a script's PDF, HTML, EPUB, plain text, and
 * Markdown file print its scene numbers and its title page, how much of the title page a Final Draft file
 * carries, and whether a Markdown file, an HTML file, and an EPUB carry its notes (Call 28; HTML
 * export design §3.3, §10a). They are
 * the script's own, kept on its project in this browser (Call 9), never in the text; the Export
 * options dialog (`components/ExportOptionsDialog.vue`) sets them, and every export reads them.
 */

const SCENE_NUMBERS: readonly SceneNumbering[] = ['none', 'written', 'all'];
const TITLE_PAGES: readonly TitlePageMode[] = ['full', 'title-author', 'none'];
type Notes = ExportOptions['notes'];
const NOTES: readonly Notes[] = ['leave-out', 'include'];

/** The project's options, any missing or unknown value read as its default. */
export function exportOptionsOf(
  project: Pick<Project, 'exportOptions'> | null | undefined,
): ExportOptions {
  const stored = project?.exportOptions;
  return {
    sceneNumbers: SCENE_NUMBERS.includes(stored?.sceneNumbers as SceneNumbering)
      ? (stored?.sceneNumbers as SceneNumbering)
      : DEFAULT_EXPORT_OPTIONS.sceneNumbers,
    titlePage: TITLE_PAGES.includes(stored?.titlePage as TitlePageMode)
      ? (stored?.titlePage as TitlePageMode)
      : DEFAULT_EXPORT_OPTIONS.titlePage,
    // A project kept before there was a notes option has none: Leave out, as it exported then.
    notes: NOTES.includes(stored?.notes as Notes)
      ? (stored?.notes as Notes)
      : DEFAULT_EXPORT_OPTIONS.notes,
  };
}

/** What each choice is called in the dialog, in the order it lists them (the default first). */
export const EXPORT_OPTION_LABELS: {
  sceneNumbers: Record<SceneNumbering, string>;
  titlePage: Record<TitlePageMode, string>;
  notes: Record<Notes, string>;
} = {
  sceneNumbers: { none: 'None', written: 'As written', all: 'Number every scene' },
  titlePage: { full: 'Full', 'title-author': 'Title and author only', none: 'None' },
  notes: { 'leave-out': 'Leave out', include: 'Include' },
};

/** The line under each choice in the dialog: what it prints. */
export const EXPORT_OPTION_HINTS: {
  sceneNumbers: Record<SceneNumbering, string>;
  titlePage: Record<TitlePageMode, string>;
  notes: Record<Notes, string>;
} = {
  sceneNumbers: {
    none: 'No scene numbers print.',
    written: 'Only the numbers written in the script, like #12A#, print.',
    all: 'Each scene is numbered by its place, except one with a written number, which keeps it: so two scenes can share a number.',
  },
  titlePage: {
    full: 'Every title page line that prints.',
    'title-author': 'The title, the credit, the authors, and the source: no contact or date.',
    none: 'No title page: the script starts on page 1.',
  },
  notes: {
    'leave-out': 'No notes or synopses, as in the PDF.',
    include:
      'In Markdown, each note and synopsis as a quote, where it stands, Drafter’s own scene notes (colour, goal, setups and payoffs) included; in HTML and EPUB, only your own notes, beside their place in the Reading view and never on the pages. The boneyard is always left out.',
  },
};

/**
 * The notes choice's name (HTML export design §3.3): the stored setting keeps its key (`notes`),
 * and is shared by the three exports that read it.
 */
export const NOTES_LEGEND = 'Include notes (Markdown, HTML, and EPUB)';
/** Under the Include notes choices: the exports that read them. */
export const NOTES_ONLY_MARKDOWN =
  'Only the Markdown, HTML, and EPUB exports carry notes; a PDF never prints them.';

/** The words for each choice that isn't the default, in the toast's sentence. */
const SCENE_PHRASE: Record<Exclude<SceneNumbering, 'none'>, string> = {
  written: 'scene numbers as written',
  all: 'every scene numbered',
};
const TITLE_PHRASE: Record<Exclude<TitlePageMode, 'full'>, string> = {
  'title-author': 'the title and author only',
  none: 'no title page',
};

/**
 * "with scene numbers as written and the title and author only", or '' for the defaults (design
 * Call 11): the end of the export toast's "Exported The Call.pdf, …", so a choice made last month
 * is no surprise. "notes" comes last when they are included (Call 28); the caller leaves them out
 * of an export that never carries them. Three are a list: "with a, b, and notes".
 */
export function optionsPhrase(options: ExportOptions): string {
  const parts: string[] = [];
  if (options.sceneNumbers !== 'none') parts.push(SCENE_PHRASE[options.sceneNumbers]);
  if (options.titlePage !== 'full') parts.push(TITLE_PHRASE[options.titlePage]);
  if (options.notes === 'include') parts.push('notes');
  if (parts.length === 0) return '';
  if (parts.length < 3) return `with ${parts.join(' and ')}`;
  return `with ${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

export const FDX_NOTE =
  'A Final Draft file gets the title page you choose, and always keeps the scene numbers written in the script: Final Draft decides whether to print them.';
export const OPTIONS_NOT_FOR_MARKDOWN =
  'A Markdown document has no scene numbers, title page, or notes to choose.';
export const OPTIONS_READ_ONLY =
  'Another tab has this script open, so its export options can’t be changed here.';

/** Keeps one option on the open script's project (no-op in a read-only tab). */
export async function setExportOption<K extends keyof ExportOptions>(
  key: K,
  value: ExportOptions[K],
): Promise<void> {
  const script = useScript();
  if (!script.project.value || useGuard().readOnly.value) return;
  // Made from the project as it is when this write's turn comes, after any choice before it.
  await script.keepOnProject((project) => ({
    exportOptions: { ...exportOptionsOf(project), [key]: value },
  }));
}

/** The Export options dialog is open. */
export const exportOptionsOpen = ref(false);
