<script lang="ts">
import { shallowRef } from 'vue';

/**
 * The place last focused this visit, by row key and unit id (`HEAD` for the row's header): the
 * grid's tab stop while it is drawn.
 */
const lastFocused = shallowRef<{ key: string | null; id: string } | null>(null);
/** A header's id in `lastFocused`: no unit's id starts with `@`. */
const HEAD = '@header';
</script>

<script setup lang="ts">
import type { MoveTarget } from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { runMove } from '~/outline/move';
import { useOutline } from '~/outline/use-outline';
import { opensMenu } from '~/strip/keys';
import { LABEL_MIN_PX } from '~/strip/labels';
import { blockMenuItems } from '~/threads/block-menu';
import { openThreadEdit } from '~/threads/dialogs';
import { HEADER, nextCell, stopIndex } from '~/threads/grid-keys';
import {
  blockName,
  cardLines,
  laneMarks,
  noThreadsYet,
  nothingYet,
  unitTitle,
} from '~/threads/lane-labels';
import { threadMenuItems } from '~/threads/thread-menu';
import { useLaneView } from '~/threads/use-lane-view';
import { useThreads } from '~/threads/use-threads';

// The Lanes (threads design §7.3, §7.5): a row per thread along the work, then No thread, each
// block a scene or passage at its place and length (4 px at least), tinted with its thread's color
// and labeled where it fits; the cursor's unit is outlined in every row. One ARIA grid, one Tab
// stop: the arrows, Home, and End move (`nextCell`, Left from a row's first block to its header),
// Enter or a click goes there (a first tap on a touch screen only focuses), and the context-menu
// key, Shift+F10, a right-click, or the ⋯ the focused block shows opens the block's menu. A row
// header's menu (Enter, Shift+F10, a click) has the thread's own edits. Escape hides the card. Placed by percentages, so a resize redraws nothing but the labels.

const threads = useThreads();
const outline = useOutline();
const { lanes, rows, noun, current } = useLaneView();

const root = ref<HTMLElement | null>(null);
const track = ref<HTMLElement | null>(null);
const width = shallowRef(0);
let observer: ResizeObserver | undefined;
onMounted(() => {
  observer = new ResizeObserver((entries) => {
    for (const entry of entries) width.value = entry.contentRect.width;
  });
  watch(
    track,
    (el, old) => {
      if (old) observer?.unobserve(old);
      if (el) {
        width.value = el.clientWidth;
        observer?.observe(el);
      }
    },
    { immediate: true },
  );
});
onBeforeUnmount(() => observer?.disconnect());

const pct = (n: number) => `${n * 100}%`;

const drawn = computed(() => {
  const now = lanes.value;
  if (!now || now.total <= 0) return [];
  return rows.value.map((row) => ({
    ...row,
    blocks: row.units.map((i) => {
      const u = now.units[i] as (typeof now.units)[number];
      const share = u.length / now.total;
      const tint = row.swatch
        ? `color-mix(in srgb, ${row.swatch} ${u.inherited ? 15 : 35}%, var(--page))`
        : undefined;
      return {
        index: i,
        id: u.id,
        name: blockName(u, now, noun.value),
        title: unitTitle(u, noun.value),
        /** Near the right end, the ⋯ goes on the block's left, inside the view. */
        moreLeft: u.from / now.total > 0.85,
        label: share * width.value >= LABEL_MIN_PX ? u.label : '',
        inherited: !!u.inherited,
        style: {
          left: `min(${pct(u.from / now.total)}, calc(100% - 4px))`,
          width: pct(share),
          ...(tint ? { background: tint, borderLeftColor: row.swatch as string } : {}),
        },
      };
    }),
  }));
});

const marks = computed(() => (lanes.value ? laneMarks(lanes.value, width.value) : []));

// ---- Focus: one Tab stop --------------------------------------------------------------------

/** The tab stop: the block last focused if drawn, else the cursor's unit's first block, else the first. */
const tabStop = computed(() => {
  const all = drawn.value;
  const last = lastFocused.value;
  if (last) {
    const r = all.findIndex((row) => row.key === last.key);
    if (r >= 0 && last.id === HEAD && last.key !== null) return { row: r, id: HEAD };
    if (r >= 0 && all[r]?.blocks.some((b) => b.id === last.id)) return { row: r, id: last.id };
  }
  const here = current.value;
  for (let r = 0; r < all.length; r++) {
    if (here && all[r]?.blocks.some((b) => b.id === here)) return { row: r, id: here };
  }
  const first = all[0]?.blocks[0];
  return first ? { row: 0, id: first.id } : null;
});
const isStop = (r: number, id: string) => tabStop.value?.row === r && tabStop.value.id === id;

const cellId = (r: number, i: number) => `lane-${r}-${i}`;
const cellEl = (r: number, i: number) => document.getElementById(cellId(r, i));

async function focusCell(r: number, i: number) {
  const row = drawn.value[r];
  if (row && i === HEADER) {
    lastFocused.value = { key: row.key, id: HEAD };
    await nextTick();
    headEl(r)?.focus();
    return;
  }
  const u = lanes.value?.units[i];
  if (!row || !u) return;
  lastFocused.value = { key: row.key, id: u.id };
  await nextTick();
  cellEl(r, i)?.focus();
}

/** Focus back on the tab stop, wherever it is now (after a move, the lanes are drawn anew). */
async function focusStop() {
  await nextTick();
  const stop = tabStop.value;
  const i = stop && lanes.value ? stopIndex(lanes.value, stop.id, HEAD) : null;
  if (!stop || i === null || !focusIsFree()) return;
  (i === HEADER ? headEl(stop.row) : cellEl(stop.row, i))?.focus();
}

const MOVES = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

/** Moves focus as `nextCell` says; at an edge the key is still the grid's (the pane doesn't scroll). */
function move(event: KeyboardEvent, r: number, unit: number): boolean {
  const now = lanes.value;
  if (!now || !MOVES.includes(event.key)) return false;
  event.preventDefault();
  const to = nextCell(now, { row: r, unit }, event.key);
  if (to) void focusCell(to.row, to.unit);
  return true;
}

function onKeydown(event: KeyboardEvent, r: number, i: number) {
  const now = lanes.value;
  const u = now?.units[i];
  if (!now || !u) return;
  if (opensMenu(event)) {
    event.preventDefault();
    openMenuFor(r, i);
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    threads.go(u.id);
    return;
  }
  // Escape hides the card (WCAG 1.4.13), and does nothing else while there is one.
  if (event.key === 'Escape' && cardFor.value) {
    event.preventDefault();
    event.stopPropagation();
    cardFor.value = null;
    return;
  }
  move(event, r, i);
}

/**
 * A header's keys, caught before its menu's button sees them (it would open on ArrowDown): the
 * arrows, Home, and End move as the blocks' do, and Shift+F10 or the context-menu key opens its
 * menu, as Enter does.
 */
function onHeadKeydown(event: KeyboardEvent, r: number) {
  if (!(event.target instanceof HTMLElement) || event.target !== headEl(r)) return;
  if (opensMenu(event)) {
    event.preventDefault();
    event.stopPropagation();
    setHead(r, true);
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (move(event, r, HEADER)) event.stopPropagation();
}

/** A touch's first tap on a block focuses it (its card and ⋯ show); the next one goes there. */
let tapOnly = false;
function onPointerdown(event: PointerEvent, r: number, i: number) {
  tapOnly = event.pointerType === 'touch' && !same(focused.value, r, i);
}
function onClick(r: number, i: number, id: string) {
  if (tapOnly) {
    tapOnly = false;
    void focusCell(r, i);
    return;
  }
  threads.go(id);
}

/**
 * The ⋯ shows on the focused block, and on the block whose menu is open. Pressing it keeps focus
 * on the block (its mousedown; a prevented pointerdown would cancel a touch's click in WebKit), and
 * where a browser focuses it anyway it stays while it has focus.
 */
const moreAt = shallowRef<{ row: number; unit: number } | null>(null);
const showsMore = (r: number, i: number) =>
  same(focused.value, r, i) || same(menuFor.value, r, i) || same(moreAt.value, r, i);

// ---- The block's menu ----------------------------------------------------------------------

const menuFor = shallowRef<{ row: number; unit: number } | null>(null);
const menuPlace = shallowRef({ left: '0px', top: '0px', width: '0px', height: '0px' });
let afterMenu: (() => void) | null = null;
let menuBack: { row: number; unit: number } | null = null;
/** After a move, focus goes to the tab stop once the lanes are drawn again. */
let refocus = false;
watch(lanes, () => {
  if (!refocus) return;
  refocus = false;
  void focusStop();
});

function openMenuFor(r: number, i: number) {
  const el = cellEl(r, i);
  const box = root.value?.getBoundingClientRect();
  if (!el || !box) return;
  const at = el.getBoundingClientRect();
  menuPlace.value = {
    left: `${at.left - box.left}px`,
    top: `${at.top - box.top}px`,
    width: `${Math.max(at.width, 4)}px`,
    height: `${at.height}px`,
  };
  menuBack = { row: r, unit: i };
  menuFor.value = { row: r, unit: i };
}

function onContextmenu(event: MouseEvent, r: number, i: number) {
  event.preventDefault();
  void focusCell(r, i).then(() => openMenuFor(r, i));
}

const focusBack = () => {
  const back = menuBack;
  if (back) void focusCell(back.row, back.unit);
};

const menuItems = computed<DropdownMenuItem[][]>(() => {
  const at = menuFor.value;
  const u = at && lanes.value?.units[at.unit];
  if (!u) return [];
  return blockMenuItems(u.id, noun.value, {
    later: (act) => {
      afterMenu = act;
    },
    focus: focusBack,
    moveTo: (id) => {
      movingToId.value = id;
    },
    moved: () => {
      refocus = true;
    },
  });
});
const menuName = computed(() => {
  const at = menuFor.value;
  const block = at ? drawn.value[at.row]?.blocks.find((b) => b.index === at.unit) : undefined;
  return block ? `Actions for ${block.name}` : 'Actions';
});

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    else if (menuFor.value === null && focusIsFree()) focusBack();
  });
}
const MENU_CONTENT = { align: 'start' as const, onCloseAutoFocus: onMenuCloseAutoFocus };

// Move to…, from a scene's menu.
const movingToId = ref<string | null>(null);
const movingTo = computed(() =>
  movingToId.value ? (outline.itemById(movingToId.value) ?? null) : null,
);
function onMoveTo(target: MoveTarget) {
  const item = movingTo.value;
  movingToId.value = null;
  if (!item) return;
  refocus = true;
  runMove(item.block, target);
}
function onMoveToClose() {
  movingToId.value = null;
  focusBack();
}

// ---- A row header's menu ------------------------------------------------------------------

const headMenu = shallowRef<number | null>(null);
let afterHead: (() => void) | null = null;
const NO_ITEMS: DropdownMenuItem[][] = [];
const headEl = (r: number) => document.getElementById(`lane-head-${r}`);

function headItems(r: number): DropdownMenuItem[][] {
  const row = drawn.value[r];
  if (!row || row.key === null) return NO_ITEMS;
  const label = row.label;
  return threadMenuItems(noun.value, threads.readOnly(), (mode) => {
    afterHead = () => openThreadEdit(label, mode, () => headEl(r)?.focus());
  });
}
function onHeadFocus(r: number) {
  const row = drawn.value[r];
  if (row?.key) lastFocused.value = { key: row.key, id: HEAD };
}
function setHead(r: number, open: boolean) {
  if (open) headMenu.value = r;
  else if (headMenu.value === r) headMenu.value = null;
}
function onHeadCloseAutoFocus(event: Event) {
  const act = afterHead;
  afterHead = null;
  if (!act) return;
  event.preventDefault();
  requestAnimationFrame(act);
}
const HEAD_CONTENT = { align: 'start' as const, onCloseAutoFocus: onHeadCloseAutoFocus };

// ---- The card ------------------------------------------------------------------------------

const cardFor = shallowRef<{ row: number; unit: number } | null>(null);
const focused = shallowRef<{ row: number; unit: number } | null>(null);
const cardPlace = shallowRef({ left: 0, top: 0 });
const cardEl = ref<HTMLElement | null>(null);
const card = computed(() => {
  const at = cardFor.value;
  const now = lanes.value;
  const u = at && now?.units[at.unit];
  return u && now ? { key: `${at.row}-${at.unit}`, lines: cardLines(u, now, noun.value) } : null;
});
const same = (a: { row: number; unit: number } | null, r: number, i: number) =>
  a?.row === r && a.unit === i;

// Escape hides a card the pointer shows, wherever focus is (WCAG 1.4.13).
function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && cardFor.value && !focused.value) cardFor.value = null;
}
onMounted(() => window.addEventListener('keydown', onWindowKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown));

function onFocus(r: number, i: number) {
  const row = drawn.value[r];
  const u = lanes.value?.units[i];
  if (row && u) lastFocused.value = { key: row.key, id: u.id };
  focused.value = { row: r, unit: i };
  cardFor.value = { row: r, unit: i };
}
function onBlur(r: number, i: number) {
  if (same(focused.value, r, i)) focused.value = null;
  if (same(cardFor.value, r, i)) cardFor.value = null;
}
function onPointerleave(r: number, i: number) {
  if (same(cardFor.value, r, i)) cardFor.value = focused.value;
}

// Under its block, moved in so it never passes the view's edges.
watch(
  () => card.value?.key,
  async (key) => {
    const at = cardFor.value;
    if (!key || !at) return;
    await nextTick();
    const el = cardEl.value;
    const block = cellEl(at.row, at.unit);
    const box = root.value?.getBoundingClientRect();
    if (!el || !block || !box) return;
    const b = block.getBoundingClientRect();
    cardPlace.value = {
      left: Math.max(0, Math.min(b.left - box.left, box.width - el.offsetWidth)),
      top: b.bottom - box.top + 4,
    };
  },
  { flush: 'post' },
);
</script>

<template>
  <div ref="root" class="lanes">
    <p v-if="!lanes" class="note">Reading the threads…</p>
    <DEmpty v-else-if="lanes.units.length === 0" icon="i-lucide-chart-gantt">{{ nothingYet(noun) }}</DEmpty>
    <DEmpty v-else-if="lanes.threads.length === 0" icon="i-lucide-git-branch">{{ noThreadsYet(noun) }}</DEmpty>
    <template v-else>
      <div class="ruler-row" aria-hidden="true">
        <span class="corner">Threads</span>
        <div ref="track" class="ruler">
          <span v-for="(mark, m) in marks" :key="m" class="tick" :class="{ numbered: mark.text }" :style="{ left: pct(mark.at) }">
            <span v-if="mark.text" class="number">{{ mark.text }}</span>
          </span>
        </div>
      </div>
      <div role="grid" aria-label="Lanes" class="grid">
        <div v-for="(row, r) in drawn" :key="row.key ?? '-none'" role="row" class="row">
          <div role="rowheader" class="head" @keydown.capture="onHeadKeydown($event, r)">
            <MenuButton
              v-if="row.key !== null"
              :open="headMenu === r"
              :items="headMenu === r ? headItems(r) : NO_ITEMS"
              :content="HEAD_CONTENT"
              @update:open="(open: boolean) => setHead(r, open)"
            >
              <button
                :id="`lane-head-${r}`"
                type="button"
                class="head-button"
                :tabindex="isStop(r, HEAD) ? 0 : -1"
                :aria-label="row.header"
                aria-keyshortcuts="Enter Shift+F10"
                @focus="onHeadFocus(r)"
                @contextmenu.prevent="setHead(r, true)"
              >
                <span class="swatch" :style="row.swatch ? { background: row.swatch } : undefined" aria-hidden="true" />
                <span class="label" aria-hidden="true">{{ row.label }}</span>
                <span v-if="row.name" class="name" aria-hidden="true">{{ row.name }}</span>
              </button>
            </MenuButton>
            <span v-else class="head-none">
              <span class="swatch none" aria-hidden="true" />
              <span>No thread<span class="sr-only">, {{ row.count }} {{ row.count === 1 ? noun : `${noun}s` }}</span></span>
            </span>
          </div>
          <div role="none" class="track">
            <div
              v-for="block in row.blocks"
              :id="cellId(r, block.index)"
              :key="block.id"
              role="gridcell"
              class="block"
              :class="{ none: row.key === null, inherited: block.inherited, current: block.id === current }"
              :style="block.style"
              :aria-label="block.name"
              :aria-current="block.id === current ? 'location' : undefined"
              :tabindex="isStop(r, block.id) ? 0 : -1"
              aria-keyshortcuts="Enter Shift+F10"
              @pointerdown="onPointerdown($event, r, block.index)"
              @click="onClick(r, block.index, block.id)"
              @contextmenu="onContextmenu($event, r, block.index)"
              @keydown="onKeydown($event, r, block.index)"
              @focus="onFocus(r, block.index)"
              @blur="onBlur(r, block.index)"
              @pointerenter="cardFor = { row: r, unit: block.index }"
              @pointerleave="onPointerleave(r, block.index)"
            >
              <span class="block-label">{{ block.label }}</span>
              <!-- The menu for a touch and a pointer, on the focused block: never a tab stop (the
                   grid is one); its menu gives focus back to the block. -->
              <button
                v-if="showsMore(r, block.index)"
                type="button"
                class="more"
                :class="{ left: block.moreLeft }"
                tabindex="-1"
                :aria-label="`Actions for ${block.title}`"
                @mousedown.prevent
                @focus="moreAt = { row: r, unit: block.index }"
                @blur="moreAt = null"
                @click.stop="openMenuFor(r, block.index)"
              >
                <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
    <MenuButton :open="menuFor !== null" :items="menuItems" :content="MENU_CONTENT" @update:open="(open: boolean) => { if (!open) menuFor = null; }">
      <!-- The menu's anchor, over the block it is for: never focused, and named for the menu. -->
      <button type="button" class="menu-anchor" tabindex="-1" aria-hidden="true" :style="menuPlace">
        <span v-if="menuFor !== null" class="sr-only">{{ menuName }}</span>
      </button>
    </MenuButton>
    <MoveToDialog :item="movingTo" :index="outline.index.value" @choose="onMoveTo" @close="onMoveToClose" />
    <div
      v-if="card"
      ref="cardEl"
      class="card"
      aria-hidden="true"
      :style="{ left: `${cardPlace.left}px`, top: `${cardPlace.top}px` }"
    >
      <p v-for="(line, n) in card.lines" :key="n" :class="{ first: n === 0 }">{{ line }}</p>
    </div>
  </div>
</template>

<style scoped>
.lanes {
  --head: clamp(6rem, 28%, 12rem);
  position: relative;
  padding: 12px 12px 24px;
  color: var(--text);
  font-size: 12px;
}
.note {
  margin: 0;
  color: var(--muted);
}
.ruler-row,
.row {
  display: flex;
  align-items: stretch;
}
.corner,
.head {
  flex: 0 0 var(--head);
  min-width: 0;
  padding-right: 8px;
  box-sizing: border-box;
}
.corner {
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
}
.ruler {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 16px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 10px;
  line-height: 12px;
}
.tick {
  position: absolute;
  bottom: 0;
  height: 4px;
  border-left: 1px solid var(--border);
}
.tick.numbered {
  height: 100%;
  border-left-color: var(--muted);
}
.number {
  padding-left: 2px;
}
.row {
  height: 24px;
  margin-top: 6px;
}
.head-button,
.head-none {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  white-space: nowrap;
}
.head-button {
  cursor: pointer;
}
.head-button:hover {
  background: var(--surface);
}
.head-none {
  color: var(--muted);
}
.swatch {
  flex: none;
  width: 4px;
  height: 16px;
  border-radius: 1px;
}
.swatch.none {
  border: 1px dashed var(--muted);
  box-sizing: border-box;
}
.label {
  flex: none;
  font-weight: 600;
}
.name {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  text-overflow: ellipsis;
}
.track {
  position: relative;
  flex: 1;
  min-width: 0;
  border-radius: 3px;
  background: var(--surface);
}
.block {
  position: absolute;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
  min-width: 4px;
  padding: 0 3px;
  border-left: 2px solid var(--muted);
  border-radius: 2px;
  background: var(--raised);
  color: var(--text);
  font-size: 11px;
  line-height: 24px;
  white-space: nowrap;
  cursor: pointer;
}
/* The label is cut to the block; the ⋯ beside the block is not. */
.block-label {
  display: block;
  overflow: hidden;
  text-overflow: clip;
}
.more {
  position: absolute;
  top: 0;
  left: calc(100% + 4px);
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--page);
  color: var(--text);
  cursor: pointer;
}
.more.left {
  right: calc(100% + 4px);
  left: auto;
}
/* A section's threads from its chapter: lighter, with a dashed edge, and said in its name. */
.block.inherited {
  border-left-style: dashed;
}
.block.none {
  border-left-color: var(--muted);
  background: color-mix(in srgb, var(--muted) 30%, var(--page));
}
/* The cursor's unit, in every row: a ring outside it, so a 4 px block shows it too. */
.block.current {
  z-index: 1;
  box-shadow: 0 0 0 2px var(--accent-text);
}
/* Focus outside the block and the ring, so it is always seen. */
.block:focus-visible {
  z-index: 2;
  outline: 2px solid var(--text);
  outline-offset: 3px;
}
.menu-anchor {
  position: absolute;
  padding: 0;
  border: 0;
  background: none;
  opacity: 0;
  pointer-events: none;
}
.card {
  position: absolute;
  z-index: 3;
  max-width: min(360px, 100%);
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--page);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
  color: var(--text);
  font-size: 12px;
  line-height: 1.4;
  pointer-events: none;
}
.card p {
  margin: 0;
  overflow-wrap: anywhere;
}
.card p.first {
  font-weight: 600;
}
@media (forced-colors: active) {
  .block {
    border: 1px solid ButtonText;
  }
  /* Box shadows are dropped here, and the focus outline would hide an outline: the cursor's unit
     keeps a border of its own, focused or not. */
  .block.current {
    border: 3px solid Highlight;
  }
  .block:focus-visible {
    outline-color: CanvasText;
  }
  .more {
    border-color: ButtonText;
  }
  .card {
    border-color: CanvasText;
  }
}
</style>
