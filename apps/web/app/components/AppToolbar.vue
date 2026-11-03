<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { formatKeys, isApple } from '~/commands/keys';
import { openPalette } from '~/commands/palette';
import { commandById } from '~/commands/registry';
import { useEditor } from '~/editor/session';
import { runContextFor } from '~/modules/context';
import { useModuleButtons } from '~/modules/host';
import { runModuleAction } from '~/modules/registry';
import { useSettings } from '~/settings/settings';
import { EXPORTS } from '~/storage/export';
import { useGuard } from '~/storage/guard';
import { save } from '~/storage/save';
import { NOT_FOR_MARKDOWN } from '~/strip/labels';
import { TOOLBAR_FOLD_ORDER, type ToolbarItem, useToolbarFolded } from '~/utils/toolbar-fold';

// The top bar (fresh-look design §3.1): one quiet 44px row. The Drafter mark and wordmark open the
// app menu, as they always have; then the script's title, whether it has unsaved changes (Task 6),
// and its state (a sample's chip); Open, Save, and Export (and any module's buttons); the command
// search; the Structure strip and Focus as icon buttons; the Help menu (Task 3b); and the theme.
// The template is chosen in the Drafter menu and the status bar.
const colorMode = useColorMode();
const focus = useFocusMode();
const wide = useWideScreen();
const { readOnly } = useGuard();
const editor = useEditor();
const { settings } = useSettings();
const title = useScriptTitle();
const paletteKeys = formatKeys('Mod-k', isApple());
const dark = computed(() => colorMode.value !== 'light');

function toggleTheme() {
  colorMode.preference = dark.value ? 'light' : 'dark';
}

// The Structure button (structure strip design §5, Call 30) runs the palette's command, so the
// two and the Settings switch are one setting. A Markdown document has no scenes: the button is
// off and says why. It is pressed while the strip shows, which needs a Fountain script.
const structureOff = computed(() => editor.kind.value === 'markdown');
const structurePressed = computed(
  () => settings.value.structureStrip && editor.kind.value === 'fountain',
);
function toggleStructure() {
  const command = commandById('toggle-structure-strip');
  if (command && (!command.enabled || command.enabled())) void command.run();
}

// Below 1024px the bar is icons; when even they don't fit (a phone at 320px with a module's buttons
// and the unsaved dot, say), they fold into "More actions" at the bar's end, one at a time in
// TOOLBAR_FOLD_ORDER (the theme first, Open last), measured, never counted. The mark (the Drafter
// menu), the title and its dot, the search, and Help never fold. A folded button's tour step points
// at More actions (tour.config.ts). The bar never scrolls sideways or widens the page (Task 6's
// stopgap did).
const bar = ref<HTMLElement>();
const folded = useToolbarFolded();
const moduleButtons = useModuleButtons();
function applyFold(items: readonly ToolbarItem[]) {
  const el = bar.value;
  if (!el) return;
  for (const item of TOOLBAR_FOLD_ORDER) el.classList.toggle(`fold-${item}`, items.includes(item));
  el.classList.toggle('folding', items.length > 0);
}
/** More actions is open; the bar isn't fitted again until it closes, so its items stay put. */
const overflowOpen = ref(false);
function fit() {
  const el = bar.value;
  if (!el || overflowOpen.value) return;
  const items: ToolbarItem[] = [];
  applyFold(items);
  if (!wide.value) {
    for (const item of TOOLBAR_FOLD_ORDER) {
      if (el.scrollWidth <= el.clientWidth) break;
      if (item === 'modules' && moduleButtons.value.length === 0) continue;
      items.push(item);
      applyFold(items);
    }
  }
  if (items.join() !== folded.value.join()) folded.value = items;
}
let observer: ResizeObserver | undefined;
let frame = 0;
function fitSoon() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(fit);
}
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    // The bar's width, and its parts' (a dot, a module's button, a chip coming or going).
    observer = new ResizeObserver(fitSoon);
    const el = bar.value;
    if (el) {
      observer.observe(el);
      for (const child of el.children) observer.observe(child);
    }
  }
  fit();
});
onUpdated(fitSoon);
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(frame);
});
watch(
  // The switch comes and goes with the kind, and its one word below 1024px changes width.
  [
    wide,
    () => moduleButtons.value.length,
    () => editor.kind.value,
    () => settings.value.writingMode,
  ],
  fitSoon,
);

// The folded buttons' items, in the bar's order; each runs what its button does. Export is a
// submenu of the exports, as its button's menu is.
const overflowButton = ref<HTMLElement | null>(null);
const { entry, choose, onCloseAutoFocus } = useCommandMenu(overflowButton);
const exportIds = computed(() =>
  EXPORTS[editor.kind.value === 'markdown' ? 'markdown' : 'fountain'].flatMap((kind) =>
    // A script's story map follows its EPUB, as in the Export menu (story-map design §1.1).
    kind === 'epub' && editor.kind.value !== 'markdown'
      ? [`export-${kind}`, 'export-story-map']
      : [`export-${kind}`],
  ),
);
/** The class on More actions' Export item, which opens the exports as a submenu. */
const EXPORT_ITEM = 'more-export';

// Reka keeps a submenu open while the pointer leaves its item only if the pointer is heading for
// it, judged by the way the pointer last moved across the menu, which starts as "right". Below
// 1024px there is no room on the right, so Export's submenu opens on the left, and a mouse that
// went straight to it counted as leaving: the submenu closed before it could be used. Firefox also
// reports a leave with nothing under the pointer while it is still on the item, near the top of the
// window, which stopped a hover or a click from opening it at all. (A tap and the keyboard never
// ask, so they worked.) While More actions is open, a leave from Export into its own submenu, or
// one that finds the pointer still on Export, isn't passed on.
function keepExportOpen(event: PointerEvent) {
  const item = event.target;
  if (event.pointerType !== 'mouse' || !(item instanceof HTMLElement)) return;
  if (!item.classList.contains(EXPORT_ITEM)) return;
  const submenu = document.getElementById(item.getAttribute('aria-controls') ?? '');
  const to = event.relatedTarget;
  const box = item.getBoundingClientRect();
  const intoSubmenu =
    item.dataset.state === 'open' && to instanceof Node && !!submenu?.contains(to);
  const stillOn =
    to === null &&
    event.clientX >= box.left &&
    event.clientX <= box.right &&
    event.clientY >= box.top &&
    event.clientY <= box.bottom;
  if (intoSubmenu || stillOn) event.stopPropagation();
}
watch(overflowOpen, (open) => {
  if (open) document.addEventListener('pointerleave', keepExportOpen, true);
  else {
    document.removeEventListener('pointerleave', keepExportOpen, true);
    fitSoon();
  }
});
onBeforeUnmount(() => document.removeEventListener('pointerleave', keepExportOpen, true));

const overflowItems = computed<DropdownMenuItem[]>(() => {
  const out: DropdownMenuItem[] = [];
  const has = (item: ToolbarItem) => folded.value.includes(item);
  if (has('open')) out.push(...entry('open', 'i-lucide-folder-open'));
  if (has('save')) out.push(...entry('save', 'i-lucide-save'));
  if (has('export')) {
    out.push({
      label: 'Export',
      icon: 'i-lucide-file-output',
      class: EXPORT_ITEM,
      children: [
        ...exportIds.value.flatMap((id) => entry(id, 'i-lucide-file-output')),
        ...entry('export-options', 'i-lucide-sliders-horizontal'),
      ],
    });
  }
  if (has('modules')) {
    for (const module of moduleButtons.value) {
      const action = module.action;
      out.push({
        label: action?.label ?? module.name,
        icon: module.icon,
        onSelect: () => {
          choose(false);
          if (action) void runModuleAction(module.name, () => action.run(runContextFor(module)));
        },
      });
    }
  }
  if (has('focus')) {
    out.push({
      label: 'Focus',
      icon: 'i-lucide-scan',
      onSelect: () => {
        choose(true);
        focus.toggle();
      },
    });
  }
  if (has('theme')) {
    out.push({
      label: dark.value ? 'Switch to light theme' : 'Switch to dark theme',
      icon: dark.value ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => {
        choose(false);
        toggleTheme();
      },
    });
  }
  return out;
});
</script>

<template>
  <header ref="bar" class="toolbar">
    <h1 class="sr-only">Drafter</h1>
    <!-- The mark opens the app menu; its chevron says so, on every screen. Below 400px the wordmark
         gives way to the mark, so the bar fits a 320px screen (WCAG 1.4.10). -->
    <AppMenu>
      <picture class="logo">
        <source media="(max-width: 399.98px)" srcset="/mark.svg">
        <img :src="dark ? '/logo-dark.svg' : '/logo-light.svg'" alt="Drafter">
      </picture>
    </AppMenu>
    <span class="sep" aria-hidden="true" />
    <!-- The title gives way first when the bar is short of room, cut short on screen; the tooltip has it whole. -->
    <span class="title" :title="title" data-tour="title">{{ title }}</span>
    <!-- Unsaved changes, right after the title: a red dot and "Unsaved", which saves (Task 6). -->
    <SaveState />
    <SampleChip v-if="wide" />
    <!-- Never in TOOLBAR_FOLD_ORDER: it's there all the while the script is written (§3.2). -->
    <ModeSwitch />
    <span class="sep before-actions" aria-hidden="true" />
    <div class="actions">
      <ScriptsMenu v-slot="{ toggle, expanded, controls }">
        <button
          type="button"
          class="act fold-open-item"
          title="Open"
          :aria-expanded="expanded ? 'true' : 'false'"
          :aria-controls="expanded ? controls : undefined"
          @click="toggle"
        >
          <UIcon name="i-lucide-folder-open" class="icon" />
          <span class="label">Open</span>
        </button>
      </ScriptsMenu>
      <button
        type="button"
        class="act fold-save-item"
        title="Save"
        :aria-disabled="readOnly ? 'true' : undefined"
        data-tour="save"
        @click="save().catch(() => {})"
      >
        <UIcon name="i-lucide-save" class="icon" />
        <span class="label">Save</span>
      </button>
      <ExportMenu v-slot="{ toggle, expanded, controls }">
        <button
          type="button"
          class="act fold-export-item"
          title="Export"
          :aria-expanded="expanded ? 'true' : 'false'"
          :aria-controls="expanded ? controls : undefined"
          data-tour="export"
          @click="toggle"
        >
          <UIcon name="i-lucide-file-output" class="icon" />
          <span class="label">Export</span>
          <UIcon name="i-lucide-chevron-down" class="caret" />
        </button>
      </ExportMenu>
      <ModuleButtons />
    </div>
    <span class="spacer" />
    <button
      type="button"
      class="search"
      title="Go to scene or command"
      data-tour="palette"
      aria-haspopup="dialog"
      @click="openPalette('all', $event.currentTarget as HTMLElement)"
    >
      <UIcon name="i-lucide-search" class="icon" />
      <span class="label">Go to scene or command</span>
      <kbd>{{ paletteKeys }}</kbd>
    </button>
    <!-- A phone draws no Structure strip, so it has no button (Call 16). -->
    <button
      type="button"
      class="ib structure"
      aria-label="Structure"
      :title="structureOff ? NOT_FOR_MARKDOWN : 'Structure strip'"
      :aria-pressed="structurePressed ? 'true' : 'false'"
      :aria-disabled="structureOff ? 'true' : undefined"
      @click="toggleStructure"
    >
      <UIcon name="i-lucide-panel-top" class="icon" />
    </button>
    <button
      id="focus-button"
      type="button"
      class="ib fold-focus-item"
      aria-label="Focus"
      title="Focus"
      data-tour="focus"
      @click="focus.toggle"
    >
      <UIcon name="i-lucide-scan" class="icon" />
    </button>
    <!-- Help, always in view: a menu of its own, not a section of the Drafter menu (Task 3b). -->
    <HelpMenu />
    <button
      type="button"
      class="ib fold-theme-item"
      :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      :title="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="toggleTheme"
    >
      <UIcon :name="dark ? 'i-lucide-sun' : 'i-lucide-moon'" class="icon" />
    </button>
    <!-- What didn't fit, below 1024px: shown only while something is folded into it. -->
    <MenuButton
      v-model:open="overflowOpen"
      :items="overflowItems"
      :content="{ align: 'end', onCloseAutoFocus }"
    >
      <button
        ref="overflowButton"
        type="button"
        class="ib overflow"
        aria-label="More actions"
        title="More actions"
        data-tour="toolbar-more"
      >
        <UIcon name="i-lucide-ellipsis" class="icon" />
      </button>
    </MenuButton>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  box-sizing: border-box;
  height: 44px;
  padding: 0 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.logo {
  display: block;
  flex: none;
}
.logo img {
  display: block;
  height: 22px;
  width: auto;
}
.sep {
  flex: none;
  width: 1px;
  height: 18px;
  margin: 0 6px;
  background: var(--border);
}
.title {
  flex: 0 1 auto;
  min-width: 0;
  margin-right: 4px;
  overflow: hidden;
  color: var(--text);
  font: 600 13px/18px var(--font-sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}
/* The four buttons: borderless, a 16px icon (and a label on a wide screen), --raised on hover. */
.act,
.ib,
.search {
  display: flex;
  flex: none;
  align-items: center;
  height: 30px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  font: 500 13px/1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.act {
  gap: 6px;
  padding: 0 10px;
}
.ib {
  justify-content: center;
  width: 30px;
  padding: 0;
}
.act:hover,
.ib:hover,
.act[aria-expanded="true"] {
  background: var(--raised);
  color: var(--text);
}
.ib[aria-pressed="true"] {
  background: var(--accent-soft);
  color: var(--text);
}
/* Forced colors drop the fill, so a border marks the pressed one (Structure). */
@media (forced-colors: active) {
  .ib[aria-pressed="true"] {
    border: 1px solid CanvasText;
  }
}
.act[aria-disabled="true"],
.ib[aria-disabled="true"] {
  cursor: not-allowed;
}
.act[aria-disabled="true"] .icon,
.ib[aria-disabled="true"] .icon {
  opacity: 0.6;
}
.icon {
  flex: none;
  width: 16px;
  height: 16px;
}
.caret {
  flex: none;
  width: 12px;
  height: 12px;
  margin-left: -2px;
}
/* The command search: a field-like button on --raised, 260px on a wide screen. */
.search {
  gap: 8px;
  width: 260px;
  margin-right: 4px;
  padding: 0 10px;
  border-radius: var(--r);
  background: var(--raised);
}
.search:hover {
  background: var(--overlay);
  color: var(--text);
}
.search .label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
kbd {
  margin-left: auto;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--overlay);
  color: var(--muted);
  font: 500 11px/16px var(--font-sans);
}
.spacer {
  flex: 1 1 0;
  min-width: 0;
}

/* Under 1280px the search gives a little of its width, and more only when the bar needs it: it
   shrinks well ahead of the title, down to what still reads as a search. */
@media (max-width: 1279.98px) {
  .search {
    flex: 0 8 220px;
    width: auto;
    min-width: 110px;
  }
}

/* One pane, and a bar of icons, below 1024px: the labels drop and the tooltips name the buttons. */
@media (max-width: 1023.98px) {
  /* The bar never widens the page: what doesn't fit folds into More actions (`fit`). */
  .toolbar {
    padding: 0 8px;
    overflow: hidden;
  }
  .sep.before-actions {
    display: none;
  }
  /* The title keeps a few letters (with its dot, which never shrinks): the buttons fold into More
     actions before it is cut down to "T…" (`fit` folds while the bar is still too wide). */
  .title {
    min-width: 6ch;
  }
  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .act,
  .search {
    justify-content: center;
    width: 30px;
    margin: 0;
    padding: 0;
  }
  .search {
    flex: none;
    min-width: 0;
    border-radius: var(--r-sm);
    background: none;
  }
  .search:hover {
    background: var(--raised);
  }
  .act .caret,
  .structure,
  kbd {
    display: none;
  }
}

/* More actions shows only while something is folded into it; a folded button is gone from the
   bar (and from the tab order), and its item is in the menu. */
.overflow {
  display: none;
}
.toolbar.folding .overflow {
  display: flex;
}
.toolbar.fold-open .fold-open-item,
.toolbar.fold-save .fold-save-item,
.toolbar.fold-export .fold-export-item,
.toolbar.fold-focus .fold-focus-item,
.toolbar.fold-theme .fold-theme-item,
.toolbar.fold-modules :deep(.modules > button) {
  display: none;
}

/* The narrowest phones (320px, WCAG 1.4.10): a little less room for each button, never under 24px. */
@media (max-width: 399.98px) {
  .toolbar {
    gap: 2px;
    padding: 0 6px;
  }
  .sep {
    margin: 0 2px;
  }
  .act,
  .ib,
  .search,
  .toolbar :deep(.act) {
    width: 26px;
  }
}
</style>
