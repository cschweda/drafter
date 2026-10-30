<script setup lang="ts">
import { redo, undo } from '@codemirror/commands';
import {
  downTarget,
  type MoveTarget,
  type OutlineItem,
  type Scene,
  targetBefore,
  upTarget,
} from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { cardsKey, rowMoveTarget } from '~/cards/grid';
import type { DropSide } from '~/components/SceneCard.vue';
import { useEditor } from '~/editor/session';
import { openSceneHistory } from '~/history/scene-history';
import { runMove } from '~/outline/move';
import { sayOutline } from '~/outline/notice';
import { sceneMenuItems } from '~/outline/scene-menu';
import { useOutline } from '~/outline/use-outline';
import { useSettings } from '~/settings/settings';

// The Cards tab (Phase 2 design §7): every scene as an index card, in script order, under its
// section's title. The cards are one listbox with a group per section and one tab stop; the arrow
// keys move by where a card is drawn, Home and End go to the first and last. Enter edits the
// card's first synopsis in place; its menu (the ⋯ button, the context-menu key, or Shift+F10) is
// the Outline row's (`scene-menu.ts`). Alt+Left and Alt+Right move a card one place, Alt+Up and
// Alt+Down a row as drawn; the menu moves it too (a phone's way), and a pointer can drag it. Every
// change is a text change, undone in one step, and focus stays on the moved card.

const editor = useEditor();
const outline = useOutline();
const { index, idOf, readOnly } = outline;
const { settings } = useSettings();
const wide = useWideScreen();
const markdown = computed(() => editor.kind.value === 'markdown');
const isPlay = computed(() => editor.template.value.id === 'stage-play-standard');

interface Card {
  id: string;
  scene: Scene;
  /**
   * Everything a card draws, as one string: a card whose `sig` is the same isn't drawn again while
   * the writer types elsewhere (`v-memo`, as the Outline's rows). Handlers look it up by id.
   */
  sig: string;
}
interface Group {
  /** The innermost section's block, or `none` before the first section, and the group's place. */
  key: string;
  section: string;
  /** The sections it is in, outermost first, as one name; empty before the first section. */
  label: string;
  cards: Card[];
}

const titleOf = (block: number) =>
  index.value.sections.find((s) => s.block === block)?.title || 'Untitled section';

/** The scenes in script order, a group for each run of scenes in the same innermost section. */
const groups = computed<Group[]>(() => {
  const out: Group[] = [];
  for (const scene of index.value.scenes) {
    const inner = scene.sections.at(-1);
    const section = inner === undefined ? 'none' : String(inner);
    const sig = JSON.stringify([
      scene.ordinal,
      scene.number,
      scene.heading,
      scene.color?.value,
      scene.synopses.map((s) => s.text),
      scene.fields.goal?.body,
      scene.pages?.eighths,
    ]);
    const card = { id: idOf(scene), scene, sig };
    const last = out.at(-1);
    if (last?.section === section) last.cards.push(card);
    else {
      out.push({
        key: `${section}:${out.length}`,
        section,
        label: scene.sections.map(titleOf).join(', '),
        cards: [card],
      });
    }
  }
  return out;
});

const cards = computed(() => groups.value.flatMap((g) => g.cards));
const cardById = (id: string) => cards.value.find((c) => c.id === id);

// One card is the tab stop: the one last focused, or the first.
const active = ref<string | null>(null);
const current = computed(() =>
  cards.value.some((c) => c.id === active.value) ? active.value : (cards.value[0]?.id ?? null),
);
const domId = (id: string) => `card-${id}`;

async function focusCard(id: string) {
  active.value = id;
  await nextTick();
  document.getElementById(domId(id))?.focus();
}

/**
 * How many cards a row of the grid holds, as drawn: the grid's tracks (every group's grid has the
 * same, so a section of one card still counts the row's width), or else the cards level with the
 * group's first.
 */
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

const now = (id: string) => outline.itemById(id);

function go(item: OutlineItem) {
  editor.goto(item.span.from);
}

// ---- Moving: the keys, the menu, Move to…, and drag ---------------------------------------------

async function move(item: OutlineItem, target: MoveTarget | null, direction?: 'up' | 'down') {
  const id = runMove(item.block, target, direction ? { direction } : {});
  const back = id ?? active.value;
  if (back) await focusCard(back);
}

const moveUp = (item: OutlineItem) => move(item, upTarget(index.value, item.block), 'up');
const moveDown = (item: OutlineItem) => move(item, downTarget(index.value, item.block), 'down');
/** Alt+Up and Alt+Down: a row of the grid as drawn (one place in one column). */
const moveRow = (item: OutlineItem, id: string, direction: 'up' | 'down') =>
  move(item, rowMoveTarget(index.value, item.block, columnsAt(id), direction), direction);

const movingToId = ref<string | null>(null);
const movingTo = computed(() => (movingToId.value ? (now(movingToId.value) ?? null) : null));
async function onMoveTo(target: MoveTarget) {
  const id = movingToId.value;
  movingToId.value = null;
  const item = id ? now(id) : undefined;
  if (item) await move(item, target);
}
async function onMoveToClose() {
  const id = movingToId.value;
  movingToId.value = null;
  if (id) await focusCard(id);
}

// Drag: a drop line before or after the card under the pointer shows where the card will land
// (its left or right half in a row of cards, its top or bottom half in one column). A pointer's
// way only, on a wide screen; the keys, the menu, and Move to… do the same.
const dragging = ref<string | null>(null);
/** The card the drop line is on, whether the card lands after it, and the line's side. */
const dropLine = ref<{ id: string; after: boolean; side: DropSide } | null>(null);
const canDrag = computed(() => wide.value && readOnly.value === null);

function onDragstart(event: DragEvent, id: string) {
  const card = cardById(id);
  if (!card || readOnly.value || editing.value === id) {
    event.preventDefault();
    return;
  }
  dragging.value = id;
  event.dataTransfer?.setData('text/plain', card.scene.heading);
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
  if (dropLine.value?.id !== id || dropLine.value.side !== side) {
    dropLine.value = { id, after, side };
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  const from = dragging.value ? now(dragging.value) : undefined;
  const line = dropLine.value;
  dragging.value = null;
  dropLine.value = null;
  const onto = line ? now(line.id) : undefined;
  if (!from || !line || !onto) return;
  void move(from, line.after ? { after: onto.block } : targetBefore(index.value, onto.block));
}

function onDragend() {
  dragging.value = null;
  dropLine.value = null;
}

const dropAt = (id: string) => (dropLine.value?.id === id ? dropLine.value.side : null);

// ---- The card's menu --------------------------------------------------------------------------

// As the Outline's: closing the menu puts focus back on the card, or where the chosen action wants it.
const menuFor = ref<string | null>(null);
let menuCard: string | null = null;
let afterMenu: (() => void) | null = null;

function setMenu(id: string, open: boolean) {
  if (open) {
    active.value = id;
    menuFor.value = id;
    menuCard = id;
  } else if (menuFor.value === id) menuFor.value = null;
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

function menuItems(card: Card): DropdownMenuItem[][] {
  const afterClosing = (act: () => void) => {
    afterMenu = act;
  };
  const withItem = (act: (item: OutlineItem) => void) => (id: string) =>
    afterClosing(() => {
      const item = now(id);
      if (item) act(item);
    });
  return sceneMenuItems(card.id, card.scene, {
    go: withItem(go),
    edit: (id) => afterClosing(() => void startEditing(id)),
    moveUp: withItem((item) => void moveUp(item)),
    moveDown: withItem((item) => void moveDown(item)),
    moveTo: (id) =>
      afterClosing(() => {
        movingToId.value = id;
      }),
    focus: (id) => void focusCard(id),
    history: (id) => afterClosing(() => openHistoryOf(id)),
  });
}

/**
 * History of this scene… (version-history design §6): the dialog opens on the scene as it is now,
 * with focus put back on its card first, so closing the dialog returns there.
 */
async function openHistoryOf(id: string) {
  const item = now(id);
  if (item?.kind !== 'scene') return;
  await focusCard(id);
  openSceneHistory({ from: item.span.from, to: item.span.to, heading: item.heading });
}

// ---- Edit synopsis in place -------------------------------------------------------------------

const editing = ref<string | null>(null);
const draft = ref('');

async function startEditing(id: string) {
  const card = cardById(id);
  if (!card) return;
  if (readOnly.value) {
    void sayOutline(readOnly.value);
    return;
  }
  draft.value = card.scene.synopses[0]?.text ?? '';
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
  const item = now(id);
  if (save && item?.kind === 'scene') outline.setSynopsis(item, draft.value);
  void focusCard(id);
}

// ---- Keys -------------------------------------------------------------------------------------

function onKeydown(event: KeyboardEvent, id: string) {
  // Only keys on the card itself: the synopsis field has its own.
  if (event.target !== event.currentTarget) return;
  const { key } = event;
  if (key === 'ContextMenu' || (key === 'F10' && event.shiftKey)) {
    event.preventDefault();
    setMenu(id, true);
    return;
  }
  if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    const item = key.startsWith('Arrow') ? now(id) : undefined;
    if (item) {
      event.preventDefault();
      if (key === 'ArrowLeft') void moveUp(item);
      else if (key === 'ArrowRight') void moveDown(item);
      else void moveRow(item, id, key === 'ArrowUp' ? 'up' : 'down');
      return;
    }
  }
  // Undo and redo work here too, on the script, and focus stays on the cards.
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
    void startEditing(id);
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
  <div class="cards-pane">
    <p v-if="markdown" class="empty">Not available for Markdown documents.</p>
    <p v-else-if="cards.length === 0" class="empty">
      No scenes yet.
      <template v-if="isPlay">A scene starts with <code>##</code> and its title.</template>
      <template v-else>A scene starts with a heading such as <code>INT. KITCHEN - NIGHT</code>.</template>
    </p>
    <div
      v-else
      role="listbox"
      aria-label="Cards"
      class="cards"
      :class="[`size-${settings.cardSize}`, { narrow: !wide }]"
    >
      <div
        v-for="group in groups"
        :key="group.key"
        role="group"
        :aria-label="group.label || undefined"
        class="group"
      >
        <div v-if="group.label" class="section-title" aria-hidden="true">{{ group.label }}</div>
        <div class="grid">
          <SceneCard
            v-for="card in group.cards"
            :key="card.id"
            v-memo="[
              card.sig,
              card.id === current,
              editing === card.id ? draft : null,
              menuFor === card.id,
              readOnly,
              canDrag,
              dragging === card.id,
              dropAt(card.id),
            ]"
            v-model:draft="draft"
            :scene="card.scene"
            :dom-id="domId(card.id)"
            :current="card.id === current"
            :editing="editing === card.id"
            :menu-open="menuFor === card.id"
            :menu-items="menuFor === card.id ? menuItems(card) : NO_ITEMS"
            :menu-content="MENU_CONTENT"
            :draggable="canDrag && editing !== card.id ? 'true' : 'false'"
            :dragging="dragging === card.id"
            :drop="dropAt(card.id)"
            @update:menu-open="(open: boolean) => setMenu(card.id, open)"
            @edited="finishEditing"
            @keydown="onKeydown($event, card.id)"
            @focus="active = card.id"
            @click="active = card.id"
            @dragstart="onDragstart($event, card.id)"
            @dragover="onDragover($event, card.id)"
            @drop="onDrop"
            @dragend="onDragend"
          />
        </div>
      </div>
    </div>
    <MoveToDialog :item="movingTo" :index="index" @choose="onMoveTo" @close="onMoveToClose" />
  </div>
</template>

<style scoped>
.cards-pane {
  font-size: 13px;
}
.empty {
  margin: 0;
  padding: 24px 16px;
  color: var(--muted);
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
.section-title {
  margin: 12px 0 6px;
  color: var(--heading);
  font-weight: 700;
}
.group:first-child .section-title {
  margin-top: 4px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-width), 1fr));
  gap: 10px;
  margin-bottom: 8px;
}
/* A phone: one column, the same cards. */
.cards.narrow .grid {
  grid-template-columns: minmax(0, 1fr);
}
</style>
