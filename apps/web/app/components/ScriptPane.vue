<script setup lang="ts">
import { parsedDoc } from '@drafter/cm-fountain';
import { createScriptView, GOTO_EVENT, type ScriptView } from '@drafter/render-html';
import '@drafter/render-html/style.css';
import type { PageMarks } from '@drafter/compare';
import { useShowChanges } from '~/compare/baseline';
import { stopLabel } from '~/compare/labels';
import { holdLive, liveDecorate, liveForDraw, markLive } from '~/compare/live';
import { useLayout } from '~/editor/layout';
import { blockIndexAt, pageOf } from '~/editor/pages';
import { domPane, type SyncPane } from '~/editor/scroll-sync';
import { useEditor } from '~/editor/session';
import { useScrollSync } from '~/editor/use-scroll-sync';
import { sayOutline } from '~/outline/notice';
import { useOutline } from '~/outline/use-outline';
import { useSettings } from '~/settings/settings';
import { scriptTopPage } from '~/strip/in-view';

const { goto, view: editorView } = useEditor();
const sync = useScrollSync();
const { layout, layoutTemplate, cursorBlock, failed, marks, shownSeq } = useLayout();
const showChanges = useShowChanges();
const outline = useOutline();
const zoom = useScriptZoom();
const { settings } = useSettings();

const host = ref<HTMLElement>();
const probe = ref<HTMLElement>();
const columns = computed(() => layoutTemplate.value?.page.width ?? 85);

/** The margin around the pages, in pixels. */
const GUTTER = 16;
/** `render-html` waits for the font with no limit: a load that never settles mustn't leave the pane blank. */
const FONT_WAIT_MS = 3000;
/** How long after the first draw a change of scale from a resize still keeps the cursor's line in view. */
const SETTLE_MS = 1000;

let view: ScriptView | undefined;
/** True from the first draw until the font has had a moment to settle the scale (see `applyZoom`). */
let settling = true;
let settled: ReturnType<typeof setTimeout> | undefined;
let observer: ResizeObserver | undefined;
/** The pages as scroll sync reads them: each line's source offset and where it stands. */
let syncPane: (SyncPane & { invalidate(): void }) | undefined;
let detachSync: (() => void) | undefined;

/**
 * Publishes the page at the pane's top for the Structure strip's in-view marker (Call 29), once a
 * frame at most: the source offset at the top, its block, and that block's page. Nothing while the
 * strip is off (and the page is cleared); it publishes once when the strip is turned on.
 */
let topFrame = 0;
function publishTop() {
  if (topFrame || !settings.value.structureStrip) return;
  topFrame = requestAnimationFrame(() => {
    topFrame = 0;
    const offset = syncPane?.offsetAtTop() ?? null;
    const doc = editorView.state.field(parsedDoc, false);
    const block = offset === null || !doc ? null : blockIndexAt(doc, offset);
    scriptTopPage.value = block === null ? null : (pageOf(layout.value, block)?.current ?? null);
  });
}

function fontsReady(): Promise<unknown> {
  const wait = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([document.fonts.load('12pt "Courier Prime"').catch(() => undefined), wait]);
}

/**
 * Fit width scales with CSS `zoom` so a page fills the pane, whatever the text size; 100% is real
 * size times the text size setting. Zoom doesn't change the layout, so the pages never change.
 */
function applyZoom(reveal = true) {
  if (!view || !host.value || !probe.value) return;
  const natural = probe.value.getBoundingClientRect().width;
  const room = host.value.clientWidth - 2 * GUTTER;
  const fit = zoom.value === 'fit';
  const scale = fit ? (natural > 0 && room > 0 ? room / natural : 1) : settings.value.textSize;
  const zoomed = scale === 1 ? '' : String(scale);
  if (view.element.style.zoom === zoomed) return;
  view.element.style.zoom = zoomed;
  // Zoom moves every line, so the one the cursor is on may have left the pane (the first visit
  // is drawn before the font settles the scale). `reveal` leaves a reader who has scrolled alone.
  // A resize (the observer) doesn't bring it back, so a pane being dragged wider doesn't yank a
  // reader's place: only the zoom buttons and text size, the first draw, and the settling after it.
  // With scroll sync on, any change of scale puts the pages back in step with the Source instead.
  if (sync.placeView()) return;
  if (reveal) view.reveal(cursorBlock.value);
}

/**
 * Show changes' marks for the layout shown: null while off; undefined while its marks haven't come
 * (they follow each layout from the worker, so the pages never wait on the diff).
 */
function liveMarks(): PageMarks | null | undefined {
  if (!showChanges.on.value) return null;
  const found = marks.value;
  return found && found.seq === shownSeq.value ? found.marks : undefined;
}

/**
 * Tells the view which marks its pages get: these, none, or (while they are coming) whatever each
 * has. `now` marks the pages on the screen; else the next draw does.
 */
function setLive(current: ScriptView, now: boolean) {
  const found = liveMarks();
  if (found === undefined) holdLive(current);
  else if (now) markLive(current, found);
  else liveForDraw(current, found);
}

async function draw() {
  const current = view;
  const next = layout.value;
  const template = layoutTemplate.value;
  if (!current || !next || !template) return;
  setLive(current, false);
  await current.update(next, template);
  if (view !== current) return;
  syncPane?.invalidate();
  applyZoom();
  // The first draw, and the settling after it, is put in step with the Source when sync is on (on a
  // phone, where the Source was); after that a drawing follows the cursor, which sync keeps in view.
  if (!(settling && sync.placeView())) current.reveal(cursorBlock.value);
  if (settled === undefined) settled = setTimeout(() => (settling = false), SETTLE_MS);
  publishTop();
}

onMounted(() => {
  if (!host.value) return;
  view = createScriptView(host.value, {
    fontsReady: fontsReady(),
    decorate: liveDecorate(() => view),
  });
  host.value.addEventListener('keydown', onKeydown);
  view.element.addEventListener(GOTO_EVENT, (event) => {
    goto((event as CustomEvent<{ offset: number }>).detail.offset);
  });
  // The probe is as wide as a page, outside the zoomed region: its width follows the font loading,
  // the template, and the pane, and so does the scale.
  observer = new ResizeObserver(() => applyZoom(settling));
  observer.observe(host.value);
  if (probe.value) observer.observe(probe.value);
  syncPane = domPane(host.value, '.drafter-line[data-from]', () => editorView.state.doc.length);
  detachSync = sync.attachView(syncPane);
  host.value.addEventListener('scroll', publishTop, { passive: true });
  void draw();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(topFrame);
  topFrame = 0;
  scriptTopPage.value = null;
  host.value?.removeEventListener('scroll', publishTop);
  host.value?.removeEventListener('keydown', onKeydown);
  detachSync?.();
  clearTimeout(settled);
  observer?.disconnect();
  view?.destroy();
  view = undefined;
});

watch([layout, layoutTemplate], draw);
// The marks came for the layout shown, or Show changes went off: the pages are marked again.
watch([marks, () => showChanges.on.value], () => {
  if (view && layout.value) setLive(view, true);
});

// ---- Next change in the Script pane (version-history design §4.3) ----------------------------

/** N and Shift+N while focus is in the pane and Show changes is on, as in the Compare tab. */
function onKeydown(event: KeyboardEvent) {
  if (event.isComposing || !showChanges.on.value) return;
  if (event.key !== 'n' && event.key !== 'N') return;
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if ((event.target as Element | null)?.closest('input, textarea, [contenteditable="true"]'))
    return;
  event.preventDefault();
  showChanges.step(event.shiftKey ? -1 : 1);
}

/** Where change `c` is in the text laid out: its first marked line, or the line its gap is before. */
function offsetOf(found: PageMarks, c: number): number {
  const line = found.lines.find((m) => m.change === c);
  if (line) return line.span.from;
  const gap = found.gaps.find((g) => g.change === c);
  return gap?.before?.from ?? editorView.state.doc.length;
}

/** Puts focus on the mark Next change stepped to, once it is drawn, and says where it is. */
async function focusMark() {
  if (!showChanges.pendingFocus.value) return;
  const found = liveMarks();
  const index = showChanges.at.value;
  const stop = found && index !== null ? found.stops[index] : undefined;
  if (!found || !stop || !view) return;
  await nextTick();
  const target = view.element.querySelector<HTMLElement>(`[data-change="${stop.change}"]`);
  if (!target) return;
  showChanges.pendingFocus.value = false;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'center' });
  const at = offsetOf(found, stop.change);
  const scene = outline.index.value.scenes.findLast((s) =>
    stop.kind === 'removed' ? s.span.from < at : s.span.from <= at,
  );
  void sayOutline(stopLabel(stop, scene?.heading ?? null));
}
watch(
  [() => showChanges.pendingFocus.value, () => showChanges.at.value, marks],
  () => void focusMark(),
  {
    flush: 'post',
  },
);
watch(
  () => settings.value.structureStrip,
  (on) => {
    if (on) {
      publishTop();
      return;
    }
    // Off, the marker is forgotten, so turning the strip on again never shows a stale page.
    cancelAnimationFrame(topFrame);
    topFrame = 0;
    scriptTopPage.value = null;
  },
);
watch([zoom, () => settings.value.textSize], () => applyZoom());
watch(cursorBlock, (block) => {
  // The title page is block -1, which no layout line belongs to: it is the top.
  if (block < 0) host.value?.scrollTo({ top: 0 });
  else view?.reveal(block);
});
</script>

<template>
  <div ref="host" class="script-host" tabindex="0">
    <div ref="probe" class="drafter-script probe" :style="{ '--cols': columns }" aria-hidden="true" />
    <p v-if="failed && !layout" role="status" class="failed">Couldn't lay out the pages.</p>
  </div>
</template>

<style scoped>
.script-host {
  position: relative;
  height: 100%;
  padding: 16px;
  box-sizing: border-box;
  overflow: auto;
  background: var(--desk);
  /* The paper and the type follow the theme. */
  --drafter-page: var(--page);
  --drafter-ink: var(--ink);
}
.script-host:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.failed {
  margin: 0;
  padding: 8px 0;
  color: var(--muted);
}
.probe {
  position: absolute;
  width: calc(var(--cols) * 1ch);
  height: 0;
  visibility: hidden;
  pointer-events: none;
}
.script-host :deep(.drafter-script:not(.probe)) {
  width: max-content;
  margin: 0 auto;
}
.script-host :deep(.drafter-page) {
  margin-bottom: 16px;
}
/* Show changes (version-history design §4.3): the Changes view's colors, whole lines only. A band
   in the row tint behind a changed line, a bar at the page's edge, and a + in the left margin. */
.script-host :deep(.live-band) {
  position: absolute;
  top: calc(var(--row) * var(--line));
  left: 0;
  right: 0;
  height: var(--line);
  background: var(--diff-add-bg);
  box-shadow: inset 3px 0 var(--diff-add-sign);
}
.script-host :deep(.live-sign) {
  position: absolute;
  top: calc(var(--row) * var(--line));
  left: 1ch;
  line-height: var(--line);
  color: var(--diff-add-sign);
  font-weight: bold;
}
.script-host :deep(.live-mark:focus-visible),
.script-host :deep(.live-mark:focus),
.script-host :deep(.live-gap-button:focus-visible) {
  outline: 2px solid var(--heading);
  outline-offset: 1px;
}
/* Removed lines (or new ones that print nothing): a rule in the blank row above the line they were
   before (or on that row's edge, `gapPlace`), its button in the margin. The lines it shows open to
   the button's right, from the next row edge down, and are a whole number of rows high, so the box
   never cuts a line of the page in two and a live line never looks removed. */
.script-host :deep(.live-gap) {
  position: absolute;
  top: calc(var(--row) * var(--line) - 1px);
  left: 0;
  right: 1ch;
  height: 0;
  display: flex;
  align-items: flex-start;
  padding-left: 1ch;
  border-top: 2px solid var(--diff-del-sign);
  z-index: 1;
}
.script-host :deep(.live-gap-unprinted) {
  border-top-color: var(--diff-add-sign);
}
.script-host :deep(.live-gap-button) {
  flex: none;
  margin-top: -1px;
  transform: translateY(-50%);
  min-height: 24px;
  padding: 0 6px;
  border: 1px solid var(--diff-del-sign);
  border-radius: 3px;
  background: var(--drafter-page, #fff);
  color: var(--diff-del-sign);
  font: 600 9pt/1.4 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.script-host :deep(.live-gap-unprinted .live-gap-button) {
  border-color: var(--diff-add-sign);
  color: var(--diff-add-sign);
}
.script-host :deep(.live-gap-lines) {
  flex: 1;
  min-width: 0;
  margin: calc(var(--drop) * var(--line) - 1px) 0 0 8px;
  padding: 0 8px;
  /* An outline that takes no room, so the box stays a whole number of rows high. */
  box-shadow:
    0 0 0 1px var(--diff-del-sign),
    0 2px 6px rgb(0 0 0 / 20%);
  background: linear-gradient(var(--diff-del-bg), var(--diff-del-bg)), var(--drafter-page, #fff);
  color: var(--drafter-ink, #000);
}
.script-host :deep(.live-gap-unprinted .live-gap-lines) {
  box-shadow:
    0 0 0 1px var(--diff-add-sign),
    0 2px 6px rgb(0 0 0 / 20%);
  background: linear-gradient(var(--diff-add-bg), var(--diff-add-bg)), var(--drafter-page, #fff);
}
.script-host :deep(.live-gap-lines del),
.script-host :deep(.live-gap-lines ins) {
  display: block;
  line-height: var(--line);
  white-space: pre-wrap;
}
.script-host :deep(.live-gap-lines ins) {
  text-decoration: none;
}
/* The hidden "added, " and "changed, " are for a screen reader, not for a copy of the page's text. */
.script-host :deep(.change-said) {
  -webkit-user-select: none;
  user-select: none;
}
/* Never printed: Show changes is something to look with (Call 1). */
@media print {
  .script-host :deep(:is(.live-band, .live-sign, .live-gap)) {
    display: none;
  }
}
</style>
