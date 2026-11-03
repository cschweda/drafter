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
import { EditorView } from '@codemirror/view';

// The one editor lives in module state (editor/session.ts), so it keeps its
// text, its undo history, and its cursor wherever the Source tab goes. This
// panel lends it a host while it shows, and parks it in index.vue's hidden
// holder when the tab leaves or the layout changes.
// Side by side the element bar is in the editor's header (AppPane), so this pane leaves it out.
const props = withDefaults(defineProps<{ bar?: boolean }>(), { bar: true });
const { view } = useEditor();
const host = ref<HTMLElement>();
const sync = useScrollSync();
let detach: (() => void) | undefined;

// With the on-screen keyboard up (below 1024px), the element row goes under the text, on the
// keyboard's top edge, and the line being typed is brought into view above it (Review Focus 5).
const keyboard = useOnScreenKeyboard();
watch([keyboard.open, keyboard.inset], async () => {
  await nextTick();
  if (!host.value?.contains(view.dom)) return;
  view.requestMeasure();
  if (view.hasFocus) {
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'nearest' }) });
  }
});

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
  <div class="source" :class="{ keyboard: keyboard.open.value }">
    <ElementBar v-if="props.bar" />
    <div ref="host" class="host" />
    <ElementAnnouncer />
    <!-- What the text box's `aria-describedby` names in Classic Mode (design §12). -->
    <span id="classic-leave" class="sr-only">To leave the text, press Escape, then Tab. If a list is open, press Escape twice.</span>
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
/* The keyboard is up: the element row is the bottom row, over the keyboard. */
.source.keyboard > :deep([data-element-bar]) {
  order: 2;
  border-top: 1px solid var(--border);
  border-bottom: 0;
}
</style>
