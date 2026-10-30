<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { useEditor } from '~/editor/session';
import { useScaffold } from '~/scaffold/session';

// Scaffold (seeing-the-script design §5): one tab, beside the Source, with a page at a time; the
// scene page is the first, and Task 7 adds a character's, a location's, and the lists. The tab holds
// the cast while it shows a script, so the cast is worked out only while someone looks. A Markdown
// document has no Scaffold: its tab is taken away (index.vue), and this draws nothing meanwhile.
const { kind } = useEditor();
const markdown = computed(() => kind.value === 'markdown');
const { need } = useCast();
const { page } = useScaffold();

let release: (() => void) | null = null;
watch(
  markdown,
  (isMarkdown) => {
    if (isMarkdown) {
      release?.();
      release = null;
    } else {
      release ??= need();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  release?.();
  release = null;
});
</script>

<template>
  <div class="scaffold">
    <ScaffoldScene v-if="!markdown && page.kind === 'scene'" />
  </div>
</template>

<style scoped>
.scaffold {
  max-width: 52rem;
  padding: 12px 16px 24px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
.scaffold :deep(h2) {
  margin: 0 0 8px;
  font-size: 15px;
}
.scaffold :deep(h2:focus-visible) {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
