<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { usePassageFocus } from '~/novel/use-focus';

// The bar over the Source while one chapter or one section is focused (Novel plan, Task 7):
// "Chapter 3 · The Night Watch — showing this chapter." and Show the whole book. The rest of the
// book is hidden, not removed: a save, a draft, and every export still write all of it.
const focus = usePassageFocus();
const { view } = useEditor();
// The sentence a moment ago, while the tree catches up with a renamed heading.
let last = '';
const label = computed(() => {
  if (!focus.passage.value) return '';
  if (focus.label.value) last = focus.label.value;
  return last;
});

function showAll() {
  focus.focus(null);
  view.focus();
}
</script>

<template>
  <section v-if="focus.passage.value" class="bar" aria-label="Focus" data-passage-bar>
    <p class="text">{{ label }}</p>
    <button type="button" class="action" @click="showAll">Show the whole book</button>
  </section>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 4px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
}
.text {
  margin: 0 auto 0 0;
}
.action {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.action:hover {
  background: var(--overlay);
}
</style>
