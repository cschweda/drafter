import { ref } from 'vue';

/** Whether About Drafter is open; the About Drafter command sets it, and `AboutDialog.vue` shows it. */
export const aboutOpen = ref(false);
