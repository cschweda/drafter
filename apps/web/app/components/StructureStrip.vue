<script lang="ts">
import { shallowRef } from 'vue';

/** The block last focused this visit: the strip's tab stop while it is still there (Call 28). */
const lastFocused = shallowRef<string | null>(null);
</script>

<script setup lang="ts">
import { type OutlineItem, rulerMarks, type StripBlock } from '@drafter/outline';
import { useEditor } from '~/editor/session';
import { useOutline } from '~/outline/use-outline';
import { scriptTopPage } from '~/strip/in-view';
import { stripKey } from '~/strip/keys';
import {
  blockFill,
  blockName,
  cardLines,
  LABEL_MIN_PX,
  NO_SCENES,
  rowMark,
  rowName,
} from '~/strip/labels';
import { useStrip } from '~/strip/use-strip';

// The Structure strip (structure strip design): a band above both panes with a row per section
// depth the script uses, a row of scenes, and a page ruler, each block placed and sized as a
// percentage of the axis, so a resize redraws nothing (Call 19). It edits nothing: a block goes
// to its place as the Outline does (Call 9), the cursor's blocks are marked and the Script pane's
// top page is on the ruler (Call 10), one card names the block under the pointer or focus (Call
// 11), and the blocks are one Tab stop with the arrow keys between them (Call 12).

const { view, current, go } = useStrip();
const outline = useOutline();
const editor = useEditor();

/** The live items by id, so a block kept from before the layout caught up is named as it is now. */
const items = computed(() => {
  const byId = new Map<string, OutlineItem>();
  for (const item of outline.index.value.items) byId.set(outline.idOf(item), item);
  return byId;
});

/** The width of the blocks' track in pixels, from the one ResizeObserver. */
const width = shallowRef(0);
const root = ref<HTMLElement | null>(null);
const track = ref<HTMLElement | null>(null);
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
        // The labels from the first frame, before the observer's first answer.
        width.value = el.clientWidth;
        observer?.observe(el);
      }
    },
    { immediate: true },
  );
});
onBeforeUnmount(() => {
  observer?.disconnect();
  // The strip going with focus in it (turned off, a Markdown document, a narrow window) would leave
  // focus nowhere: it goes to the editor, at the cursor, instead (Call 32).
  if (root.value?.contains(document.activeElement)) {
    editor.goto(editor.view.state.selection.main.head);
  }
});

const pct = (n: number) => `${n * 100}%`;

const rows = computed(() => {
  const current = view.value;
  if (!current) return [];
  const { strip, ids } = current;
  return strip.rows.map((row) => ({
    key: row.kind === 'scenes' ? 'scenes' : `depth-${row.depth}`,
    mark: rowMark(row),
    name: rowName(row),
    blocks: row.blocks.map((block: StripBlock, i) => {
      const id = ids.get(block.block) ?? `block-${block.block}`;
      const share = (block.to - block.from) / strip.length;
      const item = items.value.get(id);
      const fill = block.kind === 'scene' ? blockFill(block.color) : null;
      const left = pct((block.from - strip.start) / strip.length);
      return {
        id,
        name: item ? blockName(item) : block.label,
        label: share * width.value >= LABEL_MIN_PX ? block.label : '',
        style: {
          // A tick at the far right stays inside the track.
          left: share > 0 ? left : `min(${left}, calc(100% - 2px))`,
          width: pct(share),
          ...(fill ? { background: fill.tint, borderBottom: `3px solid ${fill.edge}` } : {}),
        },
        // Neighboring sections are told apart by two neutrals (Call 8).
        alt: block.kind === 'section' && i % 2 === 1,
        /** A section with no scenes: a 2 px tick, with no room for a label. */
        point: share === 0,
      };
    }),
  }));
});

/**
 * While the view waits for a load's index, the band keeps the rows it last had, so the panes
 * below don't move; a strip by words keeps the ruler's row, empty, for the same reason.
 */
const lastRowCount = shallowRef(1);
watch(rows, (now) => {
  if (view.value && now.length > 0) lastRowCount.value = now.length;
});
const waiting = computed(() => (view.value ? 0 : lastRowCount.value));

const marks = computed(() => {
  const current = view.value;
  return current ? rulerMarks(current.strip, width.value) : [];
});
const paged = computed(() => view.value?.strip.unit === 'pages');

/** The in-view marker's place on the ruler: the top of the Script pane's top page (Call 29). */
const inView = computed(() => {
  const page = scriptTopPage.value;
  const current = view.value;
  if (page === null || !current || current.strip.unit !== 'pages') return null;
  const at = (Math.max(page, 1) - 1 - current.strip.start) / current.strip.length;
  return pct(Math.min(1, Math.max(0, at)));
});

// ---- Focus: one Tab stop --------------------------------------------------------------------

/** The tab stop: the block last focused if it is still drawn, else the cursor's scene, else the first. */
const tabStop = computed(() => {
  const drawn = rows.value;
  const last = lastFocused.value;
  if (last && drawn.some((row) => row.blocks.some((block) => block.id === last))) return last;
  const scenes = drawn.at(-1)?.blocks ?? [];
  return (scenes.find((block) => current.value.has(block.id)) ?? scenes[0])?.id ?? null;
});

const blockEl = (id: string) =>
  root.value?.querySelector<HTMLElement>(`[data-block="${CSS.escape(id)}"]`) ?? null;

const MOVES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

async function onKeydown(event: KeyboardEvent, row: number, index: number) {
  if (event.altKey || event.ctrlKey || event.metaKey || !MOVES.has(event.key)) return;
  event.preventDefault();
  const current = view.value;
  const to = current && stripKey(current.strip, { row, index }, event.key);
  const block = to && current.strip.rows[to.row]?.blocks[to.index];
  if (!block) return;
  const id = current.ids.get(block.block) ?? `block-${block.block}`;
  lastFocused.value = id;
  await nextTick();
  blockEl(id)?.focus();
}

// ---- The card -------------------------------------------------------------------------------

/**
 * The block whose card shows: the one last hovered or focused. When the pointer leaves a block the
 * focused block's card comes back (none if no block has focus); when focus goes, the card goes.
 */
const cardFor = shallowRef<string | null>(null);
/** The block that has focus, if one has. */
const focusedBlock = shallowRef<string | null>(null);
const cardLeft = shallowRef(0);
const cardEl = ref<HTMLElement | null>(null);

const card = computed(() => {
  const id = cardFor.value;
  if (!id) return null;
  const block = rows.value.flatMap((row) => row.blocks).find((b) => b.id === id);
  if (!block) return null;
  const item = items.value.get(id);
  return { id, lines: item ? cardLines(item) : [block.name], style: block.style };
});

function showCard(id: string) {
  cardFor.value = id;
}
function onPointerleave(id: string) {
  if (cardFor.value === id) cardFor.value = focusedBlock.value;
}
function onFocus(id: string) {
  lastFocused.value = id;
  focusedBlock.value = id;
  showCard(id);
}
function onBlur(id: string) {
  if (focusedBlock.value === id) focusedBlock.value = null;
  if (cardFor.value === id) cardFor.value = null;
}

/** The card's block and where that block is: the card is measured only when one of them changes. */
const cardPlace = computed(() => {
  const shown = card.value;
  return shown ? `${shown.id}|${shown.style.left}|${shown.style.width}` : null;
});

// Under its block, its left edge at the block's, moved in so it never passes the strip's edges.
watch(
  cardPlace,
  async (now) => {
    const id = cardFor.value;
    if (!now || !id) return;
    await nextTick();
    const el = cardEl.value;
    const block = blockEl(id);
    const band = root.value;
    if (!el || !block || !band) return;
    const box = band.getBoundingClientRect();
    const left = block.getBoundingClientRect().left - box.left;
    cardLeft.value = Math.max(0, Math.min(left, box.width - el.offsetWidth));
  },
  { flush: 'post' },
);
</script>

<template>
  <div ref="root" role="group" aria-label="Structure strip" class="strip">
    <p v-if="view && rows.length === 0" class="empty">{{ NO_SCENES }}</p>
    <template v-else-if="view">
      <div class="marks" aria-hidden="true">
        <span v-for="row in rows" :key="row.key" class="mark">{{ row.mark }}</span>
      </div>
      <div ref="track" class="track">
        <div
          v-for="(row, r) in rows"
          :key="row.key"
          role="group"
          :aria-label="row.name"
          class="row"
        >
          <button
            v-for="(block, b) in row.blocks"
            :key="block.id"
            type="button"
            class="block"
            :class="{ alt: block.alt, point: block.point, current: current.has(block.id) }"
            :style="block.style"
            :aria-label="block.name"
            :aria-current="current.has(block.id) ? 'location' : undefined"
            :tabindex="block.id === tabStop ? 0 : -1"
            :data-block="block.id"
            @click="go(block.id)"
            @keydown="onKeydown($event, r, b)"
            @focus="onFocus(block.id)"
            @blur="onBlur(block.id)"
            @pointerenter="showCard(block.id)"
            @pointerleave="onPointerleave(block.id)"
          >
            {{ block.label }}
          </button>
        </div>
        <div v-if="paged" class="ruler" aria-hidden="true">
          <span
            v-for="mark in marks"
            :key="mark.page"
            class="tick"
            :class="{ numbered: mark.numbered }"
            :style="{ left: pct(mark.at) }"
          >
            <span v-if="mark.numbered" class="number">{{ mark.page }}</span>
          </span>
          <span v-if="inView" class="in-view" aria-hidden="true" :style="{ left: inView }" />
        </div>
        <div v-else class="ruler-space" aria-hidden="true" />
      </div>
    </template>
    <template v-else>
      <div class="marks" aria-hidden="true">
        <span v-for="n in waiting" :key="n" class="mark" />
      </div>
      <div class="track" aria-hidden="true">
        <div v-for="n in waiting" :key="n" class="row" />
        <div class="ruler-space" />
      </div>
    </template>
    <div
      v-if="card"
      ref="cardEl"
      class="card"
      aria-hidden="true"
      :style="{ left: `${cardLeft}px` }"
    >
      <p v-for="(line, i) in card.lines" :key="i" :class="{ first: i === 0 }">{{ line }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 18 px a row and 14 px of ruler, at most four rows and the ruler (Call 27). */
.strip {
  position: relative;
  /* Above the panes, so the card can sit over them, and below the toolbar's menus (20), which open
     over the strip. */
  z-index: 10;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  min-height: 18px;
  border-bottom: 1px solid var(--line);
  background: var(--chrome);
  color: var(--text);
  font-size: 11px;
  line-height: 18px;
}
.empty {
  grid-column: 1 / -1;
  margin: 0;
  padding: 0 14px;
  color: var(--muted);
}
.marks {
  display: flex;
  flex-direction: column;
  padding: 0 8px 0 14px;
  border-right: 1px solid var(--line);
  color: var(--muted);
  font-family: ui-monospace, monospace;
}
.mark {
  height: 18px;
}
.track {
  min-width: 0;
}
.row {
  position: relative;
  height: 18px;
  overflow: hidden;
}
.block {
  position: absolute;
  top: 0;
  bottom: 0;
  box-sizing: border-box;
  min-width: 2px;
  padding: 0 4px;
  overflow: hidden;
  border: 0;
  border-right: 1px solid var(--line);
  background: var(--chrome-2);
  color: var(--text);
  font: inherit;
  line-height: 18px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.block.alt {
  background: var(--chrome);
}
.block.point {
  padding: 0;
}
/* The cursor's scene and its sections (Call 10). */
.block.current {
  z-index: 1;
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
/* Focus is the text color, inside a heading-colored ring when the block is current too. */
.block:focus-visible {
  z-index: 2;
  outline: 2px solid var(--text);
  outline-offset: -2px;
}
.block.current:focus-visible {
  box-shadow: inset 0 0 0 4px var(--heading);
}
.ruler {
  position: relative;
  height: 14px;
  overflow: hidden;
  border-top: 1px solid var(--line);
  box-sizing: border-box;
  color: var(--muted);
  font-size: 9px;
  line-height: 13px;
}
.ruler-space {
  height: 14px;
  border-top: 1px solid var(--line);
  box-sizing: border-box;
}
.tick {
  position: absolute;
  top: 0;
  height: 4px;
  border-left: 1px solid var(--line);
}
.tick.numbered {
  height: 100%;
  border-left-color: var(--muted);
}
.number {
  padding-left: 2px;
}
/* The Script pane's top page: a small triangle pointing down at the ruler (Call 29). */
.in-view {
  position: absolute;
  top: 0;
  width: 0;
  height: 0;
  margin-left: -4px;
  border-top: 6px solid var(--heading);
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  pointer-events: none;
}
.card {
  position: absolute;
  top: calc(100% + 2px);
  max-width: min(360px, 100%);
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--line);
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
  .block.current {
    border: 2px solid Highlight;
  }
  .in-view {
    border-top-color: CanvasText;
  }
  .card {
    border-color: CanvasText;
  }
}
</style>
