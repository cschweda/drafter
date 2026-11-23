<script setup lang="ts">
import { formatKeys, isApple } from '~/commands/keys';
import { justSaved, save, saveAnnouncement, savesLanded } from '~/storage/save';
import { useScript } from '~/storage/script';

// The save state. Where there is a status bar it is the status bar's to show (AppStatusBar: a red
// dot and "Unsaved", which saves when clicked, and "Saved to …" for a moment after a save), and
// the top bar shows nothing, so nothing in it ever moves (the maintainer, 2026-11-23: "if there's a
// status message, that should go below in a dedicated status bar"). A phone has no status bar:
// there the dot stands here, right after the title, and a check for a moment after a save. This
// element is always here, with the state for the tests and what a screen reader hears: "Saved"
// when a save lands, and nothing as the writer types.
const { project, dirty } = useScript();
const keys = formatKeys('Mod-s', isApple());

/** `unsaved`, `saved` (in its file), or `clean` (not edited, and in no file): for the tests too. */
const state = computed(() =>
  dirty.value ? 'unsaved' : project.value?.savedAt !== undefined ? 'saved' : 'clean',
);

/** How long "Saved" stays after a save (it fades over the end of it, without reduced motion). */
const SAVED_MS = 2000;
// Whether there is a status bar to say it instead.
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
    <button
      v-if="state === 'unsaved' && !wide"
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
  display: inline-flex;
  flex: none;
  align-items: center;
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
@media (max-width: 639.98px) {
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
