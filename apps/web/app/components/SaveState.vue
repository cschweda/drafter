<script setup lang="ts">
import { formatKeys, isApple } from '~/commands/keys';
import { save, saveAnnouncement, savesLanded } from '~/storage/save';
import { useScript } from '~/storage/script';

// The save state, right after the script's title in the top bar (fresh-look Task 6; the
// maintainer, 2026-10-31): a red dot and "Unsaved" while the text has changes its file doesn't
// have, which saves when clicked; nothing at all once it is saved, but for a "Saved" that shows for
// a moment after a save and fades. A script with no file yet is "Unsaved" as soon as it is edited,
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
const justSaved = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(savesLanded, () => {
  clearTimeout(timer);
  // Drawn again, so its fade starts over.
  justSaved.value = false;
  void nextTick(() => {
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
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <span class="save-state" :data-save-state="state">
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
    <span v-else-if="justSaved" class="saved" aria-hidden="true" data-just-saved>
      <UIcon name="i-lucide-check" class="check" />
      Saved
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
