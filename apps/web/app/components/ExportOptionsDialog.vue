<script setup lang="ts">
import type { SceneNumbering, TitlePageMode } from '@drafter/layout';
import DDialog from '~/components/ui/DDialog.vue';
import { useEditor } from '~/editor/session';
import {
  EXPORT_OPTION_HINTS,
  EXPORT_OPTION_LABELS,
  exportOptionsOf,
  exportOptionsOpen,
  FDX_NOTE,
  NOTES_LEGEND,
  NOTES_ONLY_MARKDOWN,
  OPTIONS_INTRO_MARKDOWN,
  OPTIONS_NOT_FOR_MARKDOWN,
  OPTIONS_READ_ONLY,
  REOPEN_HINT,
  REOPEN_LABEL,
  setExportOption,
} from '~/storage/export-options';
import { useGuard } from '~/storage/guard';
import { useScript } from '~/storage/script';
import type { ExportOptions } from '~/workers/export-compute';

// Export options (out-the-door design §2.4): how the open script's exports print its scene numbers
// and its title page, and whether its Markdown, HTML, and EPUB files carry its notes (Call 28).
// "Let Drafter reopen this file" puts the whole script in its HTML and EPUB files (reopenable
// exports), for a Markdown document too, whose dialog offers only that.
// Each choice is kept the moment it is made, on the script's project, never in its text; Done
// closes.
// Export as PDF still saves at once, with the options the script has.
const dialog = ref<InstanceType<typeof DDialog>>();
const script = useScript();
const { readOnly } = useGuard();
const { kind, view } = useEditor();
const options = computed(() => exportOptionsOf(script.project.value));
const markdown = computed(() => kind.value === 'markdown');
/**
 * Why the script's choices can't be changed here, each said: a Markdown document has none of
 * them, and a read-only tab can change nothing (Let Drafter reopen this file included, which
 * then points at that reason). Both, when a Markdown document is read-only here.
 */
const why = computed(() =>
  [
    markdown.value ? OPTIONS_NOT_FOR_MARKDOWN : null,
    readOnly.value ? OPTIONS_READ_ONLY : null,
  ].filter((reason): reason is string => reason !== null),
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
    // A menu's item is never the opener: the menu is closing, though its fade can keep the item on
    // the page.
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

async function choose<K extends keyof ExportOptions>(
  key: K,
  value: ExportOptions[K] | (K extends 'reopenable' ? false : never),
) {
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
  <DDialog size="md"
    ref="dialog"
    class="export-options"
    aria-labelledby="export-options-title"
    aria-describedby="export-options-what"
    @close="onClose"
  >
    <h2 id="export-options-title" class="d-dialog-title">Export options</h2>
    <p v-if="markdown" id="export-options-what">{{ OPTIONS_INTRO_MARKDOWN }}</p>
    <p v-else id="export-options-what">
      How this script prints and exports: as a PDF, an HTML page, an EPUB, plain text, a Final Draft
      file, or Markdown. The script itself doesn’t change.
    </p>
    <p v-if="markdown" class="why">{{ OPTIONS_NOT_FOR_MARKDOWN }}</p>
    <p v-if="readOnly" id="export-options-read-only" class="why">{{ OPTIONS_READ_ONLY }}</p>
    <fieldset :key="`scene-${drawn}`" :disabled="why.length > 0">
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
    <fieldset :key="`title-${drawn}`" :disabled="why.length > 0">
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
    <fieldset :key="`notes-${drawn}`" :disabled="why.length > 0" aria-describedby="export-notes-what">
      <legend>{{ NOTES_LEGEND }}</legend>
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
    <fieldset
      :key="`reopen-${drawn}`"
      :disabled="readOnly"
      :aria-describedby="readOnly ? 'export-options-read-only' : undefined"
      class="reopen"
    >
      <legend>HTML and EPUB</legend>
      <div class="choice">
        <input
          id="export-reopenable"
          type="checkbox"
          :checked="options.reopenable === true"
          aria-describedby="export-reopenable-hint"
          @change="choose('reopenable', ($event.target as HTMLInputElement).checked || false)"
        />
        <div>
          <label for="export-reopenable">{{ REOPEN_LABEL }}</label>
          <span id="export-reopenable-hint" class="hint">{{ REOPEN_HINT }}</span>
        </div>
      </div>
    </fieldset>
    <p v-if="!markdown" class="note">{{ FDX_NOTE }}</p>
    <p v-if="failed" role="alert" class="failed">
      Couldn’t keep that choice in this browser. Try again.
    </p>
    <div class="d-dialog-footer">
      <DButton variant="primary" autofocus @click="dialog?.close()">Done</DButton>
    </div>
  </DDialog>
</template>

<style scoped>
.export-options {
  overflow-y: auto;
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
  border: 1px solid var(--border);
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
</style>
