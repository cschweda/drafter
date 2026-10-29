// The menu bar (docs/drafter-desktop-design.md §4), laid out from Drafter's own command list: the
// page sends each command's id, title, group, keys, and whether it applies right now; this builds
// the template; choosing an item sends its id back, and the page runs the command it registered
// (the same one the palette and the keys run). Pure: it imports only Electron's types, so the unit
// tests need no Electron. The part that touches Electron is menu-main.ts.
import type { MenuItemConstructorOptions } from 'electron';

/** What the page tells the main process about one command (apps/web `DesktopMenuCommand`). */
export interface MenuCommand {
  id: string;
  title: string;
  group: string;
  /** In CodeMirror's notation (`Mod-Shift-s`); the first is the one the menu shows. */
  keys?: readonly string[];
  /** Whether the command applies right now. */
  enabled: boolean;
}

/** The menus, in order. A command in any other group (a script module's) is not in the menu. */
export const GROUPS = ['File', 'Edit', 'View', 'Go', 'Help'] as const;
type Group = (typeof GROUPS)[number];

/** Where Help sends a writer who wants a newer version (opened in the browser). */
export const RELEASES_URL = 'https://github.com/cschweda/drafter/releases';

/** Where About Drafter sends a writer who wants to know more (opened in the browser). */
export const ABOUT_URL = 'https://drafter.dev/';

/** What the About box says. */
export function aboutText(version: string): { message: string; detail: string } {
  return {
    message: `Drafter ${version}`,
    detail:
      'Screenplays and stage plays, written in plain text.\nFree and open source (MIT license).\n\ndrafter.dev',
  };
}

// ---- Keys ---------------------------------------------------------------------------------------

const MODIFIERS: Record<string, string> = {
  Mod: 'CmdOrCtrl',
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
};

/** The keys CodeMirror names that Electron names differently. */
const KEY_NAMES: Record<string, string> = {
  '+': 'Plus',
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Insert: 'Insert',
};

/**
 * `Mod-Shift-s` in CodeMirror's notation → `CmdOrCtrl+Shift+S` in Electron's. A key Electron has
 * no name for gives '' (the item then shows none), never an accelerator that makes the menu throw.
 */
export function accelerator(key: string): string {
  const parts: string[] = [];
  let rest = key;
  for (;;) {
    const dash = rest.indexOf('-');
    // What is left is the key, even when it is the minus sign itself (`Mod--`).
    if (dash <= 0) break;
    const modifier = MODIFIERS[rest.slice(0, dash)];
    if (!modifier) break;
    parts.push(modifier);
    rest = rest.slice(dash + 1);
  }
  let name: string | undefined;
  if (/^[a-z]$/i.test(rest)) name = rest.toUpperCase();
  else if (/^[0-9]$/.test(rest)) name = rest;
  else if (/^F([1-9]|1\d|2[0-4])$/.test(rest)) name = rest;
  else if (Object.hasOwn(KEY_NAMES, rest)) name = KEY_NAMES[rest];
  else if (/^[`~!@#$%^&*()_=[\]{};:'",.<>/?\\|-]$/.test(rest)) name = rest;
  if (!name) return '';
  return [...parts, name].join('+');
}

// ---- Layout -------------------------------------------------------------------------------------

type Item = MenuItemConstructorOptions;

/** A run of items, and the separator that follows it. */
interface Section {
  /** The ids to take, in this order; or a test, taking them in the order the page sent. */
  pick?: readonly string[] | ((id: string) => boolean);
  /** Put them in a submenu of this name instead. */
  submenu?: string;
  /** What to cut from the start of a title in that submenu (`Open sample: `). */
  strip?: RegExp;
  /** Items that aren't commands (roles). */
  fixed?: readonly Item[];
}

const prefix =
  (...starts: string[]) =>
  (id: string) =>
    starts.some((s) => id.startsWith(s));

const LAYOUT: Record<Group, Section[]> = {
  File: [
    { pick: prefix('new-') },
    { pick: ['open'] },
    { pick: prefix('open-sample-'), submenu: 'Open Sample', strip: /^Open sample: / },
    { pick: ['reset-sample'] },
    {
      pick: (id) => id.startsWith('template-') || id === 'document-markdown',
      submenu: 'Template',
      strip: /^(Template|Document): /,
    },
    { pick: ['save', 'save-as', 'revert-to-saved'] },
    { pick: prefix('export-'), submenu: 'Export', strip: /^Export as / },
    { pick: ['remove'] },
    { pick: ['settings'] },
  ],
  Edit: [
    { pick: ['undo', 'redo'] },
    { fixed: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { pick: ['find'] },
    {
      pick: [
        'check-spelling',
        'spelling-suggestions',
        'add-to-script-dictionary',
        'add-to-my-dictionary',
        'ignore-misspelling',
      ],
    },
    { pick: prefix('element-'), submenu: 'Element', strip: /^Element: / },
    { pick: prefix('emphasis-'), submenu: 'Emphasis', strip: /^Emphasis: / },
    { pick: prefix('make-'), submenu: 'Force', strip: /^Force / },
    { pick: ['dual-dialogue', 'wrap-in-note', 'cut-to-boneyard'] },
    { pick: prefix('markdown-'), submenu: 'Markdown', strip: /^Markdown: / },
  ],
  View: [
    { pick: ['show-source', 'show-script', 'show-preview', 'show-problems'] },
    { pick: ['focus-mode'], fixed: [{ role: 'togglefullscreen' }] },
    { pick: prefix('sprint-'), submenu: 'Sprint' },
    { pick: ['show-stats'] },
    { pick: ['switch-theme'] },
    {
      pick: [
        'show-line-numbers',
        'hide-line-numbers',
        'turn-on-typewriter',
        'turn-off-typewriter',
        'show-element-bar',
        'hide-element-bar',
        'toggle-structure-strip',
      ],
    },
    { pick: ['fold-all', 'unfold-all'] },
  ],
  Go: [
    { pick: ['palette'] },
    { pick: ['go-to-scene', 'go-to-line'] },
    { pick: ['next-problem', 'previous-problem'] },
    { pick: ['next-misspelling', 'previous-misspelling'] },
  ],
  Help: [
    { pick: ['help-fountain', 'help-shortcuts', 'help-saving', 'help-privacy', 'help-licences'] },
    { pick: ['take-the-tour'] },
    { pick: prefix('sample-script-'), submenu: 'Sample Scripts', strip: /^Sample script: / },
    { pick: ['check-for-updates'] },
  ],
};

/** The help pages are called what a desktop would call them: there is no browser to speak of. */
const LABELS: Record<string, string> = {
  'help-fountain': 'Fountain Cheat Sheet',
  'help-shortcuts': 'Keyboard Shortcuts',
  'help-saving': 'Saving',
  'help-privacy': 'Privacy',
  'help-licences': 'Third-party Licences',
  'check-for-updates': 'Check for Updates…',
};

/**
 * The page's About Drafter command: its dialog (the version, Electron's and Chromium's, the links,
 * Copy version info). The menu's About Drafter runs it while the page can; with no page to show it
 * (none yet, or a Mac with no window), About is the app's own box (`MenuActions.about`).
 */
export const ABOUT_COMMAND = 'about-drafter';

/** A title as a menu label: `&` would set a mnemonic on Linux and Windows, so it is doubled. */
const label = (text: string) => text.replaceAll('&', '&&');
const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface MenuActions {
  platform?: NodeJS.Platform;
  /** Help → About Drafter. */
  about?: () => void;
  /** Help → Open the Releases Page. */
  releases?: () => void;
  /** Help → Open Modules Folder: shows the folder a writer adds script modules to. */
  modulesFolder?: () => void;
  /** File → Quit: the main process passes `app.quit()`, which a `before-quit` handler can stop. */
  quit?: () => void;
  /**
   * A Mac with no editor's window: the commands that start from a window (`opensWindow`) stay
   * on, with their keys, and choosing one calls this, which opens the window and runs it there.
   */
  reopen?: (id: string) => void;
}

/** The commands a Mac's menu keeps on with no window: New (every kind), Open…, Open Recent, Settings…. */
export const opensWindow = (id: string): boolean =>
  id.startsWith('new-') || id === 'open' || id === 'open-recent' || id === 'settings';

/**
 * The command chosen with no window, waiting for the window's page: `take` gives it, once, to the
 * first command list that has it on; a list without it at all drops it (that page can't run it).
 */
export class ParkedCommand {
  #id: string | null = null;

  park(id: string): void {
    this.#id = id;
  }

  take(commands: readonly MenuCommand[]): string | null {
    const id = this.#id;
    if (id === null) return null;
    const command = commands.find((c) => c.id === id);
    if (!command) {
      this.#id = null;
      return null;
    }
    if (!command.enabled) return null;
    this.#id = null;
    return id;
  }
}

/**
 * The menu template: File, Edit, View, Go, and Help, with the Quit of the platform. On a Mac the
 * app's own menu comes first (About, Settings…, Services, Hide, Quit), File ends with Close Window,
 * and Window comes before Help. `run` gets the id of the command an item stands for. An item
 * shows its keys but does not register them (`registerAccelerator: false`): the page's own
 * handlers keep the keys, so nothing runs twice.
 */
export function menuTemplate(
  commands: readonly MenuCommand[],
  run: (id: string) => void,
  actions: MenuActions = {},
): Item[] {
  const platform = actions.platform ?? process.platform;
  const apple = platform === 'darwin';
  const about = actions.about ?? (() => {});
  const releases = actions.releases ?? (() => {});
  const modulesFolder = actions.modulesFolder ?? (() => {});
  const quit = actions.quit ?? (() => {});

  const reopen = apple ? actions.reopen : undefined;

  const itemFor = (command: MenuCommand, strip?: RegExp): Item => {
    const title =
      LABELS[command.id] ?? (strip ? capital(command.title.replace(strip, '')) : command.title);
    const key = command.keys?.map(accelerator).find(Boolean);
    // No window on a Mac: there is no page to take the key, so the menu registers it.
    if (reopen && opensWindow(command.id)) {
      return {
        id: command.id,
        label: label(title),
        enabled: true,
        ...(key && { accelerator: key }),
        click: () => reopen(command.id),
      };
    }
    return {
      id: command.id,
      label: label(title),
      enabled: command.enabled,
      ...(key && { accelerator: key, registerAccelerator: false }),
      click: () => run(command.id),
    };
  };

  // On a Mac, Settings… is in the app's own menu (as every Mac app has it), not in File.
  const inAppMenu = (c: MenuCommand) => apple && c.id === 'settings';
  // About Drafter, once: the page's dialog while the page can show it, else the app's own box.
  const aboutCommand = commands.find((c) => c.id === ABOUT_COMMAND && c.enabled);
  const aboutItem = (): Item =>
    aboutCommand
      ? { ...itemFor(aboutCommand), label: 'About Drafter' }
      : { id: 'about', label: 'About Drafter', click: about };

  const build = (group: Group): Item[] => {
    const mine = commands.filter(
      (c) => c.group === group && !inAppMenu(c) && c.id !== ABOUT_COMMAND,
    );
    const placed = new Set<string>();
    const sections: Item[][] = [];
    for (const section of LAYOUT[group]) {
      const picked =
        section.pick === undefined
          ? []
          : Array.isArray(section.pick)
            ? (section.pick as readonly string[]).flatMap((id) => mine.filter((c) => c.id === id))
            : mine.filter((c) => (section.pick as (id: string) => boolean)(c.id));
      for (const c of picked) placed.add(c.id);
      const items = picked.map((c) => itemFor(c, section.strip));
      if (section.submenu) {
        if (items.length > 0) sections.push([{ label: section.submenu, submenu: items }]);
        if (section.fixed) sections.push([...section.fixed]);
      } else {
        const all = [...items, ...(section.fixed ?? [])];
        if (all.length > 0) sections.push(all);
      }
    }
    // A command the layout doesn't know yet still has its place, at the end of its menu.
    const rest = mine.filter((c) => !placed.has(c.id)).map((c) => itemFor(c));
    if (rest.length > 0) sections.push(rest);
    if (group === 'Help') {
      sections.push([
        { id: 'modules-folder', label: 'Open Modules Folder', click: modulesFolder },
        { id: 'releases', label: 'Open the Releases Page', click: releases },
        ...(apple ? [] : [aboutItem()]),
      ]);
    }
    if (group === 'File' && !apple) {
      sections.push([{ id: 'quit', label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: quit }]);
    }
    // A Mac closes the window in front with ⌘W (the editor's asks first, as its close button does).
    if (group === 'File' && apple) sections.push([{ role: 'close', label: 'Close Window' }]);
    return sections.flatMap((items, i) =>
      i === 0 ? items : [{ type: 'separator' as const }, ...items],
    );
  };

  const bar: Item[] = GROUPS.map((group) => ({
    label: apple ? group : `&${group}`,
    // On a Mac, Help is the system's Help menu (it adds the search field).
    ...(apple && group === 'Help' && { role: 'help' as const }),
    submenu: build(group),
  }));
  if (apple) {
    const settings = commands.filter(inAppMenu).map((c) => itemFor(c));
    bar.unshift({
      label: 'Drafter',
      submenu: [
        aboutItem(),
        { type: 'separator' },
        ...(settings.length > 0 ? [...settings, { type: 'separator' as const }] : []),
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { id: 'quit', label: 'Quit Drafter', accelerator: 'CmdOrCtrl+Q', click: quit },
      ],
    });
    // Minimize, Zoom, Bring All to Front, and the open windows: the system fills it in.
    bar.splice(bar.length - 1, 0, { label: 'Window', role: 'windowMenu' });
  }
  return bar;
}

// ---- What the page sends ------------------------------------------------------------------------

/** The most commands, and the longest id, title, and key list the main process takes. */
export const LIMITS = { commands: 400, id: 80, title: 200, keys: 4, key: 40 } as const;

/**
 * The ids of the items the menu has of its own (Quit, About, the Releases page, the modules folder). The page's
 * commands can't take them: an item the page names `quit` would be a second Quit that the
 * template's own ids (for `Menu.getMenuItemById`, and the tests) can't tell from the first.
 */
const NATIVE_IDS: ReadonlySet<string> = new Set(['quit', 'about', 'releases', 'modules-folder']);

/**
 * The list of commands in a message from the page, or null when it isn't well-formed: a list of at
 * most `LIMITS.commands` commands, each with a short string id (once only), title, one of the five
 * groups, `enabled` a boolean, and up to four short key strings. Only the known fields are kept.
 * Everything is bounded, so the menu can't be made to hold much by whoever sends it.
 */
export function parseCommands(payload: unknown): MenuCommand[] | null {
  if (!Array.isArray(payload) || payload.length > LIMITS.commands) return null;
  const seen = new Set<string>();
  const out: MenuCommand[] = [];
  for (const entry of payload as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const { id, title, group, keys, enabled } = entry as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || id.length > LIMITS.id || seen.has(id)) {
      return null;
    }
    if (NATIVE_IDS.has(id)) return null;
    if (typeof title !== 'string' || title.length > LIMITS.title) return null;
    if (typeof group !== 'string' || !(GROUPS as readonly string[]).includes(group)) return null;
    if (typeof enabled !== 'boolean') return null;
    let keyList: string[] | undefined;
    if (keys !== undefined) {
      if (!Array.isArray(keys) || keys.length > LIMITS.keys) return null;
      if (!keys.every((k) => typeof k === 'string' && k.length > 0 && k.length <= LIMITS.key)) {
        return null;
      }
      keyList = [...(keys as string[])];
    }
    seen.add(id);
    out.push({ id, title, group, ...(keyList && { keys: keyList }), enabled });
  }
  return out;
}
