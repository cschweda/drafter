<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { productionAsking } from '~/production/commands';
import { useProductionActions } from '~/production/use-commands';

// Clear marks… and Unlock… (production design §6.4): each asks first, saying what is lost, as
// Remove from this browser does. A snapshot is taken before either changes the text.
const dialog = ref<InstanceType<typeof DDialog>>();
const working = ref(false);
/** What the dialog shows: kept while it closes, so its words don't vanish under the fade. */
const shown = ref<'unlock' | 'clear-marks'>('unlock');

watch(productionAsking, async (question) => {
  if (!question) return;
  shown.value = question;
  await nextTick();
  if (productionAsking.value && dialog.value && !dialog.value.open) dialog.value.showModal();
});

function cancel() {
  productionAsking.value = null;
  dialog.value?.close();
}

function onClose() {
  if (!dialog.value?.open) productionAsking.value = null;
}

async function confirm() {
  const question = productionAsking.value;
  if (!question || working.value) return;
  working.value = true;
  try {
    const actions = useProductionActions();
    await (question === 'unlock' ? actions.unlock() : actions.clearMarks());
  } finally {
    working.value = false;
  }
  productionAsking.value = null;
  dialog.value?.close();
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="sm"
    class="confirm"
    aria-labelledby="production-confirm-title"
    aria-describedby="production-confirm-why"
    @cancel.prevent="cancel"
    @close="onClose"
  >
    <template v-if="shown === 'unlock'">
      <h2 id="production-confirm-title" class="d-dialog-title">
        Unlock pages and scene numbers?
      </h2>
      <div id="production-confirm-why">
        <p>
          The page and scene-number locks go, and so does every revision set with its marks. Your
          text isn’t changed: scene numbers already written stay in the headings, and OMITTED
          scenes stay until you take them out.
        </p>
        <p>A snapshot is taken first, so History can bring the lock and its marks back.</p>
      </div>
    </template>
    <template v-else>
      <h2 id="production-confirm-title" class="d-dialog-title">Clear every revision’s marks?</h2>
      <div id="production-confirm-why">
        <p>
          The marks every revision set made are cleared, and the script stays locked: it starts
          again as a new White draft, with the Blue revision open. The drafts each revision began
          from stay in Drafts.
        </p>
        <p>A snapshot is taken first, so History can bring the marks back.</p>
      </div>
    </template>
    <div class="d-dialog-footer">
      <DButton autofocus @click="cancel">Cancel</DButton>
      <DButton variant="primary" danger :disabled="working" @click="confirm">
        {{ shown === 'unlock' ? 'Unlock' : 'Clear marks' }}
      </DButton>
    </div>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0;
}
p + p {
  margin-top: 8px;
}
</style>
