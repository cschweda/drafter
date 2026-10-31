<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { HELP_PAGES } from '~/commands/data';
import { HELP_MENU_COMMANDS, HELP_MENU_ICONS } from '~/commands/help-menu';
import { SAMPLES } from '~/editor/samples';
import { STARTER_KINDS } from '~/editor/starter-kinds';

// The Help menu (fresh-look Task 3b; the maintainer, 2026-10-31: Help "should be visible at all
// times and not part of another (much larger) dropdown"): a button of its own in the top bar,
// after Focus. Take the tour; the help pages (each opens in a new tab, named by its title); the
// Sample scripts submenu (a tiny sample of each kind, then the guided starters, each opened as a
// new script); Reset sample (off unless a sample is open); Check for updates…; and About Drafter.
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

const pageIds = new Set(HELP_PAGES.map((page) => page.id));
const items = computed<DropdownMenuItem[][]>(() => {
  const ids = HELP_MENU_COMMANDS;
  const pages = ids.filter((id) => pageIds.has(id));
  return [
    item('take-the-tour'),
    pages.flatMap(item),
    [sampleScripts.value, ...item('reset-sample')],
    [...item('check-for-updates'), ...item('about-drafter')],
  ];
});
</script>

<template>
  <!-- MenuButton: non-modal, with Tab closing the menu and giving focus back to the button. -->
  <MenuButton :items="items" :content="{ align: 'end', onCloseAutoFocus }">
    <button ref="button" type="button" class="help" aria-label="Help" title="Help">
      <UIcon name="i-lucide-circle-help" class="help-icon" aria-hidden="true" />
      <span class="label" aria-hidden="true">Help</span>
      <UIcon name="i-lucide-chevron-down" class="caret" aria-hidden="true" />
    </button>
  </MenuButton>
</template>

<style scoped>
/* A borderless button like the top bar's Open and Export: the word and the Drafter menu's chevron. */
.help {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  height: 30px;
  padding: 0 6px 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  /* The word and its chevron both --text, as the Drafter menu's chevron is (it says: a menu). */
  color: var(--text);
  font: 500 13px/1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.help:hover,
.help[aria-expanded="true"] {
  background: var(--raised);
}
.help-icon {
  display: none;
  flex: none;
  width: 16px;
  height: 16px;
}
.caret {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--text);
  transition: transform var(--dur) var(--ease);
}
.help[aria-expanded="true"] .caret {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .caret {
    transition: none;
  }
}

/* Below 1024px the top bar is icons: Help is a question mark, still named Help. */
@media (max-width: 1023.98px) {
  .help {
    justify-content: center;
    width: 30px;
    padding: 0;
  }
  .help-icon {
    display: block;
  }
  .label,
  .caret {
    display: none;
  }
}

/* The narrowest phones (320px, WCAG 1.4.10): as the bar's other buttons, never under 24px. */
@media (max-width: 399.98px) {
  .help {
    width: 26px;
  }
}
</style>
