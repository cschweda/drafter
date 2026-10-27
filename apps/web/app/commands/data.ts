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
  { id: 'help-saving', path: '/docs/saving', title: 'Saving and your browser' },
  { id: 'help-shortcuts', path: '/docs/shortcuts', title: 'Keyboard shortcuts' },
  { id: 'help-privacy', path: '/docs/privacy', title: 'Privacy' },
];

/** The address a link uses: the page's directory, which is where a static host serves it (no redirect). */
export const helpHref = (page: Pick<HelpPage, 'path'>): string => `${page.path}/`;

/** What the palette and the shortcuts page call the command that opens a help page. */
export const helpCommandTitle = (page: Pick<HelpPage, 'title'>): string =>
  `Open the page: ${page.title}`;

const fountain = (id: string, title: string, keys: string): CommandData => ({
  id,
  title,
  group: 'Edit',
  keys,
});

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
  { id: 'export-pdf', title: 'Export as PDF', group: 'File' },
  { id: 'export-md', title: 'Export as Markdown file', group: 'File' },
  { id: 'export-txt', title: 'Export as plain text', group: 'File' },
  { id: 'remove', title: 'Remove from this browser', group: 'File' },
  { id: 'settings', title: 'Settings…', group: 'File', keys: 'Mod-,', global: true },

  // Go
  { id: 'go-to-scene', title: 'Go to scene…', group: 'Go' },
  { id: 'go-to-line', title: 'Go to line…', group: 'Go' },
  { id: 'next-problem', title: 'Next problem', group: 'Go', keys: 'F8' },
  { id: 'previous-problem', title: 'Previous problem', group: 'Go', keys: 'Shift-F8' },

  // View
  { id: 'show-source', title: 'Show Source', group: 'View' },
  { id: 'show-script', title: 'Show Script', group: 'View' },
  { id: 'show-preview', title: 'Show Preview', group: 'View' },
  { id: 'show-problems', title: 'Show Problems', group: 'View' },
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
  { id: 'switch-theme', title: 'Switch theme', group: 'View' },
  { id: 'show-line-numbers', title: 'Show line numbers', group: 'View' },
  { id: 'hide-line-numbers', title: 'Hide line numbers', group: 'View' },
  { id: 'turn-on-typewriter', title: 'Turn on typewriter scrolling', group: 'View' },
  { id: 'turn-off-typewriter', title: 'Turn off typewriter scrolling', group: 'View' },
  { id: 'turn-on-scroll-sync', title: 'Turn on scroll sync', group: 'View' },
  { id: 'turn-off-scroll-sync', title: 'Turn off scroll sync', group: 'View' },
  { id: 'fold-all', title: 'Fold all', group: 'View', keys: 'Ctrl-Alt-[' },
  { id: 'unfold-all', title: 'Unfold all', group: 'View', keys: 'Ctrl-Alt-]' },

  // Edit
  { id: 'undo', title: 'Undo', group: 'Edit', keys: 'Mod-z' },
  { id: 'redo', title: 'Redo', group: 'Edit', keys: 'Mod-Shift-z' },
  { id: 'find', title: 'Find', group: 'Edit', keys: 'Mod-f' },

  // Edit, the Fountain commands (technical design §3.3)
  fountain('make-scene-heading', 'Make scene heading', 'Mod-Alt-1'),
  fountain('make-action', 'Make action', 'Mod-Alt-2'),
  fountain('make-character', 'Make character', 'Mod-Alt-3'),
  fountain('make-parenthetical', 'Make parenthetical', 'Mod-Alt-4'),
  fountain('make-transition', 'Make transition', 'Mod-Alt-5'),
  fountain('make-centered', 'Make centered text', 'Mod-Alt-6'),
  fountain('make-lyric', 'Make lyric', 'Mod-Alt-7'),
  fountain('dual-dialogue', 'Dual dialogue', 'Mod-Shift-d'),
  fountain('wrap-in-note', 'Wrap in a note', 'Mod-/'),
  fountain('cut-to-boneyard', 'Cut to the boneyard', 'Mod-Shift-/'),
];
