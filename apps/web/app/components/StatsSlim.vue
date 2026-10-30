<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { type StatsSection, sectionHeadingId, showStats } from '~/stats/tab';

// The Stats tab's slim bar: a link to each section (seeing-the-script design §4.1), which puts
// focus on its heading. A Markdown document has the Overview alone, so no links.
const { kind } = useEditor();
const SECTIONS: ReadonlyArray<{ id: StatsSection; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'characters', label: 'Characters' },
  { id: 'grid', label: 'Character by scene' },
];
</script>

<template>
  <nav v-if="kind !== 'markdown'" aria-label="Stats sections" class="sections">
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
  gap: 2px 12px;
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
