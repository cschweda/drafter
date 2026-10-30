<script setup lang="ts">
import { commandById } from '~/commands/registry';
import { useEditor } from '~/editor/session';
import {
  type ExportKind,
  exportError,
  exportMilestone,
  exportNotice,
  exportProgress,
} from '~/storage/export';
import { OPTIONS_NOT_FOR_MARKDOWN } from '~/storage/export-options';

// A Markdown document exports as a PDF, its Markdown file, or plain text (Markdown PDF design §10).
const { kind } = useEditor();

// The toolbar's Export menu (Phase 1 design §9.7): PDF, plain text, Final Draft, Markdown, and the treatment (a Markdown document's are the PDF, the Markdown file, and plain text). The trigger is the toolbar's
// Export button, drawn by the toolbar and given through the slot. Each item runs the export's
// command (`commands/builtin.ts`), as the app menu and the palette do. The toast says when the file is ready, or why it isn't.
const open = ref(false);
// A slow export's bar (Markdown PDF design §8, the maintainer's request of 2026-10-29): how far it
// is, as a whole percent (never 100 until the file is there), or null while the worker can't say,
// when the bar moves without a number.
const percent = computed(() => {
  const fraction = exportProgress.value?.fraction;
  return fraction === null || fraction === undefined ? null : Math.floor(fraction * 100);
});
/**
 * What the toast says while an export runs. Another message (an import's "Imported …") can take
 * the toast's live region meanwhile, and empties it after a few seconds; the bar, and this line
 * drawn beside it (not said again), stay for as long as the export runs.
 */
const underWay = computed(() =>
  exportProgress.value ? `Exporting ${exportProgress.value.name}…` : '',
);
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

/**
 * Export options… (out-the-door design §2.4): the menu's last item, after a line. A Markdown
 * document has no scene numbers or title page, so it shows off, with the reason.
 */
const optionsWhy = computed(() => (kind.value === 'markdown' ? OPTIONS_NOT_FOR_MARKDOWN : ''));
function chooseOptions() {
  // Off, but still in the Tab order (aria-disabled), so the keyboard reaches it and hears why.
  if (optionsWhy.value) return;
  // The menu's button has focus as the dialog opens, so the dialog gives it back on closing: the
  // item that opened it is gone by then.
  close(true);
  commandById('export-options')?.run();
}

/** The treatment asks a question first, in its own dialog (Phase 2 design §6.4). */
function chooseTreatment() {
  close(true);
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
      <!-- A script's whole text as Markdown, beside its treatment: the two .md files (Call 24). -->
      <button v-if="kind !== 'markdown'" type="button" class="item" @click="choose('md')">
        <UIcon name="i-lucide-file-text" class="icon" />Markdown (.md)
      </button>
      <button v-if="kind !== 'markdown'" type="button" class="item" @click="chooseTreatment">
        <UIcon name="i-lucide-list-tree" class="icon" />Treatment (.md)…
      </button>
      <div class="rule" role="separator" />
      <button
        type="button"
        class="item"
        :aria-disabled="optionsWhy ? 'true' : undefined"
        :aria-describedby="optionsWhy ? 'export-options-why' : undefined"
        @click="chooseOptions"
      >
        <UIcon name="i-lucide-sliders-horizontal" class="icon" />Export options…
      </button>
      <p v-if="optionsWhy" id="export-options-why" class="why">{{ optionsWhy }}</p>
    </div>
    <div class="toast" :class="{ shown: exportNotice || exportError || exportProgress }">
      <span role="status">{{ exportNotice }}</span>
      <!-- Said once, when the export started; the bar's name says it to a screen reader after. -->
      <span v-if="underWay && exportNotice !== underWay" class="under-way" aria-hidden="true">{{
        underWay
      }}</span>
      <!-- The bar's value is read when it is asked for, never said at each step; the quarters are
           said once each, below. The percent beside it is the bar's own, drawn. -->
      <div v-if="exportProgress" class="progress">
        <div
          class="bar"
          :class="{ unknown: percent === null }"
          role="progressbar"
          :aria-label="`Exporting ${exportProgress.name}`"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="percent ?? undefined"
          :aria-valuetext="percent === null ? 'Under way' : `${percent}%`"
        >
          <div class="fill" :style="percent === null ? undefined : { width: `${percent}%` }" />
        </div>
        <span class="percent" aria-hidden="true">{{ percent === null ? '' : `${percent}%` }}</span>
      </div>
      <span class="milestone" aria-live="polite">{{ exportMilestone }}</span>
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
.item:hover:not([aria-disabled='true']) {
  background: var(--chrome);
}
.item[aria-disabled='true'] {
  color: var(--muted);
  cursor: default;
}
.rule {
  height: 1px;
  margin: 4px 2px;
  background: var(--line);
}
.why {
  margin: 0 8px 4px 30px;
  color: var(--muted);
  font-size: 12px;
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
/* "Exporting …" again, on its own line, once another message has the live region. */
.under-way {
  display: block;
}
/* A slow export's bar, under its "Exporting …", with the percent beside it. */
.progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.bar {
  position: relative;
  flex: 1;
  height: 6px;
  min-width: 8rem;
  overflow: hidden;
  border: 1px solid var(--faint);
  border-radius: 4px;
  background: var(--chrome);
}
.fill {
  height: 100%;
  border-radius: 3px;
  background: var(--heading);
  transition: width 0.2s linear;
}
/* A stage that can't say how far it is: a short piece of the bar sweeps across. */
.bar.unknown .fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 35%;
  animation: export-sweep 1.2s ease-in-out infinite;
}
@keyframes export-sweep {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(300%);
  }
}
.percent {
  min-width: 3ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
/* Said to a screen reader, never drawn. */
.milestone {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* No motion: the bar fills in steps, and an unknown stage is the whole bar, still, in the muted
   gray (3:1 on the track, test/tokens.test.ts) rather than the gold of a known amount. */
@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
  .bar.unknown .fill {
    width: 100%;
    background: var(--muted);
    animation: none;
  }
}
@media (forced-colors: active) {
  .bar {
    border: 1px solid CanvasText;
  }
  .fill {
    background: Highlight;
  }
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
