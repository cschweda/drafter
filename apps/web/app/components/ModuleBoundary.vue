<script setup lang="ts">
import { announceModuleError } from '~/modules/registry';

// A module's tab or settings is its own component, and one that throws while it draws must not
// take the editor's page with it. This shows a plain notice in its place, and a toast.
const props = defineProps<{ name: string; what: 'tab' | 'settings' }>();
const failed = ref(false);

onErrorCaptured((error) => {
  failed.value = true;
  console.error(`${props.name}’s ${props.what} failed`, error);
  void announceModuleError(`${props.name}’s ${props.what} couldn’t be shown.`);
  // Handled here: the error goes no further.
  return false;
});
</script>

<template>
  <p v-if="failed" class="failed">{{ name }}’s {{ what }} couldn’t be shown.</p>
  <slot v-else />
</template>

<style scoped>
.failed {
  margin: 0;
  padding: 16px;
  color: var(--muted);
}
</style>
