<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { saveAsQuestion } from '~/storage/save';

// Save As… in a browser that saves by downloading (Firefox, Safari): there is no picker to type a
// name into, so this asks for one. The file goes to the browser's downloads under that name, and
// the script follows it, so the next Save downloads under it too. Chrome, Edge, and the desktop
// app never show this: their own Save dialog asks. Escape and Cancel save nothing.
const dialog = ref<InstanceType<typeof DDialog>>();
const name = ref('');
let answered = false;

watch(
  saveAsQuestion,
  async (question) => {
    if (!question) return;
    answered = false;
    name.value = question.name;
    await nextTick();
    if (dialog.value && !dialog.value.open) dialog.value.showModal();
    // The name without its extension is selected, ready to type over.
    const input = document.getElementById('save-as-name') as HTMLInputElement | null;
    const dot = question.name.lastIndexOf('.');
    input?.focus();
    input?.setSelectionRange(0, dot > 0 ? dot : question.name.length);
  },
  { flush: 'post' },
);

function onSubmit(event: Event) {
  event.preventDefault();
  if (name.value.trim() === '') return;
  answered = true;
  dialog.value?.close();
  saveAsQuestion.value?.answer(name.value);
}

function cancel() {
  dialog.value?.close();
}

function onClose() {
  if (dialog.value?.open) return;
  if (!answered) saveAsQuestion.value?.answer(null);
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="sm"
    aria-labelledby="save-as-title"
    aria-describedby="save-as-why"
    @close="onClose"
  >
    <form v-if="saveAsQuestion" @submit="onSubmit">
      <h2 id="save-as-title" class="d-dialog-title">Save As</h2>
      <p id="save-as-why">
        This browser saves a script by downloading it. Give this version a name, and it goes to
        your downloads beside any you saved before.
      </p>
      <label class="field" for="save-as-name">File name</label>
      <input
        id="save-as-name"
        v-model="name"
        type="text"
        class="name"
        autocomplete="off"
        spellcheck="false"
        required
      />
      <div class="d-dialog-footer">
        <DButton type="button" @click="cancel">Cancel</DButton>
        <DButton variant="primary" type="submit">Save</DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0 0 12px;
}
.field {
  display: block;
  margin-bottom: 4px;
  font-weight: 600;
}
.name {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.name:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
</style>
