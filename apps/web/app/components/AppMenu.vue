<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { SAMPLES } from '~/editor/samples';
import { useEditor } from '~/editor/session';
import { STARTER_KINDS } from '~/editor/starter-kinds';
import { DOCUMENT_TYPES, typeNameOf } from '~/editor/template';
import { useTemplateMenu } from '~/editor/template-menu';
import { EXPORTS } from '~/storage/export';
import { useGuard } from '~/storage/guard';
import { kindOf, type Project } from '~/storage/projects';
import { revertNotice } from '~/storage/save';
import { useScript } from '~/storage/script';

// The app menu (Phase 1 design §9.1): the Drafter mark opens it. Every item runs its registered
// command (`useCommandMenu`), so this menu, the palette, and the keys never disagree; an item
// whose command is off shows disabled. The recent scripts are the one list that isn't commands:
// they open a script by id, as the Scripts menu does. Help is a menu of its own in the top bar
// (`HelpMenu.vue`, fresh-look Task 3b), so it isn't a section here.
const script = useScript();
const editor = useEditor();
const { taking } = useGuard();

/** How many recent scripts the menu lists. */
const RECENT = 8;
const recent = ref<Project[]>([]);

const mark = ref<HTMLElement | null>(null);
const { entry, choose, onCloseAutoFocus } = useCommandMenu(mark);

// The Template section: the template is chosen here on every screen (fresh-look design §3.1), as
// well as from the status bar's chip and the palette's Template: commands. It is the chip's own
// list, built once (`useTemplateMenu`), so the two agree on what is checked, what is off, and what
// a template Drafter doesn't have is called. The editor gets focus after a choice.
const {
  template,
  name: templateName,
  noteItems: templateNote,
  items: templateItems,
} = useTemplateMenu(() => choose(true));
const templateSection = computed<DropdownMenuItem[]>(() => [
  {
    type: 'label',
    label: `${template.kind.value === 'markdown' ? 'Document' : 'Template'}: ${templateName.value}`,
  },
  ...templateNote.value,
  ...templateItems.value,
]);

// A script that is not open can be switched to while nothing else is switching.
const canSwitch = computed(() => !!script.project.value && !script.busy.value && !taking.value);

const recentItems = computed<DropdownMenuItem[]>(() => {
  if (recent.value.length === 0) {
    return [{ type: 'label', label: 'Scripts you start are kept here.' }];
  }
  return recent.value.map((p) => {
    const current = script.project.value?.id === p.id;
    return {
      label: current ? `${p.title} (open now)` : p.title,
      description: typeNameOf(kindOf(p), p.templateId),
      icon: current ? 'i-lucide-check' : 'i-lucide-file',
      disabled: !canSwitch.value,
      onSelect: () => {
        choose(true);
        if (current) return;
        script.open(p.id).catch(() => {});
      },
    };
  });
});

// A Fountain script exports as a PDF, an HTML page, an EPUB, plain text, a Final Draft file, or
// Markdown; a Markdown document as a PDF, an HTML page, an EPUB, its Markdown file, or plain text
// (`EXPORTS`). (The
// Final Draft and Markdown commands are off in the other kind, and the palette hides them; here
// the other kind's items are left out.)
const exportIds = computed(() =>
  EXPORTS[editor.kind.value === 'markdown' ? 'markdown' : 'fountain'].flatMap((kind) =>
    // A script's story map follows its EPUB (story-map design §1.1).
    kind === 'epub' && editor.kind.value !== 'markdown'
      ? [`export-${kind}`, 'export-story-map']
      : [`export-${kind}`],
  ),
);
const EXPORT_ICONS: Record<string, string> = {
  'export-pdf': 'i-lucide-file-output',
  'export-html': 'i-lucide-globe',
  'export-epub': 'i-lucide-book',
  'export-story-map': 'i-lucide-map',
  'export-md': 'i-lucide-file-output',
  'export-txt': 'i-lucide-file-type',
  'export-fdx': 'i-lucide-file-code',
};

const items = computed<DropdownMenuItem[][]>(() => [
  [
    ...DOCUMENT_TYPES.flatMap((type) => entry(`new-${type.newKind}`, type.newIcon, true)),
    ...STARTER_KINDS.flatMap((starter) => entry(starter.command, 'i-lucide-graduation-cap', true)),
    ...entry('open', 'i-lucide-folder-open'),
    ...entry('open-as-screenplay', 'i-lucide-clapperboard'),
  ],
  templateSection.value,
  [{ type: 'label', label: 'Recent scripts' }, ...recentItems.value],
  [
    { type: 'label', label: 'Samples' },
    ...SAMPLES.flatMap((sample) => entry(`open-sample-${sample.kind}`, 'i-lucide-file-text', true)),
  ],
  [
    ...entry('save', 'i-lucide-save'),
    ...entry('save-as', 'i-lucide-save-all'),
    ...entry('revert-to-saved', 'i-lucide-undo-2', true),
    ...entry('history', 'i-lucide-history'),
    ...entry('start-draft', 'i-lucide-milestone'),
    ...entry('drafts', 'i-lucide-milestone'),
    ...entry('cuts', 'i-lucide-scissors'),
    // File, as in the palette: Start blank only while a first document still has its sample's untouched text.
    ...(script.canStartBlank.value ? entry('start-blank', 'i-lucide-eraser', true) : []),
  ],
  [
    ...exportIds.value.flatMap((id) => entry(id, EXPORT_ICONS[id] as string)),
    // Export options… ends the section, after a line (out-the-door design §2.4); off, with the
    // reason, for a Markdown document.
    { type: 'separator' },
    ...entry('export-options', 'i-lucide-sliders-horizontal'),
  ],
  [...entry('show-stats', 'i-lucide-chart-column'), ...entry('settings', 'i-lucide-settings')],
]);

async function readRecent() {
  try {
    recent.value = (await script.scripts()).slice(0, RECENT);
  } catch {
    recent.value = [];
  }
}
async function onOpen(open: boolean) {
  if (open) await readRecent();
}
// Read again whenever another script opens, not only as the menu opens: else the menu opens on the
// list as it was when it last opened, and the read that follows moves its rows a moment later,
// under a click on its way to one.
watch(
  () => script.project.value?.id,
  () => void readRecent(),
);
</script>

<template>
  <!-- MenuButton: non-modal, with Tab closing the menu and giving focus back to the mark. -->
  <MenuButton
    :items="items"
    :content="{ align: 'start', onCloseAutoFocus }"
    @update:open="onOpen"
  >
    <button
      ref="mark"
      type="button"
      class="mark"
      aria-label="Drafter menu"
      title="Drafter menu"
      data-tour="menu"
    >
      <slot />
      <!-- The chevron says the mark is a menu (Task 3b): in the text colour, turned while open. -->
      <UIcon name="i-lucide-chevron-down" class="caret" aria-hidden="true" />
    </button>
  </MenuButton>
  <!-- Revert to Saved says what it did here, as a toast and a polite live region. -->
  <div class="notice" :class="{ shown: revertNotice }">
    <span role="status" aria-live="polite">{{ revertNotice }}</span>
  </div>
</template>

<style scoped>
.mark {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
  height: 30px;
  padding: 0 6px 0 4px;
  border: 0;
  border-radius: var(--r);
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.mark:hover,
.mark[aria-expanded="true"] {
  background: var(--raised);
  color: var(--text);
}
.caret {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--text);
  transition: transform var(--dur) var(--ease);
}
.mark[aria-expanded="true"] .caret {
  transform: rotate(180deg);
}
@media (prefers-reduced-motion: reduce) {
  .caret {
    transition: none;
  }
}
.notice {
  position: fixed;
  z-index: 30;
  right: 16px;
  bottom: 40px;
  box-sizing: border-box;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--r-sm);
  background: var(--overlay);
  color: var(--text);
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
/* The region stays in the page, so a screen reader hears its text change; the box is drawn only with text. */
.notice:not(.shown) {
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  box-shadow: none;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
