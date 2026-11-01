<script setup lang="ts">
import { formatKeys, isApple } from '~/commands/keys';
import {
  closePalette,
  PALETTE_COMMANDS,
  paletteReturnTarget,
  usePalette,
} from '~/commands/palette';
import { type Command, type CommandGroup, useCommands } from '~/commands/registry';
import { findDrafts } from '~/drafts/find';
import { paletteLabel } from '~/drafts/labels';
import { useDrafts } from '~/drafts/use-drafts';
import { useEditor } from '~/editor/session';
import { useScript } from '~/storage/script';

// The command palette (Phase 1 design §6): scenes by name, "Go to line N" when the query is a
// number, and every command that applies, each with its keys. Nuxt UI's palette draws the labels
// with `v-html` when a slot doesn't take them over, and a scene heading is the writer's text, so
// every label goes through the `item-label` slot: Vue's interpolation, text only.
const { open, mode } = usePalette();
const { view, doc, goto, kind } = useEditor();
const commands = useCommands();
const apple = isApple();

const search = ref('');
/** Bumped when the palette opens, so which commands apply is asked again. */
const asked = ref(0);
watch(open, (on) => {
  if (!on) return;
  search.value = '';
  asked.value++;
});
watch(mode, () => {
  search.value = '';
});

const PLACEHOLDER = {
  all: 'Go to a scene, a line number, or a command',
  scene: 'Go to a scene',
  line: 'Go to a line number',
} as const;

const GROUPS: CommandGroup[] = ['File', 'Edit', 'View', 'Go', 'Help'];
const GROUP_ICON: Record<CommandGroup, string> = {
  File: 'i-lucide-file',
  Edit: 'i-lucide-pencil',
  View: 'i-lucide-eye',
  Go: 'i-lucide-compass',
  Help: 'i-lucide-circle-help',
};

interface Item {
  label: string;
  /** The line of a scene or the line count, drawn after the label. */
  line?: number;
  of?: number;
  icon?: string;
  kbds?: string[];
  /** More words a command is found by (`Command.keywords`), never drawn. */
  keywords?: readonly string[];
  onSelect: () => void;
}

/** What closed the palette: a command was chosen, so focus is for the command to place. */
let chosen = false;

function choose(act: () => void, id?: string) {
  if (id && PALETTE_COMMANDS.has(id)) {
    act();
    return;
  }
  chosen = true;
  closePalette();
  // After the palette has let go of focus.
  void nextTick().then(act);
}

const scenes = computed<Item[]>(() => {
  // A Markdown document has no scenes: its text is not read as Fountain.
  if (!open.value || kind.value === 'markdown') return [];
  const text = view.state.doc;
  const items: Item[] = [];
  for (const block of doc.value.blocks) {
    if (block.kind !== 'scene_heading') continue;
    const from = Math.min(block.span.from, text.length);
    items.push({
      label: block.sem.text || 'Scene',
      line: text.lineAt(from).number,
      icon: 'i-lucide-clapperboard',
      onSelect: () => choose(() => goto(from)),
    });
  }
  return items;
});

const lineItem = computed<Item[]>(() => {
  const query = search.value.trim();
  if (!/^\d+$/.test(query)) return [];
  const lines = view.state.doc.lines;
  const n = Math.min(Math.max(Number(query), 1), lines);
  return [
    {
      label: `Go to line ${n}`,
      of: lines,
      icon: 'i-lucide-text-cursor',
      onSelect: () => choose(() => goto(view.state.doc.line(n).from)),
    },
  ];
});

// Open draft by ID (drafts-and-cuts design §2.2): 4 or more hex characters list every draft whose
// ID begins with them, of any script still here, and a number ("2", "Draft 02") the open script's
// ("Draft 02 · a3f9c2e · 12 Oct 2026"), each opening read-only (`findDrafts`).
const drafts = useDrafts();
const script = useScript();
const draftItems = shallowRef<Item[]>([]);
let lookups = 0;

async function readDraft(projectId: string, n: number) {
  if (script.project.value?.id !== projectId) {
    await script.open(projectId);
    if (script.project.value?.id !== projectId) return;
    await drafts.load();
  }
  await drafts.read(n);
}

watch([search, open, mode], async ([typed, on, shownMode]) => {
  const mine = ++lookups;
  const openId = script.project.value?.id ?? null;
  const found = on && shownMode === 'all' ? await findDrafts(typed, openId).catch(() => []) : [];
  if (mine !== lookups) return;
  // A new empty list would draw the palette's rows again, and lose the row the keys highlighted.
  if (found.length === 0 && draftItems.value.length === 0) return;
  draftItems.value = found.map(({ projectId, row, title }) => ({
    label: paletteLabel(row, title),
    icon: 'i-lucide-milestone',
    onSelect: () => choose(() => void readDraft(projectId, row.n).catch(() => {})),
  }));
});

const available = computed(() => {
  asked.value;
  return commands.value.filter((c) => c.id !== 'palette' && (c.enabled?.() ?? true));
});

function itemOf(c: Command): Item {
  return {
    label: c.title,
    icon: c.icon ?? GROUP_ICON[c.group as CommandGroup] ?? 'i-lucide-puzzle',
    ...(c.keys ? { kbds: [formatKeys(c.keys, apple)] } : {}),
    ...(c.keywords ? { keywords: c.keywords } : {}),
    onSelect: () => choose(() => c.run(), c.id),
  };
}

const groups = computed(() => {
  const out: Array<{ id: string; label: string; ignoreFilter?: boolean; items: Item[] }> = [];
  if (mode.value !== 'scene' && lineItem.value.length) {
    out.push({ id: 'line', label: 'Line', ignoreFilter: true, items: lineItem.value });
  }
  // After Go to line: a number typed is a line first, and its draft second.
  if (mode.value === 'all' && draftItems.value.length) {
    out.push({ id: 'drafts', label: 'Drafts', ignoreFilter: true, items: draftItems.value });
  }
  if (mode.value !== 'line' && kind.value === 'fountain') {
    out.push({ id: 'scenes', label: 'Scenes', items: scenes.value });
  }
  if (mode.value === 'all') {
    // The five groups, then a group for each script module that is on, under its name.
    const others = [...new Set(available.value.map((c) => c.group))].filter(
      (g) => !GROUPS.includes(g as CommandGroup),
    );
    for (const group of [...GROUPS, ...others]) {
      const items = available.value.filter((c) => c.group === group).map(itemOf);
      if (items.length) out.push({ id: `commands-${group}`, label: group, items });
    }
  }
  return out;
});

// Every group is searched by its label, and a command by its keywords too ("show all versions"
// finds Cuts, Call 39); a scene's line number is not part of the search, and a long
// script's scenes all show: Nuxt UI's own limit is twelve.
const FUSE = {
  resultLimit: 1000,
  fuseOptions: { keys: ['label', 'keywords'], threshold: 0.1, ignoreLocation: true },
  matchAllWhenSearchEmpty: true,
};

const empty = computed(() => {
  if (mode.value === 'line') return `Type a line number, 1 to ${view.state.doc.lines}`;
  if (mode.value === 'scene')
    return search.value ? 'No scene matches' : 'This script has no scenes';
  return search.value ? 'Nothing matches' : 'Nothing to show';
});

/**
 * Focus goes back where it was when the palette closes with nothing chosen. When a command was
 * chosen, it has placed focus itself (the editor, a dialog, the search field); only if that left
 * focus nowhere does it go back.
 */
function onCloseAutoFocus(event: Event) {
  event.preventDefault();
  const was = paletteReturnTarget();
  const active = document.activeElement;
  const nowhere = !active || active === document.body || !!active.closest('[role="dialog"]');
  if ((!chosen || nowhere) && was?.isConnected) was.focus();
  else if ((!chosen || nowhere) && !was) view.focus();
  chosen = false;
}

// Two lapses of Nuxt UI's list, put right while the palette is open:
// - after some searches (seen on a phone) no row is highlighted, so Enter would choose nothing: a
//   first ArrowDown, which the list takes to mean "the first row", is sent to the input;
// - the input keeps pointing (`aria-activedescendant`) at a row that a search has taken away,
//   which axe reports: a pointer to a row that isn't there is dropped.
let watching: MutationObserver | undefined;
let settling = 0;
function settle() {
  const input = document.querySelector<HTMLInputElement>('.palette input');
  if (!input) return;
  const id = input.getAttribute('aria-activedescendant');
  if (id && !document.getElementById(id)) input.removeAttribute('aria-activedescendant');
  const rows = document.querySelectorAll('.palette [role="option"]:not([aria-disabled="true"])');
  if (
    rows.length &&
    document.activeElement === input &&
    !document.querySelector('.palette [role="option"][data-highlighted]')
  ) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  }
}
watch(open, async (on) => {
  watching?.disconnect();
  cancelAnimationFrame(settling);
  if (!on) return;
  await nextTick();
  const root = document.querySelector('.palette');
  if (!root) return;
  watching = new MutationObserver(() => {
    cancelAnimationFrame(settling);
    settling = requestAnimationFrame(settle);
  });
  watching.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-highlighted'],
  });
});
onBeforeUnmount(() => {
  watching?.disconnect();
  cancelAnimationFrame(settling);
});

function onUpdateOpen(value: boolean) {
  open.value = value;
}
</script>

<template>
  <UModal
    :open="open"
    title="Command palette"
    description="Go to a scene or a line, or run a command."
    :content="{ onCloseAutoFocus }"
    :transition="false"
    :ui="{ content: 'palette-modal' }"
    @update:open="onUpdateOpen"
  >
    <template #content>
      <UCommandPalette
        class="palette"
        :groups="groups"
        :fuse="FUSE"
        :placeholder="PLACEHOLDER[mode]"
        v-model:search-term="search"
        preserve-group-order
        close
        @update:open="onUpdateOpen"
      >
        <template #item-label="{ item }">
          <span class="palette-label">{{ item.label }}</span>
          <span v-if="item.line" class="palette-line">line {{ item.line }}</span>
          <span v-else-if="item.of" class="palette-line">of {{ item.of }}</span>
        </template>
        <!-- A listbox needs an option in it; this one says there is nothing. -->
        <template #empty>
          <div role="option" aria-disabled="true" aria-selected="false" class="palette-empty">
            {{ empty }}
          </div>
        </template>
      </UCommandPalette>
    </template>
  </UModal>
</template>
