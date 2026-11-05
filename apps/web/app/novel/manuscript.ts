import { ref } from 'vue';

/**
 * Which manuscript the Export manuscript dialog is open for: a PDF or a Word file, or null while
 * it is closed. The two export commands open it (manuscript design, "Where it sits in the app").
 */
export const manuscriptOpen = ref<null | 'pdf' | 'docx'>(null);
