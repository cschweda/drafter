<script setup lang="ts">
// An explanation behind an (i) button (fresh-look design §7): the disclosure pattern, so the text
// follows its button for a screen reader and stays in the page, where search and a reader find it.
// Enter or Space opens and closes it; Escape closes it and leaves focus on the button; a press
// outside or focus moving away closes it too. The panel is placed under the nearest positioned
// ancestor, across its whole width (a title row with `position: relative`), so it never runs past
// a narrow pane's edge.
const props = defineProps<{
  /** The button's name, such as "About the Characters table". */
  label: string;
}>();
const open = ref(false);
const id = useId();
const root = ref<HTMLElement>();
const button = ref<HTMLButtonElement>();

function close(focus: boolean) {
  open.value = false;
  if (focus) button.value?.focus();
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !open.value) return;
  event.preventDefault();
  event.stopPropagation();
  close(true);
}
function onFocusout(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (open.value && next && !root.value?.contains(next)) close(false);
}
function onPointerdown(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) close(false);
}
watch(open, (now) => {
  if (now) document.addEventListener('pointerdown', onPointerdown, true);
  else document.removeEventListener('pointerdown', onPointerdown, true);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerdown, true));
</script>

<template>
  <span ref="root" class="d-info" @keydown="onKeydown" @focusout="onFocusout">
    <button
      ref="button"
      type="button"
      class="d-btn d-btn--icon d-info-button"
      :aria-label="props.label"
      :aria-expanded="open ? 'true' : 'false'"
      :aria-controls="id"
      @click="open = !open"
    >
      <UIcon name="i-lucide-info" aria-hidden="true" />
    </button>
    <div :id="id" class="d-info-panel motion" :hidden="!open">
      <slot />
    </div>
  </span>
</template>

<style>
/* Unscoped, one class deep, as DButton's. */
.d-info-button {
  width: 24px;
  height: 24px;
  vertical-align: middle;
}
.d-info-button[aria-expanded='true'] {
  background: var(--overlay);
  color: var(--text);
}
.d-info-panel {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 5;
  max-width: 34rem;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--overlay);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  color: var(--text);
  font-size: 13px;
  font-weight: normal;
  line-height: 1.45;
  text-align: left;
  white-space: normal;
}
.d-info-panel[hidden] {
  display: none;
}
.d-info-panel > p {
  margin: 0;
}
.d-info-panel > p + p {
  margin-top: 6px;
}
@media (forced-colors: active) {
  .d-info-panel {
    border-color: CanvasText;
  }
}
</style>
