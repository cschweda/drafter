<script setup lang="ts">
import { useLayout } from '~/editor/layout';
import { pageLabel } from '~/editor/pages';
import { useEditor } from '~/editor/session';
import { TEMPLATE_NAMES, templateIdOf } from '~/editor/template';

const { doc } = useEditor();
const { page } = useLayout();
const templateName = computed(() => TEMPLATE_NAMES[templateIdOf(doc.value)]);
</script>

<template>
  <footer class="status" data-tour="status">
    <span>Sample</span>
    <span v-if="page">{{ pageLabel(page) }}</span>
    <span class="spacer" />
    <span>{{ templateName }}</span>
  </footer>
</template>

<style scoped>
.status {
  display: flex;
  gap: 16px;
  padding: 6px 14px;
  background: var(--chrome);
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
}
.spacer {
  flex: 1;
}
</style>
