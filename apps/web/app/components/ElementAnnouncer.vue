<script setup lang="ts">
import { ELEMENT_NAMES } from '~/editor/element-names';
import { useEditor } from '~/editor/session';

// A visually hidden live region: when the cursor moves to another kind of
// element, it says which, in words. A blank line has no element, so it says
// nothing (technical design §13).
const { cursor } = useEditor();
const announcement = ref('');

watch(
  () => cursor.value?.kind,
  (kind) => {
    announcement.value = kind ? ELEMENT_NAMES[kind] : '';
  },
);
</script>

<template>
  <div class="announcer sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
</template>
