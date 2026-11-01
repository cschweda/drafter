/** The color mode's key in localStorage (Nuxt's default, `nuxt-color-mode`). */
export const THEME_KEY = 'nuxt-color-mode';

let stored: boolean | undefined;

/**
 * Notes whether a theme was stored when the page opened. The color mode stores its preference as
 * soon as it starts, so this is read first, by `plugins/theme-stored.client.ts`, which runs before
 * it. False when localStorage can't be read.
 */
export function noteThemeStored(): void {
  try {
    stored = window.localStorage.getItem(THEME_KEY) !== null;
  } catch {
    stored = false;
  }
}

/** Whether a theme was stored in this browser when the page opened (see `noteThemeStored`). */
export function themeWasStored(): boolean {
  if (stored === undefined) noteThemeStored();
  return stored ?? false;
}
