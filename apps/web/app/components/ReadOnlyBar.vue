<script setup lang="ts">
import { useGuard } from '~/storage/guard';

const { readOnly, failed, editHere } = useGuard();
// A caution (main.css's `tone-warn`): the tab can't write until the writer takes the script back.
</script>

<template>
  <div :class="{ bar: readOnly, 'tone-warn': readOnly }">
    <!-- The status region stays in the page and only its text changes, so a screen reader hears it. -->
    <p role="status">
      <template v-if="readOnly">You can’t type here because this script is open in another Drafter tab.</template>
      <span v-if="readOnly && failed" class="failed">The other tab didn’t let go. Try again.</span>
    </p>
    <button v-if="readOnly" type="button" class="take" @click="editHere">Type here instead</button>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  box-sizing: border-box;
  min-height: 32px;
  padding: 4px 14px 4px 11px;
  border-bottom: 1px solid var(--border);
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
  border: 1px solid var(--tone-border);
  border-radius: var(--r-sm);
  background: transparent;
  color: var(--text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.take:hover {
  background: var(--tone-hover);
}
</style>
