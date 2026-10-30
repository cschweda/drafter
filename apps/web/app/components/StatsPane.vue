<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { useEditor } from '~/editor/session';

// The Stats tab (seeing-the-script design §4): Overview, then Characters, each under its own
// heading, which the links in the slim bar go to. A Markdown document has the Overview alone. The
// tab holds the cast while it shows a script, so the cast is worked out only while someone looks.
const { kind } = useEditor();
const markdown = computed(() => kind.value === 'markdown');
const { need } = useCast();

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
  <div class="stats">
    <StatsOverview />
    <StatsCharacters v-if="!markdown" />
  </div>
</template>

<style scoped>
.stats {
  max-width: 52rem;
  padding: 12px 16px 24px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
.stats :deep(.section + .section) {
  margin-top: 20px;
}
.stats :deep(h2) {
  margin: 0 0 8px;
  font-size: 15px;
}
.stats :deep(h2:focus-visible) {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
