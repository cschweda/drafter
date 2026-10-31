import { ref } from 'vue';

// "Drafter is up to date (v…)" (UpdatePrompt.vue): said once, on the load that an update the
// writer chose reloaded into, so the reload shows that it happened. The service-worker plugin
// marks the tab's session storage just before that reload and takes the mark on the next load;
// an ordinary load finds none. Storage that refuses (a private window, blocked site data) only
// means the note isn't shown. The plugin is in the first load, so this imports only Vue.

const KEY = 'drafter-updated';

/** This load came from an update the writer chose: the note is to be shown. */
export const justUpdated = ref(false);

/** Just before the reload into a new version. */
export function markUpdating(storage: Pick<Storage, 'setItem'> | undefined): void {
  try {
    storage?.setItem(KEY, '1');
  } catch {
    // Refused: no note after the reload.
  }
}

/** On load: whether the last reload was an update the writer chose. Takes the mark, so only once. */
export function takeUpdated(storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined): boolean {
  try {
    if (!storage || storage.getItem(KEY) === null) return false;
    storage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}

export function upToDateMessage(version: string): string {
  return `Drafter is up to date (v${version})`;
}

/** The tab's session storage, or nothing where reading it throws. */
export function sessionStore(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}
