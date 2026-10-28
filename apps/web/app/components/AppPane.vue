<script setup lang="ts">
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

// More: a small menu of the tabs that aren't in the row. Choosing one shows it here, in the slot.
const moreOpen = ref(false);
const moreButton = ref<HTMLButtonElement>();
const morePanel = ref<HTMLElement>();
const morePlace = reactive({ top: 0, left: 0 });

async function openMore() {
  const rect = moreButton.value?.getBoundingClientRect();
  const width = 14 * 16;
  morePlace.top = Math.round((rect?.bottom ?? 40) + 4);
  morePlace.left = Math.max(
    8,
    Math.min(Math.round(rect?.left ?? 8), window.innerWidth - width - 8),
  );
  moreOpen.value = true;
  await nextTick();
  morePanel.value?.querySelector<HTMLElement>('button')?.focus();
}

function closeMore(refocus: boolean) {
  if (!moreOpen.value) return;
  moreOpen.value = false;
  if (refocus) moreButton.value?.focus();
}

async function chooseMore(tab: TabId) {
  last.value = tab;
  moreOpen.value = false;
  emit('choose', tab);
  await nextTick();
  document.getElementById(`tab-${props.pane}-${tab}`)?.focus();
}

function onMoreKeydown(event: KeyboardEvent) {
  if (!moreOpen.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    closeMore(true);
    return;
  }
  const items = [...(morePanel.value?.querySelectorAll<HTMLElement>('button') ?? [])];
  const at = items.indexOf(document.activeElement as HTMLElement);
  const next: Record<string, number> = {
    ArrowDown: at < items.length - 1 ? at + 1 : 0,
    ArrowUp: at > 0 ? at - 1 : items.length - 1,
    Home: 0,
    End: items.length - 1,
  };
  const to = next[event.key];
  if (to === undefined || items.length === 0) return;
  event.preventDefault();
  items[to]?.focus();
}

function onMoreFocusout(event: FocusEvent) {
  const to = event.relatedTarget;
  if (moreOpen.value && to instanceof Node && !morePanel.value?.parentElement?.contains(to)) {
    closeMore(false);
  }
}

function onPointerdown(event: PointerEvent) {
  const root = morePanel.value?.parentElement;
  if (moreOpen.value && event.target instanceof Node && !root?.contains(event.target)) {
    closeMore(false);
  }
}
onMounted(() => document.addEventListener('pointerdown', onPointerdown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerdown));

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
    <div v-if="moreTabs.length > 0" class="more" @keydown="onMoreKeydown" @focusout="onMoreFocusout">
      <button
        ref="moreButton"
        type="button"
        class="tab more-button"
        :aria-expanded="moreOpen ? 'true' : 'false'"
        :aria-controls="moreOpen ? `more-tabs-${props.pane}` : undefined"
        @click="moreOpen ? closeMore(true) : openMore()"
      >
        More<span class="sr-only"> tabs</span>
        <UIcon name="i-lucide-chevron-down" class="chevron" aria-hidden="true" />
      </button>
      <div
        v-if="moreOpen"
        :id="`more-tabs-${props.pane}`"
        ref="morePanel"
        role="group"
        aria-label="More tabs"
        class="more-panel"
        :style="{ top: `${morePlace.top}px`, left: `${morePlace.left}px` }"
      >
        <button
          v-for="tab in moreTabs"
          :key="tab.id"
          type="button"
          class="more-item"
          @click="chooseMore(tab.id)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>
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
.more-panel {
  position: fixed;
  z-index: 20;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(14rem, calc(100vw - 16px));
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
.more-item {
  min-height: 32px;
  padding: 4px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: 600 13px/1.2 var(--font-sans);
  text-align: left;
  cursor: pointer;
}
.more-item:hover {
  background: var(--chrome);
}
.more-item:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
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
