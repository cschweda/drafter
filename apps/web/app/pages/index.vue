<script setup lang="ts">
import { registerBuiltinCommands } from '~/commands/builtin';
import { installGlobalKeys } from '~/commands/registry';
import { useEditor } from '~/editor/session';
import { applySettings } from '~/settings/apply';
import { installFileCheck } from '~/storage/check';
import { watchSaveError } from '~/storage/save';
import { useScript } from '~/storage/script';
import { fileBaseName, titleOf } from '~/storage/text';
import { otherPane, type PaneId } from '~/utils/panes';

const { tabs, phoneTab, split, choose, resize } = usePanes();
const wide = useWideScreen();
const shown = computed(() => (wide.value ? [tabs.value.left, tabs.value.right] : [phoneTab.value]));

// F6 moves focus to the other pane's panel (technical design §13).
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'F6' || !wide.value) return;
  event.preventDefault();
  const pane = (document.activeElement?.closest('[data-pane]') as HTMLElement | null)?.dataset.pane;
  const target: PaneId = pane === 'left' || pane === 'right' ? otherPane(pane) : 'left';
  document.getElementById(`panel-${tabs.value[target]}`)?.focus();
}

// The editor is parked here whenever the Source tab isn't showing.
const { view, doc } = useEditor();
const holder = ref<HTMLElement>();
// Opens the current script, and starts keeping its recovery copy.
const { dirty, project } = useScript();

// The tab says which script this is, and whether it has changes that aren't in its file.
useHead({
  title: computed(
    () =>
      `${dirty.value ? '• ' : ''}${titleOf(doc.value, fileBaseName(project.value?.fileName))} — Drafter`,
  ),
});

// The commands and their keys. The registry binds the keys that belong to the app (Save, Open,
// New, the palette) on the window; the editor's keymap has the rest.
registerBuiltinCommands();
let removeKeys: (() => void) | undefined;
let stopWatchingSave: (() => void) | undefined;
let stopSettings: (() => void) | undefined;
let removeFileCheck: (() => void) | undefined;

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  removeKeys = installGlobalKeys();
  stopWatchingSave = watchSaveError();
  stopSettings = applySettings();
  removeFileCheck = installFileCheck();
  if (!view.dom.isConnected) holder.value?.append(view.dom);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  removeKeys?.();
  stopWatchingSave?.();
  stopSettings?.();
  removeFileCheck?.();
});
</script>

<template>
  <div class="shell" :style="{ '--split': split }">
    <div class="top">
      <AppToolbar />
      <ReadOnlyBar />
      <FileBar />
      <StorageWarning />
    </div>
    <DropZone />
    <SameTitleDialog />
    <BothChangedDialog />
    <RemoveDialog />
    <CommandPalette />
    <SettingsDialog />
    <main class="panes" :class="{ wide }">
      <template v-if="wide">
        <AppPane
          pane="left"
          label="Left pane"
          :selected="tabs.left"
          :shown="shown"
          @choose="choose('left', $event)"
        />
        <PaneDivider :split="split" @resize="resize" />
        <AppPane
          pane="right"
          label="Right pane"
          :selected="tabs.right"
          :shown="shown"
          @choose="choose('right', $event)"
        />
      </template>
      <AppPane
        v-else
        pane="phone"
        label="Panes"
        :selected="phoneTab"
        :shown="shown"
        @choose="phoneTab = $event"
      />
    </main>
    <AppStatusBar />
    <div ref="holder" data-editor-holder hidden />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100dvh;
  background: var(--bg);
  color: var(--text);
}
.panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}
.panes.wide {
  grid-template-columns: calc(var(--split) * 100%) 6px minmax(0, 1fr);
}
</style>
