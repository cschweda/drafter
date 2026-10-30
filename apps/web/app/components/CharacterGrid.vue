<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { showScaffold } from '~/scaffold/show';
import { columnSceneId, type GridView, goToCell } from '~/stats/grid-data';
import { type GridPlace, gridKey, holdStop } from '~/stats/grid-keys';
import { cellName } from '~/stats/grid-labels';
import { useDrawnColumns } from '~/stats/grid-window';

// The character-by-scene grid (seeing-the-script design §4.4): a row per character, in the
// Characters table's order, and a column per scene. A cell holds the character's speeches there,
// shaded in four steps that only repeat the number; a dot is a scene they're in and silent; an
// empty cell is a scene they're not in, outlined when it is part of a long absence. The ARIA grid
// pattern: one Tab stop (the cell last focused), arrows, Home and End along a row, Ctrl+Home and
// Ctrl+End to the corners, Page Up and Page Down by ten scenes, Enter to the cue (or the first
// mention, for a silent cell), and the context-menu key or Shift+F10 for the menu. Every row is
// drawn, but only the columns in view and ten each side (Call 21): the grid's own region scrolls,
// with the names and the scene numbers kept in view.
const props = defineProps<{ view: GridView; labelledby: string }>();

/** A column's width in px, which the stylesheet's `--column` matches. */
const COLUMN_PX = 32;

const uid = useId();
const cellId = (row: number, column: number) => `${uid}-${row}-${column}`;
const root = ref<HTMLElement>();
const grid = ref<HTMLElement>();
const rows = computed(() => props.view.model.rows.length);
const columns = computed(() => props.view.model.columns);
/** The cell with the grid's Tab stop. */
const active = ref<GridPlace>({ row: 0, column: 0 });

// ---- The columns drawn ----------------------------------------------------------------------

const scrollLeft = ref(0);
const width = ref(0);
let frame = 0;
function onScroll() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    scrollLeft.value = grid.value?.scrollLeft ?? 0;
  });
}
let observer: ResizeObserver | undefined;
onMounted(() => {
  const el = grid.value;
  if (!el) return;
  width.value = el.clientWidth;
  scrollLeft.value = el.scrollLeft;
  if (typeof ResizeObserver === 'undefined') return;
  observer = new ResizeObserver(() => {
    width.value = el.clientWidth;
  });
  observer.observe(el);
});
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(frame);
});

/**
 * The columns drawn: those in view and ten each side, and the focused cell's, in order; the same
 * list while a scroll stays inside one column, so the cells aren't made again for it.
 */
const focusedColumn = computed(() => active.value.column);
const drawn = useDrawnColumns(scrollLeft, width, COLUMN_PX, columns, focusedColumn);

// ---- The cells --------------------------------------------------------------------------------

/** Each row's long absences, as the columns they span. */
const gapsByRow = computed(() => {
  const byRow: Array<Array<{ from: number; to: number }>> = props.view.model.rows.map(() => []);
  for (const gap of props.view.model.gaps) byRow[gap.row]?.push({ from: gap.from, to: gap.to });
  return byRow;
});

interface DrawnCell {
  column: number;
  text: string;
  name: string;
  classes: string[];
}

const drawnRows = computed(() =>
  props.view.model.rows.map((_, row) => {
    const name = props.view.names[row] ?? '';
    const gaps = gapsByRow.value[row] ?? [];
    return drawn.value.map((column): DrawnCell => {
      const cell = props.view.model.cell(row, column);
      const classes: string[] = [];
      const shade = cell ? props.view.model.shade(cell.speeches) : 0;
      if (shade > 0) classes.push(`shade-${shade}`);
      const gap = cell ? undefined : gaps.find((g) => column >= g.from && column <= g.to);
      if (gap) {
        classes.push('gap');
        if (column === gap.from) classes.push('gap-start');
        if (column === gap.to) classes.push('gap-end');
      }
      return {
        column,
        text: !cell ? '' : cell.silent ? '·' : String(cell.speeches),
        name: cellName(name, props.view.numbers[column] ?? '', cell),
        classes,
      };
    });
  }),
);

// ---- Focus: one Tab stop, the cell last focused ---------------------------------------------

/** The character whose row has the Tab stop: a new cast may rank them elsewhere. */
let activeKey: string | undefined;
watch(
  active,
  (place) => {
    activeKey = props.view.model.rows[place.row];
  },
  { immediate: true, flush: 'sync' },
);
// A new cast keeps the Tab stop on the same character, wherever they now rank, and on a cell that
// is still there when the script shrank; focus in the grid follows it once the rows are drawn.
watch(
  () => [props.view.model.rows, columns.value] as const,
  ([keys, c]) => {
    const { key, place: next } = holdStop(activeKey, active.value, keys, c);
    const hadFocus = !!grid.value?.contains(document.activeElement);
    if (next.row !== active.value.row || next.column !== active.value.column) active.value = next;
    // A character who is gone hands the stop to whoever has the row now, for the next cast.
    activeKey = key;
    if (hadFocus) void nextTick(() => focusHere());
  },
);
/** Focus on the Tab stop's cell, where it is, scrolling nothing. */
function focusHere() {
  const { row, column } = active.value;
  document.getElementById(cellId(row, column))?.focus({ preventScroll: true });
}
/**
 * A click on a header, the corner, or between cells focuses the grid itself, where the arrows do
 * nothing: focus goes on to the Tab stop's cell.
 */
function onGridFocus(event: FocusEvent) {
  if (event.target === grid.value) focusHere();
}
const isActive = (row: number, column: number) =>
  active.value.row === row && active.value.column === column;

async function focusCell(place: GridPlace) {
  active.value = place;
  await nextTick();
  const el = document.getElementById(cellId(place.row, place.column));
  el?.focus({ preventScroll: true });
  // The grid's scroll padding keeps it clear of the names and the scene numbers.
  el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

function onKeydown(event: KeyboardEvent, row: number, column: number) {
  if (event.altKey) return;
  const key = event.key === 'F10' && event.shiftKey ? 'ContextMenu' : event.key;
  if (event.shiftKey && key !== 'ContextMenu') return;
  const next = gridKey(
    { rows: rows.value, columns: columns.value },
    { row, column },
    key,
    event.ctrlKey || event.metaKey,
  );
  if (next === null) return;
  event.preventDefault();
  if (next === 'enter') goToCell(props.view, row, column);
  else if (next === 'menu') openMenu(row, column);
  else void focusCell(next);
}

// ---- The menu: Go to, and Scaffold for this scene ------------------------------------------

const menuFor = shallowRef<GridPlace | null>(null);
const menuPlace = shallowRef({ left: '0px', top: '0px', width: '0px', height: '0px' });
let afterMenu: (() => void) | null = null;

function openMenu(row: number, column: number) {
  const el = document.getElementById(cellId(row, column));
  const box = root.value?.getBoundingClientRect();
  if (!el || !box) return;
  const at = el.getBoundingClientRect();
  menuPlace.value = {
    left: `${at.left - box.left}px`,
    top: `${at.top - box.top}px`,
    width: `${at.width}px`,
    height: `${at.height}px`,
  };
  active.value = { row, column };
  menuFor.value = { row, column };
}

function onContextmenu(event: MouseEvent, row: number, column: number) {
  event.preventDefault();
  void focusCell({ row, column }).then(() => openMenu(row, column));
}

function setMenu(open: boolean) {
  if (!open) menuFor.value = null;
}

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    else void focusCell(active.value);
  });
}
const MENU_CONTENT = { align: 'start' as const, onCloseAutoFocus: onMenuCloseAutoFocus };

const menuName = computed(() => {
  const at = menuFor.value;
  if (!at) return 'Actions';
  return `Actions for ${props.view.names[at.row] ?? ''} in scene ${props.view.numbers[at.column] ?? ''}`;
});

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const at = menuFor.value;
  if (!at) return [];
  const later = (act: () => void) => () => {
    afterMenu = act;
  };
  return [
    [
      {
        label: 'Go to',
        icon: 'i-lucide-arrow-right',
        onSelect: later(() => goToCell(props.view, at.row, at.column)),
      },
      {
        label: 'Scaffold for this scene',
        icon: 'i-lucide-users',
        onSelect: later(() => scaffoldFor(at.column)),
      },
    ],
  ];
});

/** Scaffold for this scene: the column's scene, by its id, pinned. */
function scaffoldFor(column: number) {
  const id = columnSceneId(props.view, column);
  if (id) showScaffold({ kind: 'scene', pinned: id });
}

const gridWidth = computed(() => `calc(var(--head) + ${columns.value * COLUMN_PX}px)`);
</script>

<template>
  <div ref="root" class="holder">
    <div
      ref="grid"
      class="grid"
      role="grid"
      :aria-labelledby="labelledby"
      :aria-rowcount="rows + 1"
      :aria-colcount="columns + 1"
      tabindex="-1"
      @focus="onGridFocus"
      @scroll.passive="onScroll"
    >
      <div class="row head" role="row" aria-rowindex="1" :style="{ width: gridWidth }">
        <div class="name corner" role="columnheader" aria-colindex="1">Character</div>
        <div
          v-for="column in drawn"
          :key="column"
          class="scene"
          role="columnheader"
          :aria-colindex="column + 2"
          :title="view.index.scenes[column]?.heading || undefined"
          :style="{ left: `calc(var(--head) + ${column * COLUMN_PX}px)` }"
        >
          {{ view.numbers[column] }}
        </div>
      </div>
      <div
        v-for="(cells, row) in drawnRows"
        :key="view.model.rows[row]"
        class="row"
        role="row"
        :aria-rowindex="row + 2"
        :style="{ width: gridWidth }"
      >
        <div class="name" role="rowheader" aria-colindex="1" :title="view.names[row]">
          {{ view.names[row] }}
        </div>
        <div
          v-for="cell in cells"
          :id="cellId(row, cell.column)"
          :key="cell.column"
          class="cell"
          :class="cell.classes"
          role="gridcell"
          :aria-colindex="cell.column + 2"
          :aria-label="cell.name"
          :tabindex="isActive(row, cell.column) ? 0 : -1"
          :style="{ left: `calc(var(--head) + ${cell.column * COLUMN_PX}px)` }"
          @click="focusCell({ row, column: cell.column })"
          @focus="active = { row, column: cell.column }"
          @keydown="onKeydown($event, row, cell.column)"
          @contextmenu="onContextmenu($event, row, cell.column)"
        >
          {{ cell.text }}
        </div>
      </div>
    </div>
    <MenuButton :open="menuFor !== null" :items="menuItems" :content="MENU_CONTENT" @update:open="setMenu">
      <!-- The menu's anchor, over the cell it is for: never focused, and named for the menu. -->
      <button type="button" class="menu-anchor" tabindex="-1" aria-hidden="true" :style="menuPlace">
        <span v-if="menuFor !== null" class="sr-only">{{ menuName }}</span>
      </button>
    </MenuButton>
  </div>
</template>

<style scoped>
.holder {
  position: relative;
  --head: 8.5rem;
  --column: 32px;
  --row: 28px;
}
@media (max-width: 640px) {
  .holder {
    --head: 6rem;
  }
}
.grid {
  /* Its own scrolling region, both ways; the cells are placed in it, so their hidden words never
     widen the page. The scroll padding keeps a focused cell clear of the names and numbers. */
  position: relative;
  max-height: min(70vh, 34rem);
  overflow: auto;
  scroll-padding: var(--row) 0 0 var(--head);
  border: 1px solid var(--line);
  font-variant-numeric: tabular-nums;
}
.row {
  position: relative;
  height: var(--row);
}
.head {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.name {
  position: sticky;
  left: 0;
  z-index: 1;
  box-sizing: border-box;
  width: var(--head);
  height: var(--row);
  padding: 0 8px;
  overflow: hidden;
  background: var(--bg);
  border-right: 1px solid var(--line);
  line-height: var(--row);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.corner {
  z-index: 3;
  color: var(--muted);
}
.scene,
.cell {
  position: absolute;
  top: 0;
  box-sizing: border-box;
  width: var(--column);
  height: var(--row);
  line-height: var(--row);
  text-align: center;
}
.scene {
  color: var(--muted);
}
.cell {
  border: 1px solid transparent;
  color: var(--text);
  cursor: default;
}
.cell.shade-1 {
  background: var(--grid-shade-1);
  color: var(--grid-ink);
}
.cell.shade-2 {
  background: var(--grid-shade-2);
  color: var(--grid-ink);
}
.cell.shade-3 {
  background: var(--grid-shade-3);
  color: var(--grid-ink);
}
.cell.shade-4 {
  background: var(--grid-shade-4);
  color: var(--grid-ink);
}
/* A long absence: its empty cells outlined as one band. */
.cell.gap {
  border-top: 2px dashed var(--heading);
  border-bottom: 2px dashed var(--heading);
}
.cell.gap-start {
  border-left: 2px dashed var(--heading);
}
.cell.gap-end {
  border-right: 2px dashed var(--heading);
}
.cell:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
  box-shadow: inset 0 0 0 4px var(--bg);
}
.menu-anchor {
  position: absolute;
  padding: 0;
  border: 0;
  background: none;
  opacity: 0;
  pointer-events: none;
}
@media (forced-colors: active) {
  .cell:focus-visible {
    outline-color: Highlight;
  }
}
</style>
