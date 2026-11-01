<script setup lang="ts">
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { problemsLabel, useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { wordsLabel } from '~/markdown/preview';
import { useMarkdown } from '~/markdown/use-markdown';
import { useModuleTabs } from '~/modules/host';
import type { TabId } from '~/utils/panes';
import { TOOLS_COMPACT } from '~/utils/tools';

// The active view's few tools (fresh-look design §3.3, Call 15): the Script's page, Changes, and
// Fit · 100%; the Outline's and the Cards' counts and sizes; Scaffold's Back,
// Follow, and Pages; Compare's, Cuts', and the drafts' own. One component, so the Inspector's header
// stays one component and each view keeps its tools' code (OutlineSlim, CardsSlim, …). On a wide
// screen it sits in the header's `#inspector-tools` (INSPECTOR_TOOLS_ID), and folds into the
// header's "⋯" when the header is too narrow; on a phone it is the one pane's slim bar.

const props = defineProps<{
  selected: TabId;
  /** The header has put the tools icon-only: their labels are their tooltips (ToolButton). */
  compact?: boolean;
}>();
provide(
  TOOLS_COMPACT,
  computed(() => !!props.compact),
);

const { kind } = useEditor();
const markdown = computed(() => kind.value === 'markdown');
const { words, updating: previewing } = useMarkdown();
const { page, updating } = useLayout();
const zoom = useScriptZoom();
// "Fit" is short for its name, Fit width (design §3.3's Fit · 100%).
const ZOOM_OPTIONS = [
  { value: 'fit', label: 'Fit', name: 'Fit width' },
  { value: 'full', label: '100%' },
] as const;

const { problems, count, canFixAll, fixAll } = useProblems();
const suggestions = computed(() => problems.value.filter((p) => p.severity === 'info').length);
// Advice (info) isn't counted as a problem, so it's named apart. The pane itself says there are
// no checks for a Markdown document.
const problemsSummary = computed(() =>
  markdown.value
    ? ''
    : problemsLabel(count.value) +
      (suggestions.value > 0
        ? ` · ${suggestions.value} ${suggestions.value === 1 ? 'suggestion' : 'suggestions'}`
        : ''),
);
// The button goes when nothing is left to fix, and focus with it: it goes to the panel.
function onFixAll() {
  fixAll();
  document.getElementById('panel-problems')?.focus();
}

const moduleTabs = useModuleTabs();
const moduleTab = computed(() => moduleTabs.value.find((tab) => tab.id === props.selected));
</script>

<template>
  <!-- "Updating…" comes first: the tools sit at the header's right, so a word that comes and goes
       moves only what is left of it, never a button under the pointer. -->
  <template v-if="props.selected === 'script' && markdown">
    <span v-if="previewing" class="updating">Updating…</span>
    <span class="page">{{ wordsLabel(words) }}</span>
  </template>
  <template v-else-if="props.selected === 'script'">
    <span v-if="updating" class="updating">Updating…</span>
    <span class="page">{{ pageLabel(page) }}</span>
    <ChangesToggle />
    <span class="spacer" />
    <DSegmented v-model="zoom" label="Zoom" :options="ZOOM_OPTIONS" />
  </template>
  <template v-else-if="moduleTab">
    <span>{{ moduleTab.module.name }}</span>
  </template>
  <OutlineSlim v-else-if="props.selected === 'outline'" />
  <CardsSlim v-else-if="props.selected === 'cards'" />
  <NotesSlim v-else-if="props.selected === 'notes'" />
  <ScaffoldSlim v-else-if="props.selected === 'scaffold'" />
  <CompareSlim v-else-if="props.selected === 'compare'" />
  <CutsSlim v-else-if="props.selected === 'cuts'" />
  <DraftsSlim v-else-if="props.selected === 'drafts'" tab="drafts" />
  <DraftsSlim v-else-if="props.selected === 'draft'" tab="draft" />
  <DraftStepsSlim v-else-if="props.selected === 'draft-steps'" />
  <template v-else-if="props.selected === 'problems'">
    <span v-if="problemsSummary">{{ problemsSummary }}</span>
    <template v-if="canFixAll">
      <span class="spacer" />
      <ToolButton icon="i-lucide-wand-sparkles" label="Fix all" class="fix-all" @click="onFixAll" />
    </template>
  </template>
</template>
