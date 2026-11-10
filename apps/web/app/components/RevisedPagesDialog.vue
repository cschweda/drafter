<script setup lang="ts">
import type { RevisedChoice } from '@drafter/production';
import { MAX_HEADER } from '@drafter/production';
import DDialog from '~/components/ui/DDialog.vue';
import DSegmented from '~/components/ui/DSegmented.vue';
import { useEditor } from '~/editor/session';
import {
  headerProblem,
  type RevisedInfo,
  revisedDefaults,
  revisedHeaderChoice,
  revisedInfo,
  revisedPagesOpen,
  revisedRefusal,
} from '~/production/revised';
import { useProductionActions } from '~/production/use-commands';
import { exportRevisedPages, refuseExport } from '~/storage/export';
import { useScript } from '~/storage/script';

// Export revised pages (production design §8): which pages (the current revision's, every
// revision's, or a page range), which asterisks print, the header under each page number, and a
// tint of the revision's colour. A changed header is kept in the script's block, as its own undo
// step; cleared, the revision's own header prints again. The pages to print are checked before the
// picker, so an export with none says so and makes no file.
const dialog = ref<InstanceType<typeof DDialog>>();
const { view } = useEditor();
const script = useScript();

type Which = RevisedChoice['kind'];
const WHICH_CHOICES: { value: Which; label: string }[] = [
  { value: 'current', label: 'Current revision' },
  { value: 'all', label: 'All revisions' },
  { value: 'range', label: 'Page range' },
];
const MARK_CHOICES: { value: 'open' | 'all'; label: string }[] = [
  { value: 'open', label: 'This revision only' },
  { value: 'all', label: 'Every revision' },
];

const which = ref<Which>('current');
const marks = ref<'open' | 'all'>('open');
const from = ref('');
const to = ref('');
const header = ref('');
const tint = ref(false);
/** The script's pages and marks, from the export worker; null while it works them out. */
const info = ref<RevisedInfo | null | 'failed'>(null);
const ready = computed(() => info.value !== null && info.value !== 'failed');
/** What is wrong with the typed header (`headerProblem`): shown under it, and Export waits. */
const headerError = computed(() => headerProblem(header.value));
/** Why the typed range prints nothing, shown under its fields until they change. */
const rangeError = ref<string | null>(null);
const fromField = ref<HTMLInputElement>();
watch([from, to, which], () => {
  rangeError.value = null;
});

let opener: HTMLElement | null = null;
let opening = 0;
let openedFor: string | undefined;

async function load() {
  const mine = ++opening;
  try {
    const found = await revisedInfo();
    if (mine !== opening) return;
    info.value = found;
    const defaults = revisedDefaults(found);
    header.value = defaults.header;
    from.value = defaults.from;
    to.value = defaults.to;
  } catch {
    if (mine === opening) info.value = 'failed';
  }
}

watch(revisedPagesOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    which.value = 'current';
    marks.value = 'open';
    tint.value = false;
    header.value = '';
    from.value = '';
    to.value = '';
    info.value = null;
    rangeError.value = null;
    openedFor = script.project.value?.id;
    dialog.value.showModal();
    void load();
  }
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  revisedPagesOpen.value = false;
  opening++;
  if (opener?.isConnected) opener.focus();
  else if (view.dom.offsetParent !== null) view.focus();
  opener = null;
}

function choice(): RevisedChoice {
  return which.value === 'range'
    ? { kind: 'range', from: from.value, to: to.value }
    : { kind: which.value };
}

function exportNow() {
  const found = info.value;
  if (found === null || found === 'failed') return;
  // Never a header the block wouldn't keep: the field says what is wrong.
  if (headerError.value) return;
  const chosen = choice();
  const refusal = revisedRefusal(found, chosen);
  if (refusal && chosen.kind === 'range') {
    // The writer can fix a range: the dialog stays, and says so under it.
    rangeError.value = refusal;
    fromField.value?.focus();
    return;
  }
  dialog.value?.close();
  if (refusal) {
    // No field fixes these (no changes in the revision): said in the export toast.
    void refuseExport(refusal);
    return;
  }
  const { header: printed, save } = revisedHeaderChoice(header.value, found);
  // The header is kept as its own undo step; the export prints what was typed either way (a
  // read-only tab says why it wasn't kept). The picker needs this click, so both start now.
  if (save !== undefined) void useProductionActions().setHeader(save);
  void exportRevisedPages(
    { which: chosen, marks: marks.value, header: printed, tint: tint.value, set: found.open ?? '' },
    openedFor,
  );
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="md"
    class="revised-dialog"
    aria-labelledby="revised-title"
    aria-describedby="revised-what"
    @close="onClose"
  >
    <form @submit.prevent="exportNow">
      <h2 id="revised-title" class="d-dialog-title">Export revised pages</h2>
      <p id="revised-what" class="lead">
        The changed pages as they print in the full PDF, with their locked page numbers, to hand
        out in place of the old ones.
      </p>
      <p v-if="info === null && revisedPagesOpen" class="status" role="status">Finding the revised pages…</p>
      <p v-else-if="info === 'failed'" class="status" role="alert">
        The revised pages couldn’t be worked out. Close this and try again.
      </p>

      <div class="field">
        <span class="label">Which pages</span>
        <DSegmented v-model="which" label="Which pages" :options="WHICH_CHOICES" />
      </div>
      <div v-if="which === 'range'" class="range">
        <div class="field">
          <label for="revised-from">From page</label>
          <input
            id="revised-from"
            ref="fromField"
            v-model="from"
            type="text"
            autocomplete="off"
            maxlength="12"
            :aria-invalid="rangeError ? 'true' : undefined"
            :aria-describedby="rangeError ? 'revised-range-error' : undefined"
          />
        </div>
        <div class="field">
          <label for="revised-to">To page</label>
          <input
            id="revised-to"
            v-model="to"
            type="text"
            autocomplete="off"
            maxlength="12"
            :aria-invalid="rangeError ? 'true' : undefined"
            :aria-describedby="rangeError ? 'revised-range-error' : undefined"
          />
        </div>
      </div>
      <p v-if="which === 'range' && rangeError" id="revised-range-error" class="error" role="alert">
        {{ rangeError }}
      </p>
      <div class="field">
        <span class="label">Which marks print</span>
        <DSegmented v-model="marks" label="Which marks print" :options="MARK_CHOICES" />
      </div>
      <div class="field">
        <label for="revised-header">Header text</label>
        <input
          id="revised-header"
          v-model="header"
          type="text"
          autocomplete="off"
          :maxlength="MAX_HEADER"
          :aria-invalid="headerError ? 'true' : undefined"
          :aria-describedby="headerError ? 'revised-header-error revised-header-hint' : 'revised-header-hint'"
        />
        <span v-if="headerError" id="revised-header-error" class="error" role="alert">
          {{ headerError }}
        </span>
        <span id="revised-header-hint" class="hint">
          Under the page number on every page. Kept in the script; clear it for the revision’s own.
        </span>
      </div>
      <label class="check">
        <input v-model="tint" type="checkbox" />
        Tint each page in its revision’s colour
      </label>

      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton variant="primary" type="submit" :disabled="!ready || !!headerError">
          Export
        </DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
.revised-dialog {
  overflow-y: auto;
}
p {
  margin: 0 0 12px;
  color: var(--muted);
}
.status {
  color: var(--text);
}
label,
.label {
  font-weight: 600;
}
.field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin: 0 0 12px;
}
.range {
  display: flex;
  gap: 12px;
}
.range .field {
  flex: 1;
}
input[type='text'] {
  box-sizing: border-box;
  width: 100%;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 0 12px;
  font-weight: 400;
}
.check input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 1px 0 0;
}
.error {
  margin: 0 0 12px;
  color: var(--danger);
  font-size: 12px;
  font-weight: 600;
}
.field .error {
  margin: 0;
}
.hint {
  display: block;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
}
@media (max-width: 639.98px) {
  .revised-dialog {
    width: 100vw;
    max-width: 100vw;
    max-height: 92dvh;
    margin: auto 0 0;
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
    border-bottom: 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
}
</style>
