import { ref } from 'vue';

/** Whether the Settings dialog is open; the File command sets it and `SettingsDialog.vue` shows it. */
export const settingsOpen = ref(false);
