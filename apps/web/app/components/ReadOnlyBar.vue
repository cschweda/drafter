<script setup lang="ts">
import { useGuard } from '~/storage/guard';

const { readOnly, failed, editHere } = useGuard();
</script>

<template>
  <div :class="{ bar: readOnly }">
    <!-- The status region stays in the page and only its text changes, so a screen reader hears it. -->
    <p role="status">
      <template v-if="readOnly">This script is open for editing in another tab.</template>
      <span v-if="readOnly && failed" class="failed">The other tab didn’t let go. Try again.</span>
    </p>
    <button v-if="readOnly" type="button" class="take" @click="editHere">Edit here instead</button>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  padding: 6px 14px;
  background: var(--chrome-2);
  border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  color: var(--text);
  font-size: 13px;
}
p {
  flex: 1 1 24rem;
  margin: 0;
}
.failed {
  margin-left: 8px;
  font-weight: 600;
}
.take {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.take:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
