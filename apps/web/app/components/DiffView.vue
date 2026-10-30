<script setup lang="ts">
import {
  diffWords,
  foldRows,
  openFold,
  type Piece,
  type RowGroup,
  type WordPart,
} from '@drafter/compare';
import { headingKey } from '@drafter/history';
import { type DiffModel, isLarge, openGroups, shownGroups, summaryText } from '~/compare/rows';
import type { DocumentKind } from '~/markdown/kind';

// Compare's Changes view (version-history design §5): the summary over the top, then each group
// with a change (`DiffGroup`), unified or side by side. A group's rows are drawn only while it is
// open; one with more than `LARGE_GROUP` changed lines starts closed, and so does every group past
// the first `ROW_BUDGET` rows (`openGroups`), so a change in every scene opens as fast as one.
// Changed words are diffed when a pair is first drawn, and kept. Colors come from the `--diff-*` tokens (`tokens.css`).

const props = defineProps<{
  model: DiffModel;
  kind: DocumentKind;
  layout: 'unified' | 'split';
  /** The versions' labels, for side by side's column headers: "10:42", "now (10:58)". */
  labels: { before: string; after: string };
}>();

const emit = defineEmits<{ go: [group: RowGroup] }>();

const root = ref<HTMLElement>();
/** The view's prefix for its groups' ids. */
const uid = `diff-${useId()}`;
const groups = computed(() => shownGroups(props.model));
const summary = computed(() => summaryText(props.model.summary, props.kind));
const firstRows = computed(() => new Set(props.model.firstRow));

/** Open groups, by their first row. */
const open = ref(new Set<number>());
/** Groups closed when the view opened because the rows before them reached the budget. */
const waiting = ref(new Set<number>());
/** Each group's pieces once a fold in it was opened. */
const opened = shallowRef(new Map<number, Piece[]>());
/** Each group's pieces as `foldRows` cuts them, made once. */
let folded = new Map<number, Piece[]>();
/** Changed words of each pair, by its removed row's index; null where there are none. */
let words = new Map<number, { removed: WordPart[]; added: WordPart[] } | null>();

function piecesOf(group: RowGroup): Piece[] {
  const made = opened.value.get(group.from);
  if (made) return made;
  let pieces = folded.get(group.from);
  if (!pieces) {
    pieces = foldRows(props.model.rows, group.from, group.to);
    folded.set(group.from, pieces);
  }
  return pieces;
}

/** The rows a group draws open: its rows outside folds, and a button per fold. */
const drawnRows = (group: RowGroup) =>
  piecesOf(group).reduce((n, piece) => n + (piece.kind === 'rows' ? piece.to - piece.from : 1), 0);

watch(
  () => props.model,
  (model) => {
    opened.value = new Map();
    folded = new Map();
    words = new Map();
    const start = openGroups(shownGroups(model), drawnRows);
    open.value = start.open;
    waiting.value = start.waiting;
  },
  { immediate: true },
);

/** Why a closed group is closed, which its body says: too large, or past the budget. */
const closedWhy = (group: RowGroup): 'large' | 'waiting' | null =>
  isLarge(group) ? 'large' : waiting.value.has(group.from) ? 'waiting' : null;

function wordsOf(index: number): WordPart[] | null {
  const { rows } = props.model;
  const row = rows[index];
  if (!row || row.pair === null) return null;
  const removedAt = row.kind === 'removed' ? index : row.pair;
  if (!words.has(removedAt)) {
    const removed = rows[removedAt];
    const added = rows[removed?.pair ?? -1];
    words.set(removedAt, removed && added ? diffWords(removed.text, added.text) : null);
  }
  const parts = words.get(removedAt);
  if (!parts) return null;
  return row.kind === 'removed' ? parts.removed : parts.added;
}

function toggle(group: RowGroup) {
  const next = new Set(open.value);
  if (next.has(group.from)) next.delete(group.from);
  else next.add(group.from);
  open.value = next;
}

/** Opens fold `p` of `group` (200 lines at a time), and puts focus on its first line. */
async function openFoldAt(group: RowGroup, p: number) {
  const pieces = [...piecesOf(group)];
  const fold = pieces[p];
  if (fold?.kind !== 'fold') return;
  pieces.splice(p, 1, ...openFold(fold));
  const next = new Map(opened.value);
  next.set(group.from, pieces);
  opened.value = next;
  await nextTick();
  root.value?.querySelector<HTMLElement>(`[data-row="${fold.from}"]`)?.focus();
}

/** The group holding `change`'s first row. */
const groupOfChange = (change: number) =>
  groups.value.find((g) => g.changes.includes(change)) ?? null;

/** Opens the group of `change` and returns its first row, for Next change to focus. */
async function revealChange(change: number): Promise<HTMLElement | null> {
  const group = groupOfChange(change);
  if (!group) return null;
  if (!open.value.has(group.from)) toggle(group);
  await nextTick();
  return root.value?.querySelector<HTMLElement>(`[data-change="${change}"]`) ?? null;
}

/** Focuses the header of shown group `index` (the Changes list's entry), and scrolls to it. */
async function focusGroup(index: number): Promise<boolean> {
  await nextTick();
  const title = root.value?.querySelectorAll<HTMLElement>('.diff-group-title')[index];
  if (!title) return false;
  title.focus({ preventScroll: true });
  title.scrollIntoView({ block: 'start' });
  return true;
}

/** Focuses the header of the group headed `heading` (its older heading counts, for a renamed one). */
async function focusHeading(heading: string): Promise<boolean> {
  const key = headingKey(heading);
  const index = groups.value.findIndex(
    (g) =>
      g.title === heading ||
      g.renamedFrom === heading ||
      (props.kind === 'fountain' &&
        (headingKey(g.title) === key ||
          (g.renamedFrom !== null && headingKey(g.renamedFrom) === key))),
  );
  if (index < 0) return false;
  return focusGroup(index);
}

defineExpose({ revealChange, focusHeading, focusGroup });
</script>

<template>
  <div ref="root" class="diff-view" :class="`diff-${layout}`" data-view="changes">
    <p class="diff-summary">{{ summary }}</p>
    <DiffGroup
      v-for="(group, i) in groups"
      :key="group.from"
      :group="group"
      :index="i"
      :id-prefix="uid"
      :rows="model.rows"
      :pieces="piecesOf(group)"
      :open="open.has(group.from)"
      :closed-why="closedWhy(group)"
      :layout="layout"
      :labels="labels"
      :kind="kind"
      :first-rows="firstRows"
      :words-of="wordsOf"
      @toggle="toggle(group)"
      @open-fold="(p) => openFoldAt(group, p)"
      @go="emit('go', group)"
    />
  </div>
</template>

<style>
.diff-view {
  max-width: 64rem;
  margin: 0 auto;
  color: var(--ink);
  font-size: 13px;
}
.diff-summary {
  margin: 0 0 12px;
  color: var(--text);
  font: 600 13px/1.5 var(--font-sans);
}
.diff-group {
  margin: 0 0 16px;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
  background: var(--page);
  /* A long diff paints only the groups on screen. */
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
.diff-group-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 6px 10px;
  background: var(--diff-fold-bg);
  border-bottom: 1px solid var(--line);
  font: 13px/1.5 var(--font-sans);
}
.diff-group-title {
  flex: 1 1 12rem;
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.diff-group-title:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.diff-heading {
  font-family: var(--font-mono);
}
.diff-tag {
  margin-left: 8px;
  padding: 0 6px;
  border: 1px solid currentColor;
  border-radius: 4px;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}
.diff-counts {
  display: inline-flex;
  gap: 6px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.diff-count-add {
  color: var(--diff-add-sign);
}
.diff-count-del {
  color: var(--diff-del-sign);
}
.diff-button {
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--ink-muted);
  border-radius: 4px;
  background: var(--page);
  color: var(--ink);
  font: 600 12px/1.5 var(--font-sans);
  cursor: pointer;
}
.diff-large {
  margin: 0;
  padding: 8px 10px;
  font: 13px/1.5 var(--font-sans);
}
.diff-fold {
  display: block;
  width: 100%;
  min-height: 24px;
  padding: 2px 10px;
  border: 0;
  border-block: 1px solid var(--line);
  background: var(--diff-fold-bg);
  color: var(--ink);
  font: 600 12px/1.5 var(--font-sans);
  text-align: left;
  cursor: pointer;
}
.diff-fold:focus-visible,
.diff-row:focus-visible,
.diff-cell:focus-visible,
.diff-button:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.diff-row,
.diff-cell {
  font: 13px/1.5 var(--font-mono);
}
.diff-cell {
  padding: 0;
  vertical-align: top;
}
.diff-line {
  display: grid;
  grid-template-columns: 3.5em 3.5em 1.5em minmax(0, 1fr);
}
.diff-cell .diff-line {
  grid-template-columns: 3.5em 1.5em minmax(0, 1fr);
}
.diff-num {
  padding-right: 8px;
  color: var(--ink-muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
  user-select: none;
}
.diff-sign {
  font-weight: 700;
  text-align: center;
  user-select: none;
}
.diff-text {
  min-height: 1.5em;
  padding-right: 8px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
/* The tint behind a changed row, and the bar at its left edge. */
.diff-row.added,
.diff-cell.added {
  background: var(--diff-add-bg);
  box-shadow: inset 3px 0 var(--diff-add-sign);
}
.diff-row.removed,
.diff-cell.removed {
  background: var(--diff-del-bg);
  box-shadow: inset 3px 0 var(--diff-del-sign);
}
.added .diff-sign {
  color: var(--diff-add-sign);
}
.removed .diff-sign {
  color: var(--diff-del-sign);
}
/* Changed words: a stronger tint, and underlined or struck through, so color is never alone. */
.diff-word-add {
  background: var(--diff-add-word);
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}
.diff-word-del {
  background: var(--diff-del-word);
  text-decoration: line-through;
  text-decoration-thickness: 2px;
}
.diff-split {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.diff-split th {
  padding: 4px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--ink);
  font: 600 12px/1.5 var(--font-sans);
  text-align: left;
}
.diff-split td {
  border-left: 1px solid var(--line);
}
.diff-split td:first-child {
  border-left: 0;
}
.diff-version {
  color: var(--ink-muted);
  font-weight: 400;
}
.diff-fold-cell {
  padding: 0;
}
</style>
