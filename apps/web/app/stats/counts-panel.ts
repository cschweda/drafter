import { ref } from 'vue';
import { useFocusMode } from '~/composables/useFocusMode';

/**
 * Whether the Counts panel is open (Plan 5 Task 3). It opens from the status bar's counts item and
 * from the palette's "Counts and daily goal…", the way there on a screen with no status bar (a
 * phone, fresh-look Task 6): the panel then shows above the bottom edge on its own.
 */
export const countsOpen = ref(false);

/** Opens the Counts panel (focus mode has no status bar, so it is left first). */
export function openCounts(): void {
  useFocusMode().leave();
  countsOpen.value = true;
}
