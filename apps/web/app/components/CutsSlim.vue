<script setup lang="ts">
import { cutsCount, filterCuts } from '~/cuts/labels';
import { useCuts } from '~/cuts/use-cuts';

// The Cuts list's slim bar (drafts-and-cuts design §3.2): how many cuts (of how many, while the
// filter finds some), and Close.

const cuts = useCuts();
const { rows, filter, loaded, notKept } = cuts;
const count = computed(() => {
  const all = rows.value.length;
  if (filter.value.trim() === '') return cutsCount(all);
  return `${filterCuts(rows.value, filter.value).length.toLocaleString('en-US')} of ${cutsCount(all)}`;
});
</script>

<template>
  <span v-if="!notKept && loaded">{{ count }}</span>
  <span class="spacer" />
  <ToolButton
    icon="i-lucide-x"
    label="Close"
    class="slim-button cuts-tool"
    aria-label="Close Cuts"
    @click="cuts.close(true)"
  />
</template>

<style>
/* Unscoped: each button is a ToolButton, whose root this component's scope doesn't reach. */
.slim-button.cuts-tool {
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.slim-button.cuts-tool:hover {
  background: var(--overlay);
}
</style>
