<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { openTreatment, saveTreatment, treatmentOpen } from '~/outline/treatment';

// Export as treatment (Phase 2 design §6.4): the outline as Markdown, with each scene's first
// paragraph of action if the writer wants it, saved as a file or opened as a document.
const dialog = ref<HTMLDialogElement>();
const firstAction = ref(false);
const working = ref(false);
const { view } = useEditor();
/** What had focus when the dialog opened: the Export menu's button, the palette's input, … */
let opener: HTMLElement | null = null;

watch(treatmentOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    // A menu's item is never the opener: the menu is closing (as in the Stats window).
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
  <dialog
    ref="dialog"
    class="treatment"
    aria-labelledby="treatment-title"
    aria-describedby="treatment-what"
    @close="onClose"
  >
    <h2 id="treatment-title">Export as treatment</h2>
    <p id="treatment-what">
      A Markdown file of the outline: each section’s title, and each scene’s heading and
      synopses.
    </p>
    <label class="choice">
      <input v-model="firstAction" type="checkbox" />
      Include each scene’s first paragraph of action
    </label>
    <div class="buttons">
      <button type="button" class="btn" @click="dialog?.close()">Cancel</button>
      <button type="button" class="btn" :disabled="working" @click="open">
        Open as a document
      </button>
      <button type="button" class="btn primary" autofocus @click="save">Save file</button>
    </div>
  </dialog>
</template>

<style scoped>
.treatment {
  box-sizing: border-box;
  width: min(28rem, calc(100vw - 32px));
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
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
.choice input {
  width: 16px;
  height: 16px;
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
</style>
