<script setup lang="ts">
import { chipsOf } from '~/threads/chips';
import { useThreads } from '~/threads/use-threads';

// A scene's or passage's threads as chips (threads design §7.6), named and colored from the
// threads session, which this holds while it is shown. With `speak`, the same threads as words for
// a row's or card's screen reader name: ", thread A, The heist, thread B".
const props = defineProps<{ labels: readonly string[] | undefined; speak?: boolean }>();

const threads = useThreads();
const chips = computed(() => chipsOf(props.labels, threads.info.value));
const spoken = computed(() => chips.value.map((c) => c.accessibleName).join(', '));

let release: (() => void) | null = null;
onMounted(() => {
  release = threads.hold();
});
onBeforeUnmount(() => release?.());
</script>

<template>
  <template v-if="chips.length > 0">
    <template v-if="speak">, {{ spoken }}</template>
    <span v-else class="thread-chips"><ThreadChip v-for="c in chips" :key="c.key" :chip="c" /></span>
  </template>
</template>

<style scoped>
.thread-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}
</style>
