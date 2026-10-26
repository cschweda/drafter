<script setup lang="ts">
import { DOCUMENT_TYPES, TEMPLATE_NAMES } from '~/editor/template';
import { useGuard } from '~/storage/guard';
import { pickAndOpen } from '~/storage/open';
import type { Project } from '~/storage/projects';
import { READ_ONLY_HINT, saveAs } from '~/storage/save';
import { useScript } from '~/storage/script';

// The Open menu (Phase 1 design §9.3): new scripts, this browser's scripts, and the samples. The
// trigger is the toolbar's Open button, drawn by the toolbar and given through the slot.
// The same actions are commands too (`commands/builtin.ts`), with their keys, in the palette.
const script = useScript();
const { project, busy } = script;
const { readOnly, taking } = useGuard();
// Not while "Edit here instead" waits for the other tab: the lock it gets is for the script shown.
const idle = computed(() => !!project.value && !busy.value && !taking.value);
// A tab that only shows a script another tab is editing may show old text: it starts, saves, and
// opens nothing until the writer chooses "Edit here instead". Switching to a script stays possible.
const canStart = computed(() => idle.value && !readOnly.value);

const open = ref(false);
const scripts = ref<Project[]>([]);
const message = ref('');
const confirming = ref<Project | null>(null);
const changedSince = ref(false);
const root = ref<HTMLElement>();
const dialog = ref<HTMLDialogElement>();
const place = reactive({ top: 0, left: 0 });
let trigger: HTMLElement | null = null;

/** The panel's width in rem; the CSS has the same. */
const WIDTH_REM = 22;

async function show(from: HTMLElement | null) {
  message.value = '';
  // The button that was pressed: Safari doesn't focus a button on a click, so the focused element isn't it.
  trigger = from;
  const rect = trigger?.getBoundingClientRect();
  const width = WIDTH_REM * 16;
  place.top = Math.round((rect?.bottom ?? 40) + 8);
  place.left = Math.max(8, Math.min(Math.round(rect?.left ?? 8), window.innerWidth - width - 8));
  open.value = true;
  try {
    scripts.value = await script.scripts();
  } catch {
    scripts.value = [];
  }
  await nextTick();
  root.value?.querySelector<HTMLElement>('[data-first]')?.focus();
}

function close(refocus: boolean) {
  if (!open.value) return;
  open.value = false;
  confirming.value = null;
  if (refocus) trigger?.focus();
}

function toggle(event: Event) {
  if (open.value) close(true);
  else void show(event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
}

/** Runs one of the menu's actions; the menu stays open, with a message, if it can't. */
async function run(action: () => Promise<unknown>, refocus = true) {
  message.value = '';
  try {
    await action();
  } catch {
    message.value = 'That didn’t work. Your current script is unchanged.';
    return;
  }
  close(refocus);
}

const isCurrent = (p: Project) => project.value?.id === p.id;
const isCurrentSample = (kind: 'screenplay' | 'stage-play') => project.value?.sample === kind;

// ---- Removing -------------------------------------------------------------------------------

const neverSaved = computed(
  () =>
    !!confirming.value && confirming.value.savedHash === undefined && !confirming.value.fileName,
);

let removeTrigger: HTMLElement | null = null;
let restoreFocus = true;

async function ask(p: Project, event: Event) {
  message.value = '';
  // The button that was pressed (Safari doesn't focus a button on a click): focus goes back to it.
  removeTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  restoreFocus = true;
  // A script with a file loses what was typed since the last save, which the dialog says.
  changedSince.value = false;
  try {
    changedSince.value = await script.changed(p);
  } catch {
    changedSince.value = true;
  }
  confirming.value = p;
}

function onDialogClose() {
  confirming.value = null;
  if (restoreFocus && open.value) removeTrigger?.focus();
}

watch(confirming, async (p) => {
  if (!p) return;
  await nextTick();
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
});

function cancel() {
  dialog.value?.close();
}

async function confirmRemove() {
  const p = confirming.value;
  if (!p) return;
  restoreFocus = false;
  dialog.value?.close();
  message.value = '';
  try {
    const result = await script.remove(p.id);
    if (result === 'held') {
      message.value = `“${p.title}” is open for editing in another tab, so it can’t be removed. Close it there first.`;
      scripts.value = await script.scripts();
      return;
    }
  } catch {
    message.value = 'That didn’t work. Nothing was removed.';
    return;
  }
  close(true);
}

// ---- Closing --------------------------------------------------------------------------------

function onKeydown(event: KeyboardEvent) {
  // The dialog handles its own Escape.
  if (event.key === 'Escape' && open.value && !confirming.value) {
    event.stopPropagation();
    close(true);
  }
}

function onFocusout(event: FocusEvent) {
  const to = event.relatedTarget;
  if (open.value && !confirming.value && to instanceof Node && !root.value?.contains(to)) {
    close(false);
  }
}

function onPointerdown(event: PointerEvent) {
  if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) {
    close(false);
  }
}

onMounted(() => document.addEventListener('pointerdown', onPointerdown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerdown));
</script>

<template>
  <div ref="root" class="scripts" @keydown="onKeydown" @focusout="onFocusout">
    <slot :toggle="toggle" :expanded="open" controls="scripts-menu" />
    <div
      v-if="open"
      id="scripts-menu"
      role="group"
      aria-label="Scripts"
      class="panel"
      :style="{ top: `${place.top}px`, left: `${place.left}px` }"
    >
      <!-- One New item for each document type, in the chip's order (`DOCUMENT_TYPES`). -->
      <button
        v-for="(type, i) in DOCUMENT_TYPES"
        :key="type.id"
        type="button"
        class="item"
        :data-first="i === 0 || undefined"
        :disabled="!canStart"
        @click="run(() => script.newScript(type.newKind), false)"
      >
        <UIcon :name="type.newIcon" class="icon" />{{ type.newTitle }}
      </button>
      <button
        type="button"
        class="item"
        :disabled="!canStart"
        @click="run(() => pickAndOpen(), false)"
      >
        <UIcon name="i-lucide-folder-open" class="icon" />Open a file…
      </button>
      <button type="button" class="item" :disabled="busy || readOnly" @click="run(() => saveAs())">
        <UIcon name="i-lucide-save-all" class="icon" />Save As…
      </button>
      <p v-if="readOnly" class="message">{{ READ_ONLY_HINT }}</p>

      <div role="group" aria-labelledby="scripts-yours">
        <p id="scripts-yours" class="head">In this browser</p>
        <ul v-if="scripts.length">
          <li v-for="p in scripts" :key="p.id" class="row">
            <button
              type="button"
              class="item grow"
              :aria-current="isCurrent(p) ? 'true' : undefined"
              :disabled="!idle"
              @click="run(() => script.open(p.id))"
            >
              <span :id="`script-${p.id}`" class="title">{{ p.title }}</span>
              <span class="meta">{{ TEMPLATE_NAMES[p.templateId] }}</span>
            </button>
            <button
              type="button"
              class="remove"
              aria-label="Remove from this browser"
              :aria-describedby="`script-${p.id}`"
              @click="ask(p, $event)"
            >
              Remove
            </button>
          </li>
        </ul>
        <p v-else class="empty">Scripts you start are kept here.</p>
      </div>

      <div role="group" aria-labelledby="scripts-samples">
        <p id="scripts-samples" class="head">Samples</p>
        <button
          type="button"
          class="item"
          :aria-current="isCurrentSample('screenplay') ? 'true' : undefined"
          :disabled="!idle"
          @click="run(() => script.openSample('screenplay'))"
        >
          Screenplay
        </button>
        <button
          type="button"
          class="item"
          :aria-current="isCurrentSample('stage-play') ? 'true' : undefined"
          :disabled="!idle"
          @click="run(() => script.openSample('stage-play'))"
        >
          Stage play
        </button>
      </div>

      <p v-if="message" role="alert" class="message">{{ message }}</p>
    </div>

    <dialog
      ref="dialog"
      class="confirm"
      aria-labelledby="remove-title"
      aria-describedby="remove-why"
      @close="onDialogClose"
    >
      <template v-if="confirming">
        <h2 id="remove-title">Remove “{{ confirming.title }}” from this browser?</h2>
        <p id="remove-why">
          Drafter forgets this script and its recovery copy. A file you saved it to isn’t touched.
          <template v-if="neverSaved">
            This script has never been saved to a file, so removing it deletes the only copy.
          </template>
          <template v-else-if="changedSince">
            Changes since you last saved it to a file are lost.
          </template>
        </p>
        <div class="buttons">
          <button type="button" class="btn" autofocus @click="cancel">Cancel</button>
          <button type="button" class="btn danger" @click="confirmRemove">Remove</button>
        </div>
      </template>
    </dialog>
  </div>
</template>

<style scoped>
.scripts {
  display: contents;
}
.panel {
  position: fixed;
  z-index: 20;
  box-sizing: border-box;
  width: min(22rem, calc(100vw - 16px));
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
  font-size: 13px;
}
.head {
  margin: 8px 8px 2px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}
.empty {
  margin: 4px 8px 8px;
  color: var(--muted);
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
}
.item.grow {
  flex: 1;
  min-width: 0;
}
.item:hover:not(:disabled) {
  background: var(--chrome);
}
.item:disabled {
  color: var(--muted);
  cursor: not-allowed;
}
.item[aria-current="true"] {
  box-shadow: inset 3px 0 0 var(--heading);
}
.title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta {
  margin-left: auto;
  color: var(--muted);
  font-size: 12px;
  font-weight: 400;
  white-space: nowrap;
}
.icon {
  width: 14px;
  height: 14px;
  flex: none;
}
.remove,
.btn {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.remove {
  flex: none;
  font-size: 12px;
}
.item:focus-visible,
.remove:focus-visible,
.btn:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.message {
  margin: 6px 8px 4px;
  padding-left: 8px;
  border-left: 3px solid var(--heading);
}
.confirm {
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
}
.confirm::backdrop {
  background: rgb(0 0 0 / 0.5);
}
h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
.confirm p {
  margin: 0 0 14px;
  line-height: 1.45;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.danger {
  border-color: var(--heading);
  box-shadow: inset 0 -2px 0 var(--heading);
}
</style>
