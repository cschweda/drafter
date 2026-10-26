<script setup lang="ts">
import { createScriptView, GOTO_EVENT, type ScriptView } from '@drafter/render-html';
import '@drafter/render-html/style.css';
import { useLayout } from '~/editor/layout';
import { useEditor } from '~/editor/session';
import { useSettings } from '~/settings/settings';

const { goto } = useEditor();
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

let view: ScriptView | undefined;
let observer: ResizeObserver | undefined;

function fontsReady(): Promise<unknown> {
  const wait = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));
  return Promise.race([document.fonts.load('12pt "Courier Prime"').catch(() => undefined), wait]);
}

/**
 * Fit width scales with CSS `zoom` so a page fills the pane, whatever the text size; 100% is real
 * size times the text size setting. Zoom doesn't change the layout, so the pages never change.
 */
function applyZoom() {
  if (!view || !host.value || !probe.value) return;
  const natural = probe.value.getBoundingClientRect().width;
  const room = host.value.clientWidth - 2 * GUTTER;
  const fit = zoom.value === 'fit';
  const scale = fit ? (natural > 0 && room > 0 ? room / natural : 1) : settings.value.textSize;
  view.element.style.zoom = scale === 1 ? '' : String(scale);
}

async function draw() {
  const current = view;
  const next = layout.value;
  const template = layoutTemplate.value;
  if (!current || !next || !template) return;
  await current.update(next, template);
  if (view !== current) return;
  applyZoom();
  current.reveal(cursorBlock.value);
}

onMounted(() => {
  if (!host.value) return;
  view = createScriptView(host.value, { fontsReady: fontsReady() });
  view.element.addEventListener(GOTO_EVENT, (event) => {
    goto((event as CustomEvent<{ offset: number }>).detail.offset);
  });
  // The probe is as wide as a page, outside the zoomed region: its width follows the font loading,
  // the template, and the pane, and so does the scale.
  observer = new ResizeObserver(applyZoom);
  observer.observe(host.value);
  if (probe.value) observer.observe(probe.value);
  void draw();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  view?.destroy();
  view = undefined;
});

watch([layout, layoutTemplate], draw);
watch([zoom, () => settings.value.textSize], applyZoom);
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
