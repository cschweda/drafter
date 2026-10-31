<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useWideScreen } from '~/composables/useWideScreen';
import { useScript } from '~/storage/script';

// A phone's row above the pane while a sample is open (Phase 1 design §4.2): "Sample", the first way
// to start one's own, and a "More" menu with the rest. A wide screen has these in the top bar's
// sample chip (SampleChip.vue, fresh-look design §3.5), and no bar.
const { project } = useScript();
const wide = useWideScreen();
const { actions, off } = useStartActions();

/** The menu: every action after the first. */
const more = computed<DropdownMenuItem[]>(() =>
  actions.value.slice(1).map((action) => ({
    label: action.label,
    disabled: off(action),
    onSelect: () => action.command?.run(),
  })),
);
</script>

<template>
  <section v-if="project?.sample && !wide" class="bar" aria-label="Sample">
    <strong class="name">Sample</strong>
    <button
      v-if="actions[0]"
      type="button"
      class="action"
      :disabled="off(actions[0])"
      @click="actions[0].command?.run()"
    >
      {{ actions[0].label }}
    </button>
    <MenuButton :items="more" :content="{ align: 'end' }">
      <button type="button" class="action" aria-label="More ways to start your own">More</button>
    </MenuButton>
  </section>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 6px 12px;
  padding: 4px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
}
.name {
  margin-right: auto;
  font-weight: 600;
}
.action {
  min-height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.action:hover {
  background: var(--overlay);
}
.action:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
