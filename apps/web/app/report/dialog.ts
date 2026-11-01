import { ref } from 'vue';
import { EMPTY_DRAFT, type IssueDraft, type IssueKind } from './issue';

/**
 * Whether Report a problem or Suggest an idea is open, and as which: the Help commands (and About's
 * links) set it, and `ReportDialog.vue` shows it.
 */
export const reportOpen = ref<IssueKind | null>(null);

/** Where the dialog keeps what the writer typed for the visit, so a reload or going offline loses nothing. */
export const REPORT_DRAFT_KEY = 'drafter-report-v1';

const store = (): Storage | undefined => {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
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

export function saveDraft(draft: IssueDraft): void {
  try {
    store()?.setItem(REPORT_DRAFT_KEY, JSON.stringify(draft));
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
