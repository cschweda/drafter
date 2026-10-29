<script setup lang="ts">
import { SCENE_COLORS, type SceneDetails } from '@drafter/outline';
import { useEditor } from '~/editor/session';
import { sayOutline } from '~/outline/notice';
import {
  changedDetails,
  detailsDraft,
  sceneDetailsFor,
  takeFocusBack,
} from '~/outline/scene-details';
import { useOutline } from '~/outline/use-outline';

// Scene details (Phase 2 design §9): a scene's synopsis, color, storylines, and the four goal
// fields, written into its header (§5.4). Save writes only what changed, in one undo; Cancel and
// Escape change nothing. The dialog holds the scene's id and finds the scene again when it saves,
// so it never writes at offsets from before an edit.

const outline = useOutline();
const { view } = useEditor();
const dialog = ref<HTMLDialogElement>();

const scene = computed(() => {
  const id = sceneDetailsFor.value;
  const item = id ? outline.itemById(id) : undefined;
  return item?.kind === 'scene' ? item : null;
});
const heading = ref('');
const draft = ref<Required<SceneDetails>>(emptyDraft());
/** Where focus was when the dialog opened, given back when it closes (as in Stats). */
let opener: HTMLElement | null = null;

function emptyDraft(): Required<SceneDetails> {
  return {
    synopsis: '',
    color: null,
    storyline: '',
    goal: '',
    conflict: '',
    outcome: '',
    shift: '',
  };
}

/** A color word in the note that isn't one of Drafter's: shown as it is, and kept unless changed. */
const otherColor = computed(() => {
  const value = scene.value?.color?.value;
  return value && !(SCENE_COLORS as readonly string[]).includes(value) ? value : null;
});

const TEXT_FIELDS = [
  { key: 'storyline', label: 'Storylines', hint: 'Labels, with commas: A, B' },
  { key: 'goal', label: 'Goal', hint: 'What someone wants' },
  { key: 'conflict', label: 'Conflict', hint: 'What is in the way' },
  { key: 'outcome', label: 'Outcome', hint: 'What happens' },
  { key: 'shift', label: 'Shift', hint: 'How things turn: hope → dread' },
] as const;

watch(sceneDetailsFor, async (id) => {
  const found = scene.value;
  if (id && found) {
    heading.value = found.heading || 'Untitled scene';
    draft.value = detailsDraft(found);
  }
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (id && found && !el.open) {
    // A menu's item is never the opener: the menu is closing.
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    el.showModal();
  } else if (!id && el.open) {
    el.close();
  } else if (id && !found) {
    sceneDetailsFor.value = null;
  }
});

function save() {
  const id = sceneDetailsFor.value;
  if (!id || outline.readOnly.value) return;
  const now = outline.itemById(id);
  dialog.value?.close();
  if (now?.kind !== 'scene') {
    void sayOutline('That scene isn’t in the script any more, so nothing was saved.');
    return;
  }
  outline.setDetails(now, changedDetails(now, draft.value));
}

function onSubmit(event: Event) {
  event.preventDefault();
  save();
}

function onClose() {
  sceneDetailsFor.value = null;
  const back = takeFocusBack();
  if (back) back();
  else if (opener?.isConnected) opener.focus();
  else if (view.dom.offsetParent !== null) view.focus();
  opener = null;
}
</script>

<template>
  <dialog
    ref="dialog"
    class="scene-details"
    aria-labelledby="scene-details-title"
    @close="onClose"
  >
    <form v-if="sceneDetailsFor" @submit="onSubmit">
      <h2 id="scene-details-title">Scene details for {{ heading }}</h2>
      <p v-if="outline.readOnly.value" class="why">{{ outline.readOnly.value }}</p>
      <label class="field">
        <span>Synopsis</span>
        <input v-model="draft.synopsis" type="text" autocomplete="off" autofocus />
      </label>
      <label class="field">
        <span>Color</span>
        <select v-model="draft.color">
          <option v-for="color in SCENE_COLORS" :key="color" :value="color">{{ color }}</option>
          <option v-if="otherColor" :value="otherColor">{{ otherColor }}</option>
          <option :value="null">No color</option>
        </select>
      </label>
      <label v-for="field in TEXT_FIELDS" :key="field.key" class="field">
        <span>{{ field.label }}</span>
        <input
          v-model="draft[field.key]"
          type="text"
          autocomplete="off"
          :placeholder="field.hint"
        />
      </label>
      <div class="buttons">
        <button type="button" class="btn" @click="dialog?.close()">Cancel</button>
        <button
          type="submit"
          class="btn primary"
          :aria-disabled="outline.readOnly.value ? 'true' : undefined"
        >
          Save
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.scene-details {
  box-sizing: border-box;
  width: min(32rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
h2 {
  margin: 0 0 12px;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.why {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}
.field {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.field input,
.field select {
  min-width: 0;
  min-height: 30px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.field input::placeholder {
  color: var(--muted);
}
@media (max-width: 30rem) {
  .field {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
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
.btn[aria-disabled='true'] {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
