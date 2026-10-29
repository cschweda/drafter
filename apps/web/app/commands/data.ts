// What each built-in command IS: its id, title, group, and keys. What it DOES (`run`, `enabled`) is
// in `builtin.ts`, which needs the editor and the session. The Keyboard shortcuts page is
// prerendered and has no editor, so it reads this list (Phase 1 design §5.4), and the palette, the
// menus, and that page can't disagree. Script modules' commands are added at run time and are not
// here. This file imports only plain data, by relative paths, so a test outside the app can read it.

import { SAMPLES } from '../editor/sample-kinds';
import { DOCUMENT_TYPES } from '../editor/template';
import { SPRINT_MINUTES } from '../stats/sprint-minutes';
import type { CommandGroup } from './registry';

export interface CommandData {
  id: string;
  title: string;
  group: CommandGroup;
  /** An `i-lucide-*` name the palette draws instead of its group's icon. */
  icon?: string;
  /** In CodeMirror's notation, such as `Mod-k` or `Mod-Alt-1`. */
  keys?: string;
  /** The registry binds `keys` on the whole page (see `Command.global`). */
  global?: boolean;
}

export interface HelpPage {
  id: string;
  /** The route, prerendered, and the service worker's entry. */
  path: string;
  title: string;
}

/** The help pages (Phase 1 design §4.5): prerendered at `path`, and opened from Help and the palette. */
export const HELP_PAGES: readonly HelpPage[] = [
  { id: 'help-fountain', path: '/docs/fountain', title: 'Fountain cheat sheet' },
  { id: 'help-saving', path: '/docs/saving', title: 'Saving and your browser' },
  { id: 'help-shortcuts', path: '/docs/shortcuts', title: 'Keyboard shortcuts' },
  { id: 'help-privacy', path: '/docs/privacy', title: 'Privacy' },
  { id: 'help-licences', path: '/docs/licences', title: 'Third-party licences' },
];

/** The address a link uses: the page's directory, which is where a static host serves it (no redirect). */
export const helpHref = (page: Pick<HelpPage, 'path'>): string => `${page.path}/`;

/** What the palette and the shortcuts page call the command that opens a help page. */
export const helpCommandTitle = (page: Pick<HelpPage, 'title'>): string =>
  `Open the page: ${page.title}`;

const fountain = (id: string, title: string, keys?: string): CommandData => ({
  id,
  title,
  group: 'Edit',
  ...(keys && { keys }),
});

const element = (id: string, name: string, keys?: string): CommandData => ({
  id: `element-${id}`,
  title: `Element: ${name}`,
  group: 'Edit',
  ...(keys && { keys }),
});

/** The Markdown buttons' actions (`markdown/commands.ts`), and what the palette calls each. */
export const MARKDOWN_ACTIONS = [
  ['heading', 'Heading'],
  ['bold', 'Bold'],
  ['italic', 'Italic'],
  ['list', 'List'],
  ['numbered', 'Numbered list'],
  ['quote', 'Quote'],
  ['link', 'Link'],
  ['code', 'Code'],
] as const;

/** Every built-in command, in the order the palette lists them. */
export const COMMAND_DATA: readonly CommandData[] = [
  { id: 'palette', title: 'Go to scene or command', group: 'Go', keys: 'Mod-k', global: true },

  // File
  // One New command for each document type, in `DOCUMENT_TYPES` order.
  ...DOCUMENT_TYPES.map(
    (type): CommandData => ({
      id: `new-${type.newKind}`,
      title: type.newTitle,
      group: 'File',
      ...(type.newKeys && { keys: type.newKeys, global: true }),
    }),
  ),
  // The Fountain templates, then Markdown as a kind of document.
  ...DOCUMENT_TYPES.filter((type) => type.kind === 'fountain').map(
    (type): CommandData => ({
      id: `template-${type.id}`,
      title: `Template: ${type.name}`,
      group: 'File',
    }),
  ),
  ...DOCUMENT_TYPES.filter((type) => type.kind === 'markdown').map(
    (type): CommandData => ({
      id: 'document-markdown',
      title: `Document: ${type.name}`,
      group: 'File',
    }),
  ),
  { id: 'open', title: 'Open…', group: 'File', keys: 'Mod-o', global: true },
  { id: 'save', title: 'Save', group: 'File', keys: 'Mod-s', global: true },
  { id: 'save-as', title: 'Save As…', group: 'File', keys: 'Mod-Shift-s', global: true },
  { id: 'revert-to-saved', title: 'Revert to Saved', group: 'File' },
  { id: 'history', title: 'History…', group: 'File', icon: 'i-lucide-history' },
  { id: 'take-snapshot', title: 'Take snapshot…', group: 'File', icon: 'i-lucide-camera' },
  ...SAMPLES.map(
    (sample): CommandData => ({
      id: `open-sample-${sample.kind}`,
      title: `Open sample: ${sample.name}`,
      group: 'File',
    }),
  ),
  { id: 'reset-sample', title: 'Reset sample', group: 'File' },
  { id: 'start-blank', title: 'Start blank', group: 'File' },
  { id: 'take-the-tour', title: 'Take the tour', group: 'Help' },
  ...HELP_PAGES.map(
    (page): CommandData => ({ id: page.id, title: helpCommandTitle(page), group: 'Help' }),
  ),
  // Help → Sample scripts: a tiny sample of each kind, opened as a new script of the writer's own.
  ...SAMPLES.map(
    (sample): CommandData => ({
      id: `sample-script-${sample.kind}`,
      title: `Sample script: ${sample.name}`,
      group: 'Help',
    }),
  ),
  { id: 'check-for-updates', title: 'Check for updates…', group: 'Help' },
  { id: 'about-drafter', title: 'About Drafter', group: 'Help', icon: 'i-lucide-info' },
  { id: 'export-pdf', title: 'Export as PDF', group: 'File' },
  { id: 'export-md', title: 'Export as Markdown file', group: 'File' },
  { id: 'export-txt', title: 'Export as plain text', group: 'File' },
  { id: 'export-fdx', title: 'Export as Final Draft (.fdx)', group: 'File' },
  { id: 'export-treatment', title: 'Export as treatment…', group: 'File' },
  { id: 'screenplay-from-outline', title: 'New screenplay from this outline', group: 'File' },
  { id: 'remove', title: 'Remove from this browser', group: 'File' },
  { id: 'settings', title: 'Settings…', group: 'File', keys: 'Mod-,', global: true },

  // Go
  { id: 'go-to-scene', title: 'Go to scene…', group: 'Go' },
  { id: 'go-to-line', title: 'Go to line…', group: 'Go' },
  { id: 'next-problem', title: 'Next problem', group: 'Go', keys: 'F8' },
  { id: 'previous-problem', title: 'Previous problem', group: 'Go', keys: 'Shift-F8' },
  // The spellcheck's (Plan D, Call 11): F7, the usual key, turns on caret browsing in Firefox.
  { id: 'next-misspelling', title: 'Next misspelling', group: 'Go', keys: 'Mod-;' },
  { id: 'previous-misspelling', title: 'Previous misspelling', group: 'Go', keys: 'Mod-Shift-;' },

  // View
  { id: 'show-source', title: 'Show Source', group: 'View' },
  { id: 'show-script', title: 'Show Script', group: 'View' },
  { id: 'show-preview', title: 'Show Preview', group: 'View' },
  { id: 'show-problems', title: 'Show Problems', group: 'View' },
  { id: 'show-outline', title: 'Show Outline', group: 'View' },
  { id: 'show-cards', title: 'Show Cards', group: 'View' },
  { id: 'show-notes', title: 'Show Notes', group: 'View' },
  // Compare's (Phase 2 design §11.2, Call 21): N and Shift+N in the Compare tab, which is not a
  // registry key; from anywhere else these, while a comparison is open. They sit in View with
  // Close comparison, the desktop menu's home for Compare.
  { id: 'next-change', title: 'Next change', group: 'View' },
  { id: 'previous-change', title: 'Previous change', group: 'View' },
  { id: 'close-compare', title: 'Close comparison', group: 'View' },
  {
    id: 'focus-mode',
    title: 'Toggle focus mode',
    group: 'View',
    icon: 'i-lucide-scan',
    keys: 'Mod-Shift-Enter',
    global: true,
  },
  ...SPRINT_MINUTES.map(
    (minutes): CommandData => ({
      id: `sprint-${minutes}`,
      title: `Start a ${minutes}-minute sprint`,
      group: 'View',
    }),
  ),
  { id: 'sprint-pause', title: 'Pause sprint', group: 'View' },
  { id: 'sprint-resume', title: 'Resume sprint', group: 'View' },
  { id: 'sprint-stop', title: 'Stop sprint', group: 'View' },
  { id: 'sprint-hide', title: 'Hide sprint countdown', group: 'View' },
  { id: 'sprint-show', title: 'Show sprint countdown', group: 'View' },
  { id: 'show-stats', title: 'Show stats', group: 'View' },
  { id: 'switch-theme', title: 'Switch theme', group: 'View' },
  { id: 'show-line-numbers', title: 'Show line numbers', group: 'View' },
  { id: 'hide-line-numbers', title: 'Hide line numbers', group: 'View' },
  { id: 'turn-on-typewriter', title: 'Turn on typewriter scrolling', group: 'View' },
  { id: 'turn-off-typewriter', title: 'Turn off typewriter scrolling', group: 'View' },
  { id: 'turn-on-scroll-sync', title: 'Turn on scroll sync', group: 'View' },
  { id: 'turn-off-scroll-sync', title: 'Turn off scroll sync', group: 'View' },
  { id: 'show-element-bar', title: 'Show the element bar', group: 'View' },
  { id: 'hide-element-bar', title: 'Hide the element bar', group: 'View' },
  // The Structure strip (structure strip design §5, Call 31): Mod+Alt+O, read from the physical
  // key with Alt held (`matchesKey`), so Option's character on a Mac doesn't matter.
  {
    id: 'toggle-structure-strip',
    title: 'Toggle the structure strip',
    group: 'View',
    icon: 'i-lucide-panel-top',
    keys: 'Mod-Alt-o',
    global: true,
  },
  { id: 'fold-all', title: 'Fold all', group: 'View', keys: 'Ctrl-Alt-[' },
  { id: 'unfold-all', title: 'Unfold all', group: 'View', keys: 'Ctrl-Alt-]' },
  // Condense and expand (Phase 2 design §6.4): the names a writer looks for, for folding.
  { id: 'condense', title: 'Condense to outline', group: 'View' },
  { id: 'expand-all', title: 'Expand all', group: 'View' },

  // Edit
  { id: 'undo', title: 'Undo', group: 'Edit', keys: 'Mod-z' },
  // The Outline's moves, for the scene holding the cursor (Phase 2 design §6.2).
  { id: 'move-scene-up', title: 'Move scene up', group: 'Edit' },
  { id: 'move-scene-down', title: 'Move scene down', group: 'Edit' },
  // Scene details (Phase 2 design §9), for the scene holding the cursor.
  { id: 'scene-details', title: 'Scene details…', group: 'Edit' },
  // New note (Phase 2 design §8): at the end of the cursor's line, with an optional category.
  { id: 'new-note', title: 'New note…', group: 'Edit' },
  { id: 'expand-outline', title: 'Expand outline', group: 'Edit' },
  { id: 'redo', title: 'Redo', group: 'Edit', keys: 'Mod-Shift-z' },
  { id: 'find', title: 'Find', group: 'Edit', keys: 'Mod-f' },
  // Check spelling shows Problems on its Spelling group (Plan D, Call 13).
  { id: 'check-spelling', title: 'Check spelling', group: 'Edit' },
  // The spelling menu's (Plan D): the last three act on the misspelled word at the cursor.
  { id: 'spelling-suggestions', title: 'Spelling suggestions', group: 'Edit', keys: 'Mod-.' },
  {
    id: 'add-to-script-dictionary',
    title: 'Add word to this script’s dictionary',
    group: 'Edit',
  },
  { id: 'add-to-my-dictionary', title: 'Add word to my dictionary', group: 'Edit' },
  { id: 'ignore-misspelling', title: 'Ignore misspelling here', group: 'Edit' },

  // Edit, the element bar's commands (docs/drafter-element-bar-design.md §4): natural Fountain,
  // with a forcing mark only where a line needs one, on Mod-Alt-1…7 (decided 2026-10-27). Dual
  // dialogue, the note, and the boneyard are the commands below.
  element('scene-heading', 'Scene heading', 'Mod-Alt-1'),
  // A stage play's act, a `#` section (the template's act heading).
  element('act', 'Act'),
  element('action', 'Action', 'Mod-Alt-2'),
  element('character', 'Character', 'Mod-Alt-3'),
  element('dialogue', 'Dialogue'),
  element('parenthetical', 'Parenthetical', 'Mod-Alt-4'),
  element('transition', 'Transition', 'Mod-Alt-5'),
  element('centered', 'Centered text', 'Mod-Alt-6'),
  element('lyric', 'Lyric', 'Mod-Alt-7'),
  element('section', 'Section'),
  element('synopsis', 'Synopsis'),
  element('page-break', 'Page break'),
  { id: 'emphasis-bold', title: 'Emphasis: Bold', group: 'Edit' },
  { id: 'emphasis-italic', title: 'Emphasis: Italic', group: 'Edit' },
  { id: 'emphasis-underline', title: 'Emphasis: Underline', group: 'Edit' },

  // Edit, the Fountain commands (technical design §3.3). Each forces a kind with its mark, whatever
  // the line reads as without one, and has no key: the keys are the element commands' above.
  fountain('make-scene-heading', 'Force scene heading (.)'),
  fountain('make-action', 'Force action (!)'),
  fountain('make-character', 'Force character (@)'),
  fountain('make-parenthetical', 'Force parenthetical ( )'),
  fountain('make-transition', 'Force transition (>)'),
  fountain('make-centered', 'Force centered text (> <)'),
  fountain('make-lyric', 'Force lyric (~)'),
  fountain('dual-dialogue', 'Dual dialogue', 'Mod-Shift-d'),
  fountain('wrap-in-note', 'Wrap in a note', 'Mod-/'),
  fountain('mark-setup', 'Mark a setup'),
  fountain('mark-payoff', 'Mark a payoff'),
  fountain('cut-to-boneyard', 'Cut to the boneyard', 'Mod-Shift-/'),

  // Edit, the element bar's buttons for a Markdown document (the design, §5)
  ...MARKDOWN_ACTIONS.map(
    ([action, name]): CommandData => ({
      id: `markdown-${action}`,
      title: `Markdown: ${name}`,
      group: 'Edit',
    }),
  ),
];
