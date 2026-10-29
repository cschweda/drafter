<script setup lang="ts">
import { snapshotTime } from '~/snapshots/history';
import type { SnapshotInfo } from '~/storage/snapshots';

// Label… (Phase 2 design §11.1): a snapshot's label, typed. An empty one takes the label off. A
// labeled snapshot is always kept. A `<dialog>` shaped like Move to….

const props = defineProps<{
  /** The snapshot as listed when the dialog opened; null while closed. */
  snapshot: SnapshotInfo | null;
}>();
const emit = defineEmits<{ save: [label: string]; close: [] }>();

const dialog = ref<HTMLDialogElement>();
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
  <dialog
    ref="dialog"
    class="snapshot-label"
    aria-labelledby="snapshot-label-title"
    aria-describedby="snapshot-label-help"
    @close="onClose"
  >
    <form v-if="props.snapshot" @submit="onSubmit">
      <h2 id="snapshot-label-title">Label the snapshot from {{ snapshotTime(props.snapshot.createdAt) }}</h2>
      <p id="snapshot-label-help" class="help">
        A labeled snapshot is always kept. Leave it empty to take the label off.
      </p>
      <label class="field">
        <span>Label</span>
        <input v-model="label" type="text" autocomplete="off" maxlength="200" autofocus />
      </label>
      <div class="buttons">
        <button type="button" class="btn" @click="dialog?.close()">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.snapshot-label {
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
h2 {
  margin: 0 0 6px;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.help {
  margin: 0 0 10px;
  color: var(--muted);
  font-size: 13px;
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.field input {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn.primary {
  border-color: var(--heading);
}
</style>
