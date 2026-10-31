<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';

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

const dialog = ref<InstanceType<typeof DDialog>>();

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
  <DDialog size="md" ref="dialog" class="note-filters" aria-labelledby="note-filters-title" @close="onClose">
    <template v-if="props.open">
      <h2 id="note-filters-title" class="d-dialog-title">Filter notes</h2>
      <NoteFilterFields
        id-prefix="note-sheet"
        :categories="props.categories"
        :people="props.people"
        :scenes="props.scenes"
        class="stacked"
      />
      <div class="d-dialog-footer">
        <DButton variant="primary" autofocus @click="dialog?.close()">Done</DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
.note-filters {
  max-height: min(36rem, calc(100dvh - 32px));
}
.stacked {
  flex-direction: column;
  align-items: stretch;
}
.stacked :deep(.field) {
  justify-content: space-between;
}
</style>
