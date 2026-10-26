<script setup lang="ts">
import { fileTrouble, troubleMessage } from '~/storage/check';
import { useGuard } from '~/storage/guard';
import { openError } from '~/storage/open';
import { readOnlyHint, saveAnnouncement, saveError } from '~/storage/save';
import { kindError, useScript } from '~/storage/script';

// The corner marker of focus mode (Phase 1 design §7.1). The status bar is gone, so this carries
// what the writer must not lose sight of: whether the script has changes that aren't in its file,
// what a failed save or open said, and a way out for a keyboard with no Esc (a phone).
//
// The `sprint` slot is where a sprint's time left goes (Task 4): it is drawn before the save
// state, inside this group.
const emit = defineEmits<{ leave: [] }>();
const { dirty, warning } = useScript();
const { readOnly } = useGuard();

/** "Saved" is the script as the editor has it being the script as last saved (or opened). */
const label = computed(() =>
  readOnly.value ? 'Read-only' : dirty.value ? 'Unsaved changes' : 'Saved',
);
</script>

<template>
  <div class="marker" role="group" aria-label="Focus mode" data-focus-marker>
    <!-- What a screen reader hears when a save lands, as in the status bar. -->
    <span class="sr-only" role="status">{{ saveAnnouncement }}</span>
    <span v-if="warning === 'unavailable'" role="alert" class="failed">
      Drafter can’t keep a recovery copy in this browser right now. Your changes exist only in
      memory until you save the script to a file.
    </span>
    <span v-if="fileTrouble" role="status" class="failed">
      {{ troubleMessage(fileTrouble) }} Leave focus mode to deal with it.
    </span>
    <span v-if="saveError" role="alert" class="failed">{{ saveError }}</span>
    <span v-if="openError" role="alert" class="failed">{{ openError }}</span>
    <span v-if="readOnlyHint" role="alert" class="failed">{{ readOnlyHint }}</span>
    <span v-if="kindError" role="alert" class="failed">{{ kindError }}</span>
    <slot name="sprint" />
    <span class="state" data-focus-state>{{ label }}</span>
    <button type="button" class="leave" @click="emit('leave')">Leave focus mode</button>
  </div>
</template>

<style scoped>
.marker {
  position: fixed;
  right: 12px;
  bottom: 10px;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 4px 12px;
  max-width: calc(100vw - 24px);
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--chrome);
  color: var(--muted);
  font: 600 12px/1.3 var(--font-sans);
}
.failed {
  color: var(--text);
  box-shadow: inset 3px 0 0 var(--heading);
  padding-left: 8px;
}
.leave {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: pointer;
}
.leave:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
@media (forced-colors: active) {
  .marker {
    border-color: CanvasText;
  }
}
</style>
