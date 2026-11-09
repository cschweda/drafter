import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { DOWNLOAD_PAGE, HELP_PAGES } from '../app/commands/data';
import {
  ABOUT_MENU_COMMANDS,
  ABOUT_PAGE_IDS,
  aboutMenuGroups,
  HELP_MENU_COMMANDS,
  HELP_MENU_ICONS,
} from '../app/commands/help-menu';

// Help and About are menus of their own in the top bar (fresh-look Task 3b, 2026-10-31; split in
// two 2026-11-09: "split the help menu into a help and about menu (about should offer the bug
// reports)"). Help is for learning Drafter; About is Drafter itself, and the reports.

const source = (name: string) =>
  readFileSync(new URL(`../app/components/${name}`, import.meta.url), 'utf8');

describe('the Help menu', () => {
  test('lists the tour, the help pages About doesn’t, Download, and Reset sample, in that order', () => {
    expect(HELP_MENU_COMMANDS).toEqual([
      'take-the-tour',
      ...HELP_PAGES.map((page) => page.id).filter((id) => !ABOUT_PAGE_IDS.includes(id)),
      DOWNLOAD_PAGE.id,
      'reset-sample',
    ]);
  });

  test('starts the help pages with What is Drafter?', () => {
    const pages = HELP_MENU_COMMANDS.filter((id) => HELP_PAGES.some((page) => page.id === id));
    expect(pages[0]).toBe('help-what-is');
  });

  test('has no reports, updates, or About Drafter', () => {
    for (const id of ['report-problem', 'suggest-idea', 'check-for-updates', 'about-drafter']) {
      expect(HELP_MENU_COMMANDS, id).not.toContain(id);
    }
  });

  test('is drawn from that list, with the Sample scripts submenu', () => {
    const vue = source('HelpMenu.vue');
    expect(vue).toContain('HELP_MENU_COMMANDS');
    expect(vue).toContain("'Sample scripts'");
    expect(vue).toContain('aria-label="Help"');
    expect(vue).not.toContain("'report-problem'");
  });
});

describe('the About menu', () => {
  test('lists About Drafter, What’s new and the About pages, the reports, and updates, in that order', () => {
    expect(ABOUT_MENU_COMMANDS).toEqual([
      'about-drafter',
      'help-whats-new',
      'help-privacy',
      'help-licences',
      'help-technical',
      'report-problem',
      'suggest-idea',
      'copy-technical-details',
      'check-for-updates',
    ]);
  });

  test('groups its items: About Drafter, the pages, the reports, updates', () => {
    const groups = aboutMenuGroups((id) => [{ label: id }]).map((group) =>
      group.map((made) => made.label),
    );
    expect(groups).toEqual([
      ['about-drafter'],
      ['What’s new', 'Privacy', 'Third-party licences', 'Technical details'],
      ['report-problem', 'suggest-idea', 'copy-technical-details'],
      ['check-for-updates'],
    ]);
  });

  test('lists only help pages that exist, and none Help lists too', () => {
    for (const id of ABOUT_PAGE_IDS) {
      expect(
        HELP_PAGES.some((page) => page.id === id),
        id,
      ).toBe(true);
      expect(HELP_MENU_COMMANDS, id).not.toContain(id);
    }
  });

  test('is drawn from that list, and offers the reports', () => {
    const vue = source('AboutMenu.vue');
    expect(vue).toContain('aboutMenuGroups(entry)');
    expect(vue).toContain('aria-label="About"');
    // Folded on a narrow screen, More actions lists the same groups as a submenu.
    expect(source('AppToolbar.vue')).toContain('aboutMenuGroups(entry).flat()');
  });
});

describe('both menus', () => {
  test('give every item an icon of its own', () => {
    const all = [...HELP_MENU_COMMANDS, ...ABOUT_MENU_COMMANDS];
    const icons = all.map((id) => HELP_MENU_ICONS[id]);
    expect(icons.filter((icon) => !icon)).toEqual([]);
    expect(new Set(icons).size).toBe(icons.length);
  });

  test('are not in the Drafter menu', () => {
    const vue = source('AppMenu.vue');
    for (const id of ['take-the-tour', 'check-for-updates', 'about-drafter', 'reset-sample']) {
      expect(vue, id).not.toContain(`'${id}'`);
    }
    expect(vue).not.toContain('HELP_PAGES');
    expect(vue).not.toContain("'Sample scripts'");
  });

  test('sit in the top bar, Help then About, after Focus and before the theme', () => {
    const vue = source('AppToolbar.vue');
    const template = vue.slice(vue.indexOf('<template>'));
    const focus = template.indexOf('id="focus-button"');
    const help = template.indexOf('<HelpMenu');
    const about = template.indexOf('<AboutMenu');
    const theme = template.indexOf('toggleTheme');
    expect(focus).toBeGreaterThan(-1);
    expect(help).toBeGreaterThan(focus);
    expect(about).toBeGreaterThan(help);
    expect(theme).toBeGreaterThan(about);
  });
});
