<script setup lang="ts">
import { type OutlineItem, SCENE_COLORS, type SceneColor } from '@drafter/outline';
import { type RowAction, SWATCH } from '~/outline/labels';

// A row's menu in the Outline (Phase 2 design §6.1): from its ⋯ button, the context-menu key, or
// Shift+F10. A small group of buttons, as the Export menu is: arrow keys, Home and End move
// between them, and Escape closes it and puts focus back on the row. Color… shows the palette in
// the same place. In a read-only tab the edits are there, off, with the reason under them. The
// group itself takes focus on a click that Safari doesn't give a button, so focus stays inside.

const props = defineProps<{
  item: OutlineItem;
  /** The row's name, for the menu's. */
  name: string;
  place: { top: number; left: number };
  readOnly: string | null;
  canUp: boolean;
  canDown: boolean;
}>();
const emit = defineEmits<{
  act: [action: RowAction];
  color: [color: SceneColor | null];
  close: [refocus: boolean];
}>();

const root = ref<HTMLElement>();
const showing = ref<'actions' | 'colors'>('actions');
const current = computed(() =>
  props.item.kind === 'scene' ? (props.item.color?.value ?? null) : null,
);
const off = computed(() => props.readOnly !== null);
const what = computed(() => (props.item.kind === 'scene' ? 'scene' : 'section'));

async function focusFirst() {
  await nextTick();
  root.value?.querySelector<HTMLElement>('button')?.focus();
}
onMounted(focusFirst);
watch(showing, focusFirst);

/** An edit that is off says so instead of acting. */
function act(action: RowAction, edits = true) {
  if (edits && off.value) return;
  emit('act', action);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    if (showing.value === 'colors') showing.value = 'actions';
    else emit('close', true);
    return;
  }
  const items = [...(root.value?.querySelectorAll<HTMLElement>('button') ?? [])];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const to: Record<string, number> = {
    ArrowDown: at < items.length - 1 ? at + 1 : 0,
    ArrowUp: at > 0 ? at - 1 : items.length - 1,
    Home: 0,
    End: items.length - 1,
  };
  const next = to[event.key];
  if (next === undefined) return;
  event.preventDefault();
  event.stopPropagation();
  items[next]?.focus();
}

function onFocusout(event: FocusEvent) {
  const to = event.relatedTarget;
  if (to instanceof Node && !root.value?.contains(to)) emit('close', false);
}

function onPointerdown(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) emit('close', false);
}
onMounted(() => document.addEventListener('pointerdown', onPointerdown, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerdown, true));
</script>

<template>
  <div
    ref="root"
    class="row-menu"
    tabindex="-1"
    role="group"
    :aria-label="showing === 'colors' ? `Color for ${props.name}` : `Actions for ${props.name}`"
    :style="{ top: `${props.place.top}px`, left: `${props.place.left}px` }"
    @keydown="onKeydown"
    @focusout="onFocusout"
  >
    <template v-if="showing === 'actions'">
      <button type="button" class="item" @click="act('go', false)">Go to</button>
      <button
        type="button"
        class="item"
        :aria-disabled="off || !props.canUp ? 'true' : undefined"
        :aria-describedby="off ? 'outline-menu-why' : undefined"
        @click="props.canUp && act('up')"
      >
        Move {{ what }} up
      </button>
      <button
        type="button"
        class="item"
        :aria-disabled="off || !props.canDown ? 'true' : undefined"
        :aria-describedby="off ? 'outline-menu-why' : undefined"
        @click="props.canDown && act('down')"
      >
        Move {{ what }} down
      </button>
      <button
        type="button"
        class="item"
        :aria-disabled="off ? 'true' : undefined"
        :aria-describedby="off ? 'outline-menu-why' : undefined"
        @click="act('move-to')"
      >
        Move {{ what }} to…
      </button>
      <template v-if="props.item.kind === 'scene'">
        <button
          type="button"
          class="item"
          :aria-disabled="off ? 'true' : undefined"
          :aria-describedby="off ? 'outline-menu-why' : undefined"
          @click="act('synopsis')"
        >
          Edit synopsis
        </button>
        <button
          type="button"
          class="item"
          :aria-disabled="off ? 'true' : undefined"
          :aria-describedby="off ? 'outline-menu-why' : undefined"
          @click="!off && (showing = 'colors')"
        >
          Color…
        </button>
      </template>
      <p v-if="off" id="outline-menu-why" class="why">{{ props.readOnly }}</p>
    </template>
    <template v-else>
      <button type="button" class="item back" @click="showing = 'actions'">
        <UIcon name="i-lucide-chevron-left" class="icon" aria-hidden="true" />Back
      </button>
      <button
        v-for="color in SCENE_COLORS"
        :key="color"
        type="button"
        class="item"
        :aria-pressed="current === color ? 'true' : 'false'"
        @click="emit('color', color)"
      >
        <span class="swatch" :style="{ background: SWATCH[color] }" aria-hidden="true" />{{ color }}
      </button>
      <button
        type="button"
        class="item"
        :aria-pressed="current === null ? 'true' : 'false'"
        @click="emit('color', null)"
      >
        <span class="swatch none" aria-hidden="true" />No color
      </button>
    </template>
  </div>
</template>

<style scoped>
.row-menu {
  position: fixed;
  outline: none;
  z-index: 25;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(15rem, calc(100vw - 16px));
  max-height: calc(100dvh - 16px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
  font-size: 13px;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 4px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.item:hover {
  background: var(--chrome);
}
.item:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.item[aria-disabled='true'] {
  color: var(--muted);
  cursor: default;
}
.item[aria-pressed='true'] {
  background: var(--tab-on);
  box-shadow: inset 2px 0 0 var(--heading);
}
.swatch {
  width: 12px;
  height: 12px;
  flex: none;
  border: 1px solid var(--muted);
  border-radius: 3px;
}
.swatch.none {
  background: linear-gradient(135deg, transparent 45%, var(--muted) 45% 55%, transparent 55%);
}
.icon {
  width: 14px;
  height: 14px;
}
.why {
  margin: 4px 8px;
  color: var(--muted);
  font-size: 12px;
}
@media (forced-colors: active) {
  .item[aria-pressed='true'] {
    border: 1px solid CanvasText;
  }
}
</style>
