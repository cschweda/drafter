import { type ShallowRef, shallowRef } from 'vue';

// The Structure strip's in-view marker (structure strip design §4, Call 29): the page at the top
// of the Script pane, which `ScriptPane.vue` publishes as it scrolls, so the strip can show where
// the reader is in the pages.

/**
 * The page at the top of the Script pane while it shows (number, 0 the title page), else null.
 * Set by ScriptPane once a frame at most while it scrolls.
 */
export const scriptTopPage: ShallowRef<number | null> = shallowRef(null);
