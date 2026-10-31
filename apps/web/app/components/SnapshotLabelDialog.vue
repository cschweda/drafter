<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { snapshotTime } from '~/snapshots/history';
import type { SnapshotInfo } from '~/storage/snapshots';

// Label… (Phase 2 design §11.1): a snapshot's label, typed. An empty one takes the label off. A
// labeled snapshot is always kept. A `<dialog>` shaped like Move to….

const props = defineProps<{
  /** The snapshot as listed when the dialog opened; null while closed. */
  snapshot: SnapshotInfo | null;
}>();
const emit = defineEmits<{ save: [label: string]; close: [] }>();

const dialog = ref<InstanceType<typeof DDialog>>();
const label = ref('');

watch(
  () => props.snapshot,
  async (snapshot) => {
    label.value = snapshot?.label ?? '';
    await nextTick();
    if (snapshot && dialog.value && !dialog.value.open) dialog.value.showModal();
    if (!snapshot && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

function onSubmit(event: Event) {
  event.preventDefault();
  const typed = label.value.trim();
  dialog.value?.close();
  emit('save', typed);
}

function onClose() {
  if (props.snapshot) emit('close');
}
</script>

<template>
  <DDialog size="sm"
    ref="dialog"
    class="snapshot-label"
    aria-labelledby="snapshot-label-title"
    aria-describedby="snapshot-label-help"
    @close="onClose"
  >
    <form v-if="props.snapshot" @submit="onSubmit">
      <h2 id="snapshot-label-title" class="d-dialog-title">Label the snapshot from {{ snapshotTime(props.snapshot.createdAt) }}</h2>
      <p id="snapshot-label-help" class="help">
        A labeled snapshot is always kept. Leave it empty to take the label off.
      </p>
      <label class="field">
        <span>Label</span>
        <input v-model="label" type="text" autocomplete="off" maxlength="200" autofocus />
      </label>
      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton variant="primary" type="submit">Save</DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
h2 {
  overflow-wrap: anywhere;
}
.help {
  margin: 0 0 12px;
  color: var(--muted);
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field input {
  flex: 1;
  min-width: 0;
  min-height: 30px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
</style>
