export interface AppearanceInput {
  /** The match-system setting. */
  on: boolean;
  /** The color mode's preference now: `system`, `light`, or `dark`. */
  preference: string;
  /** The appearance showing now. */
  current: 'light' | 'dark';
  /** The theme chosen last by hand, if there is one. */
  chosen?: 'light' | 'dark';
  /** This is the first look, made when the settings were first available, not a change to them. */
  initial: boolean;
  /** The settings table was read; if not, `on` is only the default. */
  read: boolean;
}

export interface AppearanceStep {
  preference: string;
  /** The theme to remember for when following the system stops. */
  chosen?: 'light' | 'dark';
}

/**
 * What the color mode should become for the match-system setting, or null to leave it. Turning
 * the setting on follows the system (remembering the theme chosen); turning it off puts back the
 * theme chosen last. The first look is left alone when the table couldn't be read: the theme
 * lives in localStorage and may say `system`, while the setting is only the default `false`, and
 * acting on that would silently end following the system.
 */
export function appearanceStep(input: AppearanceInput): AppearanceStep | null {
  const { on, preference, current, chosen, initial, read } = input;
  if (initial && !read) return null;
  if (on) {
    if (preference === 'system') return null;
    const remembered = preference as 'light' | 'dark';
    return { preference: 'system', chosen: remembered };
  }
  if (preference !== 'system') return null;
  return chosen ? { preference: chosen, chosen } : { preference: current };
}

export interface FreshVisitInput {
  /** The browser had no scripts when the page opened (`isFirstVisit()` in storage/script.ts). */
  firstVisit: boolean;
  /** A theme is stored under `nuxt-color-mode`: the writer has chosen one in this browser. */
  themeStored: boolean;
  /** Match system appearance is on already. */
  matchSystem: boolean;
}

/**
 * Whether to turn Match system appearance on for this visit (fresh-look design §9). A fresh visit
 * (no scripts yet, and no theme ever chosen) follows the system, so a reader with a light system
 * isn't met by a dark screen. Dark stays the default, and a visitor who has been here before is
 * left exactly as they are. Once the writer picks a theme by hand, that choice wins (`applySettings`
 * turns the setting off again).
 */
export function freshVisitMatchesSystem(input: FreshVisitInput): boolean {
  return input.firstVisit && !input.themeStored && !input.matchSystem;
}
