// Plain data, apart from `settings.ts` (which needs the database), so `commands/data.ts`, which the
// prerendered Keyboard shortcuts page and tests outside the app read, can name it.

export type WritingMode = 'fountain' | 'classic';
/** The writing modes, as Settings lists them. */
export const WRITING_MODES: readonly WritingMode[] = ['fountain', 'classic'];
