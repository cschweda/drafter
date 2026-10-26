<script setup lang="ts">
import { sprintNotice } from '~/stats/sprint';

// "Sprint done: 312 words (1.2 pages).": a toast, and the polite live region that says it once.
// It is in the page in both layouts (focus mode too), and always, so a message set later is announced.
</script>

<template>
  <div class="sprint-notice" :class="{ shown: sprintNotice }" data-sprint-notice>
    <span role="status" aria-live="polite">{{ sprintNotice }}</span>
  </div>
</template>

<style scoped>
.sprint-notice {
  position: fixed;
  z-index: 30;
  right: 16px;
  bottom: 56px;
  box-sizing: border-box;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  border-radius: 6px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
  /* Only to be read: on a small screen it can sit over the status bar's buttons, which must stay clickable. */
  pointer-events: none;
}
/* The region stays in the page, so a screen reader hears its text change; the box is drawn only with text. */
.sprint-notice:not(.shown) {
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  box-shadow: none;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
