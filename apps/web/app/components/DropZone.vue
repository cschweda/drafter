<script setup lang="ts">
import { useFiles } from '~/storage/files';
import { openError, openFile } from '~/storage/open';

// A file dropped anywhere on the window opens as a script (Phase 1 design §9.3). While one is
// dragged over, the zone says so. Text dragged inside the page isn't a file and is left alone.
const over = ref(false);
// dragenter and dragleave fire for every element crossed; the zone is over while they balance.
let depth = 0;

const hasFiles = (event: DragEvent) =>
  Array.from(event.dataTransfer?.types ?? []).includes('Files');

function onEnter(event: DragEvent) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  depth++;
  over.value = true;
}

function onOver(event: DragEvent) {
  if (!hasFiles(event)) return;
  // Without this the browser would not let the drop happen, and would open the file itself.
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onLeave(event: DragEvent) {
  if (!hasFiles(event)) return;
  depth = Math.max(0, depth - 1);
  if (depth === 0) over.value = false;
}

function stop() {
  depth = 0;
  over.value = false;
}

function onDrop(event: DragEvent) {
  if (!hasFiles(event)) return;
  event.preventDefault();
  stop();
  // A dropped item can only be read until this handler returns, so it is handed over now.
  const item = Array.from(event.dataTransfer?.items ?? []).find((i) => i.kind === 'file');
  if (!item) return;
  useFiles()
    .fromDrop(item)
    .then((file) => {
      if (file) return openFile(file);
      openError.value = 'That isn’t a file Drafter can open. Drop a .fountain or .txt file.';
    })
    .catch(() => {
      openError.value = 'Couldn’t open the file. Your current script is unchanged.';
    });
}

onMounted(() => {
  window.addEventListener('dragenter', onEnter);
  window.addEventListener('dragover', onOver);
  window.addEventListener('dragleave', onLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('dragend', stop);
});
onBeforeUnmount(() => {
  window.removeEventListener('dragenter', onEnter);
  window.removeEventListener('dragover', onOver);
  window.removeEventListener('dragleave', onLeave);
  window.removeEventListener('drop', onDrop);
  window.removeEventListener('dragend', stop);
});
</script>

<template>
  <div v-if="over" class="zone" data-drop-zone>
    <p>Drop a .fountain or .txt file to open it</p>
  </div>
</template>

<style scoped>
.zone {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 0.55);
  /* The drop goes to the window, and the zone doesn't take the pointer from what's under it. */
  pointer-events: none;
}
p {
  box-sizing: border-box;
  max-width: 100%;
  margin: 0;
  padding: 28px 36px;
  border: 2px dashed var(--heading);
  border-radius: 12px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 18px;
  font-weight: 600;
  text-align: center;
}
</style>
