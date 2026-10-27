<script lang="ts">
import type { StateEffect } from '@codemirror/state';

// What the editor had when the last SourcePane let it go: the next one (a pane swap mounts it a
// moment later, in the same flush) puts it back.
let parked: { scroll: StateEffect<unknown>; focused: boolean } | undefined;
</script>

<script setup lang="ts">
import { restoreSelection } from '~/editor/restore-selection';
import { sourcePane } from '~/editor/scroll-sync';
import { useEditor } from '~/editor/session';
import { useScrollSync } from '~/editor/use-scroll-sync';

// The one editor lives in module state (editor/session.ts), so it keeps its
// text, its undo history, and its cursor wherever the Source tab goes. This
// panel lends it a host while it shows, and parks it in index.vue's hidden
// holder when the tab leaves or the layout changes.
const { view } = useEditor();
const host = ref<HTMLElement>();
const sync = useScrollSync();
let detach: (() => void) | undefined;

onMounted(() => {
  host.value?.append(view.dom);
  view.requestMeasure();
  // A hidden element forgets its scroll position, so the editor is put back where it was.
  if (parked) {
    const { scroll, focused } = parked;
    parked = undefined;
    view.dispatch({ effects: scroll });
    if (focused) {
      view.focus();
      restoreSelection(view);
    }
  }
  // Scrolling here moves the Script pane or the Preview, and theirs moves this.
  detach = sync.attachSource(sourcePane(view));
});

onBeforeUnmount(() => {
  detach?.();
  parked = { scroll: view.scrollSnapshot(), focused: view.hasFocus };
  document.querySelector('[data-editor-holder]')?.append(view.dom);
});
</script>

<template>
  <div class="source">
    <ElementBar />
    <div ref="host" class="host" />
    <ElementAnnouncer />
  </div>
</template>

<style scoped>
.source {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.host {
  flex: 1 1 0;
  min-height: 0;
}
</style>
