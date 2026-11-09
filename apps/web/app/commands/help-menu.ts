import type { DropdownMenuItem } from '@nuxt/ui';
import { DOWNLOAD_PAGE, HELP_PAGES } from './data';

// The Help and About menus (the maintainer, 2026-11-09: "split the help menu into a help and about
// menu (about should offer the bug reports)"): two buttons of their own in the top bar, after
// Focus. Help is for learning Drafter (the tour, the help pages, the samples); About is about
// Drafter itself and how to reach its maker (What's new, privacy, licences, the reports, updates).
// Before 2026-11-09 one Help menu held both (fresh-look Task 3b, 2026-10-31).

/** The help pages About lists rather than Help: what Drafter is made of and promises, not how to use it. */
export const ABOUT_PAGE_IDS: readonly string[] = [
  'help-whats-new',
  'help-privacy',
  'help-licences',
  'help-technical',
];

/**
 * The Help menu's commands, top to bottom: the tour, the help pages About doesn't list, Download
 * the desktop app (web only: the desktop app has no such command, so no item), and Reset sample.
 * The Sample scripts submenu comes before Reset sample.
 */
export const HELP_MENU_COMMANDS: readonly string[] = [
  'take-the-tour',
  ...HELP_PAGES.map((page) => page.id).filter((id) => !ABOUT_PAGE_IDS.includes(id)),
  DOWNLOAD_PAGE.id,
  'reset-sample',
];

/**
 * The About menu's commands, top to bottom: About Drafter, What's new and the other About pages,
 * Report a problem…, Suggest an idea…, Copy technical details, and Check for updates….
 */
export const ABOUT_MENU_COMMANDS: readonly string[] = [
  'about-drafter',
  ...ABOUT_PAGE_IDS,
  'report-problem',
  'suggest-idea',
  'copy-technical-details',
  'check-for-updates',
];

/** Each Help and About item's icon. */
export const HELP_MENU_ICONS: Record<string, string> = {
  'take-the-tour': 'i-lucide-compass',
  'help-what-is': 'i-lucide-feather',
  'help-why': 'i-lucide-heart',
  'help-fountain': 'i-lucide-book-open',
  'help-classic-mode': 'i-lucide-corner-down-left',
  'help-novel': 'i-lucide-book-text',
  'help-saving': 'i-lucide-save',
  'help-drafts-and-cuts': 'i-lucide-git-commit-vertical',
  'help-story-map': 'i-lucide-map',
  'help-drafter-for-claude': 'i-lucide-plug',
  'help-self-hosting': 'i-lucide-server',
  'help-shortcuts': 'i-lucide-keyboard',
  'help-privacy': 'i-lucide-shield-check',
  'help-open-formats': 'i-lucide-lock-open',
  'help-licences': 'i-lucide-scale',
  'help-technical': 'i-lucide-cpu',
  'help-whats-new': 'i-lucide-sparkles',
  [DOWNLOAD_PAGE.id]: 'i-lucide-download',
  'reset-sample': 'i-lucide-rotate-ccw',
  'report-problem': 'i-lucide-bug',
  'suggest-idea': 'i-lucide-lightbulb',
  'copy-technical-details': 'i-lucide-clipboard-copy',
  'check-for-updates': 'i-lucide-refresh-cw',
  'about-drafter': 'i-lucide-info',
};

const pageTitle = new Map(HELP_PAGES.map((page) => [page.id, page.title]));

/**
 * The About menu's items, in groups: About Drafter; the About pages (named by their titles); the
 * reports; Check for updates. `entry` is the menu's `useCommandMenu` entry, so each item runs its
 * command. The About button and, when About folds on a narrow screen, More actions' About submenu
 * both list these.
 */
export function aboutMenuGroups(
  entry: (id: string, icon: string, shows?: boolean) => DropdownMenuItem[],
): DropdownMenuItem[][] {
  const item = (id: string) =>
    entry(id, HELP_MENU_ICONS[id] ?? 'i-lucide-info').map((made) => {
      const title = pageTitle.get(id);
      return title ? { ...made, label: title } : made;
    });
  const group = (ids: readonly string[]) =>
    ids.filter((id) => ABOUT_MENU_COMMANDS.includes(id)).flatMap(item);
  return [
    group(['about-drafter']),
    group(ABOUT_PAGE_IDS),
    group(['report-problem', 'suggest-idea', 'copy-technical-details']),
    group(['check-for-updates']),
  ];
}
