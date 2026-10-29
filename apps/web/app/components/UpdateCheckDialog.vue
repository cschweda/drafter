<script setup lang="ts">
import { currentAbout } from '~/about/info';
import { checkMessage } from '~/update/check';
import { actionLabel } from '~/update/flow';
import { runUpdateCheck, takeUpdate, updateCheckOpen, useUpdateCheck } from '~/update/use-check';

// Help → Check for updates: "Checking…", then what was found. A new version is the app's own
// offer (`UpdatePrompt.vue`): Reload, Restart, or Get it here does what the offer's button does
// (asking first when changes are unsaved), and Close leaves the offer up. Nothing here reloads
// or restarts by itself.
const dialog = ref<HTMLDialogElement>();
const check = useUpdateCheck();
const about = currentAbout();
const app = about.app;

const state = computed(() => check.state.value);
const message = computed(() => checkMessage(state.value, about.version, app));
const ready = computed(() => state.value.status === 'ready' && !!state.value.how);
const busy = computed(() => state.value.status === 'checking');
const action = ref<HTMLButtonElement>();

watch(updateCheckOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    dialog.value.showModal();
    await runUpdateCheck();
    // The choice it found gets focus; otherwise Close keeps it.
    if (ready.value) {
      await nextTick();
      action.value?.focus();
    }
  }
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  updateCheckOpen.value = false;
}

function take() {
  dialog.value?.close();
  takeUpdate();
}

async function again() {
  await runUpdateCheck();
}
</script>

<template>
  <dialog
    ref="dialog"
    class="check"
    aria-labelledby="check-title"
    aria-describedby="check-what"
    data-update-check
    @close="onClose"
  >
    <h2 id="check-title">Check for updates</h2>
    <p id="check-what" role="status" aria-live="polite" data-update-check-message>{{ message }}</p>
    <div class="buttons">
      <button
        v-if="state.status === 'error'"
        type="button"
        class="btn"
        :disabled="busy"
        @click="again"
      >
        Try again
      </button>
      <button v-if="ready" ref="action" type="button" class="btn primary" @click="take">
        {{ actionLabel(state.how ?? 'reload') }}
      </button>
      <button type="button" class="btn" :class="{ primary: !ready }" autofocus @click="dialog?.close()">
        Close
      </button>
    </div>
  </dialog>
</template>

<style scoped>
.check {
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
p {
  margin: 0;
  font-size: 13px;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.btn {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn.primary {
  border-color: var(--heading);
}
.btn:disabled {
  opacity: 0.6;
  cursor: default;
}
.btn:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
