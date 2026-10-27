import { ref } from 'vue';
import { timedSay } from '../storage/say';

/**
 * What the element bar says in its toast and polite live region: where a hidden bar comes back,
 * and why an element command did nothing (the title page, a note, a line that is already
 * dialogue). The palette's element commands say it here too. Empty after a few seconds.
 */
export const elementNotice = ref('');
export const sayElement = timedSay(elementNotice, 8000);
