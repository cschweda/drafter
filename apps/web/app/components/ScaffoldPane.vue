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
.scaffold :deep(h2:focus-visible),
.scaffold :deep(h3:focus-visible) {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
/* What the character, location, and list pages share (the scene page keeps its own). */
.scaffold :deep(.page h2) {
  overflow-wrap: anywhere;
}
.scaffold :deep(.page h3) {
  margin: 16px 0 4px;
  font-size: 13px;
}
.scaffold :deep(.summary) {
  margin: 0;
}
.scaffold :deep(.note) {
  margin: 6px 0 0;
  color: var(--muted);
}
.scaffold :deep(.page .facts) {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 8px 0 0;
}
.scaffold :deep(.page .fact) {
  display: contents;
}
.scaffold :deep(.page .facts dt) {
  color: var(--muted);
}
.scaffold :deep(.page .facts dd) {
  margin: 0;
  overflow-wrap: anywhere;
}
.scaffold :deep(.scaffold-link) {
  color: var(--text);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.scaffold :deep(.scaffold-link:focus-visible),
.scaffold :deep(.go:focus-visible),
.scaffold :deep(.page .action:focus-visible) {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.scaffold :deep(.page .action) {
  min-height: 24px;
  margin-top: 8px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: none;
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.scaffold :deep(.go) {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 2px;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.scaffold :deep(.scaffold-scroll) {
  /* Holds the cells' hidden words, which are positioned, inside its own scrolling. */
  position: relative;
  overflow-x: auto;
}
.scaffold :deep(.scaffold-scroll:focus-visible) {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.scaffold :deep(.scaffold-table) {
  width: 100%;
  border-collapse: collapse;
}
.scaffold :deep(.scaffold-table caption) {
  text-align: left;
}
.scaffold :deep(.scaffold-table th),
.scaffold :deep(.scaffold-table td) {
  padding: 2px 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-weight: normal;
  vertical-align: top;
}
.scaffold :deep(.scaffold-table th + td),
.scaffold :deep(.scaffold-table td + th),
.scaffold :deep(.scaffold-table td + td),
.scaffold :deep(.scaffold-table th + th) {
  padding-left: 12px;
}
.scaffold :deep(.scaffold-table thead th) {
  color: var(--muted);
}
.scaffold :deep(.scaffold-table .num) {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
