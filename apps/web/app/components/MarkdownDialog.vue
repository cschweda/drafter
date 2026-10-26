<script setup lang="ts">
import { markdownQuestion } from '~/editor/markdown-question';
import { useEditor } from '~/editor/session';

// Making a Fountain script a Markdown document asks first. Escape is Cancel. Focus starts on
// Cancel, and goes back to what had it (the chip, or the editor after a palette command).
const dialog = ref<HTMLDialogElement>();
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
  <dialog
    ref="dialog"
    class="confirm"
    aria-labelledby="markdown-title"
    aria-describedby="markdown-why"
    @close="onClose"
  >
    <template v-if="markdownQuestion">
      <h2 id="markdown-title">Make this a Markdown document?</h2>
      <p id="markdown-why">
        The text stays as it is, but Fountain’s formatting, keys, and checks stop applying, and
        the pages give way to a preview. Undo won’t reverse this. Choose Screenplay or Stage play
        in the template menu to switch back; the text is kept.
      </p>
      <div class="buttons">
        <button type="button" class="btn" autofocus @click="choose(false)">Cancel</button>
        <button type="button" class="btn danger" @click="choose(true)">Make it Markdown</button>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.confirm {
  box-sizing: border-box;
  width: min(28rem, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
}
.confirm::backdrop {
  background: rgb(0 0 0 / 0.5);
}
h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
p {
  margin: 0 0 14px;
  line-height: 1.45;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.danger {
  border-color: var(--heading);
  box-shadow: inset 0 -2px 0 var(--heading);
}
</style>
