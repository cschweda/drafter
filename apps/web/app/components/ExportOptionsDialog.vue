<script setup lang="ts">
import type { SceneNumbering, TitlePageMode } from '@drafter/layout';
import { useEditor } from '~/editor/session';
import {
  EXPORT_OPTION_HINTS,
  EXPORT_OPTION_LABELS,
  exportOptionsOf,
  exportOptionsOpen,
  FDX_NOTE,
  NOTES_ONLY_MARKDOWN,
  OPTIONS_NOT_FOR_MARKDOWN,
  OPTIONS_READ_ONLY,
  setExportOption,
} from '~/storage/export-options';
import { useGuard } from '~/storage/guard';
import { useScript } from '~/storage/script';
import type { ExportOptions } from '~/workers/export-compute';

// Export options (out-the-door design §2.4): how the open script's exports print its scene numbers
// and its title page, and whether its Markdown file carries its notes (Call 28). Each choice is
// kept the moment it is made, on the script's project, never in its text; Done closes. Export as PDF still saves at once, with the options the script has.
const dialog = ref<HTMLDialogElement>();
const script = useScript();
const { readOnly } = useGuard();
const { kind, view } = useEditor();
const options = computed(() => exportOptionsOf(script.project.value));
const markdown = computed(() => kind.value === 'markdown');
/** Why the choices can't be changed here, or null when they can. */
const why = computed(() =>
  markdown.value ? OPTIONS_NOT_FOR_MARKDOWN : readOnly.value ? OPTIONS_READ_ONLY : null,
);
const failed = ref(false);

const SCENE_CHOICES = Object.keys(EXPORT_OPTION_LABELS.sceneNumbers) as SceneNumbering[];
const TITLE_CHOICES = Object.keys(EXPORT_OPTION_LABELS.titlePage) as TitlePageMode[];
const NOTES_CHOICES = Object.keys(EXPORT_OPTION_LABELS.notes) as ExportOptions['notes'][];

/** What had focus when the dialog opened: the Export menu's button, the palette's input, … */
let opener: HTMLElement | null = null;

watch(exportOptionsOpen, async (open) => {
  await nextTick();
  if (open) failed.value = false;
  if (open && dialog.value && !dialog.value.open) {
    // A menu's item is never the opener: the menu is closing (as in the Stats window).
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    dialog.value.showModal();
  }
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  exportOptionsOpen.value = false;
  // The browser gives focus back too, but not to an opener that has gone since (the palette's
  // input, a menu's item): then the script has it, when the Source shows.
  if (opener?.isConnected) opener.focus();
  else if (view.dom.offsetParent !== null) view.focus();
  opener = null;
}

// Bumped when a choice couldn't be kept, so the radios are drawn again from what is stored.
const drawn = ref(0);

async function choose<K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) {
  failed.value = false;
  try {
    await setExportOption(key, value);
  } catch {
    failed.value = true;
    drawn.value++;
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
      How this script prints and exports: as a PDF, plain text, a Final Draft file, or Markdown. The
      script itself doesn’t change.
    </p>
    <p v-if="why" class="why">{{ why }}</p>
    <fieldset :key="`scene-${drawn}`" :disabled="!!why">
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
    <fieldset :key="`title-${drawn}`" :disabled="!!why">
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
    <fieldset :key="`notes-${drawn}`" :disabled="!!why" aria-describedby="export-notes-what">
      <legend>Notes in Markdown</legend>
      <p id="export-notes-what" class="fieldset-note">{{ NOTES_ONLY_MARKDOWN }}</p>
      <div v-for="choice in NOTES_CHOICES" :key="choice" class="choice">
        <input
          :id="`export-notes-${choice}`"
          type="radio"
          name="export-notes"
          :value="choice"
          :checked="options.notes === choice"
          :aria-describedby="`export-notes-${choice}-hint`"
          @change="choose('notes', choice)"
        />
        <div>
          <label :for="`export-notes-${choice}`">{{ EXPORT_OPTION_LABELS.notes[choice] }}</label>
          <span :id="`export-notes-${choice}-hint`" class="hint">{{
            EXPORT_OPTION_HINTS.notes[choice]
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
.fieldset-note {
  margin: 0 0 4px;
  font-size: 12px;
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
