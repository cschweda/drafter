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
import { useEditor } from '~/editor/session';
import { KIND_WORD, nodeName, percent, targetLine, titleOf, wordsLabel } from '~/novel/labels';
import { useNovel } from '~/novel/use-novel';
import { sayOutline } from '~/outline/notice';
import { type TreeRow, treeKey, typeAhead } from '~/outline/tree';

// The Outline for a novel (the Novel design, goal 3): its parts, chapters, and sections as an ARIA
// tree, with the script Outline's keys. One row is a tab stop; the arrows, Home, End, and typing
// move between rows; Enter goes to the passage; Alt+Up and Alt+Down move it; its menu (the ⋯
// button, the context-menu key, or Shift+F10) has every action. A pointer can drag a row, and pick
// a status from the row's status button. Every change is one text change, undone in one step.

const editor = useEditor();
const novel = useNovel();
const { tree, facts } = novel;

const closed = ref(new Set<string>());

interface Row extends TreeRow {
  node: NovelNode;
  facts: Facts;
  setsize: number;
  posinset: number;
  /** Everything a row draws, as one string, so a row that is the same isn't drawn again. */
  sig: string;
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  const kept = facts.value.nodes;
  const walk = (nodes: NovelNode[], level: number, parent: string | null) => {
    nodes.forEach((node, i) => {
      const expandable = node.children.length > 0;
      const open = expandable && !closed.value.has(node.id);
      const own = kept[node.id] ?? {};
      out.push({
        id: node.id,
        node,
        facts: own,
        level,
        parent,
        expandable,
        open,
        label: titleOf(node),
        setsize: nodes.length,
        posinset: i + 1,
        sig: JSON.stringify([
          node.title,
          node.kind,
          node.words,
          own,
          level,
          expandable,
          open,
          i,
          nodes.length,
        ]),
      });
      if (open) walk(node.children, level + 1, node.id);
    });
  };
  walk(tree.value?.nodes ?? [], 1, null);
  return out;
});

const rowById = (id: string) => rows.value.find((r) => r.id === id);

const active = ref<string | null>(null);
const current = computed(() =>
  rows.value.some((r) => r.id === active.value) ? active.value : (rows.value[0]?.id ?? null),
);
/** A DOM id from a node id, which holds `:` and any letter of a title. */
const domIds = new Map<string, string>();
const domId = (id: string) => {
  let made = domIds.get(id);
  if (!made) {
    made = `novel-row-${domIds.size}`;
    domIds.set(id, made);
  }
  return made;
};

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

// ---- Moving ------------------------------------------------------------------------------

/** "It is section 2 of 3, in The Night Watch." */
function whereIs(after: NovelTree | null, id: string): string {
  if (!after) return '';
  const find = (list: NovelNode[], parent: NovelNode | null): string | null => {
    for (const n of list) {
      if (n.id === id) {
        const same = list.filter((s) => s.kind === n.kind);
        const at = same.indexOf(n) + 1;
        const where = parent ? `, in ${titleOf(parent)}` : '';
        return ` It is ${KIND_WORD[n.kind]} ${at} of ${same.length}${where}.`;
      }
      const deeper = find(n.children, n);
      if (deeper !== null) return deeper;
    }
    return null;
  };
  return find(after.nodes, null) ?? '';
}

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
    if (active.value) await focusRow(active.value);
    return;
  }
  const moved = novel.moved.value;
  if (!moved) return;
  // The rows it moved into are opened, so it can be seen and keep focus.
  const next = new Set(closed.value);
  const open = (list: NovelNode[]): boolean =>
    list.some((n) => {
      if (n.id === moved) return true;
      if (open(n.children)) {
        next.delete(n.id);
        return true;
      }
      return false;
    });
  open(tree.value?.nodes ?? []);
  closed.value = next;
  void sayOutline(`Moved ${titleOf(node)}.${whereIs(tree.value, moved)}`);
  await focusRow(moved);
}

const moveUp = (id: string) => move(id, tree.value && upTarget(tree.value, id), 'up');
const moveDown = (id: string) => move(id, tree.value && downTarget(tree.value, id), 'down');

// Drag: a drop line between rows shows where the row will land. Pointer only; the keys and the
// menu do the same.
const dragging = ref<string | null>(null);
const dropLine = ref<{ id: string; below: boolean } | null>(null);

function onDragstart(event: DragEvent, id: string) {
  const row = rowById(id);
  if (!row) return;
  if (novel.readOnly()) {
    event.preventDefault();
    return;
  }
  dragging.value = row.id;
  event.dataTransfer?.setData('text/plain', row.label);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragover(event: DragEvent, id: string) {
  if (!dragging.value || !rowById(id)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropLine.value = { id, below: event.clientY > rect.top + rect.height / 2 };
}

const RANK = { part: 0, chapter: 1, section: 2 } as const;

/** Where a row of `kind` dropped on the line above or below row `at` goes. */
function dropTarget(kind: NovelNode['kind'], at: number, below: boolean): NovelTarget | null {
  const on = rows.value[at];
  if (!on) return null;
  if (!below && on.node.kind === kind) return { before: on.id };
  const above = below ? on : rows.value[at - 1];
  if (!above) return null;
  const rank = RANK[above.node.kind];
  if (rank === RANK[kind]) return { after: above.id };
  // Just under its parent's row: first inside it.
  if (rank === RANK[kind] - 1) {
    const first = above.node.children[0];
    return first && above.open ? { before: first.id } : { into: above.id };
  }
  // Under a deeper row: after the row of this kind that holds it.
  if (rank > RANK[kind]) {
    let id: string | null = above.parent;
    while (id) {
      const holder = rowById(id);
      if (!holder) return null;
      if (holder.node.kind === kind) return { after: holder.id };
      id = holder.parent;
    }
  }
  return null;
}

function onDrop(event: DragEvent) {
  event.preventDefault();
  const from = dragging.value ? rowById(dragging.value) : undefined;
  const line = dropLine.value;
  dragging.value = null;
  dropLine.value = null;
  if (!from || !line) return;
  const at = rows.value.findIndex((r) => r.id === line.id);
  void move(from.id, dropTarget(from.node.kind, at, line.below));
}

function onDragend() {
  dragging.value = null;
  dropLine.value = null;
}

/** The pointer left the tree while dragging: no line, until it comes back over a row. */
function onDragleave(event: DragEvent) {
  const to = event.relatedTarget;
  // Moving from one row to another (or into a row's own parts) is not leaving.
  if (to instanceof Node && (event.currentTarget as HTMLElement).contains(to)) return;
  dropLine.value = null;
}

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
const draft = ref('');

async function startEditing(id: string) {
  if (novel.readOnly()) {
    void sayOutline(novel.readOnly() as string);
    return;
  }
  draft.value = facts.value.nodes[id]?.synopsis ?? '';
  editing.value = id;
  await nextTick();
  const input = document.getElementById(`${domId(id)}-synopsis`) as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

function finishEditing(save: boolean, refocus = true) {
  const id = editing.value;
  if (!id) return;
  editing.value = null;
  if (save) novel.setFacts(id, { ...(facts.value.nodes[id] ?? {}), synopsis: draft.value });
  if (refocus) void focusRow(id);
}

const root = ref<HTMLElement | null>(null);

/** Leaving the field keeps the draft, as Enter does; focus goes back to the row only within the pane. */
function onFieldBlur(event: FocusEvent) {
  const to = event.relatedTarget;
  const inside =
    !(to instanceof Node) || to === document.body || (root.value?.contains(to) ?? false);
  finishEditing(true, inside);
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

// As the script Outline's: MenuButton, opened by the ⋯ button, the context-menu key, or Shift+F10;
// closing it puts focus back on the row, or where the chosen action wants it. The status button
// opens a menu of the statuses alone.
const menuFor = ref<{ id: string; which: 'more' | 'status' } | null>(null);
let afterMenu: (() => void) | null = null;
let menuRow: string | null = null;

const isOpen = (id: string, which: 'more' | 'status') =>
  menuFor.value?.id === id && menuFor.value.which === which;

function setMenu(id: string, which: 'more' | 'status', open: boolean) {
  if (open) {
    menuFor.value = { id, which };
    menuRow = id;
  } else if (isOpen(id, which)) menuFor.value = null;
}

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  const id = menuRow;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    else if (menuFor.value === null && id) void focusRow(id);
  });
}

const MENU_CONTENT = { align: 'end' as const, onCloseAutoFocus: onMenuCloseAutoFocus };
const NO_ITEMS: DropdownMenuItem[][] = [];
const afterClosing = (act: () => void) => {
  afterMenu = act;
};

/**
 * The statuses are one choice of several, so their items are radios: Nuxt UI's menu has
 * checkbox items only, so while a menu of this tree is open, its status items are given the
 * `menuitemradio` role (their `aria-checked` already says which is chosen). A menu opens its
 * Status submenu later, so the open menu is watched until it closes.
 */
const STATUS_ITEM = 'novel-status-item';
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
    // Drawn as a radio (`menuitemradio`, below): one status at a time.
    class: STATUS_ITEM,
    onSelect: () => setStatus(id, status),
  });
  // One group, so the radios are one set.
  return [[...STATUSES.map(pick), pick(null)]];
}

function menuItems(row: Row): DropdownMenuItem[][] {
  const why = novel.readOnly();
  const off = why !== null;
  const what = KIND_WORD[row.node.kind];
  const t = tree.value;
  const groups: DropdownMenuItem[][] = [];
  if (why) groups.push([{ type: 'label', label: why }]);
  groups.push([
    {
      label: 'Go to',
      icon: 'i-lucide-arrow-right',
      onSelect: () => afterClosing(() => novel.goto(row.id)),
    },
  ]);
  groups.push([
    {
      label: `Move ${what} up`,
      icon: 'i-lucide-arrow-up',
      disabled: off || !t || upTarget(t, row.id) === null,
      onSelect: () => afterClosing(() => void moveUp(row.id)),
    },
    {
      label: `Move ${what} down`,
      icon: 'i-lucide-arrow-down',
      disabled: off || !t || downTarget(t, row.id) === null,
      onSelect: () => afterClosing(() => void moveDown(row.id)),
    },
  ]);
  groups.push([
    {
      label: 'Edit synopsis',
      icon: 'i-lucide-pencil',
      disabled: off,
      onSelect: () => afterClosing(() => void startEditing(row.id)),
    },
    {
      label: 'Status',
      icon: 'i-lucide-circle-check',
      disabled: off,
      children: statusItems(row.id),
    },
  ]);
  return groups;
}

// ---- Keys --------------------------------------------------------------------------------

let typed = '';
let typedAt = 0;

function onKeydown(event: KeyboardEvent, id: string) {
  const row = rowById(id);
  if (!row) return;
  if (event.target !== event.currentTarget) return;
  const { key } = event;
  if (key === 'ContextMenu' || (key === 'F10' && event.shiftKey)) {
    event.preventDefault();
    active.value = row.id;
    setMenu(row.id, 'more', true);
    return;
  }
  if (event.altKey && (key === 'ArrowUp' || key === 'ArrowDown')) {
    event.preventDefault();
    void (key === 'ArrowUp' ? moveUp(row.id) : moveDown(row.id));
    return;
  }
  // Undo and redo work here too, on the book, and focus stays in the Outline.
  const mod = event.ctrlKey || event.metaKey;
  if (mod && !event.altKey && (key.toLowerCase() === 'z' || key.toLowerCase() === 'y')) {
    event.preventDefault();
    if (key.toLowerCase() === 'y' || event.shiftKey) redo(editor.view);
    else undo(editor.view);
    void focusRow(row.id);
    return;
  }
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (key === 'Enter') {
    event.preventDefault();
    novel.goto(row.id);
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

function onRowClick(event: MouseEvent, id: string) {
  active.value = id;
  if ((event.target as HTMLElement).closest('.more, .status, .twisty, input')) return;
  novel.goto(id);
}

// A row that went away (an undo, an edit in the Source) hands the tab stop on.
watch(rows, async () => {
  if (!active.value || rows.value.some((r) => r.id === active.value)) return;
  const hadFocus = document.activeElement === document.body || !document.activeElement?.isConnected;
  active.value = null;
  await nextTick();
  if (hadFocus && document.activeElement === document.body && current.value) {
    await focusRow(current.value);
  }
});
</script>

<template>
  <div ref="root" class="novel-outline">
    <DEmpty v-if="rows.length === 0" icon="i-lucide-list-tree">
      No chapters yet. A chapter starts with <code>#</code> and its title, and a section within it
      with <code>##</code>.
    </DEmpty>
    <ul v-else role="tree" aria-label="Outline" class="tree" @dragleave="onDragleave">
      <li
        v-for="row in rows"
        :id="domId(row.id)"
        :key="row.id"
        role="treeitem"
        aria-keyshortcuts="Enter Shift+F10 Alt+ArrowUp Alt+ArrowDown"
        class="row"
        :class="[
          row.node.kind,
          {
            dragging: dragging === row.id,
            'drop-above': dropLine?.id === row.id && !dropLine.below,
            'drop-below': dropLine?.id === row.id && dropLine.below,
          },
        ]"
        :style="{ '--level': row.level }"
        :tabindex="row.id === current ? 0 : -1"
        :aria-level="row.level"
        :aria-setsize="row.setsize"
        :aria-posinset="row.posinset"
        :aria-expanded="row.expandable ? (row.open ? 'true' : 'false') : undefined"
        :aria-describedby="row.facts.synopsis ? `${domId(row.id)}-more` : undefined"
        :draggable="editing !== row.id ? 'true' : 'false'"
        :data-id="row.id"
        v-memo="[
          row.sig,
          row.id === current,
          dragging === row.id,
          dropLine?.id === row.id ? dropLine.below : null,
          editing === row.id,
          isOpen(row.id, 'more'),
          isOpen(row.id, 'status'),
        ]"
        @keydown="onKeydown($event, row.id)"
        @focus="active = row.id"
        @click="onRowClick($event, row.id)"
        @dragstart="onDragstart($event, row.id)"
        @dragover="onDragover($event, row.id)"
        @drop="onDrop"
        @dragend="onDragend"
      >
        <span class="sr-only">{{ nodeName(row.node, row.facts) }}</span>
        <div class="line" aria-hidden="true">
          <span v-if="row.expandable" class="twisty" @click.stop="toggle(row.id)">
            <UIcon :name="row.open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" />
          </span>
          <span v-else class="twisty" />
          <span class="heading" :class="{ untitled: !row.node.title }">{{ titleOf(row.node) }}</span>
          <span class="words">{{ wordsLabel(row.node.words) }}</span>
          <span v-if="row.facts.target" class="target">
            <span class="bar"
              ><span
                class="fill"
                :style="{ width: `${percent(row.node.words, row.facts.target)}%` }"
            /></span>
            {{ targetLine(row.node.words, row.facts.target) }}
          </span>
          <MenuButton
            :open="isOpen(row.id, 'status')"
            :items="isOpen(row.id, 'status') ? statusItems(row.id) : NO_ITEMS"
            :content="MENU_CONTENT"
            @update:open="(open: boolean) => setMenu(row.id, 'status', open)"
          >
            <button
              type="button"
              class="status"
              :class="row.facts.status ?? 'none'"
              tabindex="-1"
              :aria-label="`Status of ${row.label}`"
              @click.stop
            >
              {{ row.facts.status ? STATUS_LABELS[row.facts.status] : 'No status' }}
            </button>
          </MenuButton>
          <MenuButton
            :open="isOpen(row.id, 'more')"
            :items="isOpen(row.id, 'more') ? menuItems(row) : NO_ITEMS"
            :content="MENU_CONTENT"
            @update:open="(open: boolean) => setMenu(row.id, 'more', open)"
          >
            <button
              type="button"
              class="more"
              tabindex="-1"
              :aria-label="`Actions for ${row.label}`"
              @click.stop
            >
              <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
            </button>
          </MenuButton>
        </div>
        <input
          v-if="editing === row.id"
          :id="`${domId(row.id)}-synopsis`"
          v-model="draft"
          autocomplete="off"
          class="synopsis-field"
          :aria-label="`Synopsis of ${row.label}`"
          @keydown="onEditKeydown"
          @blur="onFieldBlur"
        />
        <div
          v-else-if="row.facts.synopsis"
          :id="`${domId(row.id)}-more`"
          class="details"
          aria-hidden="true"
        >
          {{ row.facts.synopsis }}
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.novel-outline {
  font-size: 13px;
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
  background: var(--surface);
}
.row:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: -2px;
}
.row.dragging {
  opacity: 0.5;
}
.row.drop-above {
  border-top-color: var(--accent-text);
}
.row.drop-below {
  border-bottom-color: var(--accent-text);
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
.heading {
  flex: 1 1 10rem;
  min-width: 0;
  color: var(--text);
  font-weight: 600;
  overflow-wrap: anywhere;
}
.part .heading {
  color: var(--accent-text);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.section .heading {
  font-weight: 400;
}
.heading.untitled {
  color: var(--muted);
  font-style: italic;
}
.words,
.target {
  color: var(--muted);
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
.more {
  display: inline-flex;
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
.details {
  padding-left: 24px;
  color: var(--text);
}
.synopsis-field {
  box-sizing: border-box;
  width: calc(100% - 24px);
  margin: 2px 0 2px 24px;
  min-height: 26px;
  padding: 2px 6px;
  border: 1px solid var(--accent-text);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
@media (forced-colors: active) {
  .row.drop-above,
  .row.drop-below {
    border-color: Highlight;
  }
  .fill {
    background: Highlight;
  }
}
</style>
