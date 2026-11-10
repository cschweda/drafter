import { labelRange, noRevisedPages, type RevisedChoice } from '@drafter/production';
import { ref } from 'vue';
import { useEditor } from '../editor/session';
import { renderExport } from '../storage/export-client';
import { exportOptionsOf } from '../storage/export-options';
import { useScript } from '../storage/script';
import type { RevisedInfo } from '../workers/export-compute';
import { NOT_LOCKED_REVISED } from '../workers/export-refusal';

export type { RevisedInfo } from '../workers/export-compute';

// Export revised pages (production design §8): the dialog's state and its choices, worked out
// apart from the dialog so they can be tested without one.

/** Whether the Export revised pages dialog is open: the command opens it. */
export const revisedPagesOpen = ref(false);

/** What the dialog's fields open with: the header the PDF would print, and the range's two ends. */
export function revisedDefaults(info: RevisedInfo): { header: string; from: string; to: string } {
  return {
    header: info.header ?? info.defaultHeader,
    from: info.labels[0] ?? '',
    to: info.labels.at(-1) ?? '',
  };
}

/**
 * The header the PDF prints for what the Header text field says, and what to keep in the block:
 * a string to keep as the production's own, null to remove it (the field was cleared, or set back
 * to the default, which then follows the open set), or undefined to leave the block as it is.
 */
export function revisedHeaderChoice(
  typed: string,
  info: RevisedInfo,
): { header: string; save: string | null | undefined } {
  const text = typed.trim();
  const own = text === '' || text === info.defaultHeader ? null : text;
  const header = own ?? info.defaultHeader;
  return { header, save: own === info.header ? undefined : own };
}

/** What the dialog asks the export for. */
export interface RevisedPagesChoice {
  which: RevisedChoice;
  marks: 'open' | 'all';
  header: string;
  tint: boolean;
  /** The open set's name, for the file's name ("The Hall – Blue revised pages.pdf"). */
  set: string;
}

/** The open script's `RevisedInfo`, worked out in the export worker, never on the typing path. */
export async function revisedInfo(): Promise<RevisedInfo> {
  const editor = useEditor();
  const { data } = await renderExport({
    kind: 'revised-info',
    source: editor.view.state.doc.toString(),
    template: editor.template.value,
    options: exportOptionsOf(useScript().project.value),
  });
  return JSON.parse(String(data)) as RevisedInfo;
}

/**
 * Why `which` would print nothing, by `info`, or null when it prints a page: the dialog says so
 * before any picker, so no empty file is made.
 */
export function revisedRefusal(info: RevisedInfo, which: RevisedChoice): string | null {
  if (info.open === null) return NOT_LOCKED_REVISED;
  const some =
    which.kind === 'current'
      ? info.current
      : which.kind === 'all'
        ? info.any
        : labelRange(info.labels, which.from, which.to).length > 0;
  return some ? null : noRevisedPages(which, info.open);
}
