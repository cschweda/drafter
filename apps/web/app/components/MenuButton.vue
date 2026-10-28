<script setup lang="ts">
// Every menu in Drafter: Nuxt UI's UDropdownMenu, non-modal, with Tab as the ARIA menu button pattern
// has it. A modal menu hides the page with aria-hidden while its controls stay focusable (axe:
// aria-hidden-focus), so these menus are non-modal; but Reka blocks Tab only in a modal menu, and a
// non-modal one lets Tab close it and drop focus on the page's body. So Tab and Shift+Tab are taken
// here while the menu is open: the menu closes, and Reka gives focus back to the button that opened
// it. Props, listeners, and slots pass through to UDropdownMenu.
defineOptions({ inheritAttrs: false });

const open = defineModel<boolean>('open', { default: false });
const attrs = useAttrs();

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('[data-reka-menu-content]')) return;
  event.preventDefault();
  event.stopPropagation();
  open.value = false;
}

watch(open, (now) => {
  if (now) document.addEventListener('keydown', onKeydown, true);
  else document.removeEventListener('keydown', onKeydown, true);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true));
</script>

<template>
  <UDropdownMenu v-bind="attrs" v-model:open="open" :modal="false">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}" />
    </template>
  </UDropdownMenu>
</template>
