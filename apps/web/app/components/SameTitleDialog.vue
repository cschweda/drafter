<script setup lang="ts">
import { sameTitleQuestion } from '~/storage/open';

// §9.6: where saving downloads, a file whose title matches a script already in the browser asks
// first. Escape is Cancel.
const dialog = ref<HTMLDialogElement>();
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
  <dialog
    ref="dialog"
    class="confirm"
    aria-labelledby="same-title"
    aria-describedby="same-why"
    @close="onClose"
  >
    <template v-if="sameTitleQuestion">
      <h2 id="same-title">“{{ sameTitleQuestion.title }}” is already in this browser</h2>
      <p id="same-why">
        You can replace that script with this file, or open the file beside it as a second script.
        Replacing is one change: undo brings the old text back.
      </p>
      <div class="buttons">
        <button type="button" class="btn" autofocus @click="choose('cancel')">Cancel</button>
        <button type="button" class="btn" @click="choose('beside')">Open beside it</button>
        <button type="button" class="btn danger" @click="choose('replace')">
          Replace that script
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
.danger {
  border-color: var(--heading);
  box-shadow: inset 0 -2px 0 var(--heading);
}
</style>
