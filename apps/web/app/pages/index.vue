<script setup lang="ts">
import { EditorView } from '@codemirror/view';
import { registerBuiltinCommands } from '~/commands/builtin';
import { installDesktopClose } from '~/commands/desktop-close';
import { installDesktopMenu } from '~/commands/desktop-menu';
import { installGlobalKeys } from '~/commands/registry';
import { restoreSelection } from '~/editor/restore-selection';
import { useEditor } from '~/editor/session';
import { markdownTitle } from '~/markdown/title';
import { startModules } from '~/modules/host';
import { applySettings } from '~/settings/apply';
import { useSettings } from '~/settings/settings';
import { installFileCheck } from '~/storage/check';
import { installSystemOpen } from '~/storage/open';
import { watchSaveError } from '~/storage/save';
import { useScript } from '~/storage/script';
import { fileBaseName, titleOf } from '~/storage/text';
import { installDesktopUpdates } from '~/update/desktop-source';
import { leavesOnEscape } from '~/utils/focus';
import { otherPane, type PaneId } from '~/utils/panes';

const { tabs, phoneTab, split, choose, resize } = usePanes();
const wide = useWideScreen();
const focus = useFocusMode();
const shown = computed(() => (wide.value ? [tabs.value.left, tabs.value.right] : [phoneTab.value]));

// F6 moves focus to the other pane's panel (technical design §13).
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'F6' || !wide.value || focus.on.value) return;
  event.preventDefault();
  const pane = (document.activeElement?.closest('[data-pane]') as HTMLElement | null)?.dataset.pane;
  const target: PaneId = pane === 'left' || pane === 'right' ? otherPane(pane) : 'left';
  document.getElementById(`panel-${tabs.value[target]}`)?.focus();
}

// Escape leaves focus mode when nothing else used it (CodeMirror's completion and search, the palette, a dialog).
// This listens in the bubble phase, after they have had their turn.
function onEscape(event: KeyboardEvent) {
  if (!focus.on.value || !leavesOnEscape(event)) return;
  event.preventDefault();
  focus.leave();
}

// The editor is parked here whenever the Source tab isn't showing.
const { view, doc, kind } = useEditor();
const holder = ref<HTMLElement>();
// Opens the current script, and starts keeping its recovery copy.
const { dirty, project } = useScript();
const { settings } = useSettings();

/** The script's title, as its kind reads it. */
function pageTitle(): string {
  const fallback = fileBaseName(project.value?.fileName);
  // The text changed: the Fountain parse is the signal, and the Markdown title is read from the text.
  doc.value;
  return kind.value === 'markdown'
    ? (markdownTitle(view.state.doc.toString()) ?? fallback)
    : titleOf(doc.value, fallback);
}

// The tab says which script this is, and whether it has changes that aren't in its file.
useHead({
  title: computed(() => `${dirty.value ? '• ' : ''}${pageTitle()} — Drafter`),
});

// The commands and their keys. The registry binds the keys that belong to the app (Save, Open,
// New, the palette) on the window; the editor's keymap has the rest.
registerBuiltinCommands();
let removeKeys: (() => void) | undefined;
let stopWatchingSave: (() => void) | undefined;
let stopSettings: (() => void) | undefined;
let stopModules: (() => void) | undefined;
let removeFileCheck: (() => void) | undefined;
let removeSystemOpen: (() => void) | undefined;
let removeDesktopMenu: (() => void) | undefined;
let removeDesktopClose: (() => void) | undefined;
let removeDesktopUpdates: (() => void) | undefined;

// Focus mode swaps the layout for the Source alone. Entering puts the cursor in the editor; leaving
// puts it back there if the editor is showing, else on the button that entered.
watch(
  () => focus.on.value,
  async (on) => {
    await nextTick();
    if (on || !view.dom.closest('[data-editor-holder]')) {
      view.focus();
      // The editor was moved in the page: see `restoreSelection`.
      restoreSelection(view);
      // With typewriter scrolling on, the line goes to the middle of the pane that is there now.
      const head = view.state.selection.main.head;
      view.dispatch({
        effects: EditorView.scrollIntoView(
          head,
          settings.value.typewriter ? { y: 'center' } : undefined,
        ),
      });
    } else document.getElementById('focus-button')?.focus();
  },
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('keydown', onEscape);
  removeKeys = installGlobalKeys();
  stopWatchingSave = watchSaveError();
  stopSettings = applySettings();
  stopModules = startModules();
  removeFileCheck = installFileCheck();
  removeSystemOpen = installSystemOpen();
  removeDesktopMenu = installDesktopMenu();
  removeDesktopClose = installDesktopClose();
  removeDesktopUpdates = installDesktopUpdates(useSettings());
  if (!view.dom.isConnected) holder.value?.append(view.dom);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('keydown', onEscape);
  removeKeys?.();
  stopWatchingSave?.();
  stopSettings?.();
  stopModules?.();
  removeFileCheck?.();
  removeSystemOpen?.();
  removeDesktopMenu?.();
  removeDesktopClose?.();
  removeDesktopUpdates?.();
});
</script>

<template>
  <div class="shell" :class="{ focusing: focus.on.value }" :style="{ '--split': split }">
    <div v-if="!focus.on.value" class="top">
      <AppToolbar />
      <ReadOnlyBar />
      <FileBar />
      <StorageWarning />
      <SampleBar />
      <StartBlankBar />
      <!-- Its region has no height; the offer itself is fixed in place. In the shell's grid it would be a row. -->
      <UpdatePrompt />
    </div>
    <DropZone />
    <SameTitleDialog />
    <MarkdownDialog />
    <BothChangedDialog />
    <RemoveDialog />
    <ModuleConfirmDialog />
    <CommandPalette />
    <SettingsDialog />
    <AppTour />
    <SprintNotice />
    <!-- Focus mode: the Source alone, in a column, with the marker in the corner. -->
    <main v-if="focus.on.value" class="focus" data-focus-layout>
      <h1 class="sr-only">Drafter</h1>
      <SourcePane />
      <FocusMarker @leave="focus.leave" />
    </main>
    <main v-else class="panes" :class="{ wide }">
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
    <AppStatusBar v-if="!focus.on.value" />
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
.shell.focusing {
  grid-template-rows: minmax(0, 1fr);
}
.panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 0;
}
.panes.wide {
  grid-template-columns: calc(var(--split) * 100%) 6px minmax(0, 1fr);
}
/* The Source alone: the text is a column 64 characters wide (the lines carry 24px of padding of their
   own), centered, with no gutters, and room under the last line for the marker. */
.focus {
  min-height: 0;
  animation: focus-in 0.18s ease-out;
}
.focus :deep(.cm-gutters) {
  display: none;
}
.focus :deep(.cm-content) {
  max-width: calc(64ch + 24px);
  margin-inline: auto;
  padding-bottom: 56px;
}
@keyframes focus-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
/* Under reduced motion nothing animates, entering or leaving. */
@media (prefers-reduced-motion: reduce) {
  .focus {
    animation: none;
    transition: none;
  }
}
</style>
