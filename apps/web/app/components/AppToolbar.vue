<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { TEMPLATE_NAMES, templateIdOf } from '~/editor/template';

const colorMode = useColorMode();
const { doc } = useEditor();
const templateName = computed(() => TEMPLATE_NAMES[templateIdOf(doc.value)]);
const dark = computed(() => colorMode.value !== 'light');

function toggleTheme() {
  colorMode.preference = dark.value ? 'light' : 'dark';
}

// The round actions wait for the editor and files (Plans 3 and 4): until
// then they show, but say they're unavailable.
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
    <!-- Below 400px the wordmark gives way to the mark, so the toolbar fits a
         320px screen (WCAG 1.4.10). -->
    <picture class="logo">
      <source media="(max-width: 399.98px)" srcset="/mark.svg">
      <img :src="dark ? '/logo-dark.svg' : '/logo-light.svg'" alt="Drafter">
    </picture>
    <div class="actions">
      <button
        v-for="action in ACTIONS"
        :key="action.kind"
        type="button"
        class="act"
        aria-disabled="true"
        :data-tour="action.tour"
      >
        <span class="round" :class="action.kind"><UIcon :name="action.icon" class="icon" /></span>
        <span class="label">{{ action.label }}</span>
      </button>
    </div>
    <button type="button" class="chip template" aria-disabled="true" data-tour="template">
      {{ templateName }}
    </button>
    <span class="spacer" />
    <button type="button" class="chip" aria-disabled="true" data-tour="palette">
      <UIcon name="i-lucide-search" class="icon" />
      <span class="label">Go to scene or command</span>
      <kbd>⌘K</kbd>
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
  width: 30px;
  height: 30px;
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
  width: 15px;
  height: 15px;
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
  .logo {
    margin-right: 6px;
  }
  .logo img {
    height: 22px;
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
  .chip {
    padding: 6px 8px;
  }
}
</style>
