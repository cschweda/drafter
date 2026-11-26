<script setup lang="ts">
import { unwritten } from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { useEditor } from '~/editor/session';
import { novelSummary } from '~/novel/labels';
import { useLiveNovel } from '~/novel/use-novel';
import { lengthLabel } from '~/outline/labels';
import { useOutline } from '~/outline/use-outline';
import { type OutlineView, useSettings } from '~/settings/settings';

// The Outline tab's slim bar: how many scenes, and how long they run once the pages are made; in a
// novel, its chapters, sections, and words, and the book's target when it has one. On the Outline
// tab (not the Cards', which shows the counts alone), the Tree | Lanes switch (threads design
// §7.3), remembered on this device, and with Lanes a menu with Show as table (not on a phone,
// whose Lanes are a list). A plain Markdown
// document has no scenes, so no switch.
const props = defineProps<{ countsOnly?: boolean }>();
const editor = useEditor();
const { index } = useOutline();
const novel = useLiveNovel();
const { settings, set } = useSettings();
const isNovel = computed(() => editor.kind.value === 'markdown' && editor.novel.value);
const summary = computed(() => {
  if (isNovel.value) {
    return novelSummary(novel.tree.value, novel.facts.value.bookTarget ?? null);
  }
  const { scenes } = index.value;
  // An outline of sections alone: how many are still to write, not "0 scenes".
  const toWrite = scenes.length === 0 ? unwritten(index.value).length : 0;
  if (toWrite > 0) return `${toWrite} ${toWrite === 1 ? 'section' : 'sections'} to write`;
  const count = `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}`;
  if (scenes.length === 0 || scenes.some((s) => s.pages === null)) return count;
  return `${count} · ${lengthLabel(scenes.reduce((sum, s) => sum + (s.pages?.eighths ?? 0), 0))}`;
});

const switchable = computed(
  () => !props.countsOnly && (editor.kind.value !== 'markdown' || isNovel.value),
);
const view = computed(() => settings.value.outlineView);
/** Below the Lanes' width a phone shows their list, which has no table: no menu then. */
const roomy = useMatchMedia(LANES_QUERY);
const choose = (next: OutlineView) => void set('outlineView', next);
const items = computed<DropdownMenuItem[][]>(() => [
  [
    {
      type: 'checkbox',
      label: 'Show as table',
      checked: settings.value.threadsAsTable,
      onSelect: () => void set('threadsAsTable', !settings.value.threadsAsTable),
    },
  ],
]);
</script>

<template>
  <span>{{ summary }}</span>
  <template v-if="switchable">
    <span class="spacer" />
    <div role="group" aria-label="Outline view" class="choice">
      <ToolButton
        icon="i-lucide-list-tree"
        label="Tree"
        class="slim-button view-tool"
        :aria-pressed="view === 'tree' ? 'true' : 'false'"
        @click="choose('tree')"
      />
      <ToolButton
        icon="i-lucide-chart-gantt"
        label="Lanes"
        class="slim-button view-tool"
        :aria-pressed="view === 'lanes' ? 'true' : 'false'"
        @click="choose('lanes')"
      />
    </div>
    <MenuButton v-if="view === 'lanes' && roomy" :items="items" :content="{ align: 'end' }">
      <button type="button" class="zoom-button lanes-menu" aria-label="Lanes options">
        <UIcon name="i-lucide-ellipsis" class="icon" aria-hidden="true" />
      </button>
    </MenuButton>
  </template>
</template>

<style scoped>
.choice {
  display: inline-flex;
}
.lanes-menu {
  display: inline-flex;
  align-items: center;
}
.icon {
  width: 14px;
  height: 14px;
}
</style>

<style>
/* Unscoped: each button is a ToolButton, whose root this component's scope doesn't reach. Drawn as
   Compare's view switch is. */
.choice .slim-button.view-tool {
  border-radius: 0;
}
.choice .slim-button.view-tool:first-child {
  border-radius: 5px 0 0 5px;
}
.choice .slim-button.view-tool + .slim-button.view-tool {
  margin-left: -1px;
  border-radius: 0 5px 5px 0;
}
.slim-button.view-tool {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--accent-text);
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.slim-button.view-tool[aria-pressed='true'] {
  background: var(--accent-text);
  color: var(--bg);
}
</style>
