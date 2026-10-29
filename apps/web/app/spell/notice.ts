import { sayOutline } from '../outline/notice';

// What the spelling commands and the spelling menu say (Plan D, Task 5), in the live region the
// Outline's moves use (`OutlineAnnouncer.vue`), which is always in the page.

export const NO_MARK_HERE = 'No misspelled word at the cursor.';
export const NO_MARKS = 'No misspelled words.';
export const SPELLCHECK_OFF = 'Spellcheck is off in Settings.';

/** Says `message` once, politely. */
export const saySpell = (message: string): Promise<void> => sayOutline(message);
