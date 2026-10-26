<script setup lang="ts">
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { useEditor } from '~/editor/session';
import { TEMPLATE_NAMES, templateIdOf } from '~/editor/template';
import { type RecoveryState, useScript } from '~/storage/script';

const { doc } = useEditor();
const { page } = useLayout();
const { project, dirty, recovery, ready } = useScript();
const templateName = computed(() => TEMPLATE_NAMES[templateIdOf(doc.value)]);

// Task 7 adds what a saved script says here.
const file = computed(() => {
  const sample = project.value ? !!project.value.sample : !dirty.value;
  return sample ? 'Sample · your edits stay in this browser' : 'Not saved to a file yet';
});

const RECOVERY: Record<RecoveryState, { label: string; why: string }> = {
  persistent: {
    label: 'Recovery copy: kept in this browser',
    why: 'Drafter keeps a copy of your script in this browser as you type, and the browser has agreed to keep it. Close the page or restart the browser and your script comes back. Saving it to a file is still the way to have a copy of your own.',
  },
  'not-persistent': {
    label: 'Recovery copy: may be cleared',
    why: 'Drafter keeps a copy of your script in this browser as you type, but the browser has not promised to keep it. It may clear the copy when space runs low, in a private window, or when site data is cleared. Save the script to a file to be safe.',
  },
  unavailable: {
    label: 'Recovery copy: unavailable',
    why: 'The browser won’t let Drafter keep a copy right now, so your changes exist only in memory. Save the script to a file to keep them. Drafter tries again every 30 seconds.',
  },
};

const open = ref(false);
const explanation = computed(() => RECOVERY[recovery.value].why);

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    open.value = false;
  }
}
</script>

<template>
  <footer class="status" data-tour="status" @keydown="onKeydown">
    <span>{{ file }}</span>
    <span v-if="page">{{ pageLabel(page) }}</span>
    <span class="spacer" />
    <template v-if="ready">
      <button
        type="button"
        class="recovery"
        :aria-expanded="open ? 'true' : 'false'"
        aria-controls="recovery-why"
        @click="open = !open"
      >
        {{ RECOVERY[recovery].label }}
      </button>
    </template>
    <span>{{ templateName }}</span>
    <p v-show="open" id="recovery-why" class="why">{{ explanation }}</p>
  </footer>
</template>

<style scoped>
.status {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 6px 14px;
  background: var(--chrome);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.recovery {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: pointer;
}
.recovery:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.why {
  position: absolute;
  right: 8px;
  bottom: calc(100% + 4px);
  z-index: 5;
  max-width: min(34rem, calc(100vw - 16px));
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
</style>
