import { manuscriptOpen } from '~/novel/manuscript';
import { treatmentOpen } from '~/outline/treatment';
import { revisedPagesOpen } from '~/production/revised';
import { exportScript } from '~/storage/export';
import { exportOptionsOpen } from '~/storage/export-options';
import { storyMapOpen } from '~/story-map/options';
import type { Behavior, When } from './behavior';

/**
 * The Export group's commands (out of `builtin.ts`, 2026-11-04): each export, the story map, the
 * treatment, a locked script's revised pages, and a novel's manuscript (after their dialogs), and
 * Export options.
 */
export function exportBehaviors({
  hasScript,
  isFountain,
  isNovel,
  isLocked,
  exportsHere,
}: When): Record<string, Behavior> {
  return {
    // Export: the toolbar's Export menu, the app menu, and the palette run these. What the open kind
    // exports (`EXPORTS`): a PDF for both, a Markdown document's drawn in Inter Tight (Markdown PDF
    // design §10); Final Draft for a script; and a Markdown file for both, a script's the whole script
    // written in the export worker, a document's its own text (Call 24); and an HTML page for both
    // (HTML export design §1), and an EPUB for both, to read on an e-reader (§10a).
    'export-pdf': { enabled: () => exportsHere('pdf'), run: () => void exportScript('pdf') },
    'export-html': { enabled: () => exportsHere('html'), run: () => void exportScript('html') },
    'export-epub': { enabled: () => exportsHere('epub'), run: () => void exportScript('epub') },
    'export-fdx': { enabled: () => exportsHere('fdx'), run: () => void exportScript('fdx') },
    'export-md': { enabled: () => exportsHere('md'), run: () => void exportScript('md') },
    // A copy of the script as a .fountain, leaving the script on its own file (Save As moves it).
    'export-fountain': {
      enabled: () => exportsHere('fountain'),
      run: () => void exportScript('fountain'),
    },
    'export-txt': { run: () => void exportScript('txt') },
    // The story map (story-map design §1.1): a script's, after its dialog.
    'export-story-map': {
      enabled: () => hasScript() && isFountain(),
      run: () => {
        storyMapOpen.value = true;
      },
    },
    // A locked script's revised pages (production design §8): its dialog first, for which pages,
    // which marks, the header, and the tint.
    'export-revised-pages': {
      enabled: () => hasScript() && isFountain() && isLocked(),
      run: () => {
        revisedPagesOpen.value = true;
      },
    },
    'export-treatment': {
      enabled: isFountain,
      run: () => {
        treatmentOpen.value = true;
      },
    },
    // A novel's standard manuscript, as a PDF or a Word file: its dialog first, for the title page's
    // details, which `exportManuscript` then exports with.
    'export-manuscript-pdf': {
      enabled: isNovel,
      run: () => {
        manuscriptOpen.value = 'pdf';
      },
    },
    'export-manuscript-docx': {
      enabled: isNovel,
      run: () => {
        manuscriptOpen.value = 'docx';
      },
    },
    // How the open script's exports come out (out-the-door design §2.4): scene numbers and the title
    // page for its PDF, plain text, Final Draft file, and Markdown, and notes for its Markdown alone
    // (Call 28), and "Let Drafter reopen this file" for its HTML and EPUB (reopenable exports). At
    // the end of the Export menu. On in a read-only tab, whose dialog shows the choices it can't
    // change; on for a Markdown document too, whose dialog offers only the last.
    'export-options': {
      enabled: () => hasScript(),
      run: () => {
        exportOptionsOpen.value = true;
      },
    },
  };
}
