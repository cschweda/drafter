<script setup lang="ts">
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { problemsLabel, useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { templateIdOf, typeNameOf } from '~/editor/template';
import { wordsLabel } from '~/markdown/preview';
import { useMarkdown } from '~/markdown/use-markdown';
import { progressLabel, useGoal } from '~/stats/goal';
import { openError } from '~/storage/open';
import { readOnlyHint, saveAnnouncement, saveError } from '~/storage/save';
import { kindError, type RecoveryState, useScript } from '~/storage/script';

const { doc, kind } = useEditor();
const { words } = useMarkdown();
const { page } = useLayout();
const { project, dirty, recovery, ready } = useScript();
const { count } = useProblems();
const { progress } = useGoal();
const templateName = computed(() => typeNameOf(kind.value, templateIdOf(doc.value)));

// "Saved 4 min ago" is worked out from this, which moves every 30 seconds (and when a save lands).
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});
onBeforeUnmount(() => clearInterval(tick));
// What a screen reader hears when a save lands; the visible text keeps counting minutes.
const announcement = saveAnnouncement;
watch(
  () => project.value?.savedAt,
  () => {
    now.value = Date.now();
  },
);

function savedAgo(savedAt: number): string {
  const minutes = Math.floor((now.value - savedAt) / 60_000);
  if (minutes < 1) return 'Saved just now';
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const time = new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `Saved at ${time}`;
}

const file = computed(() => {
  const current = project.value;
  // A script that has been saved to a file says how long ago, or that it has changed since.
  if (current?.savedAt !== undefined) {
    return dirty.value ? 'Unsaved changes' : savedAgo(current.savedAt);
  }
  const sample = current ? !!current.sample : !dirty.value;
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

// The counts panel opens from the page item, and Esc or a click elsewhere closes it.
const countsOpen = ref(false);
const countsWrap = ref<HTMLElement>();
const countsButton = ref<HTMLButtonElement>();
const countsLabel = computed(() =>
  kind.value === 'markdown' ? wordsLabel(words.value) : pageLabel(page.value) || 'Counts',
);

function closeCounts(refocus = true) {
  if (!countsOpen.value) return;
  countsOpen.value = false;
  if (refocus) countsButton.value?.focus();
}

function onPointerDown(event: PointerEvent) {
  if (countsOpen.value && !countsWrap.value?.contains(event.target as Node)) closeCounts(false);
}
// Tabbing out of the panel closes it. A click elsewhere is `onPointerDown`'s: a button may not take focus on click.
function onFocusOut(event: FocusEvent) {
  const to = event.relatedTarget as Node | null;
  if (to && !countsWrap.value?.contains(to)) closeCounts(false);
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));

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
    <span class="sr-only" role="status">{{ announcement }}</span>
    <span v-if="saveError" role="alert" class="failed">{{ saveError }}</span>
    <span v-if="openError" role="alert" class="failed">{{ openError }}</span>
    <span v-if="readOnlyHint" role="alert" class="failed">{{ readOnlyHint }}</span>
    <span v-if="kindError" role="alert" class="failed">{{ kindError }}</span>
    <!-- The page item opens the counts. A Markdown document has words, no pages, and no checks. -->
    <span ref="countsWrap" class="counts-wrap" @focusout="onFocusOut">
      <button
        ref="countsButton"
        type="button"
        class="counts-button"
        title="Counts and daily goal"
        aria-haspopup="dialog"
        :aria-expanded="countsOpen ? 'true' : 'false'"
        aria-controls="counts-panel"
        @click="countsOpen ? closeCounts(false) : (countsOpen = true)"
      >
        {{ countsLabel }}
      </button>
      <CountsPanel v-if="countsOpen" id="counts-panel" @close="closeCounts()" />
    </span>
    <span v-if="progress">{{ progressLabel(progress) }}</span>
    <!-- A sprint's time left (not a live region: only its end is announced). -->
    <SprintTimer />
    <span v-if="kind !== 'markdown'">{{ problemsLabel(count) }}</span>
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
.failed {
  color: var(--text);
  box-shadow: inset 3px 0 0 var(--heading);
  padding-left: 8px;
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
.counts-button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: pointer;
}
.counts-button:focus-visible,
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
