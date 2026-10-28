<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { problemsLabel, useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { wordsLabel } from '~/markdown/preview';
import { useMarkdown } from '~/markdown/use-markdown';
import { contextGeneration } from '~/modules/context';
import { useModuleTabs } from '~/modules/host';
import { useSettings } from '~/settings/settings';
import { useScript } from '~/storage/script';
import { coreTabs, TABS, type Tab, type TabId, tabRow } from '~/utils/panes';

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

const { project } = useScript();
const { kind } = useEditor();
const { words, updating: previewing } = useMarkdown();
const markdown = computed(() => kind.value === 'markdown');
/** The Script tab is the Preview in a Markdown document. */
const labelOf = (tab: { id: string; label: string }) =>
  tab.id === 'script' && markdown.value ? 'Preview' : tab.label;
const { problems, count, canFixAll, fixAll } = useProblems();
// The button goes when nothing is left to fix, and focus with it: it goes to the panel.
function onFixAll() {
  fixAll();
  document.getElementById('panel-problems')?.focus();
}
const suggestions = computed(() => problems.value.filter((p) => p.severity === 'info').length);
// The core tabs (no Outline in a Markdown document), then one slot for another tab (a module's),
// then More with the rest (Phase 2 design §5.8).
const moduleTabs = useModuleTabs();
const last = useTabSlot();
const core = computed(() => {
  const tabs = coreTabs(kind.value);
  // A pane still showing a tab the document has no more of keeps its button until it moves on.
  const own = TABS.find((tab) => tab.id === props.selected);
  return own && !tabs.includes(own) ? [...tabs, own] : tabs;
});
const others = computed<Tab[]>(() => moduleTabs.value.map(({ id, label }) => ({ id, label })));
const row = computed(() => tabRow(core.value, others.value, props.selected, last.value));
const allTabs = computed(() => row.value.row);
const moreTabs = computed(() => row.value.more);
// A tab other than the core ones that this pane shows keeps the slot when the pane moves on.
watch(
  () => props.selected,
  (tab) => {
    if (others.value.some((other) => other.id === tab)) last.value = tab;
  },
  { immediate: true },
);
const moduleTab = computed(() => moduleTabs.value.find((tab) => tab.id === props.selected));
const SLIM = computed<Record<'source' | 'problems', string>>(() => ({
  source: project.value?.fileName ?? project.value?.title ?? '',
  // Advice (info) isn't counted as a problem, so it's named apart.
  // The pane itself says there are no checks for a Markdown document.
  problems: markdown.value
    ? ''
    : problemsLabel(count.value) +
      (suggestions.value > 0
        ? ` · ${suggestions.value} ${suggestions.value === 1 ? 'suggestion' : 'suggestions'}`
        : ''),
}));
const { settings, set } = useSettings();

const { page, updating } = useLayout();
const zoom = useScriptZoom();
const ZOOMS = [
  { id: 'fit', label: 'Fit width' },
  { id: 'full', label: '100%' },
] as const;

const tabButtons = ref<HTMLButtonElement[]>([]);

// More: a menu of the tabs that aren't in the row (MenuButton, as every menu is). Choosing one shows
// it here, in the slot, and focus goes to its tab rather than back to More.
const moreItems = computed<DropdownMenuItem[]>(() =>
  moreTabs.value.map((tab) => ({ label: tab.label, onSelect: () => chooseMore(tab.id) })),
);
let chosenTab: TabId | null = null;

function chooseMore(tab: TabId) {
  last.value = tab;
  chosenTab = tab;
  emit('choose', tab);
}

function onMoreCloseAutoFocus(event: Event) {
  const tab = chosenTab;
  chosenTab = null;
  if (!tab) return;
  event.preventDefault();
  requestAnimationFrame(() => document.getElementById(`tab-${props.pane}-${tab}`)?.focus());
}

// Manual activation: arrow keys move focus along the tabs, and Enter or Space
// chooses one, so arrowing past a tab open in the other pane never swaps them.
function onKeydown(event: KeyboardEvent, index: number) {
  const last = allTabs.value.length - 1;
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
    <div class="tabs">
    <div role="tablist" :aria-label="props.label" class="tablist">
      <button
        v-for="(tab, index) in allTabs"
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
        {{ labelOf(tab) }}
        <span v-if="tab.id === 'problems' && count > 0" class="badge">{{ count }}</span>
      </button>
    </div>
    <MenuButton
      v-if="moreTabs.length > 0"
      :items="moreItems"
      :content="{ align: 'start', onCloseAutoFocus: onMoreCloseAutoFocus }"
    >
      <button type="button" class="tab more-button">
        More<span class="sr-only"> tabs</span>
        <UIcon name="i-lucide-chevron-down" class="chevron" aria-hidden="true" />
      </button>
    </MenuButton>
    </div>
    <div class="slim">
      <template v-if="props.selected === 'script' && markdown">
        <span class="page">{{ wordsLabel(words) }}</span>
        <span v-if="previewing" class="updating">Updating…</span>
      </template>
      <template v-else-if="props.selected === 'script'">
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
      <template v-else-if="moduleTab">
        {{ moduleTab.module.name }}
      </template>
      <template v-else-if="props.selected === 'outline'">
        <OutlineSlim />
      </template>
      <template v-else>
        {{ SLIM[props.selected as 'source' | 'problems'] }}
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
            <button
              type="button"
              class="zoom-button"
              :aria-pressed="settings.typewriter ? 'true' : 'false'"
              @click="set('typewriter', !settings.typewriter)"
            >
              Typewriter
            </button>
            <button
              type="button"
              class="zoom-button"
              :aria-pressed="settings.scrollSync ? 'true' : 'false'"
              @click="set('scrollSync', !settings.scrollSync)"
            >
              Sync scrolling
            </button>
          </div>
        </template>
        <template v-else-if="props.selected === 'problems' && canFixAll">
          <span class="spacer" />
          <button type="button" class="fix-all" @click="onFixAll">Fix all</button>
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
      <!-- Keyed by the script as well: a tab keeps the context it is drawn with, so another
           script draws it afresh with that script's context. -->
      <ModuleBoundary
        v-else-if="moduleTab"
        :key="`${moduleTab.id}:${contextGeneration()}`"
        :name="moduleTab.module.name"
        what="tab"
      >
        <component :is="moduleTab.module.tab?.component" :context="moduleTab.context" />
      </ModuleBoundary>
      <MarkdownPane v-else-if="props.selected === 'script' && markdown" />
      <ScriptPane v-else-if="props.selected === 'script'" />
      <OutlinePane v-else-if="props.selected === 'outline'" />
      <ProblemsPane v-else />
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
  align-items: flex-end;
  gap: 2px;
  padding: 7px 10px 0;
  overflow-x: auto;
  background: var(--chrome);
  border-bottom: 1px solid var(--line);
}
.tablist {
  display: flex;
  gap: 2px;
}
.more-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.chevron {
  width: 12px;
  height: 12px;
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
.badge {
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 9px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 11px;
}
.tab.on .badge {
  background: var(--chrome);
}
.fix-all {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--heading);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
@media (forced-colors: active) {
  .badge {
    border: 1px solid CanvasText;
  }
}
</style>
