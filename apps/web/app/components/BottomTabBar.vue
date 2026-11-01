<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { commandById } from '~/commands/registry';
import { useCompare } from '~/compare/use-compare';
import { useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { useDeleted } from '~/history/deleted';
import { useModuleTabs } from '~/modules/host';
import { openCount } from '~/notes/filter';
import { useNotes } from '~/notes/use-notes';
import {
  COMPARE_TAB,
  DELETED_TAB,
  HISTORY_ITEM,
  PHONE_LABELS,
  phoneTabs,
  TABS,
  type TabId,
  VIEW_TABS,
} from '~/utils/panes';

// The bottom tab bar (fresh-look design §6; Task 9): one pane below 1024px, switched here. 56px,
// across the window: Write (the Source), Script (a Markdown document's Preview), and Outline, then
// More with Cards, Stats, Scaffold, Notes, Problems, the modules' tabs, and History. A view chosen
// from More shows on the bar as a tab while it is the one showing, so the panel always has its tab;
// it goes back under More once another is chosen. The tabs are a tablist (the arrow keys move
// along it, Enter or Space chooses, as the Inspector's do); More is the ARIA menu button that
// every menu is (MenuButton), named with the problems it holds ("More tabs, 3 problems"). Every
// target is at least 44 by 44. It gives way to the on-screen keyboard while one is up (the element
// row takes the bottom then, `useOnScreenKeyboard`).
const props = defineProps<{
  /** The tab showing in the pane. */
  selected: TabId;
  /** The tabs showing: a tab points at its panel only when the panel exists. */
  shown: TabId[];
}>();
const emit = defineEmits<{ choose: [tab: TabId] }>();

const { kind } = useEditor();
const markdown = computed(() => kind.value === 'markdown');
const { count } = useProblems();
const { entries: noteEntries } = useNotes();
const openNotes = computed(() => openCount(noteEntries.value));
const { current: comparison } = useCompare();
const { isOpen: deletedOpen } = useDeleted();
const moduleTabs = useModuleTabs();

const ICONS: Record<string, string> = {
  source: 'i-lucide-pen-line',
  script: 'i-lucide-file-text',
  preview: 'i-lucide-eye',
  outline: 'i-lucide-list-tree',
  more: 'i-lucide-ellipsis',
};
const LABELS: Record<string, string> = Object.fromEntries(
  [...TABS, ...VIEW_TABS, COMPARE_TAB, DELETED_TAB].map((tab) => [tab.id, tab.label]),
);

/** A tab's label on the bar and in More: Write for the Source, Preview for a Markdown Script. */
function labelOf(id: TabId): string {
  if (id === 'script' && markdown.value) return 'Preview';
  if (id === HISTORY_ITEM) return 'History';
  return (
    PHONE_LABELS[id] ?? moduleTabs.value.find((tab) => tab.id === id)?.label ?? LABELS[id] ?? id
  );
}
const iconOf = (id: TabId) =>
  id === 'script' && markdown.value ? ICONS.preview : (ICONS[id] ?? 'i-lucide-panel-top');

const set = computed(() =>
  phoneTabs(
    kind.value,
    moduleTabs.value.map((tab) => tab.id),
    { compare: !!comparison.value, deleted: deletedOpen.value },
  ),
);
/** The bar's tabs: its own, then the one showing, if it came from More. */
const row = computed<TabId[]>(() => {
  const own = set.value.row;
  return own.includes(props.selected) ? own : [...own, props.selected];
});
const moreIds = computed(() => set.value.more.filter((id) => id !== props.selected));

/** A tab's accessible name with its count: "Notes, 3 open", "Problems, 2". */
function nameOf(id: TabId): string {
  if (id === 'notes' && openNotes.value > 0) return `Notes, ${openNotes.value} open`;
  if (id === 'problems' && count.value > 0) return `Problems, ${count.value}`;
  return labelOf(id);
}
const moreProblems = computed(() =>
  count.value > 0 && moreIds.value.includes('problems') ? count.value : 0,
);
const moreName = computed(() => {
  const n = moreProblems.value;
  return n > 0 ? `More tabs, ${n} ${n === 1 ? 'problem' : 'problems'}` : 'More tabs';
});

// More: choosing a view shows it here and puts focus on its tab; History runs its command, whose
// dialog takes focus (as the Drafter menu's items do, `useCommandMenu`).
const moreButton = ref<HTMLElement | null>(null);
const { choose: chooseCommand, onCloseAutoFocus: commandCloseFocus } = useCommandMenu(moreButton);
let chosenTab: TabId | null = null;
const moreItems = computed<DropdownMenuItem[][]>(() => {
  const views = moreIds.value.filter((id) => id !== HISTORY_ITEM);
  const history = commandById('history');
  return [
    views.map((id) => ({
      label: nameOf(id),
      onSelect: () => {
        chosenTab = id;
        emit('choose', id);
      },
    })),
    history
      ? [
          {
            label: 'History',
            icon: 'i-lucide-history',
            onSelect: () => {
              chooseCommand(false);
              void history.run();
            },
          },
        ]
      : [],
  ];
});
function onMoreCloseAutoFocus(event: Event) {
  const tab = chosenTab;
  chosenTab = null;
  if (!tab) {
    commandCloseFocus(event);
    return;
  }
  event.preventDefault();
  requestAnimationFrame(() => document.getElementById(`tab-phone-${tab}`)?.focus());
}

// Manual activation along the tablist: the arrow keys move focus, Enter or Space chooses.
const tablist = ref<HTMLElement>();
function onKeydown(event: KeyboardEvent) {
  const buttons = [...(tablist.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
  const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
  const last = buttons.length - 1;
  const moves: Record<string, number> = {
    ArrowRight: index === last ? 0 : index + 1,
    ArrowLeft: index === 0 ? last : index - 1,
    Home: 0,
    End: last,
  };
  const next = moves[event.key];
  if (next === undefined) return;
  event.preventDefault();
  buttons[next]?.focus();
}

const keyboard = useOnScreenKeyboard();
</script>

<template>
  <div class="bottom-bar" :class="{ away: keyboard.open.value }" data-bottom-bar>
    <div ref="tablist" role="tablist" aria-label="Panes" class="tablist">
      <button
        v-for="id in row"
        :id="`tab-phone-${id}`"
        :key="id"
        type="button"
        role="tab"
        class="tab"
        :class="{ on: id === props.selected }"
        :aria-selected="id === props.selected ? 'true' : 'false'"
        :aria-controls="props.shown.includes(id) ? `panel-${id}` : undefined"
        :aria-label="id === 'notes' && nameOf(id) !== labelOf(id) ? nameOf(id) : undefined"
        :tabindex="id === props.selected ? 0 : -1"
        @click="emit('choose', id)"
        @keydown="onKeydown($event)"
      >
        <UIcon :name="iconOf(id)" class="tab-icon" aria-hidden="true" />
        <span class="tab-label">{{ labelOf(id) }}</span>
        <!-- Problems' count is part of its name, "Problems 2", as the Inspector's tab says it. -->
        {{ ' ' }}<span v-if="id === 'problems' && count > 0" class="badge">{{ count }}</span>
        <span v-else-if="id === 'notes' && openNotes > 0" class="badge" aria-hidden="true">{{
          openNotes
        }}</span>
      </button>
    </div>
    <MenuButton
      :items="moreItems"
      :content="{ align: 'end', side: 'top', onCloseAutoFocus: onMoreCloseAutoFocus }"
    >
      <button
        ref="moreButton"
        type="button"
        class="tab more"
        data-more
        :aria-label="moreName"
      >
        <UIcon :name="ICONS.more as string" class="tab-icon" aria-hidden="true" />
        <span class="tab-label">More</span>
        <span v-if="moreProblems > 0" class="badge" aria-hidden="true" data-more-count>{{
          moreProblems
        }}</span>
      </button>
    </MenuButton>
  </div>
</template>

<style scoped>
/* 56px with its hairline, on --surface, across the window, under the pane. */
.bottom-bar {
  display: flex;
  box-sizing: border-box;
  height: 56px;
  padding: 0 4px env(safe-area-inset-bottom);
  border-top: 1px solid var(--border);
  background: var(--surface);
}
/* Under the keyboard while it is up: out of the way, out of the tab order. */
.bottom-bar.away {
  display: none;
}
.tablist {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}
.tab {
  position: relative;
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 44px;
  min-height: 44px;
  margin: 0;
  padding: 4px 2px;
  border: 0;
  border-radius: var(--r);
  background: none;
  color: var(--muted);
  font: 500 11px/14px var(--font-sans);
  cursor: pointer;
}
.more {
  flex: 0 1 25%;
  height: 100%;
}
.tab:hover {
  color: var(--text);
}
/* The one showing: the text colour and a 2px line in the accent's text colour over it, not colour
   alone (the light accent is faint on the surface). */
.tab.on {
  color: var(--text);
  font-weight: 650;
}
.tab.on::before {
  position: absolute;
  top: 0;
  right: 25%;
  left: 25%;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: var(--accent-text);
  content: '';
}
.tab-icon {
  flex: none;
  width: 20px;
  height: 20px;
}
.tab-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  position: absolute;
  top: 4px;
  left: calc(50% + 6px);
  min-width: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--raised);
  color: var(--text);
  font-size: 10px;
  line-height: 16px;
}
@media (forced-colors: active) {
  .tab.on::before {
    background: CanvasText;
  }
  .badge {
    border: 1px solid CanvasText;
  }
}
</style>
