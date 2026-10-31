<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { type StatsSection, sectionHeadingId, showStats } from '~/stats/tab';

// The Stats page's contents (seeing-the-script design §4.1; fresh-look ruling for Task 3): a row at
// the top of the page with a link to each section, which puts focus on its heading. It was the
// slim bar's, and left the Inspector's header so the header keeps room for its tabs. A Markdown
// document has the Overview alone, so no links.
const { kind } = useEditor();
const SECTIONS: ReadonlyArray<{ id: StatsSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'characters', label: 'Characters' },
  { id: 'grid', label: 'Character by scene' },
];
</script>

<template>
  <nav v-if="kind !== 'markdown'" aria-label="Stats sections" class="sections">
    <span class="contents-label" aria-hidden="true">Contents</span>
    <a
      v-for="section in SECTIONS"
      :key="section.id"
      :href="`#${sectionHeadingId(section.id)}`"
      class="section-link"
      @click.prevent="showStats(section.id)"
    >
      {{ section.label }}
    </a>
  </nav>
</template>

<style scoped>
/* Stuck at the top of the page as it scrolls on a wide screen (fresh-look design §7), one 41px row on the page's
   own colour; StatsPane's headings keep clear of it (scroll-margin-top), and its tables' headers
   stick under it. A narrow pane scrolls the row sideways rather than wrapping it. */
.sections {
  position: sticky;
  top: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 41px;
  margin: 0 -4px;
  padding: 0 4px;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  font-size: 13px;
  white-space: nowrap;
  scrollbar-width: none;
}
.contents-label {
  margin-right: 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}
/* A phone keeps its little height for the page: the row scrolls away with it, and nothing is
   ever half under it. */
@media (max-width: 640px) {
  .sections {
    position: static;
  }
  .contents-label {
    display: none;
  }
}
.section-link {
  display: inline-flex;
  flex: none;
  align-items: center;
  min-height: 28px;
  padding: 0 8px;
  border-radius: var(--r-sm);
  color: var(--text);
  font-weight: 500;
  text-decoration: none;
}
.section-link:hover {
  background: var(--raised);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.section-link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 0;
}
</style>
