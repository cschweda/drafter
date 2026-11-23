<script setup lang="ts">
import { formatKeys, isApple } from '~/commands/keys';
import { justSaved, save, saveAnnouncement, savesLanded } from '~/storage/save';
import { useScript } from '~/storage/script';

// The save state, right after the script's title in the top bar (fresh-look Task 6; the
// maintainer, 2026-10-31): a red dot and "Unsaved" while the text has changes its file doesn't
// have, which saves when clicked; nothing at all once it is saved. Its place in the bar is always
// the same size, filled or not, so nothing in the bar moves when the state changes (the maintainer,
// 2026-11-23: "nothing should change the orientation of buttons in the menu bar"), but on a phone,
// whose bar has no room to hold empty; "Saved to …" is
// the status bar's to say, and on a phone, which has no status bar, a check shows here for a moment. A script with no file yet is "Unsaved" as soon as it is edited,
// and Save asks where. On a phone the dot stands alone, with the same name. A screen reader hears
// "Saved" when a save lands, and nothing as the writer types. The status bar says none of this.
const { project, dirty } = useScript();
const keys = formatKeys('Mod-s', isApple());

/** `unsaved`, `saved` (in its file), or `clean` (not edited, and in no file): for the tests too. */
const state = computed(() =>
  dirty.value ? 'unsaved' : project.value?.savedAt !== undefined ? 'saved' : 'clean',
);

/** How long "Saved" stays after a save (it fades over the end of it, without reduced motion). */
const SAVED_MS = 2000;
// Where there is a status bar it says "Saved to …" (AppStatusBar); a phone has none, so the check
// shows here, in the slot the dot uses.
const wide = useWideScreen();
let timer: ReturnType<typeof setTimeout> | undefined;
// A save that lands as the bar goes (a phone turned, focus mode) starts no timer after it has gone.
let alive = true;
watch(savesLanded, () => {
  clearTimeout(timer);
  // Drawn again, so its fade starts over.
  justSaved.value = false;
  void nextTick(() => {
    if (!alive) return;
    justSaved.value = true;
    timer = setTimeout(() => {
      justSaved.value = false;
    }, SAVED_MS);
  });
});
// Typing again ends it at once: the dot is back.
watch(dirty, (now) => {
  if (now) {
    clearTimeout(timer);
    justSaved.value = false;
  }
});
onBeforeUnmount(() => {
  alive = false;
  clearTimeout(timer);
});
</script>

<template>
  <span class="save-state" :data-save-state="state">
    <!-- Holds the place at the size of "Unsaved", whatever is shown in it. -->
    <span class="ghost" aria-hidden="true"><span class="dot" /><span class="word">Unsaved</span></span>
    <button
      v-if="state === 'unsaved'"
      type="button"
      class="unsaved"
      aria-label="Unsaved changes — Save"
      :title="`Unsaved changes. Save (${keys})`"
      @click="save().catch(() => {})"
    >
      <span class="dot" aria-hidden="true" />
      <span class="word">Unsaved</span>
    </button>
    <!-- Seen, not heard: the status region below says "Saved". -->
    <span v-else-if="justSaved && !wide" class="saved" aria-hidden="true" data-just-saved>
      <UIcon name="i-lucide-check" class="check" />
    </span>
    <span class="sr-only" role="status">{{ saveAnnouncement }}</span>
  </span>
</template>

<style scoped>
.save-state {
  display: inline-grid;
  flex: none;
  align-items: center;
}
/* The ghost and what is shown share one cell: the cell is the ghost's size, always. */
.save-state > * {
  grid-area: 1 / 1;
}
.ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  font: 500 12px/1 var(--font-sans);
  white-space: nowrap;
  visibility: hidden;
}
.unsaved {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  font: 500 12px/1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.unsaved:hover {
  background: var(--raised);
  color: var(--text);
}
/* The favicon's dot, in the same red (public/favicon-unsaved.svg). */
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--unsaved);
}
.saved {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  color: var(--muted);
  font: 500 12px/1 var(--font-sans);
  white-space: nowrap;
  /* A deliberate exception to the 140ms motion rule: the maintainer asked for a brief fade, so
     "Saved" fades over its last 500ms (2s × 25%). */
  animation: saved-fade 2s var(--ease) both;
}
.check {
  width: 14px;
  height: 14px;
}
/* Shown, then faded over its last half-second. */
@keyframes saved-fade {
  0%,
  75% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .saved {
    animation: none;
  }
}
/* A phone: the dot alone, a 24px target, named as on a wide screen. */
/* Under 1280px the bar is short of room (the search gives way there): the dot alone, in a place
   its size, with the word in its tooltip and its name. */
@media (max-width: 1279.98px) {
  .ghost,
  .unsaved {
    justify-content: center;
    width: 24px;
    padding: 0;
  }
  .word {
    display: none;
  }
}
@media (max-width: 639.98px) {
  /* A phone's bar has no room to keep empty: a place held here pushed File off an iPhone's bar.
     The dot takes its 24px when it comes, as before. */
  .ghost {
    display: none;
  }
  .saved {
    justify-content: center;
    width: 24px;
    padding: 0;
  }
  .unsaved {
    justify-content: center;
    width: 24px;
    padding: 0;
  }
  .word {
    display: none;
  }
}
</style>
