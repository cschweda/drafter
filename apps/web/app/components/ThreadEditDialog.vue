<script setup lang="ts">
import { normalizeLabel, SCENE_COLORS, type SceneColor, THREAD_LIMITS } from '@drafter/notes';
import DDialog from '~/components/ui/DDialog.vue';
import { useEditor } from '~/editor/session';
import { sayOutline } from '~/outline/notice';
import { takeEditFocusBack, threadEdit } from '~/threads/dialogs';
import { useThreads } from '~/threads/use-threads';
import {
  labelRefusal,
  mergeQuestion,
  REFUSED,
  removedMessage,
  removeQuestion,
  renamedMessage,
} from '~/threads/words';

// One thread's edit (Threads design §7.4): rename it everywhere (asking first when the new label
// is another thread, to merge), give it a name, give it a color, or take it out of every scene or
// passage (asking with the count). One undo each; Cancel and Escape change nothing.

const editor = useEditor();
const threads = useThreads();
const dialog = ref<InstanceType<typeof DDialog>>();
const mode = computed(() => threadEdit.value?.mode ?? 'rename');
const noun = computed(() => threads.noun.value);
const why = computed(() => threads.readOnly());
const readOnly = computed(() => why.value !== null);

const key = computed(() => normalizeLabel(threadEdit.value?.label ?? ''));
const found = computed(() => threads.info.value.find((t) => t.key === key.value) ?? null);

const text = ref('');
const color = ref<SceneColor | null>(null);
const error = ref('');
/** After a rename onto another thread: the question, until the writer answers it. */
const merging = ref(false);
/** The existing thread the rename would merge into, by its own label. */
const mergeInto = ref('');
let release: (() => void) | null = null;
let opener: HTMLElement | null = null;

const TITLES = {
  rename: 'Rename thread',
  name: 'Name thread',
  color: 'Color thread',
  remove: 'Remove thread',
} as const;
const SUBMIT = { rename: 'Rename', name: 'Save', color: 'Save', remove: 'Remove' } as const;

watch(threadEdit, async (now) => {
  if (now && !release) release = threads.hold();
  const info = found.value;
  if (now && info && !dialog.value?.open) {
    text.value = now.mode === 'rename' ? info.label : (info.name ?? '');
    color.value = info.chosen ? info.color : null;
    error.value = '';
    merging.value = false;
  }
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (now && info && !el.open) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    el.showModal();
  } else if (!now && el.open) {
    el.close();
  } else if (now && !info) {
    threadEdit.value = null;
    release?.();
    release = null;
  }
});

function done(message: string) {
  dialog.value?.close();
  void sayOutline(message);
}

function rename(label: string) {
  const to = text.value.trim();
  const refusal = labelRefusal(to);
  if (refusal) {
    error.value = refusal;
    return;
  }
  if (to === label) {
    dialog.value?.close();
    return;
  }
  const other = threads.info.value.find((t) => t.key === normalizeLabel(to));
  const onto = other && other.key !== key.value ? other : null;
  if (onto && !merging.value) {
    mergeInto.value = onto.label;
    merging.value = true;
    return;
  }
  // Onto another thread, its own label is kept (b into B gives B).
  const target = onto ? onto.label : to;
  const result = threads.rename(label, target);
  done(result ? renamedMessage(label, target, result.units, noun.value) : REFUSED);
}

function submit() {
  const edit = threadEdit.value;
  const info = found.value;
  if (!edit) return;
  if (why.value) {
    void sayOutline(why.value);
    return;
  }
  if (!info) {
    done('That thread isn’t in the script any more, so nothing was changed.');
    return;
  }
  if (edit.mode === 'rename') {
    rename(info.label);
  } else if (edit.mode === 'name') {
    const name = text.value.trim();
    if (name.length > THREAD_LIMITS.name) {
      error.value = `A name is one line of ${THREAD_LIMITS.name} characters at most.`;
      return;
    }
    const chosen = info.chosen ? info.color : null;
    const ok = threads.setMeta(
      info.label,
      name || chosen ? { ...(name ? { name } : {}), ...(chosen ? { color: chosen } : {}) } : null,
    );
    const said = name
      ? `Named thread ${info.label} ${name}.`
      : `Cleared the name of thread ${info.label}.`;
    done(ok ? said : REFUSED);
  } else if (edit.mode === 'color') {
    const name = info.name;
    const ok = threads.setMeta(
      info.label,
      color.value || name
        ? { ...(name ? { name } : {}), ...(color.value ? { color: color.value } : {}) }
        : null,
    );
    const said = color.value
      ? `Colored thread ${info.label} ${color.value}.`
      : `Cleared the color of thread ${info.label}.`;
    done(ok ? said : REFUSED);
  } else {
    const count = threads.remove(info.label);
    done(count === null ? REFUSED : removedMessage(info.label, count, noun.value));
  }
}

function onSubmit(event: Event) {
  event.preventDefault();
  submit();
}

function onClose() {
  threadEdit.value = null;
  release?.();
  release = null;
  const back = takeEditFocusBack();
  if (back) back();
  else if (opener?.isConnected) opener.focus();
  else if (editor.view.dom.offsetParent !== null) editor.view.focus();
  opener = null;
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="sm"
    class="thread-edit"
    aria-labelledby="thread-edit-title"
    @close="onClose"
  >
    <form v-if="threadEdit && found" @submit="onSubmit">
      <h2 id="thread-edit-title" class="d-dialog-title">{{ TITLES[mode] }} {{ found.label }}</h2>
      <p v-if="readOnly" id="thread-edit-why" class="why">{{ why }}</p>
      <template v-if="mode === 'rename'">
        <p v-if="merging" class="why" role="alert">
          {{ mergeQuestion(found.label, mergeInto) }}
        </p>
        <label v-else class="field">
          <span>New label</span>
          <input
            v-model="text"
            type="text"
            autocomplete="off"
            spellcheck="false"
            autofocus
            :readonly="readOnly"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? 'thread-edit-error' : undefined"
            @input="error = ''"
          />
        </label>
      </template>
      <label v-else-if="mode === 'name'" class="field">
        <span>Name</span>
        <input
          v-model="text"
          type="text"
          autocomplete="off"
          autofocus
          :readonly="readOnly"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? 'thread-edit-error' : undefined"
          @input="error = ''"
        />
      </label>
      <label v-else-if="mode === 'color'" class="field">
        <span>Color</span>
        <select v-model="color" :disabled="readOnly" autofocus>
          <option v-for="c in SCENE_COLORS" :key="c" :value="c">{{ c }}</option>
          <option :value="null">No color</option>
        </select>
      </label>
      <p v-else class="why">{{ removeQuestion(found.label, found.units, noun) }}</p>
      <p v-if="error" id="thread-edit-error" class="error" role="alert">{{ error }}</p>
      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton
          variant="primary"
          type="submit"
          :danger="mode === 'remove'"
          :aria-disabled="readOnly ? 'true' : undefined"
          :aria-describedby="readOnly ? 'thread-edit-why' : undefined"
        >
          {{ merging ? 'Merge' : SUBMIT[mode] }}
        </DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
h2 {
  overflow-wrap: anywhere;
}
.why {
  margin: 0 0 12px;
  font-size: 13px;
}
.field {
  display: grid;
  grid-template-columns: 5rem 1fr;
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
.error {
  margin: 0 0 8px;
  color: var(--danger);
  font-size: 13px;
}
@media (max-width: 30rem) {
  .field {
    grid-template-columns: 1fr;
    gap: 2px;
  }
}
.d-btn[aria-disabled='true'] {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
