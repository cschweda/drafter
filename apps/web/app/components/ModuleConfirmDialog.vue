<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { moduleQuestion } from '~/modules/confirm';

// A question a module asks with `ctx.confirm`: a modal dialog, Cancel focused first, Escape is No.
// The same shape as the other questions the app asks (the Markdown change, the removal).
const dialog = ref<InstanceType<typeof DDialog>>();

watch(
  moduleQuestion,
  async (question) => {
    await nextTick();
    const el = dialog.value;
    if (!el) return;
    if (question && !el.open) el.showModal();
    else if (!question && el.open) el.close();
  },
  { flush: 'post' },
);

function choose(yes: boolean) {
  moduleQuestion.value?.answer(yes);
}

// Escape closes the dialog without a button: that is No. A close that comes after another question
// opened the dialog again is the old one's.
function onClose() {
  if (dialog.value?.open) return;
  moduleQuestion.value?.answer(false);
}
</script>

<template>
  <DDialog size="sm"
    ref="dialog"
    class="confirm"
    aria-labelledby="module-question-title"
    aria-describedby="module-question-why"
    @close="onClose"
  >
    <template v-if="moduleQuestion">
      <h2 id="module-question-title" class="d-dialog-title">{{ moduleQuestion.moduleName }}</h2>
      <p id="module-question-why">{{ moduleQuestion.message }}</p>
      <div class="d-dialog-footer">
        <DButton autofocus @click="choose(false)">
          {{ moduleQuestion.cancelLabel }}
        </DButton>
        <DButton variant="primary" @click="choose(true)">
          {{ moduleQuestion.confirmLabel }}
        </DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0;
  white-space: pre-line;
}
</style>
