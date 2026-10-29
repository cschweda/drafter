<script setup lang="ts">
import { type Change, splitLines } from '@drafter/compare';
import { gapName } from '~/compare/labels';

// Compare as the newer text's source lines (Call 20): a Markdown document, which has no pages, or a
// script whose layout failed. Marked as the pages are: a changed or added line has an asterisk
// (hidden from a screen reader) and a hidden "changed, " or "added, " at its start; removed lines
// are a button named for them that shows them struck through. Every mark carries `data-change`,
// where Next change and the Changes list put focus.

const props = defineProps<{ text: string; changes: readonly Change[] }>();

interface Gap {
  change: number;
  lines: string[];
}
interface Row {
  number: number;
  text: string;
  /** Removals that sit before this line. */
  gaps: Gap[];
  mark: { kind: 'added' | 'changed'; change: number } | null;
}

const rows = computed(() => {
  const { lines } = splitLines(props.text);
  const drawn: Row[] = lines.map((text, i) => ({ number: i + 1, text, gaps: [], mark: null }));
  const end: Gap[] = [];
  props.changes.forEach((change, index) => {
    if (change.kind === 'removed') {
      const gap = { change: index, lines: change.removed };
      const row = drawn[change.new[0]];
      if (row) row.gaps.push(gap);
      else end.push(gap);
      return;
    }
    for (let i = change.new[0]; i < change.new[1]; i++) {
      const row = drawn[i];
      if (row) row.mark = { kind: change.kind, change: index };
    }
  });
  return { drawn, end };
});

/** The gaps shown open, by change. */
const open = ref(new Set<number>());
watch(
  () => props.changes,
  () => {
    open.value = new Set();
  },
);
function toggle(change: number) {
  const next = new Set(open.value);
  if (next.has(change)) next.delete(change);
  else next.add(change);
  open.value = next;
}
</script>

<template>
  <div class="compare-lines" role="region" aria-label="The newer version, by line">
    <template v-for="row in [...rows.drawn, null]" :key="row ? row.number : 'end'">
      <div v-for="gap in row ? row.gaps : rows.end" :key="`gap-${gap.change}`" class="gap">
        <button
          type="button"
          class="compare-gap-button"
          :data-change="gap.change"
          :aria-expanded="open.has(gap.change) ? 'true' : 'false'"
          :aria-controls="`compare-line-gap-${gap.change}`"
          @click="toggle(gap.change)"
        >
          {{ gapName({ kind: 'removed', lines: gap.lines }) }}
        </button>
        <div
          :id="`compare-line-gap-${gap.change}`"
          class="compare-gap-lines"
          :hidden="!open.has(gap.change)"
        >
          <del v-for="(line, i) in gap.lines" :key="i">{{ line === '' ? ' ' : line }}</del>
        </div>
      </div>
      <div
        v-if="row"
        class="line"
        :class="{ marked: row.mark }"
        :data-change="row.mark?.change"
        :tabindex="row.mark ? -1 : undefined"
      >
        <span class="number" aria-hidden="true">{{ row.number }}</span>
        <span v-if="row.mark" class="sr-only">{{ row.mark.kind }}, </span>
        <span class="text">{{ row.text }}</span>
        <span v-if="row.mark" class="star" aria-hidden="true">*</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.compare-lines {
  padding: 8px 0;
  font: 13px/1.5 var(--font-mono, monospace);
  color: var(--text);
}
.line {
  display: grid;
  grid-template-columns: 4em minmax(0, 1fr) 2em;
  gap: 8px;
  padding: 0 8px;
}
.line:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.number {
  color: var(--muted);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.star {
  font-weight: 700;
}
.gap {
  margin: 2px 8px 2px calc(4em + 16px);
  border-top: 1px solid var(--muted);
}
.compare-gap-button {
  margin-top: 2px;
  padding: 0 6px;
  border: 1px solid var(--muted);
  border-radius: 4px;
  background: var(--chrome-2);
  color: var(--text);
  font: 600 12px/1.6 var(--font-sans);
  cursor: pointer;
}
.compare-gap-lines del {
  display: block;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
