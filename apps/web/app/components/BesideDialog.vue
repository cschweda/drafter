<script setup lang="ts">
import { useBeside } from '~/beside/use-beside';
import DDialog from '~/components/ui/DDialog.vue';
import { useDrafts } from '~/drafts/use-drafts';

// "Keep drafts and cuts next to Boca.fountain?" (drafts-and-cuts design §4.1, Calls 13 and 24):
// Chromium writes beside a file only through its folder, so the writer is asked for it once, the
// first time a draft needs writing (and again from the Drafts and Cuts lists). The folder picked
// must hold the script itself; another folder is explained, and the question stays. Not now keeps
// them in this browser, and the lists say so.

const beside = useBeside();
const { offer } = beside;
const { asking } = useDrafts();
const dialog = ref<InstanceType<typeof DDialog>>();
const choose = ref<{ $el: HTMLElement }>();
const busy = ref(false);
/** Closed by its own buttons, not by Escape: then nothing is remembered. */
let answered = false;

// After Start new draft's own dialog has closed: one modal at a time.
watch(
  [offer, asking],
  async ([wanted, starting]) => {
    await nextTick();
    const el = dialog.value;
    if (!el) return;
    if (wanted && !starting && !el.open) {
      answered = false;
      el.showModal();
      choose.value?.$el.focus();
    } else if (!wanted && el.open) {
      answered = true;
      el.close();
    }
  },
  { flush: 'post' },
);

async function onChoose() {
  if (busy.value) return;
  busy.value = true;
  try {
    await beside.askForFolder();
  } finally {
    busy.value = false;
  }
}

async function onNotNow() {
  answered = true;
  await beside.decline();
}

function onClose() {
  // Escape: asked again from the lists, never remembered as a No.
  if (!answered && offer.value) void beside.decline();
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="sm"
    class="beside"
    aria-labelledby="beside-title"
    aria-describedby="beside-help"
    @close="onClose"
  >
    <template v-if="offer">
      <h2 id="beside-title" class="d-dialog-title">Keep drafts and cuts next to {{ offer.file }}?</h2>
      <div id="beside-help">
        <p class="help">
          Drafter can keep your drafts and cuts as plain files beside the script, in a folder called
          “{{ offer.file.replace(/\.[^.]*$/, '') }} drafts” and a cuts file, so they are backed up with
          it. Choose the folder that holds {{ offer.file }}.
        </p>
        <p v-if="offer.problem" class="problem" role="alert">{{ offer.problem }}</p>
      </div>
      <div class="d-dialog-footer">
        <DButton @click="onNotNow">Not now</DButton>
        <DButton
          ref="choose"
          variant="primary"
          :aria-disabled="busy ? 'true' : undefined"
          @click="onChoose"
        >
          Choose folder…
        </DButton>
      </div>
    </template>
  </DDialog>
</template>

<style scoped>
.help {
  margin: 0 0 12px;
  color: var(--muted);
}
.problem {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--warn-bg);
  color: var(--text);
}
</style>
