<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { aboutMenuGroups } from '~/commands/help-menu';

// The About menu (the maintainer, 2026-11-09: "split the help menu into a help and about menu
// (about should offer the bug reports)"): a button of its own beside Help. About Drafter; What's
// new, Privacy, Third-party licences, and Technical details (each opens in a new tab, named by its
// title); Report a problem…, Suggest an idea…, and Copy technical details; and Check for updates….
// Each item runs its registered command (`useCommandMenu`), as Help's do. On a wide screen the
// button says About with the chevron; below 1024px it is an info icon, and where even the icons
// don't fit it folds into More actions as an About submenu (`fold-about-item`, AppToolbar.vue).
const button = ref<HTMLElement | null>(null);
const { entry, onCloseAutoFocus } = useCommandMenu(button);
const items = computed<DropdownMenuItem[][]>(() => aboutMenuGroups(entry));
</script>

<template>
  <!-- MenuButton: non-modal, with Tab closing the menu and giving focus back to the button.
       The button's look is menus.css's `.bar-menu`, shared with Help. -->
  <MenuButton :items="items" :content="{ align: 'end', onCloseAutoFocus }">
    <button ref="button" type="button" class="bar-menu about-menu fold-about-item" aria-label="About" title="About">
      <UIcon name="i-lucide-info" class="bar-menu-icon" aria-hidden="true" />
      <span class="label" aria-hidden="true">About</span>
      <UIcon name="i-lucide-chevron-down" class="caret" aria-hidden="true" />
    </button>
  </MenuButton>
</template>
