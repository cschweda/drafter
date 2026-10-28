<script setup lang="ts">
import { formatKeys, isApple } from '~/commands/keys';
import { openPalette } from '~/commands/palette';
import { useEditor } from '~/editor/session';
import { useTemplateMenu } from '~/editor/template-menu';
import { useGuard } from '~/storage/guard';
import { save } from '~/storage/save';

const colorMode = useColorMode();
const focus = useFocusMode();
const { readOnly } = useGuard();
const editor = useEditor();
// A choice puts focus in the editor, where Mod+Z undoes it; Escape, or leaving the menu, returns it to the chip as usual.
let chosen = false;
function onCloseAutoFocus(event: Event) {
  if (!chosen) return;
  chosen = false;
  event.preventDefault();
  editor.goto(editor.view.state.selection.main.head);
}
// The chip's name is the script's template ("Screenplay (fallback)" for one Drafter doesn't have); a
// Markdown document has no template, so its chip names the document, and the label says so.
const {
  template,
  name: templateName,
  noteItems,
  items: typeItems,
} = useTemplateMenu(() => {
  chosen = true;
});
const chipLabel = computed(() =>
  template.kind.value === 'markdown'
    ? `Document: ${templateName.value}`
    : `Template: ${templateName.value}`,
);
// The chip's menu: the note about an unknown template (if any), then the one list the app menu shows too.
const templateItems = computed(() =>
  noteItems.value.length > 0 ? [noteItems.value, typeItems.value] : typeItems.value,
);
const paletteKeys = formatKeys('Mod-k', isApple());
const dark = computed(() => colorMode.value !== 'light');

function toggleTheme() {
  colorMode.preference = dark.value ? 'light' : 'dark';
}

// Open is the scripts menu, Save saves, Export is the export menu, and Focus is focus mode.
const ACTIONS = [
  { label: 'Open', icon: 'i-lucide-folder-open', kind: 'open', tour: undefined },
  { label: 'Save', icon: 'i-lucide-save', kind: 'save', tour: 'save' },
  { label: 'Export', icon: 'i-lucide-file-output', kind: 'export', tour: 'export' },
  { label: 'Focus', icon: 'i-lucide-scan', kind: 'focus', tour: 'focus' },
];
</script>

<template>
  <header class="toolbar">
    <h1 class="sr-only">Drafter</h1>
    <!-- The mark opens the app menu. Below 400px the wordmark gives way to the mark, so the toolbar fits a
         320px screen (WCAG 1.4.10). -->
    <AppMenu>
      <picture class="logo">
        <source media="(max-width: 399.98px)" srcset="/mark.svg">
        <img :src="dark ? '/logo-dark.svg' : '/logo-light.svg'" alt="Drafter">
      </picture>
    </AppMenu>
    <div class="actions">
      <template v-for="action in ACTIONS" :key="action.kind">
        <ScriptsMenu v-if="action.kind === 'open'" v-slot="{ toggle, expanded, controls }">
          <button
            type="button"
            class="act"
            :aria-expanded="expanded ? 'true' : 'false'"
            :aria-controls="expanded ? controls : undefined"
            @click="toggle"
          >
            <span class="round" :class="action.kind"><UIcon :name="action.icon" class="icon" /></span>
            <span class="label">{{ action.label }}</span>
          </button>
        </ScriptsMenu>
        <ExportMenu v-else-if="action.kind === 'export'" v-slot="{ toggle, expanded, controls }">
          <button
            type="button"
            class="act"
            :aria-expanded="expanded ? 'true' : 'false'"
            :aria-controls="expanded ? controls : undefined"
            :data-tour="action.tour"
            @click="toggle"
          >
            <span class="round" :class="action.kind"><UIcon :name="action.icon" class="icon" /></span>
            <span class="label">{{ action.label }}</span>
          </button>
        </ExportMenu>
        <button
          v-else-if="action.kind === 'save'"
          type="button"
          class="act"
          :aria-disabled="readOnly ? 'true' : undefined"
          :data-tour="action.tour"
          @click="save().catch(() => {})"
        >
          <span class="round" :class="action.kind"><UIcon :name="action.icon" class="icon" /></span>
          <span class="label">{{ action.label }}</span>
        </button>
        <button
          v-else-if="action.kind === 'focus'"
          id="focus-button"
          type="button"
          class="act"
          :data-tour="action.tour"
          @click="focus.toggle"
        >
          <span class="round" :class="action.kind"><UIcon :name="action.icon" class="icon" /></span>
          <span class="label">{{ action.label }}</span>
        </button>
        <button
          v-else
          type="button"
          class="act"
          aria-disabled="true"
          :data-tour="action.tour"
        >
          <span class="round" :class="action.kind"><UIcon :name="action.icon" class="icon" /></span>
          <span class="label">{{ action.label }}</span>
        </button>
      </template>
      <ModuleButtons />
    </div>
    <MenuButton :items="templateItems" :content="{ align: 'start', onCloseAutoFocus }">
      <button
        type="button"
        class="chip template"
        :aria-label="chipLabel"
        data-tour="template"
      >
        {{ templateName }}
      </button>
    </MenuButton>
    <span class="spacer" />
    <button
      type="button"
      class="chip"
      data-tour="palette"
      aria-haspopup="dialog"
      @click="openPalette('all', $event.currentTarget as HTMLElement)"
    >
      <UIcon name="i-lucide-search" class="icon" />
      <span class="label">Go to scene or command</span>
      <kbd>{{ paletteKeys }}</kbd>
    </button>
    <button
      type="button"
      class="chip"
      :aria-label="dark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="toggleTheme"
    >
      <UIcon :name="dark ? 'i-lucide-sun' : 'i-lucide-moon'" class="icon" />
      <span class="label" aria-hidden="true">{{ dark ? 'Light' : 'Dark' }}</span>
    </button>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: var(--chrome);
  border-bottom: 1px solid var(--line);
}
.logo {
  flex: none;
}
/* The space after the mark is the menu button's, so its focus ring stays close to the logo. */
.toolbar :deep(.mark) {
  margin-right: 14px;
}
.logo img {
  display: block;
  height: 28px;
  width: auto;
}
.actions {
  display: flex;
  gap: 14px;
}
.act {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: 600 13px/1 var(--font-sans);
}
.act[aria-disabled="true"] {
  cursor: not-allowed;
}
.act[aria-disabled="true"] .round {
  opacity: 0.6;
}
.round {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #111216;
}
.round.open {
  background: #9bd3a0;
}
.round.save {
  background: #8db8e8;
}
.round.export {
  background: #e5b04a;
}
.round.focus {
  background: #f5a9c0;
}
.icon {
  width: 13px;
  height: 13px;
}
.chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--chrome-2);
  color: var(--text);
  font: 600 12.5px/1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.chip[aria-disabled="true"] {
  color: var(--muted);
  cursor: not-allowed;
}
kbd {
  padding: 1px 4px;
  border: 1px solid var(--line);
  border-radius: 4px;
  font: 600 11px/1 var(--font-sans);
}
.spacer {
  flex: 1;
}

/* One pane, and a toolbar of icons, below 1024px. */
@media (max-width: 1023.98px) {
  .toolbar,
  .actions {
    gap: 8px;
  }
  .toolbar {
    padding: 8px 10px;
  }
  .toolbar :deep(.mark) {
    margin-right: 6px;
  }
  .logo img {
    height: 24px;
  }
  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .template,
  kbd {
    display: none;
  }
  /* Icons alone, the search and theme chips match the action circles. */
  .chip {
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
  }
}
</style>
