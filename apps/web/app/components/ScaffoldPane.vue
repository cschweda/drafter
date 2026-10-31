<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { useEditor } from '~/editor/session';
import { holdFollow } from '~/scaffold/follow';
import { useScaffold } from '~/scaffold/session';

// Scaffold (seeing-the-script design §5): one tab, beside the Source, with a page at a time: the
// scene page first, a character's, a location's, and the Cast and Places lists. Alt+Left goes Back
// while focus is in the tab's panel (AppPane hears it there, the panel itself included; the slim
// bar has its own). The tab holds the cast while it shows a
// script, so the cast is worked out only while someone looks. A Markdown document has no Scaffold:
// its tab is taken away (index.vue), and this draws nothing meanwhile.
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
// The scene page follows the cursor only while the tab is shown.
let unfollow: (() => void) | null = null;
onMounted(() => {
  unfollow = holdFollow();
});
onBeforeUnmount(() => {
  release?.();
  release = null;
  unfollow?.();
  unfollow = null;
});
</script>

<template>
  <div class="scaffold">
    <template v-if="!markdown">
      <ScaffoldScene v-if="page.kind === 'scene'" />
      <ScaffoldCharacter
        v-else-if="page.kind === 'character'"
        :key="`character:${page.key}`"
        :character-key="page.key"
      />
      <ScaffoldLocation
        v-else-if="page.kind === 'location'"
        :key="`location:${page.key}`"
        :location-key="page.key"
      />
      <ScaffoldLists v-else :kind="page.kind" />
    </template>
  </div>
</template>

<style scoped>
/* Scaffold's page (fresh-look design §7): a centred column of 720px at most, the page's title
   20/600, its sections' 15/600, and its tables in the one table style (assets/css/tables.css). */
.scaffold {
  box-sizing: border-box;
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 24px 32px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
@media (max-width: 640px) {
  .scaffold {
    padding: 16px 16px 24px;
  }
}
.scaffold :deep(h2) {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}
/* What the character, location, and list pages share (the scene page keeps its own). */
.scaffold :deep(.page h2) {
  overflow-wrap: anywhere;
}
.scaffold :deep(.page .title-row) {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
}
.scaffold :deep(.page .title-row h2) {
  flex: 1;
  min-width: 0;
}
.scaffold :deep(.page h3) {
  margin: 20px 0 6px;
  font-size: 15px;
  font-weight: 600;
}
.scaffold :deep(.summary) {
  margin: 8px 0 0;
}
.scaffold :deep(.note) {
  margin: 6px 0 0;
  color: var(--muted);
}
.scaffold :deep(.page .facts) {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0 16px;
  margin: 12px 0 0;
}
.scaffold :deep(.page .fact) {
  display: contents;
}
.scaffold :deep(.page .facts dt),
.scaffold :deep(.page .facts dd) {
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
.scaffold :deep(.page .facts dt) {
  color: var(--muted);
}
.scaffold :deep(.page .facts dd) {
  margin: 0;
  overflow-wrap: anywhere;
}
/* A link in running text (facts, notes) keeps its underline; in a table it shows on hover. */
.scaffold :deep(.scaffold-link) {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.scaffold :deep(.d-table .scaffold-link) {
  text-decoration: none;
}
.scaffold :deep(.d-table .scaffold-link:hover) {
  text-decoration: underline;
}
.scaffold :deep(.scaffold-link:focus-visible),
.scaffold :deep(.go:focus-visible) {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.scaffold :deep(.page .action) {
  margin-top: 12px;
}
/* Go to a scene from a table's row: a button drawn as the table's links are. */
.scaffold :deep(.go) {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  text-decoration: none;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.scaffold :deep(.go:hover) {
  text-decoration: underline;
}
.scaffold :deep(.d-table caption h3) {
  margin: 20px 0 0;
}
@media (forced-colors: active) {
  .scaffold :deep(.d-table .scaffold-link),
  .scaffold :deep(.go) {
    text-decoration: underline;
  }
}
</style>
