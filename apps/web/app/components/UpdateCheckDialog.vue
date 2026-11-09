<script setup lang="ts">
import { currentAbout } from '~/about/info';
import DDialog from '~/components/ui/DDialog.vue';
import { checkMessage } from '~/update/check';
import { actionLabel } from '~/update/flow';
import { runUpdateCheck, takeUpdate, updateCheckOpen, useUpdateCheck } from '~/update/use-check';

// About → Check for updates: "Checking…" with a moving bar (a check can take a while when a new
// version is found and downloads: drafter.dev is rebuilt on every push), then what was found. A new version is the app's own
// offer (`UpdatePrompt.vue`): Reload, Restart, or Get it here does what the offer's button does
// (asking first when changes are unsaved), and Close leaves the offer up. Nothing here reloads
// or restarts by itself.
const dialog = ref<InstanceType<typeof DDialog>>();
const check = useUpdateCheck();
const about = currentAbout();
const app = about.app;

const state = computed(() => check.state.value);
const message = computed(() => checkMessage(state.value, about.version, app));
const ready = computed(() => state.value.status === 'ready' && !!state.value.how);
const busy = computed(() => state.value.status === 'checking' || state.value.status === 'fetching');
const action = ref<HTMLButtonElement>();
/**
 * The dialog's contents are in the page only while it is open, so its status line is never a
 * second page-level status region (the read-only bar's is the one that is always there).
 */
const shown = ref(false);

watch(updateCheckOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    shown.value = true;
    await nextTick();
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
  shown.value = false;
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
  <DDialog size="sm"
    ref="dialog"
    class="check"
    aria-labelledby="check-title"
    aria-describedby="check-what"
    data-update-check
    @close="onClose"
  >
    <template v-if="shown">
      <h2 id="check-title" class="d-dialog-title">Check for updates</h2>
      <p id="check-what" role="status" aria-live="polite" data-update-check-message>{{ message }}</p>
      <!-- Indeterminate: how long a download takes isn't known. Hidden from the tree: the status line says it. -->
      <progress v-if="busy" class="check-bar" aria-hidden="true" data-update-check-busy />
      <div class="d-dialog-footer">
        <DButton v-if="state.status === 'error'" :disabled="busy" @click="again">Try again</DButton>
        <!-- A plain button with DButton's classes: focus is moved to it, by its ref. -->
        <button v-if="ready" ref="action" type="button" class="d-btn d-btn--primary" @click="take">
          {{ actionLabel(state.how ?? 'reload') }}
        </button>
        <DButton :variant="ready ? 'secondary' : 'primary'" autofocus @click="dialog?.close()">
          Close
        </DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0;
}
.check-bar {
  display: block;
  width: 100%;
  height: 4px;
  margin-top: 12px;
  accent-color: var(--accent);
}
</style>
