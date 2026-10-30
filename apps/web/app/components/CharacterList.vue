<script setup lang="ts">
import type { GridView } from '~/stats/grid-data';
import { listLine } from '~/stats/grid-labels';

// Character by scene as text (seeing-the-script design §4.4): each character's scenes, in the
// grid's order, runs of scenes folded into ranges. What the List toggle shows instead of the grid,
// at any width, for a reader who would rather read it.
const props = defineProps<{ view: GridView; labelledby: string }>();
const lines = computed(() =>
  props.view.cast.characters.map((character, row) =>
    listLine(
      character.name,
      props.view.cast.byScene[row] ?? [],
      (scene) => props.view.numbers[scene] ?? '',
    ),
  ),
);
</script>

<template>
  <ul class="lines" :aria-labelledby="labelledby">
    <li v-for="(line, row) in lines" :key="view.model.rows[row]">{{ line }}</li>
  </ul>
</template>

<style scoped>
.lines {
  margin: 0;
  padding: 0;
  list-style: none;
}
.lines li {
  padding: 3px 0;
  border-bottom: 1px solid var(--line);
}
</style>
