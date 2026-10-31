<script setup lang="ts">
// An empty state (fresh-look design §5): centred, a 20px icon in --muted, one sentence, and an
// action when there is one (the `action` slot). The icon is decoration; the sentence says it all.
const props = defineProps<{
  /** A Lucide icon, such as `i-lucide-check`. */
  icon?: string;
}>();
</script>

<template>
  <div class="d-empty">
    <UIcon v-if="props.icon" :name="props.icon" class="d-empty-icon" data-empty-icon aria-hidden="true" />
    <p><slot /></p>
    <slot name="action" />
  </div>
</template>

<style>
.d-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 24px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
  text-align: center;
}
.d-empty > p {
  max-width: 28rem;
  margin: 0;
}
.d-empty code {
  white-space: nowrap;
}
.d-empty-icon {
  width: 20px;
  height: 20px;
  color: var(--muted);
}
</style>
