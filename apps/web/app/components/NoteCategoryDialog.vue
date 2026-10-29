<script setup lang="ts">
import { isTagWord, type NoteEntry } from '@drafter/notes';

// Set category… (Phase 2 design §8): a note's category tags, chosen from those in use and the
// starting set, or a new one typed. Only the tags change (Call 5); a category head (`TODO:`) is
// shown, and stays, since it is the note's head. A `<dialog>` shaped like Move to….

const props = defineProps<{
  /** The note as drawn when the dialog opened; null while closed. */
  entry: NoteEntry | null;
  categories: string[];
}>();
const emit = defineEmits<{ save: [tags: string[]]; close: [] }>();

const dialog = ref<HTMLDialogElement>();
const chosen = ref<string[]>([]);
const typed = ref('');
const problem = ref('');

const headCategory = computed(() =>
  props.entry?.note?.head?.kind === 'category' ? props.entry.note.head.name : null,
);
const offered = computed(() => {
  const out = [...props.categories];
  for (const tag of props.entry?.note?.tags ?? []) if (!out.includes(tag)) out.push(tag);
  return out;
});

watch(
  () => props.entry,
  async (entry) => {
    chosen.value = [...(entry?.note?.tags ?? [])];
    typed.value = '';
    problem.value = '';
    await nextTick();
    if (entry && dialog.value && !dialog.value.open) dialog.value.showModal();
    if (!entry && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

function toggle(name: string, on: boolean) {
  chosen.value = on ? [...chosen.value, name] : chosen.value.filter((n) => n !== name);
}

function onSubmit(event: Event) {
  event.preventDefault();
  const tags = [...chosen.value];
  for (const word of typed.value.split(/[\s,]+/)) {
    const name = word.replace(/^#/, '').toLowerCase();
    if (name === '') continue;
    if (!isTagWord(name) || name === 'resolved') {
      problem.value = `“${word}” can’t be a category: one word, letters, then letters, digits, or hyphens.`;
      return;
    }
    if (!tags.includes(name)) tags.push(name);
  }
  dialog.value?.close();
  emit(
    'save',
    tags.filter((name) => name !== headCategory.value),
  );
}

function onClose() {
  if (props.entry) emit('close');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="note-category"
    aria-labelledby="note-category-title"
    @close="onClose"
  >
    <form v-if="props.entry" @submit="onSubmit">
      <h2 id="note-category-title">Categories for this note</h2>
      <p v-if="headCategory" class="help">
        Its head makes it {{ headCategory }}; that stays.
      </p>
      <fieldset class="choices">
        <legend class="sr-only">Categories</legend>
        <label v-for="name in offered" :key="name" class="choice">
          <input
            type="checkbox"
            :checked="name === headCategory || chosen.includes(name)"
            :disabled="name === headCategory"
            @change="toggle(name, ($event.target as HTMLInputElement).checked)"
          />
          {{ name }}
        </label>
      </fieldset>
      <label class="field">
        <span>New category</span>
        <input v-model="typed" type="text" autocomplete="off" @input="problem = ''" />
      </label>
      <p v-if="problem" class="problem" role="alert">{{ problem }}</p>
      <div class="buttons">
        <button type="button" class="btn" @click="dialog?.close()">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.note-category {
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.help {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 13px;
}
.choices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
  gap: 4px 8px;
  margin: 0 0 10px;
  padding: 0;
  border: 0;
  font-size: 13px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
}
.field {
  display: grid;
  grid-template-columns: 7.5rem 1fr;
  align-items: center;
  gap: 8px;
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
.problem {
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
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
</style>
