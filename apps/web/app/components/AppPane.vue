<script setup lang="ts">
import screenplay from '#samples/screenplay.fountain?raw';
import { TABS, type TabId } from '~/utils/panes';

const props = defineProps<{
  /** `left`, `right`, or `phone`; it names the tabs' ids. */
  pane: string;
  /** The tab list's accessible name. */
  label: string;
  selected: TabId;
  /** The tabs showing in any pane: a tab points at its panel only when the panel exists. */
  shown: TabId[];
}>();
const emit = defineEmits<{ choose: [tab: TabId] }>();

// Until the editor, the Script view, and the linter arrive (Plans 2 and 3),
// each panel holds a placeholder: the sample's source, or a line of text.
const SLIM: Record<TabId, string> = {
  source: 'screenplay.fountain',
  script: 'Fit width',
  problems: 'No problems',
};

const tabButtons = ref<HTMLButtonElement[]>([]);

// Manual activation: arrow keys move focus along the tabs, and Enter or Space
// chooses one, so arrowing past a tab open in the other pane never swaps them.
function onKeydown(event: KeyboardEvent, index: number) {
  const last = TABS.length - 1;
  const moves: Record<string, number> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const next = moves[event.key];
  if (next === undefined) return;
  event.preventDefault();
  tabButtons.value[next]?.focus();
}
</script>

<template>
  <section class="pane" :data-pane="props.pane">
    <div role="tablist" :aria-label="props.label" class="tabs">
      <button
        v-for="(tab, index) in TABS"
        :id="`tab-${props.pane}-${tab.id}`"
        :key="tab.id"
        ref="tabButtons"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: tab.id === props.selected }"
        :aria-selected="tab.id === props.selected ? 'true' : 'false'"
        :aria-controls="props.shown.includes(tab.id) ? `panel-${tab.id}` : undefined"
        :tabindex="tab.id === props.selected ? 0 : -1"
        @click="emit('choose', tab.id)"
        @keydown="onKeydown($event, index)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="slim">{{ SLIM[props.selected] }}</div>
    <div
      :id="`panel-${props.selected}`"
      role="tabpanel"
      :aria-labelledby="`tab-${props.pane}-${props.selected}`"
      tabindex="0"
      class="panel"
      :data-tour="props.selected"
    >
      <pre v-if="props.selected === 'source'" class="source">{{ screenplay }}</pre>
      <p v-else-if="props.selected === 'script'" class="placeholder">Formatted pages appear here.</p>
      <p v-else class="placeholder">No problems found.</p>
    </div>
  </section>
</template>

<style scoped>
.pane {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: var(--bg);
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 7px 10px 0;
  overflow-x: auto;
  background: var(--chrome);
  border-bottom: 1px solid var(--line);
}
.tab {
  padding: 7px 10px 9px;
  border: 0;
  border-radius: 7px 7px 0 0;
  background: none;
  color: var(--muted);
  font: 600 13px/1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.tab.on {
  background: var(--tab-on);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--heading);
}
.slim {
  padding: 5px 12px;
  background: var(--chrome-2);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.panel {
  min-height: 0;
  overflow: auto;
}
.source {
  margin: 0;
  padding: 12px 16px;
  color: var(--text);
  font: 13.5px/21px var(--font-mono);
  white-space: pre-wrap;
}
.placeholder {
  margin: 0;
  padding: 24px 16px;
  color: var(--muted);
}
</style>
