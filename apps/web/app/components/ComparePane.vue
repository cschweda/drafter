<script setup lang="ts">
import { buildPage, speechRoles } from '@drafter/render-html';
import '@drafter/render-html/style.css';
import { draftName } from '@drafter/history';
import { markPage } from '~/compare/draw';
import { useCompare } from '~/compare/use-compare';
import { wholeLabel } from '~/cuts/labels';
import type { CutRow } from '~/cuts/store';
import { useCuts } from '~/cuts/use-cuts';
import { stepLine } from '~/drafts/steps';
import { useDraftSteps } from '~/drafts/use-steps';
import { sayOutline } from '~/outline/notice';

// The Compare tab (Phase 2 design §11.2): the Changes list above the view the slim bar chose
// (version-history design §5.1): the Changes view (`DiffView`), or the newer version's pages, drawn
// with `buildPage` and marked by `markPage` (Call 17). Read-only: nothing here edits. N and Shift+N
// go to the next and previous change while focus is in the tab (Call 21); a change gets focus and
// its label is said once. On a phone the Changes list is a collapsed `<details>` at the top. A step
// of Draft by draft (drafts-and-cuts design §2.4) leads with its own bar, the step and its numbers
// with Previous step and Next step (in the pane, not the slim bar, which folds its tools behind ⋯
// at most widths), and lists, beside the changes, the cuts made while writing its later draft
// (from Cuts, §3), with Show in Cuts for the list grouped by draft.

const compare = useCompare();
const { current, pages, view, layout, stops, groupList, layoutFailed, draftStep } = compare;
const cuts = useCuts();
const steps = useDraftSteps();
/** The step shown, as counted for Draft by draft, or null. */
const shownStep = computed(() => {
  const index = steps.shownStep.value;
  return index === null ? null : (steps.steps.value[index] ?? null);
});
const firstStep = computed(() => steps.shownStep.value === 0);
const lastStep = computed(() => current.value?.newer.at === null);

/** The cuts made while writing the step's later draft, newest first; most shown here, all in Cuts. */
const stepCuts = computed(() => {
  const step = draftStep.value;
  if (!step) return [];
  return cuts.rows.value.filter((row) => row.cuts.some((c) => c.draft === step.to));
});
const STEP_CUTS_SHOWN = 12;
const opening = computed(() => (current.value?.kind === 'markdown' ? 'the opening' : 'a scene'));
/** "Whole scene", or "From INT. HALL - DAY": what a cut was, in a few words. */
const cutKind = (row: CutRow) =>
  wholeLabel(row) ?? `From ${row.where.within?.heading || opening.value}`;
const wide = useWideScreen();
const diffView = ref<{
  revealChange(change: number): Promise<HTMLElement | null>;
  focusHeading(heading: string): Promise<boolean>;
  focusGroup(index: number): Promise<boolean>;
}>();

/**
 * The Changes list's entries: in the Changes view one per group (a rename across the script lists
 * its scenes, not each line), going to the group's header; in Pages one per change.
 */
const entries = computed(() =>
  view.value === 'changes'
    ? groupList.value.map((entry) => ({
        label: entry.label,
        go: () => compare.goToListedGroup(entry),
      }))
    : stops.value.map((stop, i) => ({ label: stop.label, go: () => compare.go(i) })),
);

const root = ref<HTMLElement>();
const sheet = ref<HTMLElement>();
const probe = ref<HTMLElement>();
const columns = computed(() => pages.value?.template.page.width ?? 85);

/** The desk around the pages, in pixels, as the Script pane's. */
const GUTTER = 24;

/** Fit width, as the Script pane's: CSS `zoom`, so a page fills the pane and the layout never changes. */
function applyZoom() {
  if (!root.value || !probe.value || !sheet.value) return;
  const natural = probe.value.getBoundingClientRect().width;
  const room = root.value.clientWidth - 2 * GUTTER;
  const scale = natural > 0 && room > 0 ? room / natural : 1;
  sheet.value.style.zoom = scale === 1 ? '' : String(scale);
  // The gaps between the pages are inside the zoom: divided by it, they stay 24px on the screen.
  sheet.value.style.setProperty('--scale', String(scale));
}

function draw() {
  const el = sheet.value;
  if (!el) return;
  const drawn = pages.value;
  el.replaceChildren();
  if (!drawn) return;
  const roles = speechRoles(drawn.template);
  for (const page of drawn.layout.pages) {
    const built = buildPage(document, page, drawn.template, roles);
    markPage(built, page.number, drawn.marks);
    el.append(built);
  }
  applyZoom();
  void focusPending();
}

/** Puts focus on the change Next change or the Changes list asked for, once it is drawn, and says it. */
async function focusPending() {
  if (!compare.pendingFocus.value) return;
  await nextTick();
  const index = compare.at.value;
  const stop = index === null ? undefined : stops.value[index];
  if (!stop) return;
  const target =
    view.value === 'changes'
      ? await diffView.value?.revealChange(stop.stop.change)
      : sheet.value?.querySelector<HTMLElement>(`[data-change="${stop.stop.change}"]`);
  if (!target) return;
  compare.pendingFocus.value = false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center' });
  void sayOutline(stop.label);
}

/** Keys that would edit text somewhere: a character, Backspace, Delete, and Enter off a button. */
function edits(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey) return false;
  if (event.key === 'Backspace' || event.key === 'Delete') return true;
  if (event.key === 'Enter') return !(event.target as Element | null)?.closest('button, summary');
  return event.key.length === 1 && event.key !== ' ';
}

// N and Shift+N, while focus is anywhere in the tab, its panel included (the tab has no text input).
// Compare is read-only, so the other editing keys do nothing here (Space and Enter still press a
// button).
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (
    (event.key === 'n' || event.key === 'N') &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault();
    compare.step(event.shiftKey ? -1 : 1);
    return;
  }
  if (edits(event)) event.preventDefault();
}

let panel: HTMLElement | null = null;
let observer: ResizeObserver | undefined;
onMounted(() => {
  panel = root.value?.closest<HTMLElement>('[role="tabpanel"]') ?? root.value ?? null;
  panel?.addEventListener('keydown', onKeydown);
  observer = new ResizeObserver(() => {
    applyZoom();
    compare.paneWidth.value = root.value?.clientWidth ?? 0;
  });
  if (root.value) observer.observe(root.value);
  if (probe.value) observer.observe(probe.value);
  draw();
});
onBeforeUnmount(() => {
  panel?.removeEventListener('keydown', onKeydown);
  observer?.disconnect();
});

watch(pages, draw);
watch([compare.pendingFocus, compare.at, view, stops], () => void focusPending());

/** Opened at a scene (from History of this scene): its group's header gets focus. */
async function focusScene() {
  const heading = compare.focusScene.value;
  if (heading === null || view.value !== 'changes' || !diffView.value) return;
  compare.focusScene.value = null;
  await diffView.value.focusHeading(heading);
}
watch([compare.focusScene, diffView], () => void focusScene(), { flush: 'post' });

/** The Changes list's group entry: its header gets focus. */
async function focusListedGroup() {
  const index = compare.pendingGroup.value;
  if (index === null || view.value !== 'changes' || !diffView.value) return;
  compare.pendingGroup.value = null;
  await diffView.value.focusGroup(index);
}
watch([compare.pendingGroup, diffView], () => void focusListedGroup(), { flush: 'post' });
</script>

<template>
  <div ref="root" class="compare-host">
    <template v-if="current">
      <div v-if="draftStep" role="group" aria-labelledby="compare-step-name" class="changes step-bar">
        <p class="step-text">
          <span id="compare-step-name" class="step-name">
            {{ draftName(draftStep.from) }} <span aria-hidden="true">→</span
            ><span class="sr-only">to</span>
            {{ current.newer.at === null ? 'now' : draftName(draftStep.to) }}
          </span>
          <span v-if="shownStep" class="step-numbers">{{
            stepLine(shownStep, steps.kind.value)
          }}</span>
        </p>
        <div class="step-buttons">
          <button
            type="button"
            class="step-button"
            :aria-disabled="firstStep ? 'true' : undefined"
            @click="steps.walk(-1)"
          >
            <UIcon name="i-lucide-chevron-left" aria-hidden="true" />Previous step
          </button>
          <button
            type="button"
            class="step-button"
            :aria-disabled="lastStep ? 'true' : undefined"
            @click="steps.walk(1)"
          >
            Next step<UIcon name="i-lucide-chevron-right" aria-hidden="true" />
          </button>
        </div>
      </div>
      <details v-if="!wide" class="changes">
        <summary>Changes ({{ entries.length }})</summary>
        <ul v-if="entries.length > 0">
          <li v-for="(entry, i) in entries" :key="i">
            <button type="button" class="change" @click="entry.go()">{{ entry.label }}</button>
          </li>
        </ul>
      </details>
      <section v-else class="changes" aria-labelledby="compare-changes-title">
        <h2 id="compare-changes-title" class="changes-title">Changes</h2>
        <ul v-if="entries.length > 0">
          <li v-for="(entry, i) in entries" :key="i">
            <button type="button" class="change" @click="entry.go()">{{ entry.label }}</button>
          </li>
        </ul>
      </section>
      <component
        :is="wide ? 'section' : 'details'"
        v-if="draftStep"
        class="changes step-cuts"
        aria-labelledby="compare-step-cuts-title"
      >
        <component :is="wide ? 'h2' : 'summary'" id="compare-step-cuts-title" class="changes-title">
          Cut while writing {{ draftName(draftStep.to) }} ({{ stepCuts.length }})
        </component>
        <p v-if="stepCuts.length === 0" class="none">
          Nothing was kept in Cuts while writing {{ draftName(draftStep.to) }}.
        </p>
        <ul v-else>
          <li v-for="row in stepCuts.slice(0, STEP_CUTS_SHOWN)" :key="row.id" class="cut">
            <span class="cut-title">{{ row.title || 'Untitled cut' }}</span>
            <span class="cut-kind">{{ cutKind(row) }}</span>
          </li>
        </ul>
        <p v-if="stepCuts.length > STEP_CUTS_SHOWN" class="none">
          And {{ (stepCuts.length - STEP_CUTS_SHOWN).toLocaleString('en-US') }} more.
        </p>
        <button
          v-if="stepCuts.length > 0"
          type="button"
          class="change show-cuts"
          @click="cuts.showDraft(draftStep.to)"
        >
          Show in Cuts
        </button>
      </component>
      <DiffView
        v-if="view === 'changes'"
        ref="diffView"
        :model="current.model"
        :kind="current.kind"
        :layout="layout"
        :labels="{ before: current.older.label, after: current.newer.label }"
        @go="compare.goToGroup"
      />
      <template v-else>
        <p v-if="current.changes.length === 0" class="note">
          No changes: the two versions are the same.
        </p>
        <p v-else-if="layoutFailed" class="note">
          The pages couldn’t be laid out. The Changes view shows every change.
        </p>
        <p v-else-if="!pages" role="status" class="note">Laying out the pages…</p>
      </template>
    </template>
    <div
      ref="probe"
      class="drafter-script probe"
      :style="{ '--cols': columns }"
      aria-hidden="true"
    />
    <section
      v-show="view === 'pages'"
      ref="sheet"
      class="drafter-script pages on-sheet"
      aria-label="The newer version"
    />
  </div>
</template>

<style scoped>
.compare-host {
  position: relative;
  height: 100%;
  padding: 24px;
  box-sizing: border-box;
  overflow: auto;
  background: var(--desk);
  color: var(--text);
}
.changes {
  margin: 0 auto 12px;
  max-width: 48rem;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--raised);
  font-size: 13px;
}
.changes summary {
  font-weight: 700;
  cursor: pointer;
}
.changes-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 700;
}
.changes ul {
  max-height: 12rem;
  margin: 4px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.change {
  width: 100%;
  min-height: 24px;
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.change:hover {
  background: var(--surface);
}
.step-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
}
.step-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  margin: 0;
}
.step-name {
  font-weight: 700;
}
.step-numbers {
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.step-buttons {
  display: flex;
  gap: 4px;
}
.step-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.step-button:hover {
  background: var(--overlay);
}
.step-button:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.step-button[aria-disabled='true'] {
  cursor: not-allowed;
  color: var(--muted);
}
.step-cuts .none {
  margin: 4px 0 0;
  color: var(--muted);
}
.step-cuts .cut {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  padding: 2px 6px;
}
.cut-title {
  min-width: 0;
  overflow-wrap: anywhere;
}
.cut-kind {
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.show-cuts {
  width: auto;
  margin-top: 4px;
  font-weight: 600;
}
.note {
  margin: 0 auto 12px;
  max-width: 48rem;
  color: var(--muted);
  font-size: 13px;
}
.probe {
  position: absolute;
  width: calc(var(--cols) * 1ch);
  height: 0;
  visibility: hidden;
  pointer-events: none;
}
.pages {
  width: max-content;
  margin: 0 auto;
}
.pages :deep(.drafter-page) {
  /* Paper on the desk, as the Script pane's (design §4): 24px apart whatever the zoom, a hairline
     and a soft shadow. */
  margin-bottom: calc(24px / var(--scale, 1));
  box-shadow:
    0 0 0 1px var(--sheet-edge),
    var(--sheet-shadow);
}
/* Printed, a page is the paper itself: no hairline or shadow. */
@media print {
  .pages :deep(.drafter-page) {
    border: 0;
    box-shadow: none;
  }
}
.pages :deep(.compare-mark:focus-visible),
.pages :deep(.compare-mark:focus) {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.pages :deep(.compare-star) {
  font-weight: bold;
}
/* A thin rule in the blank row above the line the lines were before (or on that row's edge), with
   its button in the left margin; the lines it shows open to the button's right from the next row
   edge, a whole number of rows high, so the box never cuts a line in two (`gapPlace`). */
.pages :deep(.compare-gap) {
  position: absolute;
  top: calc(var(--row) * var(--line) - 1px);
  left: 1ch;
  right: 1ch;
  height: 0;
  display: flex;
  align-items: flex-start;
  border-top: 1px dashed currentColor;
  z-index: 1;
}
.pages :deep(.compare-gap-button) {
  flex: none;
  transform: translateY(-50%);
  padding: 0 4px;
  border: 1px solid currentColor;
  border-radius: 3px;
  background: var(--drafter-page);
  color: inherit;
  font: 600 9pt/1.4 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.pages :deep(.compare-gap-lines) {
  flex: 1;
  min-width: 0;
  margin: calc(var(--drop) * var(--line)) 0 0 8px;
  padding: 0 8px;
  box-shadow:
    0 0 0 1px currentColor,
    0 2px 6px rgb(0 0 0 / 20%);
  background: var(--drafter-page);
}
.pages :deep(.compare-gap-lines ins),
.pages :deep(.compare-gap-lines del) {
  display: block;
  line-height: var(--line);
  white-space: pre-wrap;
}
.pages :deep(.compare-gap-lines ins) {
  text-decoration: none;
}
.pages :deep(.change-said) {
  -webkit-user-select: none;
  user-select: none;
}
</style>
