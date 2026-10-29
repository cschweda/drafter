<script setup lang="ts">
import { commandById } from '~/commands/registry';
import { useEditor } from '~/editor/session';
import { type ExportKind, exportError, exportNotice } from '~/storage/export';

// A Markdown document exports as a PDF, its Markdown file, or plain text (Markdown PDF design §10).
const { kind } = useEditor();

// The toolbar's Export menu (Phase 1 design §9.7): PDF, plain text, and Final Draft (a Markdown document's are the PDF, the Markdown file, and plain text). The trigger is the toolbar's
// Export button, drawn by the toolbar and given through the slot. Each item runs the export's
// command (`commands/builtin.ts`), as the app menu and the palette do. The toast says when the file is ready, or why it isn't.
const open = ref(false);
const root = ref<HTMLElement>();
const place = reactive({ top: 0, left: 0 });
let trigger: HTMLElement | null = null;

/** The panel's width in rem; the CSS has the same. */
const WIDTH_REM = 14;

async function show(from: HTMLElement | null) {
  // The button that was pressed: Safari doesn't focus a button on a click, so the focused element isn't it.
  trigger = from;
  const rect = trigger?.getBoundingClientRect();
  const width = WIDTH_REM * 16;
  place.top = Math.round((rect?.bottom ?? 40) + 8);
  place.left = Math.max(8, Math.min(Math.round(rect?.left ?? 8), window.innerWidth - width - 8));
  open.value = true;
  await nextTick();
  root.value?.querySelector<HTMLElement>('[data-first]')?.focus();
}

function close(refocus: boolean) {
  if (!open.value) return;
  open.value = false;
  if (refocus) trigger?.focus();
}

function toggle(event: Event) {
  if (open.value) close(true);
  else void show(event.currentTarget instanceof HTMLElement ? event.currentTarget : null);
}

function choose(kind: ExportKind) {
  // The picker or the download follows the click; the toast reports the result.
  commandById(`export-${kind}`)?.run();
  close(true);
}

/** The treatment asks a question first, in its own dialog (Phase 2 design §6.4). */
function chooseTreatment() {
  close(false);
  commandById('export-treatment')?.run();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    close(true);
  }
}

function onFocusout(event: FocusEvent) {
  const to = event.relatedTarget;
  if (open.value && to instanceof Node && !root.value?.contains(to)) close(false);
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
  <div ref="root" class="export" @keydown="onKeydown" @focusout="onFocusout">
    <slot :toggle="toggle" :expanded="open" controls="export-menu" />
    <div
      v-if="open"
      id="export-menu"
      role="group"
      aria-label="Export"
      class="panel"
      :style="{ top: `${place.top}px`, left: `${place.left}px` }"
    >
      <button type="button" class="item" data-first @click="choose('pdf')">
        <UIcon name="i-lucide-file-text" class="icon" />PDF
      </button>
      <button v-if="kind === 'markdown'" type="button" class="item" @click="choose('md')">
        <UIcon name="i-lucide-file-text" class="icon" />Markdown (.md)
      </button>
      <button type="button" class="item" @click="choose('txt')">
        <UIcon name="i-lucide-file-type" class="icon" />Plain text (.txt)
      </button>
      <button v-if="kind !== 'markdown'" type="button" class="item" @click="choose('fdx')">
        <UIcon name="i-lucide-file-code" class="icon" />Final Draft (.fdx)
      </button>
      <button v-if="kind !== 'markdown'" type="button" class="item" @click="chooseTreatment">
        <UIcon name="i-lucide-list-tree" class="icon" />Treatment (.md)…
      </button>
    </div>
    <div class="toast" :class="{ shown: exportNotice || exportError }">
      <span role="status">{{ exportNotice }}</span>
      <span v-if="exportError" role="alert" class="failed">{{ exportError }}</span>
    </div>
  </div>
</template>

<style scoped>
.export {
  display: contents;
}
.panel {
  position: fixed;
  z-index: 20;
  box-sizing: border-box;
  width: min(14rem, calc(100vw - 16px));
  padding: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
  font-size: 13px;
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
.item:hover {
  background: var(--chrome);
}
.item:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.icon {
  width: 14px;
  height: 14px;
  flex: none;
}
.toast {
  position: fixed;
  z-index: 30;
  right: 16px;
  bottom: 40px;
  box-sizing: border-box;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  border-radius: 6px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
/* The regions stay in the page, so a screen reader hears their text change; the box is drawn only with text. */
.toast:not(.shown) {
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  box-shadow: none;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
