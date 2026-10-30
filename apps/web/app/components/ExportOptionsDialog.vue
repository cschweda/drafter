<script setup lang="ts">
import type { SceneNumbering, TitlePageMode } from '@drafter/layout';
import { useEditor } from '~/editor/session';
import {
  EXPORT_OPTION_HINTS,
  EXPORT_OPTION_LABELS,
  exportOptionsOf,
  exportOptionsOpen,
  FDX_NOTE,
  OPTIONS_NOT_FOR_MARKDOWN,
  OPTIONS_READ_ONLY,
  setExportOption,
} from '~/storage/export-options';
import { useGuard } from '~/storage/guard';
import { useScript } from '~/storage/script';

// Export options (out-the-door design §2.4): how the open script's exports print its scene numbers
// and its title page. Each choice is kept the moment it is made, on the script's project, never in
// its text; Done closes. Export as PDF still saves at once, with the options the script has.
const dialog = ref<HTMLDialogElement>();
const script = useScript();
const { readOnly } = useGuard();
const { kind } = useEditor();
const options = computed(() => exportOptionsOf(script.project.value));
const markdown = computed(() => kind.value === 'markdown');
/** Why the choices can't be changed here, or null when they can. */
const why = computed(() =>
  markdown.value ? OPTIONS_NOT_FOR_MARKDOWN : readOnly.value ? OPTIONS_READ_ONLY : null,
);
const failed = ref(false);

const SCENE_CHOICES = Object.keys(EXPORT_OPTION_LABELS.sceneNumbers) as SceneNumbering[];
const TITLE_CHOICES = Object.keys(EXPORT_OPTION_LABELS.titlePage) as TitlePageMode[];

watch(exportOptionsOpen, async (open) => {
  await nextTick();
  if (open) failed.value = false;
  if (open && dialog.value && !dialog.value.open) dialog.value.showModal();
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  exportOptionsOpen.value = false;
}

async function choose<K extends 'sceneNumbers' | 'titlePage'>(
  key: K,
  value: K extends 'sceneNumbers' ? SceneNumbering : TitlePageMode,
) {
  failed.value = false;
  try {
    await setExportOption(key, value as never);
  } catch {
    failed.value = true;
  }
}
</script>

<template>
  <dialog
    ref="dialog"
    class="export-options"
    aria-labelledby="export-options-title"
    aria-describedby="export-options-what"
    @close="onClose"
  >
    <h2 id="export-options-title">Export options</h2>
    <p id="export-options-what">
      How this script’s PDF and plain text print. The script itself doesn’t change.
    </p>
    <p v-if="why" class="why">{{ why }}</p>
    <fieldset :disabled="!!why">
      <legend>Scene numbers</legend>
      <div v-for="choice in SCENE_CHOICES" :key="choice" class="choice">
        <input
          :id="`export-scene-${choice}`"
          type="radio"
          name="export-scene-numbers"
          :value="choice"
          :checked="options.sceneNumbers === choice"
          :aria-describedby="`export-scene-${choice}-hint`"
          @change="choose('sceneNumbers', choice)"
        />
        <div>
          <label :for="`export-scene-${choice}`">{{ EXPORT_OPTION_LABELS.sceneNumbers[choice] }}</label>
          <span :id="`export-scene-${choice}-hint`" class="hint">{{
            EXPORT_OPTION_HINTS.sceneNumbers[choice]
          }}</span>
        </div>
      </div>
    </fieldset>
    <fieldset :disabled="!!why">
      <legend>Title page</legend>
      <div v-for="choice in TITLE_CHOICES" :key="choice" class="choice">
        <input
          :id="`export-title-${choice}`"
          type="radio"
          name="export-title-page"
          :value="choice"
          :checked="options.titlePage === choice"
          :aria-describedby="`export-title-${choice}-hint`"
          @change="choose('titlePage', choice)"
        />
        <div>
          <label :for="`export-title-${choice}`">{{ EXPORT_OPTION_LABELS.titlePage[choice] }}</label>
          <span :id="`export-title-${choice}-hint`" class="hint">{{
            EXPORT_OPTION_HINTS.titlePage[choice]
          }}</span>
        </div>
      </div>
    </fieldset>
    <p class="note">{{ FDX_NOTE }}</p>
    <p v-if="failed" role="alert" class="failed">
      Couldn’t keep that choice in this browser. Try again.
    </p>
    <div class="buttons">
      <button type="button" class="btn primary" autofocus @click="dialog?.close()">Done</button>
    </div>
  </dialog>
</template>

<style scoped>
.export-options {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
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
.why {
  color: var(--text);
}
fieldset {
  margin: 0 0 12px;
  padding: 8px 12px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
}
legend {
  padding: 0 4px;
  font-size: 13px;
  font-weight: 600;
}
.choice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 0;
  font-size: 13px;
}
.choice input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
}
.hint {
  display: block;
  color: var(--muted);
  font-size: 12px;
}
fieldset:disabled label {
  cursor: default;
}
.failed {
  color: var(--text);
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
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
