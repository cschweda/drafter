<script setup lang="ts">
import { draftName } from '@drafter/history';
import { draftNotice } from '~/beside/draft-open';
import { useEditor } from '~/editor/session';
import { sayOutline } from '~/outline/notice';
import { pickAndOpen } from '~/storage/open';
import { listProjects } from '~/storage/projects';
import { useScript } from '~/storage/script';

// The note bar over a draft file opened as a script (drafts-and-cuts design §4.2): "This is
// Draft 03 of Boca. It is read-only, as it was frozen." The editor stays read-only while it shows.
// Open a copy to keep writing makes the text editable: it is already a copy, never bound to the
// draft file, so Save asks where to keep it. Open Boca instead opens the work: the script of that
// file in this browser if there is one, else Open, to choose it (the browser, and the desktop
// app's grants, can't reach a file beside another by its name alone).

const script = useScript();
const editor = useEditor();
const shown = computed(() => {
  const notice = draftNotice.value;
  return notice && notice.projectId === script.project.value?.id ? notice : null;
});
watch(
  () => shown.value?.readOnly === true,
  (on) => editor.setFrozen(on),
  { immediate: true },
);

function keepWriting() {
  draftNotice.value = null;
  editor.view.focus();
  void sayOutline('This is a copy of the draft now. Save asks where to keep it.');
}

async function openWork() {
  const notice = shown.value;
  if (!notice) return;
  const names =
    notice.kind === 'markdown'
      ? [`${notice.work}.md`, `${notice.work}.markdown`]
      : [`${notice.work}.fountain`];
  const work = (await listProjects()).find(
    (p) =>
      p.id !== notice.projectId &&
      !p.sample &&
      p.fileName !== undefined &&
      names.includes(p.fileName),
  );
  draftNotice.value = null;
  if (work) await script.open(work.id);
  else await pickAndOpen();
}
</script>

<template>
  <section v-if="shown" class="bar" aria-label="Draft file">
    <p class="text">
      This is {{ draftName(shown.n) }} of {{ shown.work }}.<template v-if="shown.readOnly"> It is read-only, as it was frozen.</template>
    </p>
    <button v-if="shown.readOnly" type="button" class="action" @click="keepWriting">Open a copy to keep writing</button>
    <button type="button" class="action" @click="openWork">Open {{ shown.work }} instead</button>
    <button v-if="!shown.readOnly" type="button" class="action" aria-label="Close the note about this draft" @click="draftNotice = null">
      <UIcon name="i-lucide-x" aria-hidden="true" />
    </button>
  </section>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 4px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
}
.text {
  margin: 0 auto 0 0;
}
.action {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.action:hover {
  background: var(--overlay);
}
</style>
