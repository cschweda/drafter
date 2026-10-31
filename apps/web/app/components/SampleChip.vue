<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useEditor } from '~/editor/session';
import { useGuard } from '~/storage/guard';
import { useScript } from '~/storage/script';

// The chip after the title in the top bar (fresh-look design §3.1): what state the script is in.
// A sample says so, and its menu is the sample bar of old: New screenplay, New stage play, New
// Markdown document, Open a file…. A tab that only shows the script says "Read-only" (the bar under
// the top bar says why, and offers to edit here). A phone has the sample bar's row instead
// (SampleBar.vue), since this chip doesn't fit beside its icons.
const { project } = useScript();
const { readOnly } = useGuard();
const editor = useEditor();
const { actions, off } = useStartActions();

// A choice puts the cursor in the editor if the command didn't put focus anywhere itself; the chip
// has gone by then (the script is no longer a sample). Escape returns focus to the chip as usual.
let chosen = false;
function onCloseAutoFocus(event: Event) {
  if (!chosen) return;
  chosen = false;
  event.preventDefault();
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    editor.goto(editor.view.state.selection.main.head);
  });
}

const items = computed<DropdownMenuItem[]>(() =>
  actions.value.map((action) => ({
    label: action.label,
    icon: action.id === 'open' ? 'i-lucide-folder-open' : 'i-lucide-file-plus',
    disabled: off(action),
    onSelect: () => {
      chosen = true;
      action.command?.run();
    },
  })),
);
</script>

<template>
  <MenuButton
    v-if="project?.sample"
    :items="items"
    :content="{ align: 'start', onCloseAutoFocus }"
  >
    <button type="button" class="chip" aria-label="Sample: start your own" data-sample-chip>
      <span class="what">Sample ·</span>
      <span class="do">Start your own</span>
      <UIcon name="i-lucide-chevron-down" class="caret" />
    </button>
  </MenuButton>
  <span v-else-if="readOnly" class="chip state">Read-only</span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  background: var(--raised);
  color: var(--muted);
  font: 500 12px/16px var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
}
button.chip {
  cursor: pointer;
}
button.chip:hover {
  background: var(--overlay);
}
.do {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text);
}
.caret {
  flex: none;
  width: 12px;
  height: 12px;
}
.state {
  color: var(--text);
}
</style>
