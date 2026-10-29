<script setup lang="ts">
import type { Scene } from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { cardName } from '~/cards/labels';
import { colorName, lengthLabel, sceneNumber, swatchOf } from '~/outline/labels';
import { goalLine } from '~/outline/scene-details';

// One index card in the Cards tab (Phase 2 design §7): a listbox option named by `cardName` and
// described by its synopses. What's drawn is hidden from screen readers, which read the name once.
// The card's ⋯ button is a pointer's (`tabindex="-1"`); the keys and the menu are the Cards tab's.

const props = defineProps<{
  scene: Scene;
  /** The element id; the synopsis field and the description hang off it. */
  domId: string;
  /** The one tab stop, and the selected card. */
  current: boolean;
  editing: boolean;
  menuOpen: boolean;
  menuItems: DropdownMenuItem[][];
  menuContent: object;
}>();
const emit = defineEmits<{ 'update:menuOpen': [open: boolean]; edited: [save: boolean] }>();
const draft = defineModel<string>('draft', { default: '' });

const goal = computed(() => goalLine(props.scene));
const swatch = computed(() =>
  props.scene.color ? (swatchOf(props.scene.color.value) ?? 'transparent') : 'transparent',
);

function onEditKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('edited', true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('edited', false);
  }
}
</script>

<template>
  <div
    :id="props.domId"
    role="option"
    class="card"
    :class="{ colored: !!props.scene.color }"
    :style="{ '--stripe': swatch }"
    :tabindex="props.current ? 0 : -1"
    :aria-selected="props.current ? 'true' : 'false'"
    :aria-describedby="props.scene.synopses.length > 0 ? `${props.domId}-synopsis` : undefined"
  >
    <span class="sr-only">{{ cardName(props.scene) }}</span>
    <div class="stripe" aria-hidden="true">
      <span v-if="props.scene.color" class="color">{{ colorName(props.scene.color.value) }}</span>
    </div>
    <div class="top" aria-hidden="true">
      <span class="num">{{ sceneNumber(props.scene) }}</span>
      <span class="heading">{{ props.scene.heading || 'Untitled scene' }}</span>
      <MenuButton
        :open="props.menuOpen"
        :items="props.menuItems"
        :content="props.menuContent"
        @update:open="(open: boolean) => emit('update:menuOpen', open)"
      >
        <button
          type="button"
          class="more"
          tabindex="-1"
          :aria-label="`Actions for ${props.scene.heading || 'this scene'}`"
          @click.stop
        >
          <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
        </button>
      </MenuButton>
    </div>
    <input
      v-if="props.editing"
      :id="`${props.domId}-field`"
      v-model="draft"
      class="synopsis-field"
      :aria-label="`Synopsis of ${props.scene.heading}`"
      @keydown="onEditKeydown"
      @blur="emit('edited', false)"
    />
    <div class="body" aria-hidden="true">
      <div
        v-if="props.scene.synopses.length > 0"
        :id="`${props.domId}-synopsis`"
        class="synopses"
        :class="{ hidden: props.editing }"
      >
        <p v-for="(synopsis, i) in props.scene.synopses" :key="i" class="synopsis">
          {{ synopsis.text }}
        </p>
      </div>
      <p v-if="goal" class="goal">Goal: {{ goal }}</p>
    </div>
    <div v-if="props.scene.pages" class="foot" aria-hidden="true">
      {{ lengthLabel(props.scene.pages.eighths) }}
    </div>
  </div>
</template>

<style scoped>
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: var(--card-height, 9rem);
  padding: 0 10px 8px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome);
  color: var(--text);
  overflow: hidden;
  cursor: default;
}
.card:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 1px;
}
.card[aria-selected='true'] {
  border-color: var(--heading);
}
/* The color as a stripe across the top, and its name on it: the name is never left to the color. */
.stripe {
  display: flex;
  align-items: center;
  min-height: 6px;
  margin: 0 -10px;
  padding: 0 10px;
  border-top: 6px solid var(--stripe);
}
.colored .stripe {
  min-height: 18px;
  border-bottom: 1px solid var(--line);
}
.color {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
}
.top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.num {
  min-width: 2ch;
  color: var(--muted);
  font-weight: 700;
}
.heading {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.more {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.more:hover {
  background: var(--chrome-2);
  color: var(--text);
}
.body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--card-lines, 6);
  line-clamp: var(--card-lines, 6);
}
.synopses.hidden {
  display: none;
}
.synopsis,
.goal {
  margin: 0;
}
.goal {
  color: var(--muted);
}
.foot {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}
.synopsis-field {
  box-sizing: border-box;
  width: 100%;
  min-height: 26px;
  padding: 2px 6px;
  border: 1px solid var(--heading);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
@media (forced-colors: active) {
  .stripe {
    border-top-color: CanvasText;
  }
  .card[aria-selected='true'] {
    border: 2px solid Highlight;
  }
}
</style>
