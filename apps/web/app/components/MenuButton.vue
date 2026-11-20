<script setup lang="ts">
// Every menu in Drafter: Nuxt UI's UDropdownMenu, non-modal, with Tab as the ARIA menu button pattern
// has it. A modal menu hides the page with aria-hidden while its controls stay focusable (axe:
// aria-hidden-focus), so these menus are non-modal; but Reka blocks Tab only in a modal menu, and a
// non-modal one lets Tab close it and drop focus on the page's body. So Tab and Shift+Tab are taken
// here while the menu is open: the menu closes, and Reka gives focus back to the button that opened
// it. Props, listeners, and slots pass through to UDropdownMenu.
// Every menu has the one menu style (fresh-look design §5): `d-menu`, drawn in assets/css/menus.css.
defineOptions({ inheritAttrs: false });

const MENU_UI = { content: 'd-menu' };

const open = defineModel<boolean>('open', { default: false });
const attrs = useAttrs();

// Giving focus back when a menu closes. Reka does it for every menu a moment after the menu has
// left the page (a zero-millisecond timer), whatever has happened since. On a slow machine a click
// on another button gets in before that moment: the button's own menu opened, the timer then took
// focus back to this menu's button, and the new menu, having lost focus, closed again. So the
// moment is this component's own, and it leaves focus alone when the writer has put it somewhere
// since. A menu's own `onCloseAutoFocus` (`content`) still runs first, and what it prevents stays
// prevented; a click outside the menu gives focus to nothing, as before.
type Content = {
  onCloseAutoFocus?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
};
/** The button that opened the menu: what had focus then (a click or a key puts it there). */
let opener: HTMLElement | null = null;
/** The menu closed because of a click or a focus outside it. */
let outside = false;

function onCloseAutoFocus(event: Event) {
  (attrs.content as Content | undefined)?.onCloseAutoFocus?.(event);
  const wasOutside = outside;
  outside = false;
  if (event.defaultPrevented) return;
  event.preventDefault();
  if (wasOutside) return;
  const button = opener;
  setTimeout(() => {
    if (button?.isConnected && focusIsFree(button)) button.focus();
  }, 0);
}

function onInteractOutside(event: Event) {
  (attrs.content as Content | undefined)?.onInteractOutside?.(event);
  if (!event.defaultPrevented) outside = true;
}

const content = computed(() => ({
  ...(attrs.content as Content | undefined),
  onCloseAutoFocus,
  onInteractOutside,
}));

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest('[data-reka-menu-content]')) return;
  event.preventDefault();
  event.stopPropagation();
  open.value = false;
}

watch(open, (now) => {
  if (now) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && active !== document.body ? active : null;
    outside = false;
    document.addEventListener('keydown', onKeydown, true);
  } else document.removeEventListener('keydown', onKeydown, true);
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown, true));
</script>

<template>
  <UDropdownMenu
    v-bind="attrs"
    v-model:open="open"
    :content="content"
    :modal="false"
    :ui="MENU_UI"
  >
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}" />
    </template>
  </UDropdownMenu>
</template>
