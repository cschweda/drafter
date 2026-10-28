<script setup lang="ts">
import {
  downTarget,
  type MoveTarget,
  type OutlineItem,
  type OutlineNode,
  SCENE_COLORS,
  type SceneColor,
  targetAfterRow,
  upTarget,
} from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { useEditor } from '~/editor/session';
import {
  colorName,
  lengthLabel,
  sceneName,
  sceneNumber,
  sectionName,
  swatchOf,
} from '~/outline/labels';
import { runMove } from '~/outline/move';
import { type TreeRow, treeKey, typeAhead } from '~/outline/tree';
import { useOutline } from '~/outline/use-outline';

// The Outline tab (Phase 2 design §6.1–6.2): the script's sections holding its scenes, as an
// ARIA tree. One row is a tab stop; the arrow keys, Home, End, and typing move between rows;
// Enter goes to a row in the Source pane. Alt+Up and Alt+Down move a row; its menu (the ⋯ button,
// the context-menu key, or Shift+F10) has every action, Move to… among them, which is what a
// phone uses; a pointer can drag a row too. Every change is a text change, undone in one step.

const editor = useEditor();
const outline = useOutline();
const { index, idOf, readOnly } = outline;
const markdown = computed(() => editor.kind.value === 'markdown');
const isPlay = computed(() => editor.template.value.id === 'stage-play-standard');

const filter = ref('');
const closed = ref(new Set<string>());

interface Row extends TreeRow {
  item: OutlineItem;
  setsize: number;
  posinset: number;
}

const query = computed(() => filter.value.trim().toLowerCase());

function matches(node: OutlineNode): boolean {
  const q = query.value;
  if (!q) return true;
  if ('children' in node) return node.children.some(matches);
  const scene = node.item;
  return (
    scene.heading.toLowerCase().includes(q) ||
    scene.synopses.some((s) => s.text.toLowerCase().includes(q)) ||
    scene.speakers.some((name) => name.toLowerCase().includes(q))
  );
}

/** The rows showing: a closed section's are not, and a filter keeps the matches and their sections. */
const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const walk = (nodes: OutlineNode[], level: number, parent: string | null) => {
    const kept = nodes.filter(matches);
    kept.forEach((node, i) => {
      const id = idOf(node.item);
      const children = 'children' in node ? node.children : [];
      const expandable = children.length > 0;
      const open = expandable && (query.value !== '' || !closed.value.has(id));
      out.push({
        id,
        item: node.item,
        level,
        parent,
        expandable,
        open,
        label: node.item.kind === 'scene' ? node.item.heading : node.item.title,
        setsize: kept.length,
        posinset: i + 1,
      });
      if (open) walk(children, level + 1, id);
    });
  };
  walk(index.value.tree, 1, null);
  return out;
});

// One row is the tab stop: the one last focused, or the first.
const active = ref<string | null>(null);
const current = computed(() =>
  rows.value.some((r) => r.id === active.value) ? active.value : (rows.value[0]?.id ?? null),
);
const domId = (id: string) => `outline-${id}`;

async function focusRow(id: string) {
  active.value = id;
  await nextTick();
  document.getElementById(domId(id))?.focus();
}

function toggle(id: string) {
  const next = new Set(closed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  closed.value = next;
}

function go(item: OutlineItem) {
  editor.goto(item.span.from);
}

// ---- Moving ------------------------------------------------------------------------------

async function move(item: OutlineItem, target: MoveTarget | null, direction?: 'up' | 'down') {
  const id = runMove(item.block, target, direction ? { direction } : {});
  if (id) {
    // The sections it moved into are opened, so its row can be seen and keep focus.
    const moved = outline.itemById(id);
    if (moved) {
      const next = new Set(closed.value);
      for (const section of index.value.sections) {
        if (moved.span.from > section.span.from && moved.span.from < section.span.to) {
          next.delete(idOf(section));
        }
      }
      closed.value = next;
    }
    await focusRow(id);
  } else if (active.value) {
    await focusRow(active.value);
  }
}

const moveUp = (item: OutlineItem) => move(item, upTarget(index.value, item.block), 'up');
const moveDown = (item: OutlineItem) => move(item, downTarget(index.value, item.block), 'down');

// Move to…
const movingTo = ref<OutlineItem | null>(null);
async function onMoveTo(target: MoveTarget) {
  const item = movingTo.value;
  movingTo.value = null;
  if (item) await move(item, target);
}
async function onMoveToClose() {
  const item = movingTo.value;
  movingTo.value = null;
  if (item) await focusRow(idOf(item));
}

// Drag: a drop line between rows shows where the row will land (design §6.2). Pointer only; the
// keys and Move to… do the same.
const dragging = ref<string | null>(null);
const dropLine = ref<{ id: string; below: boolean } | null>(null);

function onDragstart(event: DragEvent, row: Row) {
  if (readOnly.value) {
    event.preventDefault();
    return;
  }
  dragging.value = row.id;
  event.dataTransfer?.setData('text/plain', row.label);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragover(event: DragEvent, row: Row) {
  if (!dragging.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropLine.value = { id: row.id, below: event.clientY > rect.top + rect.height / 2 };
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  const from = rows.value.find((r) => r.id === dragging.value);
  const line = dropLine.value;
  dragging.value = null;
  dropLine.value = null;
  if (!from || !line) return;
  const at = rows.value.findIndex((r) => r.id === line.id);
  const above = line.below ? rows.value[at] : rows.value[at - 1];
  const target = targetAfterRow(index.value, above?.item ?? null, above?.open ?? true);
  void move(from.item, target);
}

function onDragend() {
  dragging.value = null;
  dropLine.value = null;
}

// ---- The row's menu ----------------------------------------------------------------------

// MenuButton, as every menu is: a row's ⋯ button opens it, and so do the context-menu key and
// Shift+F10 on the row. Closing it puts focus back on the row (the ⋯ button is a pointer's only), or
// where the chosen action wants it.
const menuFor = ref<string | null>(null);
let afterMenu: (() => void) | null = null;

function openMenu(row: Row) {
  active.value = row.id;
  menuFor.value = row.id;
}

/** A row's menu opened or closed. A menu closing late (its fade) never closes another row's. */
function setMenu(row: Row, open: boolean) {
  if (open) menuFor.value = row.id;
  else if (menuFor.value === row.id) menuFor.value = null;
}

/** Runs `act` once the menu has closed and given focus back. */
const then = (act: () => void) => () => {
  afterMenu = act;
};

function onMenuCloseAutoFocus(event: Event, row: Row) {
  event.preventDefault();
  const act = afterMenu;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    // Not when another row's menu has opened since: focus is that menu's now.
    else if (menuFor.value === null) void focusRow(row.id);
  });
}

function menuItems(row: Row): DropdownMenuItem[][] {
  const off = readOnly.value !== null;
  const what = row.item.kind === 'scene' ? 'scene' : 'section';
  const item = row.item;
  const groups: DropdownMenuItem[][] = [];
  if (readOnly.value) groups.push([{ type: 'label', label: readOnly.value }]);
  groups.push([{ label: 'Go to', icon: 'i-lucide-arrow-right', onSelect: then(() => go(item)) }]);
  groups.push([
    {
      label: `Move ${what} up`,
      icon: 'i-lucide-arrow-up',
      disabled: off || upTarget(index.value, item.block) === null,
      onSelect: then(() => void moveUp(item)),
    },
    {
      label: `Move ${what} down`,
      icon: 'i-lucide-arrow-down',
      disabled: off || downTarget(index.value, item.block) === null,
      onSelect: then(() => void moveDown(item)),
    },
    {
      label: `Move ${what} to…`,
      icon: 'i-lucide-move',
      disabled: off,
      onSelect: then(() => {
        movingTo.value = item;
      }),
    },
  ]);
  if (item.kind === 'scene') {
    const current = item.color?.value ?? null;
    const pick = (color: SceneColor | null): DropdownMenuItem => ({
      type: 'checkbox',
      label: color ?? 'No color',
      checked: current === color,
      onSelect: then(() => {
        outline.setColor(item, color);
        void focusRow(row.id);
      }),
    });
    groups.push([
      {
        label: 'Edit synopsis',
        icon: 'i-lucide-pencil',
        disabled: off,
        onSelect: then(() => void startEditing(row)),
      },
      {
        label: 'Color…',
        icon: 'i-lucide-palette',
        disabled: off,
        children: [SCENE_COLORS.map(pick), [pick(null)]],
      },
    ]);
  }
  return groups;
}

// ---- Edit synopsis in place --------------------------------------------------------------

const editing = ref<string | null>(null);
const draft = ref('');

async function startEditing(row: Row) {
  if (row.item.kind !== 'scene' || readOnly.value) return;
  draft.value = row.item.synopses[0]?.text ?? '';
  editing.value = row.id;
  await nextTick();
  const input = document.getElementById(`${domId(row.id)}-synopsis`) as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

function finishEditing(save: boolean) {
  const id = editing.value;
  if (!id) return;
  editing.value = null;
  const item = outline.itemById(id);
  if (save && item?.kind === 'scene') outline.setSynopsis(item, draft.value);
  void focusRow(id);
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

// ---- Keys --------------------------------------------------------------------------------

let typed = '';
let typedAt = 0;

function onKeydown(event: KeyboardEvent, row: Row) {
  // Only keys on the row itself: its ⋯ button and the synopsis field have their own.
  if (event.target !== event.currentTarget) return;
  const { key } = event;
  if (key === 'ContextMenu' || (key === 'F10' && event.shiftKey)) {
    event.preventDefault();
    openMenu(row);
    return;
  }
  if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
    event.preventDefault();
    void (key === 'ArrowUp' ? moveUp(row.item) : moveDown(row.item));
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (key === 'Enter') {
    event.preventDefault();
    go(row.item);
    return;
  }
  const action = treeKey(rows.value, row.id, key);
  if (action) {
    event.preventDefault();
    if ('toggle' in action) toggle(action.toggle);
    else void focusRow(action.focus);
    return;
  }
  if (key.length === 1 && key !== ' ') {
    const now = Date.now();
    typed = now - typedAt < 700 ? typed + key : key;
    typedAt = now;
    const found = typeAhead(rows.value, row.id, typed);
    if (found) {
      event.preventDefault();
      void focusRow(found);
    }
  }
}

function onRowClick(event: MouseEvent, row: Row) {
  active.value = row.id;
  if ((event.target as HTMLElement).closest('.more, .twisty, input')) return;
  go(row.item);
}

// After a change in another tab or the source, a row that went away hands the tab stop on.
watch(rows, () => {
  if (active.value && !rows.value.some((r) => r.id === active.value)) active.value = null;
});

const sceneLength = (row: Row) =>
  row.item.kind === 'scene' && row.item.pages
    ? `p. ${row.item.pages.page} · ${lengthLabel(row.item.pages.eighths)}`
    : '';
const sectionSummary = (row: Row) => {
  if (row.item.kind !== 'section') return '';
  const { scenes, eighths } = row.item;
  const count = `${scenes} ${scenes === 1 ? 'scene' : 'scenes'}`;
  return eighths === null ? count : `${count} · ${lengthLabel(eighths)}`;
};
/** A scene row's synopsis or speakers, shown under it and read as its description. */
const hasDetails = (row: Row) =>
  row.item.kind === 'scene' && (row.item.synopses.length > 0 || row.item.speakers.length > 0);
const nameOfRow = (row: Row) =>
  row.item.kind === 'scene' ? sceneName(row.item) : sectionName(row.item);
</script>

<template>
  <div class="outline">
    <p v-if="markdown" class="empty">Not available for Markdown documents.</p>
    <template v-else>
      <div class="tools">
        <label class="filter">
          <span>Filter</span>
          <input
            v-model="filter"
            type="search"
            autocomplete="off"
            placeholder="Heading, synopsis, or character"
          />
        </label>
      </div>
      <p v-if="index.items.length === 0" class="empty">
        No scenes yet.
        <template v-if="isPlay">A scene starts with <code>##</code> and its title.</template>
        <template v-else>A scene starts with a heading such as <code>INT. KITCHEN - NIGHT</code>.</template>
      </p>
      <p v-else-if="rows.length === 0" class="empty">No scene matches “{{ filter.trim() }}”.</p>
      <ul v-else role="tree" aria-label="Outline" class="tree">
        <li
          v-for="row in rows"
          :id="domId(row.id)"
          :key="row.id"
          role="treeitem"
          class="row"
          :class="{
            section: row.item.kind === 'section',
            dragging: dragging === row.id,
            'drop-above': dropLine?.id === row.id && !dropLine.below,
            'drop-below': dropLine?.id === row.id && dropLine.below,
          }"
          :style="{ '--level': row.level }"
          :tabindex="row.id === current ? 0 : -1"
          :aria-level="row.level"
          :aria-setsize="row.setsize"
          :aria-posinset="row.posinset"
          :aria-expanded="row.expandable ? (row.open ? 'true' : 'false') : undefined"
          :aria-describedby="hasDetails(row) ? `${domId(row.id)}-more` : undefined"
          :draggable="readOnly === null && editing !== row.id ? 'true' : 'false'"
          :data-id="row.id"
          @keydown="onKeydown($event, row)"
          @focus="active = row.id"
          @click="onRowClick($event, row)"
          @dragstart="onDragstart($event, row)"
          @dragover="onDragover($event, row)"
          @drop="onDrop"
          @dragend="onDragend"
        >
          <!-- The row's name is this one line of words; what's drawn is the same, laid out, and
               hidden from screen readers so they read it once. Its synopsis and speakers are its
               description. -->
          <span class="sr-only">{{ nameOfRow(row) }}</span>
          <div class="line" aria-hidden="true">
            <span
              v-if="row.expandable"
              class="twisty"
              aria-hidden="true"
              @click.stop="toggle(row.id)"
            >
              <UIcon :name="row.open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
            </span>
            <span v-else class="twisty" aria-hidden="true" />
            <template v-if="row.item.kind === 'scene'">
              <span class="num">{{ sceneNumber(row.item) }}</span>
              <span class="heading">{{ row.item.heading || 'Untitled scene' }}</span>
              <span v-if="row.item.color" class="chip">
                <span
                  class="swatch"
                  :style="{ background: swatchOf(row.item.color.value) ?? 'transparent' }"
                  aria-hidden="true"
                />{{ colorName(row.item.color.value) }}
              </span>
              <span v-if="sceneLength(row)" class="length">{{ sceneLength(row) }}</span>
            </template>
            <template v-else>
              <span class="heading">{{ row.item.title || 'Untitled section' }}</span>
              <span class="length">{{ sectionSummary(row) }}</span>
            </template>
            <MenuButton
              :open="menuFor === row.id"
              :items="menuFor === row.id ? menuItems(row) : []"
              :content="{
                align: 'end',
                onCloseAutoFocus: (event: Event) => onMenuCloseAutoFocus(event, row),
              }"
              @update:open="(open: boolean) => setMenu(row, open)"
            >
              <button
                type="button"
                class="more"
                tabindex="-1"
                :aria-label="`Actions for ${row.label || 'this row'}`"
                @click.stop
              >
                <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
              </button>
            </MenuButton>
          </div>
          <input
            v-if="row.item.kind === 'scene' && editing === row.id"
            :id="`${domId(row.id)}-synopsis`"
            v-model="draft"
            class="synopsis-field"
            :aria-label="`Synopsis of ${row.item.heading}`"
            @keydown="onEditKeydown"
            @blur="finishEditing(false)"
          />
          <div
            v-if="row.item.kind === 'scene' && hasDetails(row)"
            :id="`${domId(row.id)}-more`"
            class="details"
            aria-hidden="true"
          >
            <span v-if="editing !== row.id && row.item.synopses[0]" class="synopsis">{{
              row.item.synopses[0].text
            }}</span>
            <span v-if="row.item.speakers.length > 0" class="who"
              ><span class="sr-only">Speaking: </span>{{ row.item.speakers.join(', ') }}</span
            >
          </div>
        </li>
      </ul>
    </template>
    <MoveToDialog
      :item="movingTo"
      :index="index"
      @choose="onMoveTo"
      @close="onMoveToClose"
    />
  </div>
</template>

<style scoped>
.outline {
  font-size: 13px;
}
.tools {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 8px 12px;
  background: var(--bg);
  border-bottom: 1px solid var(--line);
}
.filter {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
}
.filter input {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
}
.empty {
  margin: 0;
  padding: 24px 16px;
  color: var(--muted);
}
.tree {
  margin: 0;
  padding: 4px 0;
  list-style: none;
}
.row {
  padding: 4px 8px 4px calc(8px + (var(--level) - 1) * 18px);
  border-top: 2px solid transparent;
  border-bottom: 2px solid transparent;
  cursor: pointer;
}
.row:hover {
  background: var(--chrome);
}
.row:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.row.dragging {
  opacity: 0.5;
}
.row.drop-above {
  border-top-color: var(--heading);
}
.row.drop-below {
  border-bottom-color: var(--heading);
}
.line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px 8px;
}
.twisty {
  display: inline-flex;
  width: 16px;
  flex: none;
  justify-content: center;
  color: var(--muted);
}
.num {
  min-width: 2ch;
  color: var(--muted);
  font-weight: 700;
}
.heading {
  flex: 1 1 12rem;
  min-width: 0;
  color: var(--text);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.section .heading {
  color: var(--heading);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--text);
  font-size: 12px;
}
.swatch {
  width: 9px;
  height: 9px;
  border: 1px solid var(--muted);
  border-radius: 50%;
}
.length {
  color: var(--muted);
  white-space: nowrap;
}
.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  margin-left: auto;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.more:hover {
  background: var(--chrome-2);
  color: var(--text);
}
.details {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 12px;
  padding-left: 24px;
  color: var(--muted);
}
.details:empty {
  display: none;
}
.synopsis {
  color: var(--text);
}
.synopsis-field {
  box-sizing: border-box;
  width: calc(100% - 24px);
  margin: 2px 0 2px 24px;
  min-height: 26px;
  padding: 2px 6px;
  border: 1px solid var(--heading);
  border-radius: 4px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
}
@media (forced-colors: active) {
  .row.drop-above,
  .row.drop-below {
    border-color: Highlight;
  }
}
</style>
