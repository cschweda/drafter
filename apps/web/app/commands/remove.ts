import { ref } from 'vue';
import type { Project } from '~/storage/projects';

/**
 * The script the "Remove from this browser" command is asking about, while its dialog is up.
 * The Scripts menu has a confirmation of its own for the scripts it lists; this is for the open one.
 */
export const removing = ref<Project | null>(null);
