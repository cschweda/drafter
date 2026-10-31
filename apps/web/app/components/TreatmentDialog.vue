<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { useEditor } from '~/editor/session';
import { openTreatment, saveTreatment, treatmentOpen } from '~/outline/treatment';

// Export as treatment (Phase 2 design §6.4): the outline as Markdown, with each scene's first
// paragraph of action if the writer wants it, saved as a file or opened as a document.
const dialog = ref<InstanceType<typeof DDialog>>();
const firstAction = ref(false);
const working = ref(false);
const { view } = useEditor();
/** What had focus when the dialog opened: the Export menu's button, the palette's input, … */
let opener: HTMLElement | null = null;

watch(treatmentOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    // A menu's item is never the opener: the menu is closing, though its fade can keep the item on
    // the page.
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    dialog.value.showModal();
  }
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  treatmentOpen.value = false;
  // An opener that has gone since (the palette's input, a menu's item) can't have focus back:
  // then the script has it, when the Source shows. Open as a document moves it on itself.
  if (working.value) opener = null;
  else if (opener?.isConnected) opener.focus();
  else if (view.dom.offsetParent !== null) view.focus();
  opener = null;
}

async function save() {
  // The picker needs the click, so it comes first; the dialog closes after.
  const done = saveTreatment(firstAction.value);
  dialog.value?.close();
  await done;
}

async function open() {
  if (working.value) return;
  working.value = true;
  try {
    dialog.value?.close();
    await openTreatment(firstAction.value);
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <DDialog size="md"
    ref="dialog"
    class="treatment"
    aria-labelledby="treatment-title"
    aria-describedby="treatment-what"
    @close="onClose"
  >
    <h2 id="treatment-title" class="d-dialog-title">Export as treatment</h2>
    <p id="treatment-what">
      A Markdown file of the outline: each section’s title, and each scene’s heading and
      synopses.
    </p>
    <label class="choice">
      <input v-model="firstAction" type="checkbox" />
      Include each scene’s first paragraph of action
    </label>
    <div class="d-dialog-footer">
      <DButton @click="dialog?.close()">Cancel</DButton>
      <DButton :disabled="working" @click="open">
        Open as a document
      </DButton>
      <DButton variant="primary" autofocus @click="save">Save file</DButton>
    </div>
  </DDialog>
</template>

<style scoped>
p {
  margin: 0 0 12px;
  color: var(--muted);
}
.choice {
  display: flex;
  align-items: center;
  gap: 8px;
}
.choice input {
  width: 16px;
  height: 16px;
}
</style>
