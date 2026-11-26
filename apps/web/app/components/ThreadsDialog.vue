<script setup lang="ts">
import { normalizeLabel, SCENE_SWATCH, THREAD_LIMITS } from '@drafter/notes';
import { findNode } from '@drafter/novel';
import type { DropdownMenuItem } from '@nuxt/ui';
import DDialog from '~/components/ui/DDialog.vue';
import { useEditor } from '~/editor/session';
import { useNovel } from '~/novel/use-novel';
import { sayOutline } from '~/outline/notice';
import { useOutline } from '~/outline/use-outline';
import { openThreadEdit, takeThreadsFocusBack, threadsFor } from '~/threads/dialogs';
import { useThreads } from '~/threads/use-threads';
import { labelRefusal, limitMessage, REFUSED } from '~/threads/words';

// Threads… (Threads design §7.4): every thread as a checklist, with a field for a new one. Save
// puts the scene or passage in exactly the checked threads, in one undo; Cancel and Escape change
// nothing. A thread's own menu (rename, name, color, remove) closes this and opens that edit.
// The dialog holds the item's id, and finds it again when it saves.

const DIALOG_ID = 'threads-dialog';
const editor = useEditor();
const outline = useOutline();
const novel = useNovel();
const threads = useThreads();
const dialog = ref<InstanceType<typeof DDialog>>();
const fieldEl = ref<HTMLInputElement>();

const isNovel = () => editor.kind.value === 'markdown' && editor.novel.value === true;

/** The scene or passage the dialog is for, now: its name, its threads, and the id the session wants. */
const unit = computed(() => {
  const id = threadsFor.value;
  if (!id) return null;
  if (isNovel()) {
    const tree = novel.tree.value;
    const node = tree ? findNode(tree, id) : null;
    if (!node || node.kind === 'part') return null;
    return {
      key: id,
      heading: node.title || 'Scene break',
      labels: novel.facts.value.nodes[id]?.threads ?? [],
    };
  }
  const item = outline.itemById(id);
  if (item?.kind !== 'scene') return null;
  return {
    key: `scene:${item.block}`,
    heading: item.heading || 'Untitled scene',
    labels: item.threads,
  };
});

const noun = computed(() => threads.noun.value);
const why = computed(() => threads.readOnly());
const readOnly = computed(() => why.value !== null);

const heading = ref('');
/** The labels as the scene had them when the dialog opened, to tell a change from none. */
let began: string[] = [];
/** Every label shown, in order: the threads there are, then ones typed here. */
const rows = ref<string[]>([]);
/** Which of them (by `normalizeLabel`) are checked. */
const checked = ref<Set<string>>(new Set());
const fresh = ref('');
const error = ref('');
let release: (() => void) | null = null;
let opener: HTMLElement | null = null;

const keyOf = (label: string) => normalizeLabel(label);
const info = (label: string) => threads.info.value.find((t) => t.key === keyOf(label));
const full = computed(() => checked.value.size >= THREAD_LIMITS.perUnit);

function begin(labels: string[]) {
  began = labels.slice();
  const shown = threads.info.value.map((t) => t.label);
  for (const label of labels) if (!shown.some((s) => keyOf(s) === keyOf(label))) shown.push(label);
  rows.value = shown;
  checked.value = new Set(labels.map(keyOf));
  fresh.value = '';
  error.value = '';
}

watch(threadsFor, async (id) => {
  if (id && !release) release = threads.hold();
  const found = unit.value;
  if (id && found && !dialog.value?.open) {
    heading.value = found.heading;
    begin(found.labels);
  }
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (id && found && !el.open) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    el.showModal();
  } else if (!id && el.open) {
    el.close();
  } else if (id && !found) {
    threadsFor.value = null;
    release?.();
    release = null;
  }
});

function toggle(label: string, on: boolean) {
  const next = new Set(checked.value);
  if (on) next.add(keyOf(label));
  else next.delete(keyOf(label));
  checked.value = next;
  error.value = '';
}

/** Enter in the New thread field: adds the label (or finds it) and checks it, or says why not. */
function add() {
  const text = fresh.value.trim();
  const refusal = labelRefusal(text);
  if (refusal) {
    error.value = refusal;
    return;
  }
  const existing = rows.value.find((r) => keyOf(r) === keyOf(text));
  if (existing && checked.value.has(keyOf(existing))) {
    fresh.value = '';
    error.value = '';
    return;
  }
  if (full.value) {
    error.value = limitMessage(noun.value);
    return;
  }
  if (!existing) rows.value = [...rows.value, text];
  toggle(existing ?? text, true);
  fresh.value = '';
}

function save() {
  const id = threadsFor.value;
  if (!id) return;
  if (why.value) {
    void sayOutline(why.value);
    return;
  }
  const now = unit.value;
  if (!now) {
    dialog.value?.close();
    void sayOutline(`That ${noun.value} isn’t in the script any more, so nothing was saved.`);
    return;
  }
  // Text typed and not yet added counts as added.
  if (fresh.value.trim() !== '') {
    add();
    if (error.value) return;
  }
  const labels = rows.value.filter((r) => checked.value.has(keyOf(r)));
  const same = labels.length === began.length && labels.every((label, i) => began[i] === label);
  const sameSet =
    labels.length === began.length && labels.every((l) => began.some((b) => keyOf(b) === keyOf(l)));
  dialog.value?.close();
  if (same || sameSet) return;
  if (threads.setUnitThreads(now.key, labels)) {
    void sayOutline(`Saved the threads of ${now.heading}.`);
  } else {
    void sayOutline(REFUSED);
  }
}

function onSubmit(event: Event) {
  event.preventDefault();
  save();
}

function onFieldKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  event.stopPropagation();
  add();
}

function onClose() {
  threadsFor.value = null;
  release?.();
  release = null;
  const back = takeThreadsFocusBack();
  if (back) back();
  else if (opener?.isConnected) opener.focus();
  else if (editor.view.dom.offsetParent !== null) editor.view.focus();
  opener = null;
}

/** A thread's own menu: this closes, and the edit opens in its place. */
function menuOf(label: string): DropdownMenuItem[][] {
  const off = readOnly.value;
  const edit = (mode: 'rename' | 'name' | 'color' | 'remove') => () => {
    const back = takeThreadsFocusBack();
    dialog.value?.close();
    void nextTick().then(() =>
      requestAnimationFrame(() => openThreadEdit(label, mode, back ?? undefined)),
    );
  };
  return [
    [
      { label: 'Rename thread…', icon: 'i-lucide-pencil', disabled: off, onSelect: edit('rename') },
      { label: 'Name…', icon: 'i-lucide-text-cursor', disabled: off, onSelect: edit('name') },
      { label: 'Color…', icon: 'i-lucide-palette', disabled: off, onSelect: edit('color') },
    ],
    [
      {
        label: `Remove from every ${noun.value}…`,
        icon: 'i-lucide-trash-2',
        disabled: off,
        onSelect: edit('remove'),
      },
    ],
  ];
}

const swatch = (label: string) => {
  const found = info(label);
  return found ? SCENE_SWATCH[found.color] : null;
};
</script>

<template>
  <DDialog
    :id="DIALOG_ID"
    ref="dialog"
    size="md"
    class="threads-dialog"
    aria-labelledby="threads-title"
    @close="onClose"
  >
    <form v-if="threadsFor" @submit="onSubmit">
      <h2 id="threads-title" class="d-dialog-title">Threads for {{ heading }}</h2>
      <p v-if="readOnly" id="threads-why" class="why">{{ why }}</p>
      <fieldset class="list">
        <legend class="sr-only">Threads this {{ noun }} is in</legend>
        <p v-if="rows.length === 0" class="empty">No threads yet. Add one below.</p>
        <div v-for="label in rows" :key="keyOf(label)" class="row">
          <label class="pick">
            <input
              type="checkbox"
              :checked="checked.has(keyOf(label))"
              :disabled="readOnly || (full && !checked.has(keyOf(label)))"
              @change="toggle(label, ($event.target as HTMLInputElement).checked)"
            />
            <span
              class="swatch"
              :class="{ none: !swatch(label) }"
              :style="swatch(label) ? { background: swatch(label) as string } : undefined"
              aria-hidden="true"
            />
            <span class="label">{{ label }}</span>
            <span v-if="info(label)?.name" class="name">{{ info(label)?.name }}</span>
          </label>
          <MenuButton v-if="info(label)" :items="menuOf(label)" :content="{ align: 'end' }" :portal="`#${DIALOG_ID}`">
            <button
              type="button"
              class="more"
              :aria-label="`Actions for thread ${label}`"
            >
              <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
            </button>
          </MenuButton>
        </div>
      </fieldset>
      <p v-if="full" id="threads-full" class="why">{{ limitMessage(noun) }}</p>
      <label class="field">
        <span>New thread</span>
        <input
          ref="fieldEl"
          v-model="fresh"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :readonly="readOnly"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? 'threads-error' : undefined"
          @keydown="onFieldKey"
          @input="error = ''"
        />
      </label>
      <p v-if="error" id="threads-error" class="error" role="alert">{{ error }}</p>
      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton
          variant="primary"
          type="submit"
          :aria-disabled="readOnly ? 'true' : undefined"
          :aria-describedby="readOnly ? 'threads-why' : undefined"
        >
          Save
        </DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
h2 {
  overflow-wrap: anywhere;
}
.why,
.empty {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 13px;
}
.list {
  margin: 0 0 12px;
  padding: 0;
  border: 0;
  max-height: 40vh;
  overflow-y: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.pick {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 30px;
  font-size: 13px;
}
.label {
  font-weight: 600;
  overflow-wrap: anywhere;
}
.name {
  color: var(--muted);
  overflow-wrap: anywhere;
}
.swatch {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.swatch.none {
  border: 1px solid var(--muted);
}
.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.more:hover {
  background: var(--surface);
}
.field {
  display: grid;
  grid-template-columns: 6.5rem 1fr;
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
.error {
  margin: 0 0 8px;
  color: var(--danger);
  font-size: 13px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
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
