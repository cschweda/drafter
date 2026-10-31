<script setup lang="ts">
import { formatKeys, isApple } from '~/commands/keys';
import { openPalette } from '~/commands/palette';
import { commandById } from '~/commands/registry';
import { useEditor } from '~/editor/session';
import { useSettings } from '~/settings/settings';
import { useGuard } from '~/storage/guard';
import { save } from '~/storage/save';
import { NOT_FOR_MARKDOWN } from '~/strip/labels';

// The top bar (fresh-look design §3.1): one quiet 44px row. The Drafter mark and wordmark open the
// app menu, as they always have; then the script's title and its state (a sample's chip); Open,
// Save, and Export (and any module's buttons); the command search; and the Structure strip, Focus,
// and the theme as icon buttons. The template is chosen in the Drafter menu and the status bar.
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
</script>

<template>
  <header class="toolbar">
    <h1 class="sr-only">Drafter</h1>
    <!-- The mark opens the app menu. Below 400px the wordmark gives way to the mark, so the bar fits a
         320px screen (WCAG 1.4.10). -->
    <AppMenu>
      <picture class="logo">
        <source media="(max-width: 399.98px)" srcset="/mark.svg">
        <img :src="dark ? '/logo-dark.svg' : '/logo-light.svg'" alt="Drafter">
      </picture>
    </AppMenu>
    <span class="sep" aria-hidden="true" />
    <!-- The title gives way first when the bar is short of room, cut short on screen; the tooltip has it whole. -->
    <span class="title" :title="title">{{ title }}</span>
    <SampleChip v-if="wide" />
    <span class="sep before-actions" aria-hidden="true" />
    <div class="actions">
      <ScriptsMenu v-slot="{ toggle, expanded, controls }">
        <button
          type="button"
          class="act"
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
        class="act"
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
          class="act"
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
      class="ib"
      aria-label="Focus"
      title="Focus"
      data-tour="focus"
      @click="focus.toggle"
    >
      <UIcon name="i-lucide-scan" class="icon" />
    </button>
    <button
      type="button"
      class="ib"
      :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      :title="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="toggleTheme"
    >
      <UIcon :name="dark ? 'i-lucide-sun' : 'i-lucide-moon'" class="icon" />
    </button>
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

/* Under 1280px the search gives a little of its width. */
@media (max-width: 1279.98px) {
  .search {
    width: 220px;
  }
}

/* One pane, and a bar of icons, below 1024px: the labels drop and the tooltips name the buttons. */
@media (max-width: 1023.98px) {
  .toolbar {
    padding: 0 8px;
  }
  .sep.before-actions {
    display: none;
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
  .toolbar :deep(.mark .caret) {
    display: none;
  }
}
</style>
