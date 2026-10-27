<script setup lang="ts">
import { contextGeneration } from '~/modules/context';
import { registerRunner, setFolderFailure, setFolderParts } from '~/modules/folder';
import { type FrameChannel, frameChannel } from '~/modules/folder-channel';
import type { Surface, Theme } from '~/modules/folder-protocol';
import { announceModuleError } from '~/modules/registry';
import type { ModuleContext } from '~/modules/types';

// One frame of a module from the desktop app's modules folder (docs/plans/2026-10-27-desktop-modules-folder.md):
// sandboxed with scripts only, on the module's own origin, so its code never reaches this page, the
// file bridge, or another module. Its calls come here as messages, answered by its context.
const props = defineProps<{
  moduleId: string;
  name: string;
  surface: Surface;
  context: ModuleContext;
}>();

const frame = ref<HTMLIFrameElement>();
const height = ref(0);
const src = computed(
  () => `drafter-module://${props.moduleId}/?surface=${encodeURIComponent(props.surface)}`,
);
const title = computed(() =>
  props.surface === 'settings' ? `${props.name} settings` : props.name,
);

/** The colors and fonts the frame draws with: the page's own, so it follows the theme. */
const THEME_VARIABLES = [
  '--bg',
  '--chrome',
  '--chrome-2',
  '--line',
  '--text',
  '--muted',
  '--heading',
  '--font-sans',
  '--font-mono',
];
function theme(): Theme {
  const style = getComputedStyle(document.documentElement);
  const out: Theme = { 'color-scheme': style.colorScheme || 'normal' };
  for (const name of THEME_VARIABLES) out[name] = style.getPropertyValue(name).trim();
  return out;
}

let channel: FrameChannel | undefined;
let forget: (() => void) | undefined;
const onMessage = (event: MessageEvent) => channel?.receive(event);

function onLoad() {
  channel?.start(props.surface, theme());
}

onMounted(() => {
  channel = frameChannel({
    name: props.name,
    frame: () => frame.value?.contentWindow ?? undefined,
    // The frame's origin is opaque, so it can't be named: `*` reaches whatever the frame holds,
    // which can only be this module's page (the desktop app refuses any other navigation in it).
    post: (message) => frame.value?.contentWindow?.postMessage(message, '*'),
    context: () => props.context,
    onReady: (parts) => {
      if (props.surface === 'background') setFolderParts(props.moduleId, parts);
    },
    onFailed: (why) => {
      if (props.surface === 'background') setFolderFailure(props.moduleId, why);
      void announceModuleError(`${props.name} couldn’t start: ${why}.`);
    },
    onSize: (h) => {
      height.value = h;
    },
  });
  if (props.surface === 'background') forget = registerRunner(props.moduleId, channel);
  window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  forget?.();
  channel?.dispose();
  channel = undefined;
});

// A tab or settings draws again when the script, its pages, or the open script change: the frame
// is told (at most every 250 ms) and asks for what it needs.
let timer: ReturnType<typeof setTimeout> | undefined;
if (props.surface !== 'background') {
  watch(
    () => [props.context.source(), props.context.layout(), contextGeneration()],
    () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        channel?.changed();
      }, 250);
    },
  );
  onBeforeUnmount(() => clearTimeout(timer));
}
</script>

<template>
  <iframe
    ref="frame"
    :src="src"
    :title="title"
    sandbox="allow-scripts"
    allow=""
    referrerpolicy="no-referrer"
    :class="['folder-frame', props.surface]"
    :style="props.surface === 'settings' ? { height: `${height}px` } : undefined"
    :tabindex="props.surface === 'background' ? -1 : undefined"
    :aria-hidden="props.surface === 'background' ? 'true' : undefined"
    :data-folder-module="props.moduleId"
    :data-surface="props.surface"
    @load="onLoad"
  />
</template>

<style scoped>
.folder-frame {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
}
.folder-frame.tab {
  height: 100%;
}
.folder-frame.background {
  position: absolute;
  width: 0;
  height: 0;
  visibility: hidden;
}
</style>
