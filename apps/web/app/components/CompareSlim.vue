<script setup lang="ts">
import { useCompare } from '~/compare/use-compare';
import { sayOutline } from '~/outline/notice';

// The Compare tab's slim bar: what is compared ("Comparing 10:42 with now (10:58)"), Update when one
// side is now (Call 15: now is the text when Compare opened), and Close comparison.

const compare = useCompare();
const { current } = compare;

function update() {
  compare.update();
  const n = current.value?.changes.length ?? 0;
  void sayOutline(
    `Compared with the text as it is now: ${n === 0 ? 'no changes' : `${n} ${n === 1 ? 'change' : 'changes'}`}.`,
  );
}
</script>

<template>
  <template v-if="current">
    <span>Comparing {{ current.older.label }} with {{ current.newer.label }}</span>
    <span class="spacer" />
    <button v-if="current.newer.at === null" type="button" class="slim-button" @click="update">
      Update
    </button>
    <button type="button" class="slim-button" @click="compare.close(true)">Close comparison</button>
  </template>
</template>

<style scoped>
.slim-button {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--heading);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
