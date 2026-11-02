import { DOWNLOAD_PAGE, HELP_PAGES } from './data';

// The Help menu (fresh-look Task 3b; the maintainer, 2026-10-31: Help "should be visible at all
// times and not part of another (much larger) dropdown"): its own button in the top bar, after
// Focus. These are the commands it lists, in order; the Sample scripts submenu (a tiny sample of
// each kind, then the guided starters) comes after the help pages, before Reset sample.

/**
 * The Help menu's commands, top to bottom: the tour, the help pages, Download the desktop app (web
 * only: the desktop app has no such command, so no item), Reset sample,
 * Report a problem…, Suggest an idea…, Check for updates…, About.
 */
export const HELP_MENU_COMMANDS: readonly string[] = [
  'take-the-tour',
  ...HELP_PAGES.map((page) => page.id),
  DOWNLOAD_PAGE.id,
  'reset-sample',
  'report-problem',
  'suggest-idea',
  'check-for-updates',
  'about-drafter',
];

/** Each Help item's icon. */
export const HELP_MENU_ICONS: Record<string, string> = {
  'take-the-tour': 'i-lucide-compass',
  'help-what-is': 'i-lucide-feather',
  'help-why': 'i-lucide-heart',
  'help-fountain': 'i-lucide-book-open',
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
  'check-for-updates': 'i-lucide-refresh-cw',
  'about-drafter': 'i-lucide-info',
};
