<script setup lang="ts">
import { moduleQuestion } from '~/modules/confirm';

// A question a module asks with `ctx.confirm`: a modal dialog, Cancel focused first, Escape is No.
// The same shape as the other questions the app asks (the Markdown change, the removal).
const dialog = ref<HTMLDialogElement>();

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
  <dialog
    ref="dialog"
    class="confirm"
    aria-labelledby="module-question-title"
    aria-describedby="module-question-why"
    @close="onClose"
  >
    <template v-if="moduleQuestion">
      <h2 id="module-question-title">{{ moduleQuestion.moduleName }}</h2>
      <p id="module-question-why">{{ moduleQuestion.message }}</p>
      <div class="buttons">
        <button type="button" class="btn" autofocus @click="choose(false)">
          {{ moduleQuestion.cancelLabel }}
        </button>
        <button type="button" class="btn" @click="choose(true)">
          {{ moduleQuestion.confirmLabel }}
        </button>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.confirm {
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 32px));
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
.confirm p {
  margin: 0 0 14px;
  line-height: 1.45;
  white-space: pre-line;
}
.buttons {
  display: flex;
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
</style>
