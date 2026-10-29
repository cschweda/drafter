<script setup lang="ts">
import { isTagWord } from '@drafter/notes';
import { useEditor } from '~/editor/session';
import { categoriesInUse } from '~/notes/filter';
import { newNoteOpen, takeNewNoteBack, useNotes } from '~/notes/use-notes';
import { sayOutline } from '~/outline/notice';
import { useOutline } from '~/outline/use-outline';

// New note (Phase 2 design §8): the text and an optional category, put at the end of the cursor's
// line (`insertNote`, Call 6) as `[[text #category]]`, in one undo. Opened from the Notes tab's
// button and the palette; the element bar's Note button keeps wrapping the selection.

const notes = useNotes();
const outline = useOutline();
const { view } = useEditor();
const dialog = ref<HTMLDialogElement>();
const text = ref('');
const category = ref('');
const problem = ref('');
const categories = computed(() => categoriesInUse(notes.entries.value));
const readOnly = computed(() => outline.readOnly.value);
let opener: HTMLElement | null = null;

watch(newNoteOpen, async (open) => {
  if (open) {
    text.value = '';
    category.value = '';
    problem.value = '';
  }
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    el.showModal();
  } else if (!open && el.open) el.close();
});

function onSubmit(event: Event) {
  event.preventDefault();
  if (readOnly.value) {
    void sayOutline(readOnly.value);
    return;
  }
  if (text.value.trim() === '') {
    problem.value = 'Write the note first.';
    return;
  }
  const name = category.value.trim().replace(/^#/, '').toLowerCase();
  if (name !== '' && (!isTagWord(name) || name === 'resolved')) {
    problem.value = 'A category is one word: letters, then letters, digits, or hyphens.';
    return;
  }
  dialog.value?.close();
  notes.add(text.value, name === '' ? null : name);
}

function onClose() {
  newNoteOpen.value = false;
  const back = takeNewNoteBack();
  if (back) back();
  else if (opener?.isConnected) opener.focus();
  else if (view.dom.offsetParent !== null) view.focus();
  opener = null;
}
</script>

<template>
  <dialog ref="dialog" class="new-note" aria-labelledby="new-note-title" @close="onClose">
    <form v-if="newNoteOpen" @submit="onSubmit">
      <h2 id="new-note-title">New note</h2>
      <p id="new-note-help" class="help">
        It goes at the end of the cursor’s line, and never prints.
      </p>
      <p v-if="readOnly" id="new-note-why" class="why">{{ readOnly }}</p>
      <label class="field">
        <span>Note</span>
        <input
          v-model="text"
          type="text"
          autocomplete="off"
          autofocus
          aria-describedby="new-note-help"
          :readonly="!!readOnly"
          @input="problem = ''"
        />
      </label>
      <label class="field">
        <span>Category</span>
        <input
          v-model="category"
          type="text"
          autocomplete="off"
          list="new-note-categories"
          placeholder="Optional"
          :readonly="!!readOnly"
          @input="problem = ''"
        />
      </label>
      <datalist id="new-note-categories">
        <option v-for="name in categories" :key="name" :value="name" />
      </datalist>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <div class="buttons">
        <button type="button" class="btn" @click="dialog?.close()">Cancel</button>
        <button
          type="submit"
          class="btn primary"
          :aria-disabled="readOnly ? 'true' : undefined"
          :aria-describedby="readOnly ? 'new-note-why' : undefined"
        >
          Add note
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.new-note {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
h2 {
  margin: 0 0 4px;
  font-size: 16px;
}
.help,
.why {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}
.problem {
  margin: 0 0 8px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}
.field {
  display: grid;
  grid-template-columns: 6rem 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.field input {
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
