import type { SceneNumbering, TitlePageMode } from '@drafter/layout';
import { ref } from 'vue';
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from '../workers/export-compute';
import { useGuard } from './guard';
import type { Project } from './projects';
import { useScript } from './script';

/**
 * Export options (out-the-door design §2): how a script's PDF and plain text print its scene
 * numbers and its title page, and how much of the title page a Final Draft file carries. They are
 * the script's own, kept on its project in this browser (Call 9), never in the text; the Export
 * options dialog (`components/ExportOptionsDialog.vue`) sets them, and every export reads them.
 */

const SCENE_NUMBERS: readonly SceneNumbering[] = ['none', 'written', 'all'];
const TITLE_PAGES: readonly TitlePageMode[] = ['full', 'title-author', 'none'];

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
  };
}

/** What each choice is called in the dialog, in the order it lists them (the default first). */
export const EXPORT_OPTION_LABELS: {
  sceneNumbers: Record<SceneNumbering, string>;
  titlePage: Record<TitlePageMode, string>;
} = {
  sceneNumbers: { none: 'None', written: 'As written', all: 'Number every scene' },
  titlePage: { full: 'Full', 'title-author': 'Title and author only', none: 'None' },
};

/** The line under each choice in the dialog: what it prints. */
export const EXPORT_OPTION_HINTS: {
  sceneNumbers: Record<SceneNumbering, string>;
  titlePage: Record<TitlePageMode, string>;
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
};

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
 * is no surprise.
 */
export function optionsPhrase(options: ExportOptions): string {
  const parts: string[] = [];
  if (options.sceneNumbers !== 'none') parts.push(SCENE_PHRASE[options.sceneNumbers]);
  if (options.titlePage !== 'full') parts.push(TITLE_PHRASE[options.titlePage]);
  return parts.length === 0 ? '' : `with ${parts.join(' and ')}`;
}

export const FDX_NOTE =
  'A Final Draft file gets the title page you choose, and always keeps the scene numbers written in the script: Final Draft decides whether to print them.';
export const OPTIONS_NOT_FOR_MARKDOWN = 'A Markdown document has no scene numbers or title page.';
export const OPTIONS_READ_ONLY =
  'Another tab has this script open, so its export options can’t be changed here.';

/** Keeps one option on the open script's project (no-op in a read-only tab). */
export async function setExportOption<K extends keyof ExportOptions>(
  key: K,
  value: ExportOptions[K],
): Promise<void> {
  const script = useScript();
  const project = script.project.value;
  if (!project || useGuard().readOnly.value) return;
  await script.keepOnProject({ exportOptions: { ...exportOptionsOf(project), [key]: value } });
}

/** The Export options dialog is open. */
export const exportOptionsOpen = ref(false);
