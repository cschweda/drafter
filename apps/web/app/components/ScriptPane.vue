<script setup lang="ts">
import { parsedDoc } from '@drafter/cm-fountain';
import { createScriptView, GOTO_EVENT, type ScriptView } from '@drafter/render-html';
import '@drafter/render-html/style.css';
import { useLayout } from '~/editor/layout';
import { blockIndexAt, pageOf } from '~/editor/pages';
import { domPane, type SyncPane } from '~/editor/scroll-sync';
import { useEditor } from '~/editor/session';
import { useScrollSync } from '~/editor/use-scroll-sync';
import { useSettings } from '~/settings/settings';
import { scriptTopPage } from '~/strip/in-view';

const { goto, view: editorView } = useEditor();
const sync = useScrollSync();
const { layout, layoutTemplate, cursorBlock, failed } = useLayout();
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

async function draw() {
  const current = view;
  const next = layout.value;
  const template = layoutTemplate.value;
  if (!current || !next || !template) return;
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
  view = createScriptView(host.value, { fontsReady: fontsReady() });
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
  detachSync?.();
  clearTimeout(settled);
  observer?.disconnect();
  view?.destroy();
  view = undefined;
});

watch([layout, layoutTemplate], draw);
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
</style>
