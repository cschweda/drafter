<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { draftName, EXPLAINER, sameQuestion } from '~/drafts/labels';
import { NOTE_MAX } from '~/drafts/store';
import { useDrafts } from '~/drafts/use-drafts';
import { useEditor } from '~/editor/session';

// Start new draft… (drafts-and-cuts design §2.1): the text as it is now is kept as Draft N, for
// good, and the writer carries on in Draft N+1. An optional one-line note for the draft being
// kept. Enter starts it; Escape cancels and nothing changes. A script's first time says once what a
// draft is (§2.5); a text the same as the last draft asks first (Call 2).

const drafts = useDrafts();
const { asking, current, rows } = drafts;
const editor = useEditor();
const dialog = ref<InstanceType<typeof DDialog>>();
const input = ref<HTMLInputElement>();
const note = ref('');
/** The last draft when the text is the same as it; null otherwise, and while it's checked. */
const same = shallowRef<{ n: number } | null>(null);
const first = computed(() => rows.value.length === 0);
const starting = ref(false);
/** The draft that is kept: the one being written, as the dialog opened. */
const keeping = ref(1);

watch(asking, async (open) => {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) {
    note.value = '';
    same.value = null;
    keeping.value = current.value;
    el.showModal();
    input.value?.focus();
    const last = await drafts.sameAs();
    if (asking.value) same.value = last ? { n: last.n } : null;
  } else if (!open && el.open) el.close();
});

async function onSubmit(event: Event) {
  event.preventDefault();
  if (starting.value) return;
  starting.value = true;
  try {
    const done = await drafts.start(note.value);
    dialog.value?.close();
    if (done && editor.view.dom.offsetParent !== null) editor.view.focus();
  } finally {
    starting.value = false;
  }
}

function onClose() {
  asking.value = false;
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="sm"
    class="start-draft"
    aria-labelledby="start-draft-title"
    aria-describedby="start-draft-help"
    @close="onClose"
  >
    <form v-if="asking" @submit="onSubmit">
      <h2 id="start-draft-title" class="d-dialog-title">Start new draft</h2>
      <div id="start-draft-help">
        <p v-if="first" class="explain">{{ EXPLAINER }}</p>
        <p class="help">
          The text as it is now is kept as {{ draftName(keeping) }}, and you carry on writing in
          {{ draftName(keeping + 1) }}.
        </p>
        <p v-if="same" class="same" role="status">{{ sameQuestion(same.n) }}</p>
      </div>
      <label class="field">
        <span>Note for {{ draftName(keeping) }}</span>
        <input
          ref="input"
          v-model="note"
          type="text"
          autocomplete="off"
          :maxlength="NOTE_MAX"
          placeholder="Optional, such as “sent to Sam for notes”"
        />
      </label>
      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton variant="primary" type="submit" :aria-disabled="starting ? 'true' : undefined">
          {{ same ? 'Start anyway' : 'Start new draft' }}
        </DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
.explain {
  margin: 0 0 8px;
  color: var(--text);
}
.help {
  margin: 0 0 12px;
  color: var(--muted);
}
.same {
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--warn-bg);
  color: var(--text);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field input {
  min-height: 30px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.field input::placeholder {
  color: var(--muted);
}
</style>
