<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useWideScreen } from '~/composables/useWideScreen';
import { useScript } from '~/storage/script';

// A phone's row above the pane while a sample is open (Phase 1 design §4.2): "Sample ·" and
// "Start your own", whose menu holds every way to start one's own, as the top bar's sample chip
// does on a wide screen (SampleChip.vue, fresh-look design §3.5). The same words and the same menu
// in both places (final review, M4).
const { project } = useScript();
const wide = useWideScreen();
const { actions, off } = useStartActions();

const items = computed<DropdownMenuItem[]>(() =>
  actions.value.map((action) => ({
    label: action.label,
    icon: action.id === 'open' ? 'i-lucide-folder-open' : 'i-lucide-file-plus',
    disabled: off(action),
    onSelect: () => action.command?.run(),
  })),
);
</script>

<template>
  <section v-if="project?.sample && !wide" class="bar" aria-label="Sample">
    <strong class="name" aria-hidden="true">Sample ·</strong>
    <MenuButton :items="items" :content="{ align: 'end' }">
      <button type="button" class="action" aria-label="Sample: start your own">
        Start your own
        <UIcon name="i-lucide-chevron-down" class="caret" aria-hidden="true" />
      </button>
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
  font-weight: 600;
}
.action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
.caret {
  flex: none;
  width: 12px;
  height: 12px;
}
</style>
