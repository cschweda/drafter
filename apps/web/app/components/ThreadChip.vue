<script setup lang="ts">
import type { Chip } from '~/threads/chips';

// One thread on a row or a card (threads design §7.6): a 4×16 bar in the thread's color beside the
// label, never the round dot a scene's color uses. Its name is "thread A, The heist". Rows and
// cards hide what is drawn from screen readers and say it in their own name; this is that name
// for anything that doesn't.
defineProps<{ chip: Chip }>();
</script>

<template>
  <span class="thread-chip" role="img" :aria-label="chip.accessibleName">
    <span
      class="thread-bar"
      :class="{ none: !chip.swatch }"
      :style="chip.swatch ? { background: chip.swatch } : undefined"
      aria-hidden="true"
    />
    <span class="thread-text" aria-hidden="true">{{ chip.label }}</span>
  </span>
</template>

<style scoped>
.thread-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 0 6px 0 4px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  line-height: 18px;
}
.thread-bar {
  flex: none;
  width: 4px;
  height: 16px;
  border-radius: 1px;
}
.thread-bar.none {
  border: 1px dashed var(--muted);
  box-sizing: border-box;
}
.thread-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
