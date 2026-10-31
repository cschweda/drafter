import { computed } from 'vue';
import { desktop } from '~/desktop';
import { installAdviceHere } from './install-advice';
import { useScript } from './script';

/**
 * The browser's note that the "may be cleared" toast was dismissed: it shows once, not at every visit
 * (the status bar's chip keeps saying so). The e2e tests' storage state sets it, as it does the
 * tour's, so the toast covers nothing in tests about something else.
 */
export const STORAGE_TOAST_SEEN = 'drafter-storage-toast-v1';

/** Whether the toast was dismissed in this browser before. Storage that throws counts as not. */
export function storageToastSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_TOAST_SEEN) === 'true';
  } catch {
    return false;
  }
}

/** Remembers that the toast was dismissed. */
export function rememberStorageToast() {
  try {
    localStorage.setItem(STORAGE_TOAST_SEEN, 'true');
  } catch {
    // A browser that keeps nothing shows it again next time.
  }
}

/**
 * What the app says about the recovery copy (fresh-look design §3.5): "may be cleared" is a one-time
 * toast and a warning chip in the status bar; "unavailable" stays an alert above the panes, since
 * the writer's changes are only in memory. The status bar's chip (Task 6) reads this too.
 */
export function useStorageNotice() {
  const { warning, recovery, dismissWarning } = useScript();
  return {
    // The desktop app's profile is never cleared (no browser evicts it), so it never warns that the
    // recovery copy may be. That the copy can't be kept at all is still said: it is a real failure.
    mayBeCleared: computed(() => warning.value === 'not-persistent' && desktop() === null),
    unavailable: computed(() => warning.value === 'unavailable'),
    /** The recovery copy's state, for the status bar's chip: a warning unless it is kept. */
    chip: computed(() =>
      recovery.value === 'persistent' || (recovery.value === 'not-persistent' && desktop() !== null)
        ? null
        : recovery.value,
    ),
    // What to say about installing depends on the browser (by feature, see install-advice.ts). Read
    // only in the browser: the site is generated without a window.
    advice: () => (import.meta.client ? installAdviceHere() : ''),
    dismiss: dismissWarning,
  };
}
