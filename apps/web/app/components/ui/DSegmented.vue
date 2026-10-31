<script setup lang="ts" generic="T extends string">
// The segmented control (fresh-look design §5), for an either/or choice: a group of buttons, the
// chosen one pressed (`aria-pressed`), drawn as one strip with the chosen segment filled. The
// chosen one is told apart by its fill and its weight, not by colour alone.
const props = defineProps<{
  /** The group's accessible name. */
  label: string;
  /** Each choice: what it says, and its accessible name where that says more (`name`). */
  options: ReadonlyArray<{ value: T; label: string; name?: string }>;
}>();
const model = defineModel<T>({ required: true });
</script>

<template>
  <div role="group" :aria-label="props.label" class="d-segmented">
    <button
      v-for="option in props.options"
      :key="option.value"
      type="button"
      class="d-segment"
      :aria-label="option.name"
      :aria-pressed="model === option.value ? 'true' : 'false'"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style>
.d-segmented {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: var(--r-sm);
  background: var(--raised);
}
.d-segment {
  min-height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.d-segment:hover {
  color: var(--text);
}
.d-segment[aria-pressed='true'] {
  background: var(--overlay);
  color: var(--text);
  font-weight: 600;
  /* And a line under it in the accent's text colour: a cue beyond the fill and the weight. */
  box-shadow: inset 0 -2px 0 var(--accent-text);
}
@media (forced-colors: active) {
  .d-segment[aria-pressed='true'] {
    outline: 2px solid Highlight;
  }
}
</style>
