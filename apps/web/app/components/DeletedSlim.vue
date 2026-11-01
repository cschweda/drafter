<script setup lang="ts">
import { useDeleted } from '~/history/deleted';
import { countLabel, progressLabel } from '~/history/labels';

// The Deleted scenes tab's slim bar (version-history design §9): "12 deleted scenes", or while the
// versions are first read, a progress bar with "Reading versions… 120 of 300"; and Close, which takes
// the tab away.

const deleted = useDeleted();
const { shown, filter, rows, progress, done, listed, why } = deleted;
const progressId = useId();
// Read again after an edit, the count stands: the progress shows on the first reading only.
const reading = computed(
  () => !why.value && !done.value && !listed.value && progress.value !== null,
);
// Entries put back leave the count at once, as they leave the list.
const count = computed(() => (filter.value.trim() === '' ? shown.value.length : rows.value.length));
</script>

<template>
  <template v-if="why" />
  <template v-else-if="reading && progress">
    <progress
      class="reading"
      :value="progress.read"
      :max="Math.max(progress.total, 1)"
      :aria-labelledby="progressId"
    />
    <span :id="progressId">{{ progressLabel(progress.read, progress.total) }}</span>
  </template>
  <span v-else-if="listed">{{ countLabel(count) }}</span>
  <span class="spacer" />
  <ToolButton
    icon="i-lucide-x"
    label="Close"
    class="slim-button deleted-tool"
    aria-label="Close Deleted scenes"
    @click="deleted.close(true)"
  />
</template>

<style scoped>
.reading {
  width: 6rem;
  height: 8px;
  accent-color: var(--accent-text);
}
</style>

<style>
/* Unscoped: each button is a ToolButton, whose root this component's scope doesn't reach. */
.slim-button.deleted-tool {
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
.slim-button.deleted-tool:hover {
  background: var(--overlay);
}
</style>
