<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { markdownQuestion } from '~/editor/markdown-question';
import { useEditor } from '~/editor/session';

// Making a Fountain script a Markdown document asks first. Escape is Cancel. Focus starts on
// Cancel, and goes back to what had it (the chip, or the editor after a palette command).
const dialog = ref<InstanceType<typeof DDialog>>();
let answered = false;

watch(
  markdownQuestion,
  async (question) => {
    if (!question) return;
    answered = false;
    await nextTick();
    if (dialog.value && !dialog.value.open) dialog.value.showModal();
  },
  { flush: 'post' },
);

// The question is about the script that was open: another one opening (a key works under the
// dialog) answers it No. `chooseType` also checks, for a switch that keeps the editor's text.
const { loaded } = useEditor();
watch(loaded, () => {
  if (markdownQuestion.value) choose(false);
});

function choose(ok: boolean) {
  answered = true;
  dialog.value?.close();
  markdownQuestion.value?.answer(ok);
}

// Escape closes the dialog without a button.
function onClose() {
  // A close that comes after another question opened the dialog again is the old one's.
  if (dialog.value?.open) return;
  if (!answered) markdownQuestion.value?.answer(false);
}
</script>

<template>
  <DDialog size="sm"
    ref="dialog"
    class="confirm"
    aria-labelledby="markdown-title"
    aria-describedby="markdown-why"
    @close="onClose"
  >
    <template v-if="markdownQuestion">
      <h2 id="markdown-title" class="d-dialog-title">Make this a Markdown document?</h2>
      <p id="markdown-why">
        The text stays as it is, but Fountain’s formatting, keys, and checks stop applying, and
        the pages give way to a preview. Undo won’t reverse this. Choose Screenplay or Stage play
        in the template menu to switch back; the text is kept.
      </p>
      <div class="d-dialog-footer">
        <DButton autofocus @click="choose(false)">Cancel</DButton>
        <DButton variant="primary" @click="choose(true)">Make it Markdown</DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0;
}
</style>
