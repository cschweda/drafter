<script setup lang="ts">
import { useEditor } from '~/editor/session';

// The one editor lives in module state (editor/session.ts), so it keeps its
// text, its undo history, and its cursor wherever the Source tab goes. This
// panel lends it a host while it shows, and parks it in index.vue's hidden
// holder when the tab leaves or the layout changes.
const { view } = useEditor();
const host = ref<HTMLElement>();

onMounted(() => {
  host.value?.append(view.dom);
  view.requestMeasure();
});

onBeforeUnmount(() => {
  document.querySelector('[data-editor-holder]')?.append(view.dom);
});
</script>

<template>
  <div class="source">
    <div ref="host" class="host" />
    <ElementAnnouncer />
  </div>
</template>

<style scoped>
.source,
.host {
  height: 100%;
  min-height: 0;
}
</style>
