import { ref } from 'vue';

// The choices behind "A new version of Drafter is ready" (Phase 1 design §11). Nothing here
// reloads by itself: every path to `apply` starts with the writer pressing a button.

export const UPDATE_READY = 'A new version of Drafter is ready';

export const UNSAVED_MESSAGE =
  'Your unsaved changes stay in this browser’s recovery copy, but they aren’t in your file yet.';

/** The question's text. With no recovery copy to promise (the browser can't keep one), it says so. */
export function unsavedMessage(recovery: 'ok' | 'not-persistent' | 'unavailable' | string): string {
  return recovery === 'unavailable'
    ? 'Drafter can’t keep a recovery copy in this browser right now, so your unsaved changes aren’t in your file or anywhere else yet.'
    : UNSAVED_MESSAGE;
}

export const DOWNLOADING_MESSAGE = 'Your script is downloading. Reload when it has finished.';

/** The button that reloads with changes unsaved: with no recovery copy, it says what it costs. */
export function reloadAnywayLabel(recovery: string): string {
  return recovery === 'unavailable' ? 'Reload and lose them' : 'Reload anyway';
}

export interface UpdateDeps {
  /** Whether the open script has changes that aren't in its file. */
  unsaved(): boolean;
  /** Saves the open script (the Save command). Rejects when the save fails. */
  save(): Promise<'saved' | 'cancelled'>;
  /** Whether the save that just finished was a download (a browser that can't write the file itself). */
  savedByDownload(): boolean;
  /** Writes the recovery copy's pending text now. Never rejects. */
  flush(): Promise<void>;
  /**
   * Lets the new version take over and reloads. `anyway`: the writer chose to leave with changes
   * that aren't in a file, so the browser's own "leave this page?" question is not asked too.
   */
  apply(options?: { anyway?: boolean }): Promise<void> | void;
}

/**
 * `toast`: the offer, with Reload. `confirm`: the question that comes first when changes are
 * unsaved. `downloading`: Save first was a download, which has to finish before the page goes.
 */
export type UpdateStage = 'toast' | 'confirm' | 'downloading';

export function createUpdateFlow(deps: UpdateDeps) {
  const stage = ref<UpdateStage>('toast');
  const saving = ref(false);

  /** Reload: at once when nothing is unsaved, else the question first. */
  async function reload(): Promise<void> {
    if (deps.unsaved()) {
      stage.value = 'confirm';
      return;
    }
    await deps.apply();
  }

  /** Saves, and reloads only if the save worked. A cancelled or failed save leaves the question up. */
  async function saveFirst(): Promise<void> {
    if (stage.value !== 'confirm' || saving.value) return;
    saving.value = true;
    try {
      if ((await deps.save()) === 'saved') {
        // A download starts and `save` is done at once; a reload within moments would lose its
        // blob (and a browser's "allow downloads?" question). The writer reloads when it's there.
        if (deps.savedByDownload()) stage.value = 'downloading';
        else await deps.apply();
      }
    } catch {
      // The save says what went wrong in the status bar; the question stays.
    } finally {
      saving.value = false;
    }
  }

  async function reloadAnyway(): Promise<void> {
    if (stage.value !== 'confirm') return;
    await deps.flush();
    await deps.apply({ anyway: true });
  }

  function cancel(): void {
    stage.value = 'toast';
  }

  return { stage, saving, reload, saveFirst, reloadAnyway, cancel };
}
