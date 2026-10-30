<script setup lang="ts">
import type { DiffRow, WordPart } from '@drafter/compare';

// One row of the Changes view, unified (version-history design §5.3): the older line's number, the
// newer's, a sign (+, −, or none), and the line as it is, spaces kept. The numbers and the sign are
// hidden from a screen reader, which hears a hidden "added, " or "removed, " and then the whole
// line; changed words are underlined (inserted) or struck through (deleted), never color alone,
// and add no speech. A change's first row carries `data-change`, where Next change puts focus.
// Side by side, a row is a table cell with its own side's number (`side`).

const props = defineProps<{
  row: DiffRow;
  /** Its index in the rows, so the view can find it. */
  index: number;
  /** The row's changed words, when it is paired and the pair has been diffed; null for none. */
  words: WordPart[] | null;
  /** This row is its change's first. */
  first: boolean;
  /** Side by side: the cell of this side, with its number only. */
  side?: 'old' | 'new';
}>();

const SIGNS = { added: '+', removed: '−', same: '' } as const;
const SAID = { added: 'added, ', removed: 'removed, ', same: '' } as const;
const WORD_CLASS = { added: 'diff-word-add', removed: 'diff-word-del', same: '' } as const;
</script>

<template>
  <component
    :is="props.side ? 'td' : 'div'"
    :class="[props.side ? 'diff-cell' : 'diff-row', props.row.kind]"
    :data-change="props.first ? props.row.change : undefined"
    :data-row="props.index"
    tabindex="-1"
  ><span class="diff-line">
    <span v-if="props.side !== 'new'" class="diff-num" aria-hidden="true">{{
      props.row.old === null ? '' : props.row.old + 1
    }}</span>
    <span v-if="props.side !== 'old'" class="diff-num" aria-hidden="true">{{
      props.row.new === null ? '' : props.row.new + 1
    }}</span>
    <span class="diff-sign" aria-hidden="true">{{ SIGNS[props.row.kind] }}</span>
    <span class="diff-text"
      ><span v-if="props.row.kind !== 'same'" class="drafter-sr-only">{{ SAID[props.row.kind] }}</span
      ><template v-if="props.words"
        ><span
          v-for="(part, i) in props.words"
          :key="i"
          :class="WORD_CLASS[part.kind]"
          >{{ part.text }}</span
        ></template
      ><template v-else>{{ props.row.text }}</template></span
    ></span>
  </component>
</template>
