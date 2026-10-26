import { ref } from 'vue';
import { usePalette } from '~/commands/palette';
import { settingsOpen } from '~/settings/dialog';

// How the rest of the app asks the tour to start, and when the tour may. The tour never stacks on
// another modal: it waits until the palette and every dialog are closed.

/** Counts the requests for the tour (Help → Take the tour, and the palette's command). `AppTour.vue` watches it. */
export const tourRequests = ref(0);

/** True while the welcome, the intro card, or a step is showing. `AppTour.vue` sets it. */
export const tourShowing = ref(false);

/** Asks for the tour to be offered: its intro card, and then the steps. */
export function requestTour(): void {
  tourRequests.value++;
}

/**
 * Something else is modal: the command palette, the Settings dialog, a native `<dialog>` that
 * is open (the both-changed question, the same-title and Markdown questions, the remove and
 * module-confirm dialogs, the Open menu), or a menu that is still open or closing. (Take the tour
 * is chosen from the app menu, which returns focus to its mark as it goes: the tour waits for that
 * so its first dialog keeps focus.)
 */
export function modalOpen(): boolean {
  return (
    usePalette().open.value ||
    settingsOpen.value ||
    (typeof document !== 'undefined' && !!document.querySelector('dialog[open], [role="menu"]'))
  );
}

/** How often a waiting tour looks again, in milliseconds. */
export const CLEAR_POLL = 150;

/**
 * Resolves true once nothing else is modal, or false if `cancelled` says to stop first. Polls,
 * because a native dialog opening and closing is not something Vue can watch.
 */
export function whenClear(cancelled: () => boolean = () => false): Promise<boolean> {
  return new Promise((resolve) => {
    const look = () => {
      if (cancelled()) return resolve(false);
      if (!modalOpen()) return resolve(true);
      setTimeout(look, CLEAR_POLL);
    };
    look();
  });
}
