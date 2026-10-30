<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useCast } from '~/cast/use-cast';
import { isBackKey } from '~/scaffold/keys';
import { type ScaffoldPage, useScaffold } from '~/scaffold/session';
import { goScaffold, scaffoldBack } from '~/scaffold/show';

// Scaffold's slim bar (seeing-the-script design §5.1, §5.2): Back, the page's name, Follow the
// cursor (a toggle, on the scene page; on at every visit), and a menu of pages: This scene (the
// cursor's, following), Cast, and Places. Back is a button, and Alt+Left does the same here and in
// the tab's page; with nothing to go back to it is aria-disabled, and stays where focus finds it.
const { follow, page, canGoBack } = useScaffold();
const { cast } = useCast();

const name = computed(() => {
  const now = page.value;
  switch (now.kind) {
    case 'scene':
      return 'This scene';
    case 'character':
      return cast.value?.figures.get(now.key)?.character.name ?? now.key;
    case 'location':
      return cast.value?.locations.get(now.key)?.location ?? now.key;
    case 'cast':
      return 'Cast';
    case 'places':
      return 'Places';
  }
  return '';
});

/** A page chosen from the menu, opened once the menu has closed (its focus goes to the heading). */
let chosen: ScaffoldPage | null = null;
const items = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'This scene', onSelect: () => (chosen = { kind: 'scene', pinned: null }) },
    { label: 'Cast', onSelect: () => (chosen = { kind: 'cast' }) },
    { label: 'Places', onSelect: () => (chosen = { kind: 'places' }) },
  ],
]);
function onCloseAutoFocus(event: Event) {
  const next = chosen;
  chosen = null;
  if (!next) return;
  event.preventDefault();
  goScaffold(next);
}
const MENU_CONTENT = { align: 'start' as const, onCloseAutoFocus };

function onKeydown(event: KeyboardEvent) {
  if (!isBackKey(event)) return;
  event.preventDefault();
  scaffoldBack();
}
</script>

<template>
  <div class="scaffold-bar" @keydown="onKeydown">
    <button
      type="button"
      class="zoom-button"
      :aria-disabled="canGoBack ? undefined : 'true'"
      :aria-keyshortcuts="'Alt+ArrowLeft'"
      @click="scaffoldBack"
    >
      <UIcon name="i-lucide-arrow-left" class="icon" aria-hidden="true" />Back
    </button>
    <span class="name">{{ name }}</span>
    <span class="spacer" />
    <div v-if="page.kind === 'scene'" class="zoom">
      <button
        type="button"
        class="zoom-button"
        :aria-pressed="follow ? 'true' : 'false'"
        @click="follow = !follow"
      >
        Follow the cursor
      </button>
    </div>
    <MenuButton :items="items" :content="MENU_CONTENT">
      <button type="button" class="zoom-button pages">
        Pages
        <UIcon name="i-lucide-chevron-down" class="icon" aria-hidden="true" />
      </button>
    </MenuButton>
  </div>
</template>

<style scoped>
.scaffold-bar {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-width: 0;
}
.zoom-button {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.zoom-button[aria-disabled='true'] {
  cursor: default;
}
.icon {
  width: 14px;
  height: 14px;
}
.name {
  min-width: 0;
  color: var(--text);
  font-weight: 600;
  overflow-wrap: anywhere;
}
</style>
