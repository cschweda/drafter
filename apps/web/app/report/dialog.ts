import { ref } from 'vue';
import { EMPTY_DRAFT, hasText, type IssueDraft, type IssueKind } from './issue';

/**
 * Whether Report a problem or Suggest an idea is open, and as which: the Help commands (and About's
 * links) set it, and `ReportDialog.vue` shows it.
 */
export const reportOpen = ref<IssueKind | null>(null);

/**
 * Where the dialog keeps the report until the writer clears it (localStorage), so closing the tab,
 * a reload, or the desktop app restarting loses nothing. Drafter can't know whether GitHub or an
 * email app got the report, so it never clears it by itself. Only the report's own fields are
 * kept: never the script.
 */
export const REPORT_DRAFT_KEY = 'drafter-report-v1';

const store = (): Storage | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
};

/** What was typed this visit, or an empty draft (storage blocked or broken: an empty one). */
export function loadDraft(): IssueDraft {
  try {
    const raw = store()?.getItem(REPORT_DRAFT_KEY);
    if (!raw) return { ...EMPTY_DRAFT };
    const saved = JSON.parse(raw) as Partial<IssueDraft>;
    const text = (value: unknown) => (typeof value === 'string' ? value : '');
    return {
      kind: saved.kind === 'idea' ? 'idea' : 'problem',
      title: text(saved.title),
      happened: text(saved.happened),
      expected: text(saved.expected),
      idea: text(saved.idea),
      includeVersion: saved.includeVersion !== false,
    };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

/** Keeps the report's fields (and nothing else); an empty report is nothing to keep. */
export function saveDraft(draft: IssueDraft): void {
  if (!hasText(draft)) {
    clearDraft();
    return;
  }
  const { kind, title, happened, expected, idea, includeVersion } = draft;
  try {
    store()?.setItem(
      REPORT_DRAFT_KEY,
      JSON.stringify({ kind, title, happened, expected, idea, includeVersion }),
    );
  } catch {
    // Blocked or full: the draft holds while the dialog is open.
  }
}

export function clearDraft(): void {
  try {
    store()?.removeItem(REPORT_DRAFT_KEY);
  } catch {
    // Nothing to clear.
  }
}
