<script setup lang="ts">
import { redo, undo } from '@codemirror/commands';
import {
  downTarget,
  type Facts,
  findNode,
  type NovelNode,
  type NovelTarget,
  type NovelTree,
  STATUS_LABELS,
  STATUSES,
  type Status,
  upTarget,
} from '@drafter/novel';
import type { DropdownMenuItem } from '@nuxt/ui';
import { cardsKey } from '~/cards/grid';
import { useEditor } from '~/editor/session';
import { KIND_WORD, nodeName, percent, targetLine, titleOf, wordsLabel } from '~/novel/labels';
import { useNovel } from '~/novel/use-novel';
import { sayOutline } from '~/outline/notice';
import { useSettings } from '~/settings/settings';

// The Cards tab for a novel (the Novel design, goal 3): a card for each chapter and each section, in
// the book's order, under its part's title, with its synopsis, status, and words. As the script's
// Cards: one listbox with a group for each part and one tab stop; the arrow keys move by where a
// card is drawn. Enter goes to the passage in the Source; Alt+Left and Alt+Up move it back, Alt+Right
// and Alt+Down forward; its menu (the ⋯ button, the context-menu key, or Shift+F10) has every action
// (a phone's way), and a pointer on a wide screen can drag it. Every change is one text change,
// undone in one step, and focus stays on the moved card. A synopsis is edited in a field laid over
// its card, outside the listbox: an option may hold no field.

const editor = useEditor();
const novel = useNovel();
const { tree, facts } = novel;
const { settings } = useSettings();
const wide = useWideScreen();

type DropSide = 'left' | 'right' | 'above' | 'below';

interface Card {
  id: string;
  node: NovelNode;
  facts: Facts;
  /** The chapter a section is in, or null. */
  chapter: string | null;
  /** Everything a card draws, as one string, so a card that is the same isn't drawn again. */
  sig: string;
}
interface Group {
  key: string;
  /** The part's title (or "Part"), or empty for chapters before the first part. */
  label: string;
  cards: Card[];
}

const groups = computed<Group[]>(() => {
  const out: Group[] = [];
  const kept = facts.value.nodes;
  const add = (group: Group, node: NovelNode, chapter: string | null) => {
    const own = kept[node.id] ?? {};
    group.cards.push({
      id: node.id,
      node,
      facts: own,
      chapter,
      sig: JSON.stringify([node.title, node.kind, node.words, own]),
    });
  };
  const addChapter = (group: Group, chapter: NovelNode) => {
    add(group, chapter, null);
    for (const section of chapter.children) add(group, section, chapter.id);
  };
  let loose: Group | null = null;
  for (const node of tree.value?.nodes ?? []) {
    if (node.kind === 'part') {
      loose = null;
      const group: Group = { key: node.id, label: titleOf(node), cards: [] };
      for (const chapter of node.children) addChapter(group, chapter);
      out.push(group);
    } else {
      if (!loose) {
        loose = { key: `loose:${out.length}`, label: '', cards: [] };
        out.push(loose);
      }
      addChapter(loose, node);
    }
  }
  return out.filter((g) => g.cards.length > 0);
});

const cards = computed(() => groups.value.flatMap((g) => g.cards));
const cardById = (id: string) => cards.value.find((c) => c.id === id);

const active = ref<string | null>(null);
const current = computed(() =>
  cards.value.some((c) => c.id === active.value) ? active.value : (cards.value[0]?.id ?? null),
);
/** A DOM id from a node id, which holds `:` and any letter of a title. */
const domIds = new Map<string, string>();
const domId = (id: string) => {
  let made = domIds.get(id);
  if (!made) {
    made = `novel-card-${domIds.size}`;
    domIds.set(id, made);
  }
  return made;
};

async function focusCard(id: string) {
  active.value = id;
  await nextTick();
  document.getElementById(domId(id))?.focus();
}

/** How many cards a row of the grid holds, as drawn. */
function columnsAt(id: string): number {
  const grid = document.getElementById(domId(id))?.parentElement;
  const tracks = grid ? getComputedStyle(grid).gridTemplateColumns.trim() : '';
  if (/^[\d.]+px( [\d.]+px)*$/.test(tracks)) return tracks.split(' ').length;
  const drawn = grid ? Array.from(grid.children) : [];
  const top = drawn[0]?.getBoundingClientRect().top;
  if (top === undefined) return 1;
  return Math.max(
    1,
    drawn.filter((el) => Math.abs(el.getBoundingClientRect().top - top) < 2).length,
  );
}

const kindOf = (card: Card) => KIND_WORD[card.node.kind];
const kindLabel = (card: Card) => (card.node.kind === 'chapter' ? 'Chapter' : 'Section');

// ---- Moving ------------------------------------------------------------------------------

async function move(id: string, target: NovelTarget | null, direction?: 'up' | 'down') {
  const node = tree.value && findNode(tree.value, id);
  if (!node) return;
  const why = novel.readOnly();
  if (why) {
    void sayOutline(why);
    return;
  }
  if (!target || !novel.move(id, target)) {
    if (direction) void sayOutline(`${titleOf(node)} can’t move further ${direction}.`);
    if (active.value) await focusCard(active.value);
    return;
  }
  const moved = novel.moved.value;
  if (!moved) return;
  void sayOutline(`Moved ${titleOf(node)}.`);
  await focusCard(moved);
}

const moveUp = (id: string) => move(id, tree.value && upTarget(tree.value, id), 'up');
const moveDown = (id: string) => move(id, tree.value && downTarget(tree.value, id), 'down');

// Drag: a drop line before or after the card under the pointer (its left or right half in a row of
// cards, its top or bottom half in one column). A pointer's way only, on a wide screen; the keys and
// the menu do the same.
const dragging = ref<string | null>(null);
const dropLine = ref<{ id: string; after: boolean; side: DropSide } | null>(null);
const canDrag = computed(() => wide.value && novel.readOnly() === null);

function onDragstart(event: DragEvent, id: string) {
  const card = cardById(id);
  if (!card || novel.readOnly() || editing.value === id) {
    event.preventDefault();
    return;
  }
  dragging.value = id;
  event.dataTransfer?.setData('text/plain', titleOf(card.node));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragover(event: DragEvent, id: string) {
  if (!dragging.value || !cardById(id)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const row = columnsAt(id) > 1;
  const after = row
    ? event.clientX > rect.left + rect.width / 2
    : event.clientY > rect.top + rect.height / 2;
  const side: DropSide = row ? (after ? 'right' : 'left') : after ? 'below' : 'above';
  if (dropLine.value?.id !== id || dropLine.value.side !== side)
    dropLine.value = { id, after, side };
}

/** Where a card of `kind` dropped before or after `onto` goes, or null when it can't go there. */
function dropTarget(kind: NovelNode['kind'], onto: Card, after: boolean): NovelTarget | null {
  if (onto.node.kind === kind) return after ? { after: onto.id } : { before: onto.id };
  // A section on a chapter's card goes first inside that chapter.
  if (kind === 'section' && onto.node.kind === 'chapter') return { into: onto.id };
  // A chapter on a section's card goes beside the chapter that holds it.
  if (kind === 'chapter' && onto.chapter) {
    return after ? { after: onto.chapter } : { before: onto.chapter };
  }
  return null;
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  const from = dragging.value ? cardById(dragging.value) : undefined;
  const line = dropLine.value;
  dragging.value = null;
  dropLine.value = null;
  const onto = line ? cardById(line.id) : undefined;
  if (!from || !line || !onto) return;
  void move(from.id, dropTarget(from.node.kind, onto, line.after));
}

function onDragend() {
  dragging.value = null;
  dropLine.value = null;
}

/** The pointer left the cards while dragging: no line, until it comes back over a card. */
function onDragleave(event: DragEvent) {
  const to = event.relatedTarget;
  if (to instanceof Node && (event.currentTarget as HTMLElement).contains(to)) return;
  dropLine.value = null;
}

const dropAt = (id: string) => (dropLine.value?.id === id ? dropLine.value.side : null);

// ---- Facts -------------------------------------------------------------------------------

function setStatus(id: string, status: Status | null) {
  const own = { ...(facts.value.nodes[id] ?? {}) };
  if (status) own.status = status;
  else delete own.status;
  novel.setFacts(id, own);
  const node = tree.value && findNode(tree.value, id);
  if (node) {
    void sayOutline(
      status
        ? `${titleOf(node)} is ${STATUS_LABELS[status]}.`
        : `Took the status off ${titleOf(node)}.`,
    );
  }
}

const editing = ref<string | null>(null);
const editingTitle = computed(() => {
  const node = editing.value ? cardById(editing.value)?.node : undefined;
  return node ? titleOf(node) : '';
});
const root = ref<HTMLElement | null>(null);
const fieldAt = ref<{ top: number; left: number; width: number } | null>(null);
const draft = ref('');

async function startEditing(id: string) {
  const why = novel.readOnly();
  if (why) {
    void sayOutline(why);
    return;
  }
  draft.value = facts.value.nodes[id]?.synopsis ?? '';
  // Laid over the card's body, where it is now.
  const el = document.getElementById(domId(id));
  const box = root.value?.getBoundingClientRect();
  if (el && box) {
    const r = el.getBoundingClientRect();
    fieldAt.value = {
      top: r.top - box.top + 32,
      left: r.left - box.left + 6,
      width: Math.max(80, r.width - 12),
    };
  }
  editing.value = id;
  await nextTick();
  const input = document.getElementById(`${domId(id)}-field`) as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

function finishEditing(save: boolean) {
  const id = editing.value;
  if (!id) return;
  editing.value = null;
  if (save) novel.setFacts(id, { ...(facts.value.nodes[id] ?? {}), synopsis: draft.value });
  void focusCard(id);
}

function onEditKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Enter') {
    event.preventDefault();
    finishEditing(true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    finishEditing(false);
  }
}

// ---- Menus -------------------------------------------------------------------------------

// As the Outline's: closing the menu puts focus back on the card, or where the chosen action wants it.
const menuFor = ref<{ id: string; which: 'more' | 'status' } | null>(null);
let afterMenu: (() => void) | null = null;
let menuCard: string | null = null;

const isOpen = (id: string, which: 'more' | 'status') =>
  menuFor.value?.id === id && menuFor.value.which === which;

function setMenu(id: string, which: 'more' | 'status', open: boolean) {
  if (open) {
    active.value = id;
    menuFor.value = { id, which };
    menuCard = id;
  } else if (isOpen(id, which)) menuFor.value = null;
}

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  const id = menuCard;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    else if (menuFor.value === null && id) void focusCard(id);
  });
}

const MENU_CONTENT = { align: 'end' as const, onCloseAutoFocus: onMenuCloseAutoFocus };
const NO_ITEMS: DropdownMenuItem[][] = [];
const afterClosing = (act: () => void) => {
  afterMenu = act;
};

// The statuses are one choice of several, so their items are radios (as the Outline's): Nuxt UI's
// menu has checkbox items only, so while a menu of the cards is open its status items are given the
// `menuitemradio` role.
const STATUS_ITEM = 'novel-card-status-item';
function radios() {
  for (const item of document.querySelectorAll(`.${STATUS_ITEM}[role="menuitemcheckbox"]`)) {
    item.setAttribute('role', 'menuitemradio');
  }
}
let radioWatch: MutationObserver | null = null;
watch(menuFor, (open) => {
  radioWatch?.disconnect();
  radioWatch = null;
  if (!open || typeof MutationObserver === 'undefined') return;
  radioWatch = new MutationObserver(radios);
  radioWatch.observe(document.body, { childList: true, subtree: true });
  void nextTick(radios);
});
onBeforeUnmount(() => radioWatch?.disconnect());

function statusItems(id: string): DropdownMenuItem[][] {
  const now = facts.value.nodes[id]?.status ?? null;
  const off = novel.readOnly() !== null;
  const pick = (status: Status | null): DropdownMenuItem => ({
    type: 'checkbox',
    label: status ? STATUS_LABELS[status] : 'No status',
    checked: now === status,
    disabled: off,
    class: STATUS_ITEM,
    onSelect: () => setStatus(id, status),
  });
  return [[...STATUSES.map(pick), pick(null)]];
}

function menuItems(card: Card): DropdownMenuItem[][] {
  const why = novel.readOnly();
  const off = why !== null;
  const what = kindOf(card);
  const t = tree.value;
  const groups: DropdownMenuItem[][] = [];
  if (why) groups.push([{ type: 'label', label: why }]);
  groups.push([
    {
      label: 'Go to',
      icon: 'i-lucide-arrow-right',
      onSelect: () => afterClosing(() => novel.goto(card.id)),
    },
  ]);
  groups.push([
    {
      label: `Move ${what} up`,
      icon: 'i-lucide-arrow-up',
      disabled: off || !t || upTarget(t, card.id) === null,
      onSelect: () => afterClosing(() => void moveUp(card.id)),
    },
    {
      label: `Move ${what} down`,
      icon: 'i-lucide-arrow-down',
      disabled: off || !t || downTarget(t, card.id) === null,
      onSelect: () => afterClosing(() => void moveDown(card.id)),
    },
  ]);
  groups.push([
    {
      label: 'Edit synopsis',
      icon: 'i-lucide-pencil',
      disabled: off,
      onSelect: () => afterClosing(() => void startEditing(card.id)),
    },
    {
      label: 'Status',
      icon: 'i-lucide-circle-check',
      disabled: off,
      children: statusItems(card.id),
    },
  ]);
  return groups;
}

// ---- Keys --------------------------------------------------------------------------------

function onKeydown(event: KeyboardEvent, id: string) {
  // Only keys on the card itself: the synopsis field has its own.
  if (event.target !== event.currentTarget) return;
  const { key } = event;
  if (key === 'ContextMenu' || (key === 'F10' && event.shiftKey)) {
    event.preventDefault();
    setMenu(id, 'more', true);
    return;
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      event.preventDefault();
      void moveUp(id);
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      event.preventDefault();
      void moveDown(id);
      return;
    }
  }
  // Undo and redo work here too, on the book, and focus stays on the cards.
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey && (key.toLowerCase() === 'z' || key.toLowerCase() === 'y')) {
    event.preventDefault();
    if (key.toLowerCase() === 'y' || event.shiftKey) redo(editor.view);
    else undo(editor.view);
    void focusCard(id);
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (key === 'Enter') {
    event.preventDefault();
    novel.goto(id);
    return;
  }
  const at = cards.value.findIndex((c) => c.id === id);
  if (at < 0) return;
  const next = cardsKey(
    groups.value.map((g) => g.cards.length),
    columnsAt(id),
    at,
    key,
  );
  if (next === null) {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) {
      event.preventDefault();
    }
    return;
  }
  event.preventDefault();
  const to = cards.value[next];
  if (to) void focusCard(to.id);
}

function onClick(event: MouseEvent, id: string) {
  active.value = id;
  if ((event.target as HTMLElement).closest('.more, .status, input')) return;
  novel.goto(id);
}

// After a change in another tab or the source, a card that went away hands the tab stop on.
watch(cards, async () => {
  if (!active.value || cards.value.some((c) => c.id === active.value)) return;
  const hadFocus = document.activeElement === document.body || !document.activeElement?.isConnected;
  active.value = null;
  await nextTick();
  if (hadFocus && document.activeElement === document.body && current.value) {
    await focusCard(current.value);
  }
});
</script>

<template>
  <div ref="root" class="novel-cards">
    <DEmpty v-if="cards.length === 0" icon="i-lucide-layout-grid">
      No chapters yet. A chapter starts with <code>#</code> and its title, and a section within it
      with <code>##</code>.
    </DEmpty>
    <div
      v-else
      role="listbox"
      aria-label="Cards"
      class="cards"
      :class="[`size-${settings.cardSize}`, { narrow: !wide }]"
      @dragleave="onDragleave"
    >
      <div
        v-for="group in groups"
        :key="group.key"
        role="group"
        :aria-label="group.label || undefined"
        class="group"
      >
        <div v-if="group.label" class="part-title" aria-hidden="true">{{ group.label }}</div>
        <div class="grid">
          <div
            v-for="card in group.cards"
            :id="domId(card.id)"
            :key="card.id"
            v-memo="[
              card.sig,
              card.id === current,
              editing === card.id ? draft : null,
              isOpen(card.id, 'more'),
              isOpen(card.id, 'status'),
              canDrag,
              editing === card.id,
              dragging === card.id,
              dropAt(card.id),
            ]"
            role="option"
            class="card"
            :class="[
              card.node.kind,
              {
                dragging: dragging === card.id,
                [`drop-${dropAt(card.id)}`]: !!dropAt(card.id),
              },
            ]"
            :tabindex="card.id === current ? 0 : -1"
            :aria-selected="card.id === current ? 'true' : 'false'"
            :aria-describedby="card.facts.synopsis ? `${domId(card.id)}-synopsis` : undefined"
            :draggable="canDrag && editing !== card.id ? 'true' : 'false'"
            @keydown="onKeydown($event, card.id)"
            @focus="active = card.id"
            @click="onClick($event, card.id)"
            @dragstart="onDragstart($event, card.id)"
            @dragover="onDragover($event, card.id)"
            @drop="onDrop"
            @dragend="onDragend"
          >
            <span class="sr-only">{{ nodeName(card.node, card.facts) }}</span>
            <div class="top" aria-hidden="true">
              <span class="kind">{{ kindLabel(card) }}</span>
              <span class="heading" :class="{ untitled: !card.node.title }">{{ titleOf(card.node) }}</span>
              <MenuButton
                :open="isOpen(card.id, 'more')"
                :items="isOpen(card.id, 'more') ? menuItems(card) : NO_ITEMS"
                :content="MENU_CONTENT"
                @update:open="(open: boolean) => setMenu(card.id, 'more', open)"
              >
                <!-- Not a button: a card is an option, whose children axe wants none focusable. The
                     menu is the keys' too (Shift+F10), so this is the pointer's way in. -->
                <span class="more" @click.stop>
                  <!-- The menu is named by its trigger's text. -->
                  <span class="sr-only">Actions for {{ titleOf(card.node) }}</span>
                  <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
                </span>
              </MenuButton>
            </div>
            <div class="body" aria-hidden="true">
              <p v-if="card.facts.synopsis && editing !== card.id" :id="`${domId(card.id)}-synopsis`" class="synopsis">
                {{ card.facts.synopsis }}
              </p>
            </div>
            <div class="foot" aria-hidden="true">
              <MenuButton
                :open="isOpen(card.id, 'status')"
                :items="isOpen(card.id, 'status') ? statusItems(card.id) : NO_ITEMS"
                :content="MENU_CONTENT"
                @update:open="(open: boolean) => setMenu(card.id, 'status', open)"
              >
                <span class="status" :class="card.facts.status ?? 'none'" @click.stop>
                  <span class="sr-only">Status of {{ titleOf(card.node) }}: </span>
                  {{ card.facts.status ? STATUS_LABELS[card.facts.status] : 'No status' }}
                </span>
              </MenuButton>
              <span class="words">{{ wordsLabel(card.node.words) }}</span>
              <span v-if="card.facts.target" class="target">
                {{ targetLine(card.node.words, card.facts.target) }}
                <span class="bar"
                  ><span class="fill" :style="{ width: `${percent(card.node.words, card.facts.target)}%` }"
                /></span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <input
      v-if="editing && fieldAt"
      :id="`${domId(editing)}-field`"
      v-model="draft"
      autocomplete="off"
      class="synopsis-field"
      :style="{ top: `${fieldAt.top}px`, left: `${fieldAt.left}px`, width: `${fieldAt.width}px` }"
      :aria-label="`Synopsis of ${editingTitle}`"
      @keydown="onEditKeydown"
      @blur="finishEditing(false)"
    />
  </div>
</template>

<style scoped>
.novel-cards {
  position: relative;
  font-size: 13px;
}
.cards {
  --card-width: 13rem;
  --card-height: 9rem;
  --card-lines: 5;
  padding: 8px 12px 16px;
}
.cards.size-small {
  --card-width: 10rem;
  --card-height: 6.5rem;
  --card-lines: 2;
  font-size: 12px;
}
.cards.size-large {
  --card-width: 18rem;
  --card-height: 12rem;
  --card-lines: 10;
  font-size: 14px;
}
.part-title {
  margin: 12px 0 6px;
  color: var(--accent-text);
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.group:first-child .part-title {
  margin-top: 4px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-width), 1fr));
  gap: 10px;
  margin-bottom: 8px;
}
.cards.narrow .grid {
  grid-template-columns: minmax(0, 1fr);
}
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: var(--card-height, 9rem);
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  color: var(--text);
  overflow: hidden;
  cursor: pointer;
}
/* A section is a lighter card, set in from its chapter's. */
.card.section {
  border-left: 4px solid var(--border);
}
.card:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.card[aria-selected='true'] {
  border-color: var(--accent-text);
}
.top {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.kind {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}
.heading {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.card.section .heading {
  font-weight: 400;
}
.heading.untitled {
  color: var(--muted);
  font-style: italic;
}
.more {
  display: inline-flex;
  cursor: pointer;
  flex: none;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.more:hover {
  background: var(--raised);
  color: var(--text);
}
.body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--card-lines, 6);
  line-clamp: var(--card-lines, 6);
}
.synopsis {
  margin: 0;
}
.synopsis-field {
  position: absolute;
  box-sizing: border-box;
  width: 100%;
  min-height: 26px;
  padding: 2px 6px;
  border: 1px solid var(--accent-text);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
  color: var(--muted);
  font-size: 12px;
}
.words,
.target {
  white-space: nowrap;
}
.target {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.bar {
  display: inline-block;
  width: 40px;
  height: 6px;
  border: 1px solid var(--muted);
  border-radius: 3px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: var(--accent-text);
}
.status {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.status.none {
  color: var(--muted);
}
.status.done {
  border-color: var(--accent-text);
}
.status:hover {
  background: var(--raised);
}
.card.dragging {
  opacity: 0.5;
}
.card.drop-left {
  box-shadow: -5px 0 0 -1px var(--accent-text);
}
.card.drop-right {
  box-shadow: 5px 0 0 -1px var(--accent-text);
}
.card.drop-above {
  box-shadow: 0 -5px 0 -1px var(--accent-text);
}
.card.drop-below {
  box-shadow: 0 5px 0 -1px var(--accent-text);
}
@media (forced-colors: active) {
  .card.drop-left {
    border-left: 4px solid Highlight;
  }
  .card.drop-right {
    border-right: 4px solid Highlight;
  }
  .card.drop-above {
    border-top: 4px solid Highlight;
  }
  .card.drop-below {
    border-bottom: 4px solid Highlight;
  }
  .card[aria-selected='true'] {
    border: 2px solid Highlight;
  }
}
</style>
