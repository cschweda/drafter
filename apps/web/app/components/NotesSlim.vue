<script setup lang="ts">
import { notesShown, openCount } from '~/notes/filter';
import { notesFilter, useNotes } from '~/notes/use-notes';
import { useOutline } from '~/outline/use-outline';

// The Notes tab's slim bar: how many notes the list shows, and how many are open in the script
// (the tab's badge, Call 15).

const notes = useNotes();
const outline = useOutline();
const shown = computed(() => {
  if (notesFilter.group === 'setups') return null;
  const rows = notesShown(notes.entries.value, outline.index.value, notesFilter, () => 0);
  return rows.reduce((n, row) => n + 1 + row.replies.length, 0);
});
const open = computed(() => openCount(notes.entries.value));
const word = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
</script>

<template>
  <span v-if="shown !== null">{{ word(shown, 'shown', 'shown') }}</span>
  <span v-else>{{ word(notes.threads.value.length, 'label', 'labels') }}</span>
  <span>{{ open }} open</span>
</template>
