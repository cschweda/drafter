import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { HELP_PAGES } from '../app/commands/data';
import { HELP_MENU_COMMANDS, HELP_MENU_ICONS } from '../app/commands/help-menu';

// Help is its own menu in the top bar (fresh-look Task 3b; the maintainer, 2026-10-31: "should be
// visible at all times and not part of another (much larger) dropdown"). It has everything the
// Drafter menu's Help section had, and the Drafter menu has none of it now.

const source = (name: string) =>
  readFileSync(new URL(`../app/components/${name}`, import.meta.url), 'utf8');

describe('the Help menu', () => {
  test('lists the tour, every help page, the samples, Check for updates, and About, in that order', () => {
    expect(HELP_MENU_COMMANDS).toEqual([
      'take-the-tour',
      ...HELP_PAGES.map((page) => page.id),
      'reset-sample',
      'check-for-updates',
      'about-drafter',
    ]);
  });

  test('gives every item an icon of its own', () => {
    const icons = HELP_MENU_COMMANDS.map((id) => HELP_MENU_ICONS[id]);
    expect(icons.filter((icon) => !icon)).toEqual([]);
    expect(new Set(icons).size).toBe(icons.length);
  });

  test('is drawn from that list, with the Sample scripts submenu', () => {
    const vue = source('HelpMenu.vue');
    expect(vue).toContain('HELP_MENU_COMMANDS');
    expect(vue).toContain("'Sample scripts'");
    expect(vue).toContain('aria-label="Help"');
  });

  test('is not in the Drafter menu any more', () => {
    const vue = source('AppMenu.vue');
    for (const id of ['take-the-tour', 'check-for-updates', 'about-drafter', 'reset-sample']) {
      expect(vue, id).not.toContain(`'${id}'`);
    }
    expect(vue).not.toContain('HELP_PAGES');
    expect(vue).not.toContain("'Sample scripts'");
  });

  test('sits in the top bar, after Focus and before the theme', () => {
    const vue = source('AppToolbar.vue');
    const template = vue.slice(vue.indexOf('<template>'));
    const focus = template.indexOf('id="focus-button"');
    const help = template.indexOf('<HelpMenu');
    const theme = template.indexOf('toggleTheme');
    expect(focus).toBeGreaterThan(-1);
    expect(help).toBeGreaterThan(focus);
    expect(theme).toBeGreaterThan(help);
  });
});
