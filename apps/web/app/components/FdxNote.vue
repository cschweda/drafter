<script setup lang="ts">
import { useEditor } from '~/editor/session';

// A quiet note in the top bar for a Markdown document or a novel (the maintainer, 2026-11-05):
// Drafter exports Final Draft files, but only for a screenplay or a stage play, so a writer here
// doesn't take its absence for a missing feature. It sits where a script's Fountain | Classic
// switch does (a document has none), on a wide screen only: the bar below 1024px folds its
// buttons, and the Export menu says the same beside its greyed-out Final Draft item.
const { kind } = useEditor();
const wide = useWideScreen();
</script>

<template>
  <span
    v-if="wide && kind === 'markdown'"
    class="fdx-note"
    data-fdx-note
    title="Final Draft (.fdx) export is for screenplays and stage plays. This document exports as a PDF, an HTML page, an EPUB, Markdown, or plain text."
  >
    <UIcon name="i-lucide-info" class="icon" aria-hidden="true" />
    <span class="label">Final Draft (.fdx): scripts only</span>
  </span>
</template>

<style scoped>
/* Drawn as the sample chip is: a small pill on --raised, in the muted colour. */
.fdx-note {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--raised);
  color: var(--muted);
  font: 500 12px/16px var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
  cursor: default;
}
.icon {
  flex: none;
  width: 14px;
  height: 14px;
}
/* Below 1440px the bar has room for the icon only: the words stay for a screen reader, and the
   tooltip says them all, so the title and the sample chip keep their room. */
@media (max-width: 1439.98px) {
  .fdx-note {
    padding: 0 5px;
  }
  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
@media (forced-colors: active) {
  .fdx-note {
    border: 1px solid CanvasText;
  }
}
</style>
