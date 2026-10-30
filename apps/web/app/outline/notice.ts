import { type Ref, ref, watch } from 'vue';
import { timedSay } from '../storage/say';

/**
 * What the Outline says happened, once, in a polite live region (Phase 2 design §5.7): "Moved
 * INT. HALL to scene 4 of 32." The region is always in the page (`OutlineAnnouncer.vue`), so a
 * move made from the Source pane is heard too. Empty after a few seconds.
 */
export const outlineNotice = ref('');
export const sayOutline = timedSay(outlineNotice, 8000);

/**
 * `outlineNotice` as a modal dialog's status line shows it (History, History of this scene): only
 * what is said while the dialog is open, so a message said before it opened isn't shown in it.
 * Empty again each time it opens. Call it in a component's setup, which stops the watches.
 */
export function noticeWhileOpen(open: () => boolean): Ref<string> {
  const shown = ref('');
  watch(open, (now) => {
    if (now) shown.value = '';
  });
  watch(outlineNotice, (message) => {
    if (open()) shown.value = message;
  });
  return shown;
}
