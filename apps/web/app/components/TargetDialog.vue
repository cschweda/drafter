<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { parseTarget, wordsLabel } from '~/novel/labels';

// Set a target… (Novel plan, Task 8): a passage's word target, typed as a whole number. Blank or 0
// takes it away. A `<dialog>` shaped like Label…; the row it was opened from shows the progress.

const props = defineProps<{
  /** The passage as it stood when the dialog opened; null while closed. */
  passage: { name: string; words: number; target: number | undefined } | null;
}>();
const emit = defineEmits<{ save: [target: number | null]; close: [] }>();

const dialog = ref<InstanceType<typeof DDialog>>();
const text = ref('');
const problem = ref('');

watch(
  () => props.passage,
  async (passage) => {
    text.value = passage?.target ? String(passage.target) : '';
    problem.value = '';
    await nextTick();
    if (passage && dialog.value && !dialog.value.open) dialog.value.showModal();
    if (!passage && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

function onSubmit(event: Event) {
  event.preventDefault();
  const parsed = parseTarget(text.value);
  if ('problem' in parsed) {
    problem.value = parsed.problem;
    return;
  }
  dialog.value?.close();
  emit('save', parsed.target);
}

function onClose() {
  if (props.passage) emit('close');
}
</script>

<template>
  <DDialog size="sm"
    ref="dialog"
    class="target-dialog"
    aria-labelledby="target-title"
    aria-describedby="target-help"
    @close="onClose"
  >
    <form v-if="props.passage" novalidate @submit="onSubmit">
      <h2 id="target-title" class="d-dialog-title">Target for {{ props.passage.name }}</h2>
      <p id="target-help" class="help">
        It has {{ wordsLabel(props.passage.words) }} now. Leave the target empty, or 0, to take it away.
      </p>
      <label class="field">
        <span>Words</span>
        <input
          v-model="text"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          autofocus
          :aria-invalid="problem ? 'true' : 'false'"
          :aria-describedby="problem ? 'target-help target-problem' : 'target-help'"
          @input="problem = ''"
        />
      </label>
      <p v-if="problem" id="target-problem" class="problem" role="alert">{{ problem }}</p>
      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton variant="primary" type="submit">Set target</DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
h2 {
  overflow-wrap: anywhere;
}
.help {
  margin: 0 0 12px;
  color: var(--muted);
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field input {
  flex: 1;
  min-width: 0;
  min-height: 30px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.problem {
  margin: 8px 0 0;
  padding-left: 8px;
  box-shadow: inset 3px 0 0 var(--accent-text);
  font-size: 13px;
}
</style>
