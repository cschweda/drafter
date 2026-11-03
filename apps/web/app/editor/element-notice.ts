import { ref } from 'vue';
import { timedSay } from '../storage/say';

/**
 * What the element bar says in its toast and polite live region: where a hidden bar comes back,
 * and why an element command did nothing (the title page, a note, a line that is already
 * dialogue). The palette's element commands say it here too. Empty after a few seconds.
 */
export const elementNotice = ref('');
export const sayElement = timedSay(elementNotice, 8000);

/**
 * What Classic Mode says to a screen reader alone (`ElementAnnouncer.vue`): the switch, and each row
 * of a list as it goes by, which on the element bar's toast would be a card a second. It's always on
 * the page, where the toast has gone with the bar in focus mode or with the bar turned off.
 */
export const classicNotice = ref('');
export const sayClassic = timedSay(classicNotice, 8000);
