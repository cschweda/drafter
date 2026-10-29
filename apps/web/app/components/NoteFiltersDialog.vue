<script setup lang="ts">
// The Notes tab's filters in a sheet, on a phone (Phase 2 design §8, Call 14): a `<dialog>` shaped
// like Move to…. The filters apply as they change; Done closes it and focus goes back to the
// Filters button.

const props = defineProps<{
  open: boolean;
  categories: string[];
  people: string[];
  scenes: Array<{ ordinal: number; label: string }>;
}>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement>();

watch(
  () => props.open,
  async (open) => {
    await nextTick();
    if (open && dialog.value && !dialog.value.open) dialog.value.showModal();
    if (!open && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

function onClose() {
  if (props.open) emit('close');
}
</script>

<template>
  <dialog ref="dialog" class="note-filters" aria-labelledby="note-filters-title" @close="onClose">
    <template v-if="props.open">
      <h2 id="note-filters-title">Filter notes</h2>
      <NoteFilterFields
        id-prefix="note-sheet"
        :categories="props.categories"
        :people="props.people"
        :scenes="props.scenes"
        class="stacked"
      />
      <div class="buttons">
        <button type="button" class="btn" autofocus @click="dialog?.close()">Done</button>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.note-filters {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 32px));
  max-height: min(36rem, calc(100dvh - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
h2 {
  margin: 0 0 12px;
  font-size: 16px;
}
.stacked {
  flex-direction: column;
  align-items: stretch;
}
.stacked :deep(.field) {
  justify-content: space-between;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.btn {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
