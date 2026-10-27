import { type Ref, readonly, shallowRef } from 'vue';
import { db } from '../storage/db';

export interface Settings {
  /** Follow the system's light or dark appearance; off by default (Phase 1 design §8). */
  matchSystem: boolean;
  /** Scales both panes evenly: 0.9, 1, 1.15, 1.3, or 1.5. */
  textSize: number;
  spellcheck: boolean;
  /** Strict Fountain (§5.6). */
  strict: boolean;
  /** Source line numbers in the leftmost gutter, so a line can be referred to; off by default (decided 2026-10-26). */
  lineNumbers: boolean;
  /** Typewriter scrolling: the cursor's line stays at the middle of the Source pane; off by default (§7.2). */
  typewriter: boolean;
  /** A short tone when a sprint ends; off by default, so Drafter makes no sound unless asked (§7.3). */
  sprintSound: boolean;
  /** Desktop app only: look on GitHub for a newer version once, when Drafter starts; on by default. */
  checkForUpdates: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  matchSystem: false,
  textSize: 1,
  spellcheck: true,
  strict: false,
  lineNumbers: false,
  typewriter: false,
  sprintSound: false,
  checkForUpdates: true,
};

/** The text sizes the dialog offers, as multiples of the normal size. */
export const TEXT_SIZES: readonly number[] = [0.9, 1, 1.15, 1.3, 1.5];

function isKey(key: string): key is keyof Settings {
  return Object.hasOwn(DEFAULT_SETTINGS, key);
}

/** Whether `value` is one `key` can hold: a stored row from an older or damaged table may not be. */
function isValid(key: keyof Settings, value: unknown): boolean {
  return key === 'textSize'
    ? typeof value === 'number' && TEXT_SIZES.includes(value)
    : typeof value === 'boolean';
}

export interface SettingsStore {
  settings: Readonly<Ref<Settings>>;
  /** Changes a setting and keeps it in the settings table. An unknown key or a value it can't hold changes nothing. */
  set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>;
  /** Settles when the table has been read, whether or not it could be. */
  ready: Promise<void>;
  /** True once the table was read; false before, and for good when it couldn't be. */
  read: Readonly<Ref<boolean>>;
}

/**
 * A set of settings that reads the `settings` table once and keeps every change in it, a row to
 * a setting. The app has one (`useSettings`); a test makes its own to stand for a new visit.
 *
 * Settings are a convenience, not the writer's work: if the table can't be read the defaults
 * stand, and if it can't be written the change holds for this visit and `set` still resolves.
 */
export function createSettings(): SettingsStore {
  const state = shallowRef<Settings>({ ...DEFAULT_SETTINGS });
  /** What `set` has changed, which a slow read must not overwrite. */
  const changed = new Set<keyof Settings>();
  const read = shallowRef(false);

  const ready = (async () => {
    try {
      const rows = await db.settings.toArray();
      const next: Record<string, unknown> = { ...state.value };
      for (const row of rows) {
        // One damaged row doesn't cost the others.
        if (typeof row !== 'object' || row === null) continue;
        const { key, value } = row;
        if (isKey(key) && !changed.has(key) && isValid(key, value)) next[key] = value;
      }
      state.value = next as unknown as Settings;
      read.value = true;
    } catch {
      // The defaults stand, and `read` stays false.
    }
  })();

  async function set<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
    if (!isKey(key) || !isValid(key, value)) return;
    changed.add(key);
    state.value = { ...state.value, [key]: value };
    try {
      await db.settings.put({ key, value });
    } catch {
      // Held for this visit.
    }
  }

  return { settings: readonly(state), set, ready, read: readonly(read) };
}

let shared: SettingsStore | undefined;

/** The app's settings, read on first use (in the browser). */
export function useSettings(): SettingsStore {
  shared ??= createSettings();
  return shared;
}
