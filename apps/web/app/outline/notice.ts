import { ref } from 'vue';
import { timedSay } from '../storage/say';

/**
 * What the Outline says happened, once, in a polite live region (Phase 2 design §5.7): "Moved
 * INT. HALL to scene 4 of 32." The region is always in the page (`OutlineAnnouncer.vue`), so a
 * move made from the Source pane is heard too. Empty after a few seconds.
 */
export const outlineNotice = ref('');
export const sayOutline = timedSay(outlineNotice, 8000);
