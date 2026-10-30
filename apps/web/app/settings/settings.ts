import { SPELL_LANGUAGES, type SpellLanguage } from '@drafter/spell';
import type { Paper } from '@drafter/templates';
import { type Ref, readonly, shallowRef } from 'vue';
import { DIFF_COLORS, type DiffColors } from '../compare/colors';
import { db } from '../storage/db';

export interface Settings {
  /** Follow the system's light or dark appearance; off by default (Phase 1 design §8). */
  matchSystem: boolean;
  /** Scales both panes evenly: 0.9, 1, 1.15, 1.3, or 1.5. */
  textSize: number;
  /** Drafter's spellcheck in the Source pane, with its own dictionary; on by default (Plan D). The browser's is always off there. */
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
  /** The Source and the Script pane (or the Preview) scroll together; on by default (decided 2026-10-27). */
  scrollSync: boolean;
  /** The element bar over the Source pane, which writes Fountain's marks; on by default (decided 2026-10-27). */
  elementBar: boolean;
  /** How big the Cards tab draws its cards, chosen on its slim bar; medium by default (Phase 2 design §7). */
  cardSize: CardSize;
  /** The spellcheck's dictionary: US English by default (Plan D, Call 8). */
  spellLanguage: SpellLanguage;
  /** Check notes and boneyard as well; off by default (Plan D, Call 7). */
  spellNotes: boolean;
  /** My dictionary: words never marked in any script in this browser, kept as typed (technical design §10; Plan D, Call 9). */
  personalDictionary: readonly string[];
  /** The Structure strip above the panes; off by default, to keep the writing screen calm (structure strip design §5). */
  structureStrip: boolean;
  /** The paper of a Markdown document's PDF: US Letter by default (Markdown PDF design §6, Call 20). A script's PDF uses its template's. */
  markdownPaper: Paper;
  /** Colors for changes in Compare's Changes view: red and green, or blue and orange (version-history design §7). */
  diffColors: DiffColors;
  /** Compare's view, the last chosen on its slim bar: the Changes view by default (version-history design §5.1). */
  compareView: CompareView;
  /** The Changes view's layout, the last chosen: unified by default; side by side where the pane is wide enough. */
  diffLayout: DiffLayout;
  /** The Stats tab's Character by scene as a List of text, not the grid: the last chosen, off by default (seeing-the-script design §4.4). */
  gridAsList: boolean;
}

export type CompareView = 'changes' | 'pages';
export type DiffLayout = 'unified' | 'split';
export const COMPARE_VIEWS: readonly CompareView[] = ['changes', 'pages'];
export const DIFF_LAYOUTS: readonly DiffLayout[] = ['unified', 'split'];

export type CardSize = 'small' | 'medium' | 'large';
/** The card sizes, smallest first. */
export const CARD_SIZES: readonly CardSize[] = ['small', 'medium', 'large'];
/** The papers a Markdown document's PDF can be on, as Settings lists them. */
export const PAPERS: readonly Paper[] = ['letter', 'a4'];

export const DEFAULT_SETTINGS: Settings = {
  matchSystem: false,
  textSize: 1,
  spellcheck: true,
  strict: false,
  lineNumbers: false,
  typewriter: false,
  sprintSound: false,
  checkForUpdates: true,
  scrollSync: true,
  elementBar: true,
  cardSize: 'medium',
  spellLanguage: 'en-US',
  spellNotes: false,
  personalDictionary: [],
  structureStrip: false,
  markdownPaper: 'letter',
  diffColors: 'red-green',
  compareView: 'changes',
  diffLayout: 'unified',
  gridAsList: false,
};

/** The text sizes the dialog offers, as multiples of the normal size. */
export const TEXT_SIZES: readonly number[] = [0.9, 1, 1.15, 1.3, 1.5];

function isKey(key: string): key is keyof Settings {
  return Object.hasOwn(DEFAULT_SETTINGS, key);
}

/** Whether `value` is one `key` can hold: a stored row from an older or damaged table may not be. */
function isValid(key: keyof Settings, value: unknown): boolean {
  if (key === 'textSize') return typeof value === 'number' && TEXT_SIZES.includes(value);
  if (key === 'cardSize') return (CARD_SIZES as readonly unknown[]).includes(value);
  if (key === 'markdownPaper') return (PAPERS as readonly unknown[]).includes(value);
  if (key === 'diffColors') return (DIFF_COLORS as readonly unknown[]).includes(value);
  if (key === 'compareView') return (COMPARE_VIEWS as readonly unknown[]).includes(value);
  if (key === 'diffLayout') return (DIFF_LAYOUTS as readonly unknown[]).includes(value);
  if (key === 'spellLanguage') return (SPELL_LANGUAGES as readonly unknown[]).includes(value);
  if (key === 'personalDictionary') {
    // Each entry one word: a non-empty string with no whitespace.
    return Array.isArray(value) && value.every((w) => typeof w === 'string' && /^\S+$/u.test(w));
  }
  return typeof value === 'boolean';
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
    // A list is copied: one read from the settings themselves is a Vue proxy, which IndexedDB
    // (and a worker) can't clone.
    const kept = Array.isArray(value) ? [...value] : value;
    state.value = { ...state.value, [key]: kept };
    try {
      await db.settings.put({ key, value: kept });
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
