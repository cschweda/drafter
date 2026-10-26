<script setup lang="ts">
import { removing } from '~/commands/remove';
import { useEditor } from '~/editor/session';
import { useScript } from '~/storage/script';

// "Remove from this browser" from the command palette: the same question the Scripts menu asks
// about a script in its list, asked here about the one that is open.
const script = useScript();
const dialog = ref<HTMLDialogElement>();
const changedSince = ref(false);
const message = ref('');
const working = ref(false);

const neverSaved = computed(
  () => !!removing.value && removing.value.savedHash === undefined && !removing.value.fileName,
);

watch(removing, async (p) => {
  message.value = '';
  changedSince.value = false;
  if (!p) return;
  try {
    changedSince.value = await script.changed(p);
  } catch {
    changedSince.value = true;
  }
  await nextTick();
  if (removing.value && dialog.value && !dialog.value.open) dialog.value.showModal();
});

function cancel() {
  dialog.value?.close();
}

function onClose() {
  removing.value = null;
}

async function confirm() {
  const p = removing.value;
  if (!p || working.value) return;
  working.value = true;
  message.value = '';
  try {
    const result = await script.remove(p.id);
    if (result === 'held') {
      message.value = `“${p.title}” is open for editing in another tab, so it can’t be removed. Close it there first.`;
      return;
    }
  } catch {
    message.value = 'That didn’t work. Nothing was removed.';
    return;
  } finally {
    working.value = false;
  }
  dialog.value?.close();
  useEditor().view.focus();
}
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm"
    aria-labelledby="remove-open-title"
    aria-describedby="remove-open-why"
    @close="onClose"
  >
    <template v-if="removing">
      <h2 id="remove-open-title">Remove “{{ removing.title }}” from this browser?</h2>
      <p id="remove-open-why">
        Drafter forgets this script and its recovery copy. A file you saved it to isn’t touched.
        <template v-if="neverSaved">
          This script has never been saved to a file, so removing it deletes the only copy.
        </template>
        <template v-else-if="changedSince">
          Changes since you last saved it to a file are lost.
        </template>
      </p>
      <p v-if="message" role="alert" class="message">{{ message }}</p>
      <div class="buttons">
        <button type="button" class="btn" autofocus @click="cancel">Cancel</button>
        <button type="button" class="btn danger" :disabled="working" @click="confirm">
          Remove
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
}
.message {
  padding-left: 8px;
  border-left: 3px solid var(--heading);
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
.btn:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.danger {
  border-color: var(--heading);
  box-shadow: inset 0 -2px 0 var(--heading);
}
</style>
