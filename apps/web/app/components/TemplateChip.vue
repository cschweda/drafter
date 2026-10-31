<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { useTemplateMenu } from '~/editor/template-menu';

// The template chip (fresh-look design §3.1, §3.4): it left the top bar for the status bar's right
// end, where the template is named; the Drafter menu's Template section has the same list. Its name
// is the script's template ("Screenplay (fallback)" for one Drafter doesn't have); a Markdown
// document has no template, so its chip names the document, and the label says so.
const editor = useEditor();
// A choice puts focus in the editor, where Mod+Z undoes it; Escape, or leaving the menu, returns it to the chip as usual.
let chosen = false;
function onCloseAutoFocus(event: Event) {
  if (!chosen) return;
  chosen = false;
  event.preventDefault();
  editor.goto(editor.view.state.selection.main.head);
}
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
</script>

<template>
  <MenuButton :items="templateItems" :content="{ align: 'end', onCloseAutoFocus }">
    <button
      type="button"
      class="chip template"
      :aria-label="chipLabel"
      :title="templateName"
      data-tour="template"
    >
      <span class="name">{{ templateName }}</span>
    </button>
  </MenuButton>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: inherit;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.chip:hover {
  background: var(--raised);
  color: var(--text);
}
.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
