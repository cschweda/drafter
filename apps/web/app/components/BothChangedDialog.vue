<script setup lang="ts">
import { type BothChangedChoice, bothChangedQuestion } from '~/storage/check';

// §9.6: the file and this browser's text both changed since the last save. Either answer keeps the
// other version as a script of its own, so nothing is lost. Escape is neither: it asks again later.
const dialog = ref<HTMLDialogElement>();
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
  <dialog
    ref="dialog"
    class="confirm"
    aria-labelledby="both-title"
    aria-describedby="both-why"
    @close="onClose"
  >
    <template v-if="bothChangedQuestion">
      <h2 id="both-title">“{{ bothChangedQuestion.title }}” changed in two places</h2>
      <p id="both-why">
        {{ bothChangedQuestion.fileName }} changed since you last saved it, and so did this
        browser's copy. Choose the one to keep working on. Drafter keeps the other as a new script,
        so nothing is lost.
      </p>
      <div class="buttons">
        <button type="button" class="btn" @click="choose('file')">Open the file</button>
        <button type="button" class="btn" autofocus @click="choose('browser')">
          Keep this browser's version
        </button>
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
</style>
