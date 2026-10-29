<script setup lang="ts">
import { type OutlineItem, rulerMarks, type StripBlock } from '@drafter/outline';
import { useOutline } from '~/outline/use-outline';
import { blockFill, blockName, LABEL_MIN_PX, NO_SCENES, rowMark, rowName } from '~/strip/labels';
import { useStrip } from '~/strip/use-strip';

// The Structure strip (structure strip design): a band above both panes with a row per section
// depth the script uses, a row of scenes, and a page ruler, each block placed and sized as a
// percentage of the axis, so a resize redraws nothing (Call 19). It edits nothing.

const { view } = useStrip();
const outline = useOutline();

/** The live items by id, so a block kept from before the layout caught up is named as it is now. */
const items = computed(() => {
  const byId = new Map<string, OutlineItem>();
  for (const item of outline.index.value.items) byId.set(outline.idOf(item), item);
  return byId;
});

/** The width of the blocks' track in pixels, from the one ResizeObserver. */
const width = shallowRef(0);
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
      if (el) observer?.observe(el);
    },
    { immediate: true },
  );
});
onBeforeUnmount(() => observer?.disconnect());

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
      return {
        id,
        name: item ? blockName(item) : block.label,
        label: share * width.value >= LABEL_MIN_PX ? block.label : '',
        style: {
          left: pct((block.from - strip.start) / strip.length),
          width: pct(share),
          ...(fill ? { background: fill.tint, borderBottom: `3px solid ${fill.edge}` } : {}),
        },
        // Neighboring sections are told apart by two neutrals (Call 8).
        alt: block.kind === 'section' && i % 2 === 1,
      };
    }),
  }));
});

const marks = computed(() => {
  const current = view.value;
  return current ? rulerMarks(current.strip, width.value) : [];
});
const paged = computed(() => view.value?.strip.unit === 'pages');
</script>

<template>
  <div role="group" aria-label="Structure strip" class="strip">
    <p v-if="view && rows.length === 0" class="empty">{{ NO_SCENES }}</p>
    <template v-else-if="view">
      <div class="marks" aria-hidden="true">
        <span v-for="row in rows" :key="row.key" class="mark">{{ row.mark }}</span>
      </div>
      <div ref="track" class="track">
        <div
          v-for="row in rows"
          :key="row.key"
          role="group"
          :aria-label="row.name"
          class="row"
        >
          <button
            v-for="block in row.blocks"
            :key="block.id"
            type="button"
            class="block"
            :class="{ alt: block.alt }"
            :style="block.style"
            :aria-label="block.name"
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
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 18 px a row and 14 px of ruler, at most four rows and the ruler (Call 27). */
.strip {
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
.block:focus-visible {
  z-index: 1;
  outline: 2px solid var(--heading);
  outline-offset: -2px;
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
@media (forced-colors: active) {
  .block {
    border: 1px solid ButtonText;
  }
}
</style>
