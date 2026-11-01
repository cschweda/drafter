<script setup lang="ts">
import { EditorView } from '@codemirror/view';
import { installTestCastProbe } from '~/cast/probe-hook';
import { registerBuiltinCommands } from '~/commands/builtin';
import { installDesktopClose } from '~/commands/desktop-close';
import { installDesktopMenu } from '~/commands/desktop-menu';
import { commandById, installGlobalKeys } from '~/commands/registry';
import { isDesktopBuild } from '~/desktop';
import { restoreSelection } from '~/editor/restore-selection';
import { useEditor } from '~/editor/session';
import { startModules } from '~/modules/host';
import { applySettings } from '~/settings/apply';
import { useSettings } from '~/settings/settings';
import { useSnapshots } from '~/snapshots/use-snapshots';
import { useSpell } from '~/spell/use-spell';
import { installFileCheck } from '~/storage/check';
import { installSystemOpen } from '~/storage/open';
import { watchSaveError } from '~/storage/save';
import { useScript } from '~/storage/script';
import { installDesktopUpdates } from '~/update/desktop-source';
import { guardEditorSelection, leavesOnEscape } from '~/utils/focus';
import { dropTab, PHONE_DEFAULT_TAB } from '~/utils/panes';

const desktopBuild = isDesktopBuild();
const { tabs, phoneTab, split, inspect, resize } = usePanes();
const wide = useWideScreen();
const focus = useFocusMode();
const shown = computed(() => (wide.value ? [tabs.value.left, tabs.value.right] : [phoneTab.value]));
// The on-screen keyboard (below 1024px): the shell fits what is still seen above it (the root's
// `keyboard-open`); the status bar's row and the bottom tab bar give way.
useOnScreenKeyboard();

// The skip link: the first Tab stop, which puts the cursor in the editor (Show Source, which also
// brings the Source up on a phone) past the toolbar and the bars under it.
function skipToEditor() {
  void commandById('show-source')?.run();
}

// F6 moves focus between the editor and the Inspector (technical design §13): from the editor
// to the Inspector's panel, and from the Inspector, or anywhere else, to the editor.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'F6' || !wide.value || focus.on.value) return;
  event.preventDefault();
  const pane = (document.activeElement?.closest('[data-pane]') as HTMLElement | null)?.dataset.pane;
  if (pane === 'left') document.getElementById(`panel-${tabs.value.right}`)?.focus();
  else view.focus();
}

// Escape leaves focus mode when nothing else used it (CodeMirror's completion and search, the palette, a dialog).
// This listens in the bubble phase, after they have had their turn.
function onEscape(event: KeyboardEvent) {
  if (!focus.on.value || !leavesOnEscape(event)) return;
  event.preventDefault();
  focus.leave();
}

// The editor is parked here whenever the Source tab isn't showing.
const { view, kind } = useEditor();

// A Markdown document has no scenes or notes, so no Outline, Cards, Notes, or Scaffold tab (Phase 2
// design §5.7; seeing-the-script design §10): the Inspector showing one shows the Preview.
const NOT_FOR_MARKDOWN = ['outline', 'cards', 'notes', 'scaffold'];
watch(
  kind,
  (now) => {
    if (now !== 'markdown') return;
    for (const tab of NOT_FOR_MARKDOWN) tabs.value = dropTab(tabs.value, tab);
    if (NOT_FOR_MARKDOWN.includes(phoneTab.value)) phoneTab.value = PHONE_DEFAULT_TAB;
  },
  { immediate: true },
);
const holder = ref<HTMLElement>();
// Opens the current script, and starts keeping its recovery copy.
const { dirty } = useScript();
const { settings } = useSettings();
// The Structure strip: when it is turned on, on a wide screen, for a Fountain script (structure
// strip design §5). It sits in `.top`, which focus mode takes away.
const stripShown = computed(
  () => settings.value.structureStrip && wide.value && kind.value === 'fountain',
);
// Starts taking the script's snapshots as the writer works, saves, and opens files (§11.1).
useSnapshots();
// Starts the spellcheck, which makes its worker once the settings are read and the first script is
// open (Plan D): the Source pane's spelling marks.
useSpell();

// The script's title, as its kind reads it: the browser tab and the top bar show it.
const pageTitle = useScriptTitle();

// The tab says which script this is, and whether it has changes that aren't in its file.
// A tab's title can't be coloured, so its icon says so too, with a red dot (fresh-look Task 6): both
// icons, whichever the browser chose: the .ico with the .ico (a browser that picks it may not read an
// SVG), the SVG with the SVG. The "• " stays, for a reader who can't tell the red.
useHead({
  title: computed(() => `${dirty.value ? '• ' : ''}${pageTitle.value} — Drafter`),
  link: computed(() =>
    dirty.value
      ? [
          { key: 'icon-ico', rel: 'icon', href: '/favicon-unsaved.ico', sizes: '32x32' },
          { key: 'icon-svg', rel: 'icon', href: '/favicon-unsaved.svg', type: 'image/svg+xml' },
        ]
      : [],
  ),
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
let removeSelectionGuard: (() => void) | undefined;

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
  // Safari would type into the script with focus anywhere else (decided 2026-10-29).
  removeSelectionGuard = guardEditorSelection(view.contentDOM);
  if (!view.dom.isConnected) holder.value?.append(view.dom);
  installTestCastProbe();
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
  removeSelectionGuard?.();
});
</script>

<template>
  <div class="shell" :class="{ focusing: focus.on.value }" :style="{ '--split': split }">
    <a v-if="!focus.on.value" href="#panel-source" class="skip" @click.prevent="skipToEditor">
      Skip to the editor
    </a>
    <!-- The top bar, then only what can't wait (fresh-look design §3.5): a tab that can't edit, a
         file that can't be checked, a recovery copy that can't be kept, and on a phone the sample's
         row (a wide screen has it in the top bar's chip). The recovery copy that may be cleared is
         a toast and the status bar's chip. -->
    <div v-if="!focus.on.value" class="top">
      <AppToolbar />
      <ReadOnlyBar />
      <FileBar />
      <StorageWarning />
      <SampleBar />
      <StartBlankBar />
      <!-- Its region has no height; the offer itself is fixed in place. In the shell's grid it would be a row. -->
      <UpdatePrompt />
      <StructureStrip v-if="stripShown" />
    </div>
    <DropZone />
    <SameTitleDialog />
    <MarkdownDialog />
    <BothChangedDialog />
    <RemoveDialog />
    <ModuleConfirmDialog />
    <!-- The desktop app's folder modules run in hidden frames of their own; drafter.dev has none. -->
    <LazyFolderModuleRunners v-if="desktopBuild" />
    <CommandPalette />
    <OutlineAnnouncer />
    <SpellMenu />
    <TreatmentDialog />
    <ExportOptionsDialog />
    <SceneDetailsDialog />
    <NewNoteDialog />
    <SettingsDialog />
    <HistoryDialog />
    <SceneHistoryDialog />
    <AboutDialog />
    <UpdateCheckDialog />
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
        <!-- The editor on the left, always; every other view in the Inspector (Calls 4, 13). -->
        <AppPane pane="left" label="Source" selected="source" :shown="shown" />
        <PaneDivider :split="split" @resize="resize" />
        <AppPane
          pane="right"
          label="Inspector"
          :selected="tabs.right"
          :shown="shown"
          @choose="inspect($event)"
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
/* Out of sight until it has focus, then over the toolbar's corner. Positioned, so it takes no row of
   the grid. */
.skip {
  position: absolute;
  z-index: 50;
  top: 6px;
  left: 6px;
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 14px;
  font-weight: 600;
  text-decoration: underline;
  transform: translateY(-200%);
}
.skip:focus {
  transform: none;
}
.top {
  /* As wide as the window, never its content: a long title is cut short, not the window widened. */
  min-width: 0;
}
/* Fitted to the visual viewport while the on-screen keyboard is up (useOnScreenKeyboard). Fixed,
   so a browser that pans the page to the caret moves nothing under it. */
:root.keyboard-open .shell {
  position: fixed;
  top: var(--vv-top, 0);
  right: 0;
  left: 0;
  height: var(--vv-height, 100dvh);
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
  /* The 36px header, a second bar (the element bar, the Outline's filter), and the text. Each pane
     takes all three rows as its own (AppPane.vue), so a row is as tall as the taller pane's part:
     the first lines of text in the two panes start at the same height. */
  grid-template-rows: auto auto minmax(0, 1fr);
}
.panes.wide > :deep(*) {
  grid-row: 1 / -1;
}
/* The Source alone: the text fits the window, with even margins that grow with it (the lines carry
   24px of padding of their own), with no gutters, and room under the last line for the marker. */
.focus {
  min-height: 0;
  animation: focus-in 0.18s ease-out;
}
.focus :deep(.cm-gutters) {
  display: none;
}
.focus :deep(.cm-content) {
  margin-inline: clamp(0px, 8vw - 24px, 120px);
  padding-top: clamp(16px, 5vh, 48px);
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
