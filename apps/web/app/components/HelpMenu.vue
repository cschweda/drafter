<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { DOWNLOAD_PAGE, HELP_PAGES } from '~/commands/data';
import { HELP_MENU_COMMANDS, HELP_MENU_ICONS } from '~/commands/help-menu';
import { SAMPLES } from '~/editor/samples';
import { STARTER_KINDS } from '~/editor/starter-kinds';

// The Help menu (fresh-look Task 3b; the maintainer, 2026-10-31: Help "should be visible at all
// times and not part of another (much larger) dropdown"): a button of its own in the top bar,
// after Focus, with About beside it (2026-11-09). Take the tour; the help pages About doesn't list
// (each opens in a new tab, named by its title) and Download the desktop app; the Sample scripts
// submenu (a tiny sample of each kind, then the guided starters, each opened as a new script); and
// Reset sample (off unless a sample is open). The reports, updates, and About Drafter are About's.
// Each item runs its registered command (`useCommandMenu`), as the Drafter menu's do. On a wide
// screen the button says Help with the Drafter menu's chevron; below 1024px it is a question mark.
const button = ref<HTMLElement | null>(null);
const { entry, onCloseAutoFocus } = useCommandMenu(button);

/** The commands that show a script give the editor focus afterward. */
const SHOWS = new Set(['reset-sample']);
const icon = (id: string) => HELP_MENU_ICONS[id] ?? 'i-lucide-book-open';
const pageTitle = new Map(HELP_PAGES.map((page) => [page.id, page.title]));

/** A command's item, named as the menu names it (a help page by its title). */
function item(id: string): DropdownMenuItem[] {
  return entry(id, icon(id), SHOWS.has(id)).map((made) => {
    const title = pageTitle.get(id);
    return title ? { ...made, label: title } : made;
  });
}

const sampleScripts = computed<DropdownMenuItem>(() => ({
  label: 'Sample scripts',
  icon: 'i-lucide-files',
  children: [
    SAMPLES.flatMap((sample) =>
      entry(`sample-script-${sample.kind}`, 'i-lucide-file-text', true).map((made) => ({
        ...made,
        label: sample.name,
      })),
    ),
    // The guided starters, under the tiny samples, by the names a lesson goes by.
    STARTER_KINDS.flatMap((starter) =>
      entry(starter.command, 'i-lucide-graduation-cap', true).map((made) => ({
        ...made,
        label: starter.menuLabel,
      })),
    ),
  ],
}));

// The help pages, then Download the desktop app (named by its command, not the page's title).
const pageIds = new Set([...HELP_PAGES.map((page) => page.id), DOWNLOAD_PAGE.id]);
const items = computed<DropdownMenuItem[][]>(() => {
  const pages = HELP_MENU_COMMANDS.filter((id) => pageIds.has(id));
  return [
    item('take-the-tour'),
    pages.flatMap(item),
    [sampleScripts.value, ...item('reset-sample')],
  ];
});
</script>

<template>
  <!-- MenuButton: non-modal, with Tab closing the menu and giving focus back to the button.
       The button's look is menus.css's `.bar-menu`, shared with About. -->
  <MenuButton :items="items" :content="{ align: 'end', onCloseAutoFocus }">
    <button ref="button" type="button" class="bar-menu" aria-label="Help" title="Help">
      <UIcon name="i-lucide-circle-help" class="bar-menu-icon" aria-hidden="true" />
      <span class="label" aria-hidden="true">Help</span>
      <UIcon name="i-lucide-chevron-down" class="caret" aria-hidden="true" />
    </button>
  </MenuButton>
</template>
