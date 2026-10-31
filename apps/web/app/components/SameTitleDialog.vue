<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { sameTitleQuestion } from '~/storage/open';

// §9.6: where saving downloads, a file whose title matches a script already in the browser asks
// first. Escape is Cancel.
const dialog = ref<InstanceType<typeof DDialog>>();
let answered = false;

watch(
  sameTitleQuestion,
  async (question) => {
    if (!question) return;
    answered = false;
    await nextTick();
    if (dialog.value && !dialog.value.open) dialog.value.showModal();
  },
  { flush: 'post' },
);

function choose(choice: 'replace' | 'beside' | 'cancel') {
  answered = true;
  dialog.value?.close();
  sameTitleQuestion.value?.answer(choice);
}

// Escape closes the dialog without a button.
function onClose() {
  // A close that comes after another question opened the dialog again is the old one's.
  if (dialog.value?.open) return;
  if (!answered) sameTitleQuestion.value?.answer('cancel');
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="sm"
    aria-labelledby="same-title"
    aria-describedby="same-why"
    @close="onClose"
  >
    <template v-if="sameTitleQuestion">
      <h2 id="same-title" class="d-dialog-title">“{{ sameTitleQuestion.title }}” is already in this browser</h2>
      <p id="same-why">
        You can replace that script with this file, or open the file beside it as a second script.
        Replacing is one change: undo brings the old text back.
      </p>
      <div class="d-dialog-footer">
        <DButton autofocus @click="choose('cancel')">Cancel</DButton>
        <DButton @click="choose('beside')">Open beside it</DButton>
        <DButton variant="primary" @click="choose('replace')">Replace that script</DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0;
}
</style>
