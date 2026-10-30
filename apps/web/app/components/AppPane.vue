<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useCompare } from '~/compare/use-compare';
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { problemsLabel, useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { useDeleted } from '~/history/deleted';
import { wordsLabel } from '~/markdown/preview';
import { useMarkdown } from '~/markdown/use-markdown';
import { contextGeneration } from '~/modules/context';
import { useModuleTabs } from '~/modules/host';
import { openCount } from '~/notes/filter';
import { useNotes } from '~/notes/use-notes';
import { isBackKey } from '~/scaffold/keys';
import { scaffoldBack } from '~/scaffold/show';
import { useSettings } from '~/settings/settings';
import { useScript } from '~/storage/script';
import {
  COMPARE_TAB,
  coreTabs,
  DELETED_TAB,
  TABS,
  type Tab,
  type TabId,
  tabRow,
  viewTabs,
} from '~/utils/panes';

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
// The core tabs (no Outline in a Markdown document), then one slot for another tab (Cards, Notes,
// Stats, Scaffold, or a module's), then More with the rest, Cards, Notes, Stats, and Scaffold first
// (Phase 2 design §5.8). A Markdown document's only view tab is Stats.
const moduleTabs = useModuleTabs();
const last = useTabSlot();
const core = computed(() => {
  const tabs = coreTabs(kind.value);
  // A pane still showing a tab the document has no more of keeps its button until it moves on.
  const own = TABS.find((tab) => tab.id === props.selected);
  return own && !tabs.includes(own) ? [...tabs, own] : tabs;
});
// The Notes tab's badge is the open notes in My notes and Readers (Call 15), named "Notes, 3 open".
const { entries: noteEntries } = useNotes();
const openNotes = computed(() => openCount(noteEntries.value));
// Compare exists only while a comparison is open, first among the others then, so it takes the slot
// of the pane it opens in (Phase 2 design §5.8, Call 16).
const { current: comparison } = useCompare();
// Deleted scenes, too, exists only while it is open (version-history design §9, Call 34).
const { isOpen: deletedOpen } = useDeleted();
const others = computed<Tab[]>(() => [
  ...(comparison.value ? [COMPARE_TAB] : []),
  ...(deletedOpen.value ? [DELETED_TAB] : []),
  ...viewTabs(kind.value).map((tab) =>
    tab.id === 'notes' && openNotes.value > 0
      ? { ...tab, badge: String(openNotes.value), badgeName: `${openNotes.value} open` }
      : tab,
  ),
  ...moduleTabs.value.map(({ id, label }) => ({ id, label })),
]);
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
// Side by side, a tab with a bar of its own under the slim bar (the Source's element bar, the
// Outline's filter) puts it in the row the panes share for it, and its text under it (index.vue).
const barShown = useElementBarShown();
const barred = computed(
  () =>
    (props.selected === 'source' && barShown.value) ||
    (props.selected === 'outline' && !markdown.value),
);

/**
 * Side by side, the Outline's tree scrolls under its filter rather than the panel, so the keys
 * that scroll a focused panel (F6 puts focus there) scroll the tree, as they scrolled the panel.
 */
function onPanelKeydown(event: KeyboardEvent) {
  // Scaffold's Back key, heard anywhere in its panel, the panel itself too (design §5.1). Alt+Left
  // is the browser's Back as well: the page stays where it is.
  if (props.selected === 'scaffold' && !event.defaultPrevented && isBackKey(event)) {
    event.preventDefault();
    scaffoldBack();
    return;
  }
  if (!barred.value || event.target !== event.currentTarget || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const panel = event.currentTarget as HTMLElement;
  const area = [...panel.querySelectorAll<HTMLElement>(':scope > * > :not([data-pane-bar])')].find(
    (el) => el.scrollHeight > el.clientHeight,
  );
  if (!area) return;
  const page = area.clientHeight * 0.875;
  const by: Record<string, number> = {
    ArrowDown: 40,
    ArrowUp: -40,
    PageDown: page,
    PageUp: -page,
    ' ': event.shiftKey ? -page : page,
    Home: -area.scrollHeight,
    End: area.scrollHeight,
  };
  const delta = by[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  area.scrollBy({ top: delta });
}

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
  moreTabs.value.map((tab) => ({
    label: tabName(tab),
    onSelect: () => chooseMore(tab.id),
  })),
);
let chosenTab: TabId | null = null;

/** A tab's name with its badge: "Notes, 3 open". */
function tabName(tab: Tab): string {
  if (!tab.badge) return tab.label;
  return `${tab.label}, ${tab.badgeName ?? tab.badge}`;
}

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
  <section
    class="pane"
    :class="{ side: props.pane !== 'phone', barred }"
    :data-pane="props.pane"
  >
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
        :aria-label="tab.badge ? tabName(tab) : undefined"
        @click="emit('choose', tab.id)"
        @keydown="onKeydown($event, index)"
      >
        {{ labelOf(tab) }}
        <span v-if="tab.id === 'problems' && count > 0" class="badge">{{ count }}</span>
        <span v-else-if="tab.badge" class="badge" aria-hidden="true">{{ tab.badge }}</span>
      </button>
    </div>
    <MenuButton
      v-if="moreTabs.length > 0"
      :items="moreItems"
      :content="{ align: 'start', onCloseAutoFocus: onMoreCloseAutoFocus }"
    >
      <button type="button" class="tab more-button">
        <span class="more-word">More</span><span class="sr-only"> tabs</span>
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
        <ChangesToggle />
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
      <template v-else-if="props.selected === 'cards'">
        <CardsSlim />
      </template>
      <template v-else-if="props.selected === 'notes'">
        <NotesSlim />
      </template>
      <template v-else-if="props.selected === 'stats'">
        <StatsSlim />
      </template>
      <template v-else-if="props.selected === 'scaffold'">
        <ScaffoldSlim />
      </template>
      <template v-else-if="props.selected === 'compare'">
        <CompareSlim />
      </template>
      <template v-else-if="props.selected === 'deleted'">
        <DeletedSlim />
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
      :class="{
        editing:
          props.selected === 'source' ||
          props.selected === 'script' ||
          props.selected === 'compare',
      }"
      :data-tour="props.selected"
      @keydown="onPanelKeydown"
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
      <CardsPane v-else-if="props.selected === 'cards'" />
      <NotesPane v-else-if="props.selected === 'notes'" />
      <StatsPane v-else-if="props.selected === 'stats'" />
      <ScaffoldPane v-else-if="props.selected === 'scaffold'" />
      <ComparePane v-else-if="props.selected === 'compare'" />
      <DeletedPane v-else-if="props.selected === 'deleted'" />
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
  /* Holds the More button's hidden words, which are positioned, inside the row's own scrolling:
     else they would stick out past the row and widen the page on a narrow phone. */
  position: relative;
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
/* A narrow phone: the row holds four tabs, the slot, and More at 375px (controller ruling 4), so
   More is its chevron alone, still named "More tabs", and the tabs sit closer. */
@media (max-width: 479.98px) {
  .tabs .tab {
    padding-inline: 7px;
  }
  .more-word {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
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
/* `:deep`, so a tab's own slim bar (CardsSlim) draws its buttons the same. */
.slim :deep(.spacer) {
  flex: 1;
}
.slim :deep(.zoom) {
  display: flex;
  gap: 2px;
}
.slim :deep(.zoom-button) {
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
.slim :deep(.zoom-button[aria-pressed='true']) {
  background: var(--tab-on);
  color: var(--text);
  border-bottom-color: var(--heading);
}
/* Forced colors drops the background, so a border marks the pressed one. */
@media (forced-colors: active) {
  .slim :deep(.zoom-button[aria-pressed='true']) {
    border: 1px solid CanvasText;
  }
}
.panel {
  min-height: 0;
  overflow: auto;
}
/* The editor, the Script view, and Compare scroll themselves. */
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

<style>
/* Side by side, the two panes share the rows of index.vue's grid (tabs, slim bar, second bar, text),
   so the first lines of text in both start at the same height (decided 2026-10-29). A pane without
   a second bar lets its slim bar take that row too, its background carried down and its words at
   the top; a pane with one (the Source's element bar, the Outline's filter) puts it in that row,
   and the part under it scrolls itself. Unscoped, to reach into the tabs' panes; a phone's one pane
   keeps the layout above. */
@supports (grid-template-rows: subgrid) {
  .panes.wide > .pane.side {
    grid-template-rows: subgrid;
  }
  /* WebKit sizes a subgrid's row by a bar's min-height instead of its content (so the slim bar was
     24px with its 35px of buttons), and the bars' content is taller than their minimum anyway. */
  .pane.side > .slim,
  .pane.side.barred > .panel > * > [data-pane-bar] {
    min-height: auto;
  }
  .pane.side > .slim {
    grid-row: 2 / span 2;
    align-content: flex-start;
  }
  .pane.side > .panel {
    grid-row: 4;
  }
  .pane.side.barred > .slim {
    grid-row: 2;
  }
  .pane.side.barred > .panel {
    display: grid;
    grid-row: 3 / span 2;
    grid-template-rows: subgrid;
    overflow: hidden;
  }
  .pane.side.barred > .panel > * {
    display: grid;
    grid-row: 1 / -1;
    grid-template-rows: subgrid;
    height: auto;
    min-height: 0;
  }
  .pane.side.barred > .panel > * > [data-pane-bar] {
    grid-row: 1;
  }
  .pane.side.barred > .panel > * > :not([data-pane-bar]) {
    grid-row: 2;
    min-height: 0;
  }
  /* The editor scrolls itself already; the Outline's tree does here, under its filter. */
  .pane.side.barred > .panel > .outline > :not([data-pane-bar]) {
    overflow: auto;
  }
  /* Under the bars, the Source's first line has the editor's 12px of padding over it and half its
     line's leading inside it. The other panes' first text stands level with that: the Script's
     page and Compare's first box (a page's margin above its first line belongs to the page), the
     Preview's first line (its sheet starts at the top), and the first row or words of the rest. */
  .pane.side :is(.script-host, .compare-host) {
    padding-top: calc(12px + 2px * var(--text-scale, 1));
  }
  .pane.side .preview {
    padding-top: 0;
  }
  .pane.side .preview .sheet {
    padding-top: calc(11px + 2px * var(--text-scale, 1));
  }
  .pane.side .panel > * > .empty:first-child {
    padding-top: 12px;
  }
  .pane.side .problems > .problem:first-child {
    padding-top: 7px;
  }
  /* As tall as the element bar, so neither stretches the other. */
  .pane.side .outline > .tools {
    padding-block: 0;
  }
}
</style>
