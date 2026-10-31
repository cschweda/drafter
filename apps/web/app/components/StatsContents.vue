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
.sections {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.contents-label {
  color: var(--muted);
}
.section-link {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  color: var(--text);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.section-link:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
