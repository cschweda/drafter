<script setup lang="ts">
import { readerHeader } from '~/drafts/labels';
import { useDrafts } from '~/drafts/use-drafts';

// The slim bar of the Drafts list and of the draft being read (drafts-and-cuts design §2.3): the
// list's count and Start new draft…, or the draft's "Draft 2 · a3f9c2e · read-only"; and Close.

const props = defineProps<{ tab: 'drafts' | 'draft' }>();
const drafts = useDrafts();
const { rows, reading, notKept } = drafts;
const count = computed(() => {
  const n = rows.value.length;
  return n === 1 ? '1 draft' : `${n.toLocaleString('en-US')} drafts`;
});
</script>

<template>
  <template v-if="props.tab === 'drafts'">
    <span v-if="!notKept">{{ count }}</span>
    <span class="spacer" />
    <ToolButton
      v-if="!notKept"
      icon="i-lucide-milestone"
      label="Start new draft…"
      class="slim-button drafts-tool"
      @click="drafts.ask()"
    />
    <ToolButton
      icon="i-lucide-x"
      label="Close"
      class="slim-button drafts-tool"
      aria-label="Close Drafts"
      @click="drafts.close(true)"
    />
  </template>
  <template v-else>
    <span v-if="reading" class="reader-name">{{ readerHeader(reading.row) }}</span>
    <span class="spacer" />
    <ToolButton
      icon="i-lucide-x"
      label="Close"
      class="slim-button drafts-tool"
      :aria-label="reading ? `Close Draft ${reading.row.n}` : 'Close the draft'"
      @click="drafts.closeReading(true)"
    />
  </template>
</template>

<style scoped>
.reader-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
</style>

<style>
/* Unscoped: each button is a ToolButton, whose root this component's scope doesn't reach. */
.slim-button.drafts-tool {
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.slim-button.drafts-tool:hover {
  background: var(--overlay);
}
</style>
