<script setup lang="ts">
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { useSettings } from '~/settings/settings';
import { useScript } from '~/storage/script';
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

// Until the Problems list arrives (Plan 3), its panel holds a placeholder: a line of text.
const { project } = useScript();
const SLIM = computed<Record<Exclude<TabId, 'script'>, string>>(() => ({
  source: project.value?.fileName ?? project.value?.title ?? '',
  problems: 'No problems',
}));
const { settings, set } = useSettings();

const { page, updating } = useLayout();
const zoom = useScriptZoom();
const ZOOMS = [
  { id: 'fit', label: 'Fit width' },
  { id: 'full', label: '100%' },
] as const;

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
    <div class="slim">
      <template v-if="props.selected === 'script'">
        <span class="page">{{ pageLabel(page) }}</span>
        <span v-if="updating" class="updating">Updating…</span>
        <span class="spacer" />
        <div role="group" aria-label="Zoom" class="zoom">
          <button
            v-for="option in ZOOMS"
            :key="option.id"
            type="button"
            class="zoom-button"
            :aria-pressed="zoom === option.id ? 'true' : 'false'"
            @click="zoom = option.id"
          >
            {{ option.label }}
          </button>
        </div>
      </template>
      <template v-else>
        {{ SLIM[props.selected] }}
        <template v-if="props.selected === 'source'">
          <span class="spacer" />
          <div role="group" aria-label="Source view" class="zoom">
            <button
              type="button"
              class="zoom-button"
              :aria-pressed="settings.lineNumbers ? 'true' : 'false'"
              @click="set('lineNumbers', !settings.lineNumbers)"
            >
              Line numbers
            </button>
          </div>
        </template>
      </template>
    </div>
    <div
      :id="`panel-${props.selected}`"
      role="tabpanel"
      :aria-labelledby="`tab-${props.pane}-${props.selected}`"
      tabindex="0"
      class="panel"
      :class="{ editing: props.selected === 'source' || props.selected === 'script' }"
      :data-tour="props.selected"
    >
      <SourcePane v-if="props.selected === 'source'" />
      <ScriptPane v-else-if="props.selected === 'script'" />
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
/* Forced colors (Windows High Contrast) drop the background and the
   box-shadow, so a border marks the selected tab there. */
@media (forced-colors: active) {
  .tab.on {
    border-bottom: 2px solid CanvasText;
  }
}
.slim {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-height: 24px;
  padding: 5px 12px;
  background: var(--chrome-2);
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
.zoom {
  display: flex;
  gap: 2px;
}
.zoom-button {
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  /* Always there, so the pressed one's line moves nothing. */
  border-bottom: 1px solid transparent;
  border-radius: 5px 5px 0 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.zoom-button[aria-pressed='true'] {
  background: var(--tab-on);
  color: var(--text);
  border-bottom-color: var(--heading);
}
/* Forced colors drops the background, so a border marks the pressed one. */
@media (forced-colors: active) {
  .zoom-button[aria-pressed='true'] {
    border: 1px solid CanvasText;
  }
}
.panel {
  min-height: 0;
  overflow: auto;
}
/* The editor and the Script view scroll themselves. */
.panel.editing {
  overflow: hidden;
}
.placeholder {
  margin: 0;
  padding: 24px 16px;
  color: var(--muted);
}
</style>
