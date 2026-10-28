<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { HELP_PAGES } from '~/commands/data';
import { formatKeys, isApple } from '~/commands/keys';
import { type Command, useCommands } from '~/commands/registry';
import { SAMPLES } from '~/editor/samples';
import { useEditor } from '~/editor/session';
import { DOCUMENT_TYPES, typeNameOf } from '~/editor/template';
import { useTemplateMenu } from '~/editor/template-menu';
import { useGuard } from '~/storage/guard';
import { kindOf, type Project } from '~/storage/projects';
import { revertNotice } from '~/storage/save';
import { useScript } from '~/storage/script';

// The app menu (Phase 1 design §9.1): the Drafter mark opens it. Every item runs its registered
// command (`commands/builtin.ts`), so this menu, the palette, and the keys never disagree; an item
// whose command is off shows disabled. The recent scripts are the one list that isn't commands:
// they open a script by id, as the Scripts menu does. The Help section is the last group and is
// built from commands too (`helpItems`): Take the tour and the help pages.
const commands = useCommands();
const script = useScript();
const editor = useEditor();
const { taking } = useGuard();
const apple = isApple();

/** How many recent scripts the menu lists. */
const RECENT = 8;
const recent = ref<Project[]>([]);

/**
 * The item for a command. A missing command leaves no item (a hot reload may not have it yet).
 * `shows` is for the commands that show a script: the editor gets focus afterward, not the mark.
 */
function entry(id: string, icon: string, shows = false): DropdownMenuItem[] {
  const command: Command | undefined = commands.value.find((c) => c.id === id);
  if (!command) return [];
  const off = command.enabled ? !command.enabled() : false;
  const why = off ? command.why?.() : undefined;
  return [
    {
      label: command.title,
      icon,
      ...(why && { description: why }),
      ...(command.keys && { kbds: [formatKeys(command.keys, apple)] }),
      disabled: off,
      onSelect: () => {
        choose(shows);
        command.run();
      },
    },
  ];
}

// The Template section: the toolbar's icon row has no room for the template chip below 1024px, so a
// phone chooses the template here (the palette's Template: commands reach the same list). It is
// the chip's own list, built once (`useTemplateMenu`), so the two agree on what is checked, what is
// off, and what a template Drafter doesn't have is called. The editor gets focus after a choice.
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

// A Fountain script exports as a PDF or plain text; a Markdown document as its Markdown file or
// plain text. (The PDF and Markdown commands are off in the other kind, and the palette hides
// them; here the other kind's item is left out.)
const exportIds = computed(() =>
  editor.kind.value === 'markdown' ? ['export-md', 'export-txt'] : ['export-pdf', 'export-txt'],
);
const EXPORT_ICONS: Record<string, string> = {
  'export-pdf': 'i-lucide-file-output',
  'export-md': 'i-lucide-file-output',
  'export-txt': 'i-lucide-file-type',
};

// Help: the group at the end of the menu. Take the tour is first (always on), then the help pages
// (each opens in a new tab, and is named by the page's title under the Help label); Reset sample is last (off unless a sample is open).
const HELP_ICONS: Record<string, string> = {
  'help-fountain': 'i-lucide-book-open',
  'help-saving': 'i-lucide-save',
  'help-shortcuts': 'i-lucide-keyboard',
  'help-privacy': 'i-lucide-shield-check',
};
const helpItems = computed<DropdownMenuItem[]>(() => [
  { type: 'label', label: 'Help' },
  ...entry('take-the-tour', 'i-lucide-compass'),
  ...HELP_PAGES.flatMap((page) =>
    entry(page.id, HELP_ICONS[page.id] ?? 'i-lucide-book-open').map((item) => ({
      ...item,
      label: page.title,
    })),
  ),
  ...entry('reset-sample', 'i-lucide-rotate-ccw', true),
]);

const items = computed<DropdownMenuItem[][]>(() => [
  [
    ...DOCUMENT_TYPES.flatMap((type) => entry(`new-${type.newKind}`, type.newIcon, true)),
    ...entry('open', 'i-lucide-folder-open'),
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
    // File, as in the palette: Start blank only while a first document still has its sample's untouched text.
    ...(script.canStartBlank.value ? entry('start-blank', 'i-lucide-eraser', true) : []),
  ],
  exportIds.value.flatMap((id) => entry(id, EXPORT_ICONS[id] as string)),
  [...entry('show-stats', 'i-lucide-chart-column'), ...entry('settings', 'i-lucide-settings')],
  helpItems.value,
]);

async function onOpen(open: boolean) {
  if (!open) return;
  try {
    recent.value = (await script.scripts()).slice(0, RECENT);
  } catch {
    recent.value = [];
  }
}

// Choosing an item runs a command that may move focus itself (a dialog, a new script). The menu
// holds focus until it has closed, so a command's own focus is lost to it; then the menu doesn't
// hand focus back to the mark, and if nothing else has it, a command that shows a script puts it in
// the editor and any other gives it to the mark. Escape, or leaving the menu, returns it to the
// mark as usual.
let chosen = false;
let toEditor = false;
function choose(shows: boolean) {
  chosen = true;
  toEditor = shows;
}
const mark = ref<HTMLElement | null>(null);
function onCloseAutoFocus(event: Event) {
  if (!chosen) return;
  chosen = false;
  event.preventDefault();
  requestAnimationFrame(() => {
    const active = document.activeElement;
    if (active && active !== document.body) return;
    if (toEditor) editor.goto(editor.view.state.selection.main.head);
    else mark.value?.focus();
  });
}
</script>

<template>
  <!-- MenuButton: non-modal, with Tab closing the menu and giving focus back to the mark. -->
  <MenuButton
    :items="items"
    :content="{ align: 'start', onCloseAutoFocus }"
    @update:open="onOpen"
  >
    <button ref="mark" type="button" class="mark" aria-label="Drafter menu" data-tour="menu">
      <slot />
    </button>
  </MenuButton>
  <!-- Revert to Saved says what it did here, as a toast and a polite live region. -->
  <div class="notice" :class="{ shown: revertNotice }">
    <span role="status" aria-live="polite">{{ revertNotice }}</span>
  </div>
</template>

<style scoped>
.mark {
  display: block;
  flex: none;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  cursor: pointer;
}
.mark:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 4px;
}
.notice {
  position: fixed;
  z-index: 30;
  right: 16px;
  bottom: 40px;
  box-sizing: border-box;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  border-radius: 6px;
  background: var(--chrome-2);
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
