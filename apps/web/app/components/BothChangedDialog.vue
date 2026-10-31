<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { type BothChangedChoice, bothChangedQuestion } from '~/storage/check';

// §9.6: the file and this browser's text both changed since the last save. Either answer keeps the
// other version as a script of its own, so nothing is lost. Escape is neither: it asks again later.
const dialog = ref<InstanceType<typeof DDialog>>();
let answered = false;

watch(
  bothChangedQuestion,
  async (question) => {
    if (!question) return;
    answered = false;
    await nextTick();
    if (dialog.value && !dialog.value.open) dialog.value.showModal();
  },
  { flush: 'post' },
);

function choose(choice: BothChangedChoice) {
  answered = true;
  dialog.value?.close();
  bothChangedQuestion.value?.answer(choice);
}

// Escape closes the dialog without a button.
function onClose() {
  // A close that comes after another question opened the dialog again is the old one's.
  if (dialog.value?.open) return;
  if (!answered) bothChangedQuestion.value?.answer('later');
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="sm"
    aria-labelledby="both-title"
    aria-describedby="both-why"
    @close="onClose"
  >
    <template v-if="bothChangedQuestion">
      <h2 id="both-title" class="d-dialog-title">“{{ bothChangedQuestion.title }}” changed in two places</h2>
      <p id="both-why">
        {{ bothChangedQuestion.fileName }} changed since you last saved it, and so did this
        browser's copy. Choose the one to keep working on. Drafter keeps the other as a new script,
        so nothing is lost.
      </p>
      <div class="d-dialog-footer">
        <DButton @click="choose('file')">Open the file</DButton>
        <DButton variant="primary" autofocus @click="choose('browser')">
          Keep this browser's version
        </DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0;
}
</style>
