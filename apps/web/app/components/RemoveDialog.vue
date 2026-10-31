<script setup lang="ts">
import { removing } from '~/commands/remove';
import DDialog from '~/components/ui/DDialog.vue';
import { useEditor } from '~/editor/session';
import { useScript } from '~/storage/script';

// "Remove from this browser" from the command palette: the same question the Scripts menu asks
// about a script in its list, asked here about the one that is open.
const script = useScript();
const dialog = ref<InstanceType<typeof DDialog>>();
const changedSince = ref(false);
const message = ref('');
const working = ref(false);

const neverSaved = computed(
  () => !!removing.value && removing.value.savedHash === undefined && !removing.value.fileName,
);

watch(removing, async (p) => {
  message.value = '';
  changedSince.value = false;
  if (!p) return;
  try {
    changedSince.value = await script.changed(p);
  } catch {
    changedSince.value = true;
  }
  await nextTick();
  if (removing.value && dialog.value && !dialog.value.open) dialog.value.showModal();
});

function cancel() {
  removing.value = null;
  dialog.value?.close();
}

// A close that comes after the dialog was opened again is the old close: it changes nothing.
function onClose() {
  if (!dialog.value?.open) removing.value = null;
}

async function confirm() {
  const p = removing.value;
  if (!p || working.value) return;
  working.value = true;
  message.value = '';
  try {
    const result = await script.remove(p.id);
    if (result === 'held') {
      message.value = `“${p.title}” is open for editing in another tab, so it can’t be removed. Close it there first.`;
      return;
    }
  } catch {
    message.value = 'That didn’t work. Nothing was removed.';
    return;
  } finally {
    working.value = false;
  }
  dialog.value?.close();
  useEditor().view.focus();
}
</script>

<template>
  <DDialog size="sm"
    ref="dialog"
    class="confirm"
    aria-labelledby="remove-open-title"
    @cancel.prevent="cancel"
    aria-describedby="remove-open-why"
    @close="onClose"
  >
    <template v-if="removing">
      <h2 id="remove-open-title" class="d-dialog-title">Remove “{{ removing.title }}” from this browser?</h2>
      <p id="remove-open-why">
        Drafter forgets this script and its recovery copy. A file you saved it to isn’t touched.
        <template v-if="neverSaved">
          This script has never been saved to a file, so removing it deletes the only copy.
        </template>
        <template v-else-if="changedSince">
          Changes since you last saved it to a file are lost.
        </template>
      </p>
      <p v-if="message" role="alert" class="message">{{ message }}</p>
      <div class="d-dialog-footer">
        <DButton autofocus @click="cancel">Cancel</DButton>
        <DButton variant="primary" danger :disabled="working" @click="confirm">
          Remove
        </DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0;
}
.message {
  margin-top: 12px;
  padding-left: 8px;
  border-left: 3px solid var(--danger-border);
}
</style>
