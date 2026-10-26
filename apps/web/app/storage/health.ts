import { db } from './db';

/** How well the recovery copy is kept (technical design §8.3). */
export type RecoveryState = 'persistent' | 'not-persistent' | 'unavailable';

/**
 * Whether IndexedDB opens, and whether the browser promises to keep it. A browser that can't say
 * (no Storage API, or the question fails) is treated as one that makes no promise.
 */
export async function checkRecovery(): Promise<RecoveryState> {
  try {
    await db.open();
  } catch {
    return 'unavailable';
  }
  try {
    return (await navigator.storage?.persisted?.()) ? 'persistent' : 'not-persistent';
  } catch {
    return 'not-persistent';
  }
}

/** Asks the browser to keep the storage; the answer shows in the next `checkRecovery`. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Refusing and failing look the same to the writer.
  }
}
