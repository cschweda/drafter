<script setup lang="ts">
import { fileTrouble, troubleMessage, updatedNotice, useFileCheck } from '~/storage/check';
import { saveAs } from '~/storage/save';

// §9.6: the bar under the toolbar when a script's file can't be checked, and the toast that says
// the file was loaded. The status regions stay in the page and only their text changes, so a
// screen reader hears them.
const { check, editCopy } = useFileCheck();

const trouble = computed(() => fileTrouble.value);
const failed = ref(false);

async function saveElsewhere() {
  failed.value = false;
  try {
    await saveAs();
  } catch {
    // The status bar says what went wrong.
  }
}
</script>

<template>
  <div data-file-bar :class="{ bar: trouble || updatedNotice }">
    <span role="status" class="message">
      <template v-if="trouble">{{ troubleMessage(trouble) }}</template>
    </span>
    <button
      v-if="trouble?.kind === 'permission'"
      type="button"
      class="action"
      @click="check({ ask: true })"
    >
      Check for changes
    </button>
    <template v-else-if="trouble">
      <button type="button" class="action" @click="saveElsewhere">Save As</button>
      <button type="button" class="action" @click="editCopy">Edit this browser's copy</button>
    </template>
    <span role="status" class="notice">{{ updatedNotice }}</span>
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
.message,
.notice {
  flex: 1 1 24rem;
}
.message:empty,
.notice:empty {
  display: none;
}
.notice {
  flex-basis: 100%;
  font-weight: 600;
}
.action {
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
.action:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
