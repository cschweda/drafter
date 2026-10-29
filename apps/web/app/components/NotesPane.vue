<script setup lang="ts">
import { redo, undo } from '@codemirror/commands';
import {
  categoryColors,
  deleteEntry,
  isTagWord,
  type NoteEntry,
  readNote,
  resolveAll,
  rewriteNote,
  SCENE_COLORS,
  type SceneColor,
  setCategoryColor,
  setResolved,
  setTags,
  writeNote,
} from '@drafter/notes';
import type { Scene } from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { useLayout } from '~/editor/layout';
import { pageOf } from '~/editor/pages';
import { useEditor } from '~/editor/session';
import {
  categoriesInUse,
  categoriesOfEntry,
  hasStatus,
  isOpen,
  type NoteGroup,
  notesShown,
  peopleInUse,
} from '~/notes/filter';
import { type NoteAction, notesKey } from '~/notes/list-keys';
import { notesFilter, openNewNote, useNotes } from '~/notes/use-notes';
import { sceneNumber, swatchOf } from '~/outline/labels';
import { sayOutline } from '~/outline/notice';
import { useOutline } from '~/outline/use-outline';

// The Notes tab (Phase 2 design §8): every note and boneyard in the script, in one list, each
// linked to its place; not the scene fields or the Beat Board's cards. Filter chips choose a group;
// the filters narrow it (in a sheet on a phone). The list is one listbox with one tab stop: Up and
// Down move, Enter goes to the note, E edits it in place, R resolves or reopens it, C sets its
// category, Delete deletes it, and the context-menu key or Shift+F10 opens its menu. Every change
// is a text change in one undo, made on the note as it is now (`useNotes().act`).

const editor = useEditor();
const outline = useOutline();
const notes = useNotes();
const { layout } = useLayout();
const wide = useWideScreen();
const why = outline.readOnly;
const markdown = computed(() => editor.kind.value === 'markdown');
const filter = notesFilter;

const GROUPS: ReadonlyArray<{ id: NoteGroup; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My notes' },
  { id: 'readers', label: 'Readers' },
  { id: 'setups', label: 'Setups & payoffs' },
  { id: 'boneyard', label: 'Boneyard' },
];

const lineOf = (offset: number) => {
  const text = editor.view.state.doc;
  return text.lineAt(Math.min(Math.max(offset, 0), text.length)).number;
};
const sceneAt = (offset: number): Scene | null =>
  outline.index.value.scenes.find((s) => s.span.from <= offset && offset < s.span.to) ?? null;

interface Item {
  entry: NoteEntry;
  scene: Scene | null;
  line: number;
  categories: string[];
  reply: boolean;
  page?: number | null;
}
interface Thread {
  key: string;
  label: string;
  items: Item[];
}

const rows = computed(() => notesShown(notes.entries.value, outline.index.value, filter, lineOf));

/** Setups & payoffs: a group per label, never-paid-off ones first, each mark with its page. */
const threads = computed<Thread[]>(() => {
  if (filter.group !== 'setups') return [];
  const text = filter.text.trim().toLowerCase();
  const out: Thread[] = [];
  for (const thread of notes.threads.value) {
    const marks = [...thread.setups, ...thread.payoffs].sort((a, b) => a.span.from - b.span.from);
    const items = marks.map(
      (entry): Item => ({
        entry,
        scene: sceneAt(entry.span.from),
        line: lineOf(entry.span.from),
        categories: [],
        reply: false,
        page: pageOf(layout.value, entry.block)?.current ?? null,
      }),
    );
    if (text !== '' && !thread.label.toLowerCase().includes(text)) continue;
    if (filter.scene !== null && !items.some((item) => item.scene?.ordinal === filter.scene)) {
      continue;
    }
    const state = thread.unpaid
      ? 'not paid off'
      : thread.setups.length === 0
        ? 'no setup'
        : 'paid off';
    const early =
      thread.early.length > 0 && thread.setups.length > 0
        ? ', a payoff comes before its setup'
        : '';
    out.push({
      key: `${thread.label}:${out.length}`,
      label: `${thread.label}: ${state}${early}`,
      items,
    });
  }
  return out;
});

const items = computed<Item[]>(() => {
  if (filter.group === 'setups') return threads.value.flatMap((t) => t.items);
  return rows.value.flatMap((row) => [
    {
      entry: row.entry,
      scene: row.scene,
      line: row.line,
      categories: row.categories,
      reply: false,
    },
    ...row.replies.map(
      (reply): Item => ({
        entry: reply,
        scene: sceneAt(reply.span.from),
        line: lineOf(reply.span.from),
        categories: categoriesOfEntry(reply),
        reply: true,
      }),
    ),
  ]);
});
/** Each item's place in `items`, for the threads' groups. */
const indexOf = (item: Item) => items.value.indexOf(item);

const categories = computed(() => categoriesInUse(notes.entries.value));
const people = computed(() => peopleInUse(notes.entries.value));
const scenes = computed(() =>
  outline.index.value.scenes.map((s) => ({
    ordinal: s.ordinal,
    label: `Scene ${sceneNumber(s)}: ${s.heading || 'Untitled scene'}`,
  })),
);
const swatches = computed(() => {
  const out: Record<string, string> = {};
  for (const [name, color] of Object.entries(categoryColors(editor.doc.value))) {
    const swatch = swatchOf(color);
    if (swatch) out[name] = swatch;
  }
  return out;
});
const colors = computed(() => categoryColors(editor.doc.value));

// ---- Focus: one tab stop, the row last focused ------------------------------------------------

const active = ref(0);
const current = computed(() => Math.min(active.value, Math.max(items.value.length - 1, 0)));
const domId = (i: number) => `note-row-${i}`;

async function focusRow(i: number) {
  active.value = Math.min(Math.max(i, 0), Math.max(items.value.length - 1, 0));
  await nextTick();
  document.getElementById(domId(current.value))?.focus();
}

// ---- Actions ----------------------------------------------------------------------------------

const NO_STATUS = 'A setup, a payoff, or a boneyard has no status or categories.';

function go(item: Item) {
  editor.goto(item.entry.span.from);
}

function resolve(i: number) {
  const item = items.value[i];
  if (!item) return;
  const note = item.entry.note;
  if (!hasStatus(note)) {
    void sayOutline(NO_STATUS);
    return;
  }
  const to = !note.resolved;
  notes.act(
    item.entry,
    (doc, entry) => setResolved(doc, entry, to),
    to ? 'Resolved the note.' : 'Reopened the note.',
    'Nothing was changed: the note would read differently.',
  );
  void focusRow(i);
}

function remove(i: number) {
  const item = items.value[i];
  if (!item) return;
  const what = item.entry.kind === 'boneyard' ? 'boneyard' : 'note';
  notes.act(
    item.entry,
    deleteEntry,
    `Deleted the ${what}.`,
    `Nothing was deleted: taking the ${what} out would change how the script prints.`,
  );
  void focusRow(i);
}

// Edit in place: the head and the text; Enter saves, Escape or leaving cancels.
const editing = ref<number | null>(null);
let editingEntry: NoteEntry | null = null;
const draftHead = ref('');
const draftBody = ref('');

/** A note's head as typed: the text before its colon (a quote's colon is the quote's). */
function headText(entry: NoteEntry): string {
  const note = entry.note;
  if (!note?.head) return '';
  const inner = entry.text;
  const at = note.body === '' ? inner.trimEnd().length : inner.lastIndexOf(note.body);
  return inner.slice(0, at).trim().replace(/:$/, '').trim();
}

async function startEditing(i: number) {
  const item = items.value[i];
  if (!item) return;
  if (why.value) {
    void sayOutline(why.value);
    return;
  }
  if (item.entry.kind !== 'note' || !item.entry.note) {
    void sayOutline('A boneyard is changed in the Source.');
    return;
  }
  editingEntry = item.entry;
  draftHead.value = headText(item.entry);
  draftBody.value = item.entry.note.body;
  editing.value = i;
  await nextTick();
  const input = document.getElementById(`${domId(i)}-body`) as HTMLInputElement | null;
  input?.focus();
  input?.select();
}

function finishEditing(save: boolean) {
  const i = editing.value;
  const was = editingEntry;
  if (i === null || !was) return;
  const head = draftHead.value.trim() === '' ? null : draftHead.value;
  const body = draftBody.value;
  let written = '';
  if (save) {
    try {
      written = writeNote(head, body);
    } catch (error) {
      // A head that wouldn't read back as one: say so, and keep the fields open.
      void sayOutline(error instanceof Error ? error.message : String(error));
      return;
    }
  }
  editing.value = null;
  editingEntry = null;
  if (save) {
    // With no head, a body that starts `Word:` reads as that head, as it would typed (DECISIONS).
    const read = readNote(written.slice(2, -2));
    const gained = head === null && read.head !== null;
    const colon = written.indexOf(':');
    notes.act(
      was,
      (doc, entry) => rewriteNote(doc, entry, head, body),
      gained
        ? `Saved the note. “${written.slice(2, colon + 1)}” at its start reads as its head.`
        : 'Saved the note.',
      'The note is as it was.',
    );
  }
  void focusRow(i);
}

// Set category…: a dialog on the note as it was when it opened.
const categoryFor = ref<NoteEntry | null>(null);
let categoryRow = 0;

function openCategory(i: number) {
  const item = items.value[i];
  if (!item) return;
  if (why.value) {
    void sayOutline(why.value);
    return;
  }
  if (!hasStatus(item.entry.note)) {
    void sayOutline(NO_STATUS);
    return;
  }
  categoryRow = i;
  categoryFor.value = item.entry;
}

function onCategorySave(tags: string[]) {
  const was = categoryFor.value;
  if (!was) return;
  notes.act(
    was,
    (doc, entry) => setTags(doc, entry, tags),
    tags.length > 0
      ? `Set the note’s categories: ${tags.join(', ')}.`
      : 'Took the categories off the note.',
    'The note’s categories are as they were.',
  );
}

function onCategoryClose() {
  categoryFor.value = null;
  void focusRow(categoryRow);
}

// A category's color, kept in the metadata block (design §5.5).
function setColor(name: string, color: SceneColor | null) {
  if (why.value) {
    void sayOutline(why.value);
    return;
  }
  const changes = setCategoryColor(editor.doc.value, name, color);
  if (changes.length === 0) return;
  if (outline.apply(changes)) {
    void sayOutline(
      color ? `Colored the ${name} category ${color}.` : `Took the color off the ${name} category.`,
    );
  }
}

function colorItems(name: string): DropdownMenuItem[][] {
  const pick = (color: SceneColor | null): DropdownMenuItem => ({
    type: 'checkbox',
    label: color ?? 'No color',
    checked: (colors.value[name] ?? null) === color,
    onSelect: () => setColor(name, color),
  });
  return [SCENE_COLORS.map(pick), [pick(null)]];
}

/** A category chip's menu: Color…. */
function chipItems(name: string): DropdownMenuItem[][] {
  const groups: DropdownMenuItem[][] = [];
  if (why.value) groups.push([{ type: 'label', label: why.value }]);
  groups.push([
    {
      label: 'Color…',
      icon: 'i-lucide-palette',
      disabled: why.value !== null || !isTagWord(name),
      children: colorItems(name),
    },
  ]);
  return groups;
}

// ---- The row's menu ---------------------------------------------------------------------------

const menuFor = ref<number | null>(null);
let menuRow: number | null = null;
let afterMenu: (() => void) | null = null;

function setMenu(i: number, open: boolean) {
  if (open) {
    active.value = i;
    menuFor.value = i;
    menuRow = i;
  } else if (menuFor.value === i) menuFor.value = null;
}

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  const i = menuRow;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    else if (menuFor.value === null && i !== null) void focusRow(i);
  });
}

const MENU_CONTENT = { align: 'end' as const, onCloseAutoFocus: onMenuCloseAutoFocus };
const NO_ITEMS: DropdownMenuItem[][] = [];

function menuItems(i: number): DropdownMenuItem[][] {
  const item = items.value[i];
  if (!item) return NO_ITEMS;
  const off = why.value !== null;
  const later = (act: () => void) => () => {
    afterMenu = act;
  };
  const note = item.entry.note;
  const groups: DropdownMenuItem[][] = [];
  if (why.value) groups.push([{ type: 'label', label: why.value }]);
  groups.push([{ label: 'Go to', icon: 'i-lucide-arrow-right', onSelect: later(() => go(item)) }]);
  const edits: DropdownMenuItem[] = [];
  if (hasStatus(note)) {
    edits.push({
      label: note.resolved ? 'Reopen' : 'Resolve',
      icon: note.resolved ? 'i-lucide-rotate-ccw' : 'i-lucide-check',
      disabled: off,
      onSelect: later(() => resolve(i)),
    });
  }
  if (item.entry.kind === 'note') {
    edits.push({
      label: 'Edit',
      icon: 'i-lucide-pencil',
      disabled: off,
      onSelect: later(() => void startEditing(i)),
    });
  }
  if (hasStatus(note)) {
    edits.push({
      label: 'Set category…',
      icon: 'i-lucide-tag',
      disabled: off,
      onSelect: later(() => openCategory(i)),
    });
  }
  if (edits.length > 0) groups.push(edits);
  const named = item.categories.filter(isTagWord);
  if (named.length > 0) {
    groups.push(
      named.map((name) => ({
        label: `Color of ${name}…`,
        icon: 'i-lucide-palette',
        disabled: off,
        children: colorItems(name),
      })),
    );
  }
  groups.push([
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      disabled: off,
      onSelect: later(() => remove(i)),
    },
  ]);
  return groups;
}

// ---- Resolve all shown ------------------------------------------------------------------------

const toResolve = computed(() => items.value.map((item) => item.entry).filter(isOpen));
const asking = ref<NoteEntry[] | null>(null);
const askDialog = ref<HTMLDialogElement>();
const resolveButton = ref<HTMLButtonElement>();
const notesWord = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`;

async function askResolveAll() {
  if (why.value) {
    void sayOutline(why.value);
    return;
  }
  if (toResolve.value.length === 0) {
    void sayOutline('No open notes are shown.');
    return;
  }
  asking.value = [...toResolve.value];
  await nextTick();
  askDialog.value?.showModal();
}

function confirmResolveAll() {
  const was = asking.value;
  askDialog.value?.close();
  if (!was) return;
  notes.actAll(was, resolveAll, `Resolved ${notesWord(was.length)}.`);
}

function onAskClose() {
  asking.value = null;
  resolveButton.value?.focus();
}

// ---- New note and the phone's filters ---------------------------------------------------------

const newButton = ref<HTMLButtonElement>();
function onNewNote() {
  if (why.value) {
    void sayOutline(why.value);
    return;
  }
  openNewNote(() => newButton.value?.focus());
}

const filtersOpen = ref(false);
const filtersButton = ref<HTMLButtonElement>();
function onFiltersClose() {
  filtersOpen.value = false;
  filtersButton.value?.focus();
}
const filtering = computed(
  () =>
    [filter.category, filter.person, filter.scene].filter((v) => v !== null).length +
    (filter.status === 'all' ? 0 : 1) +
    (filter.text.trim() === '' ? 0 : 1),
);

// ---- Keys -------------------------------------------------------------------------------------

function run(action: NoteAction, i: number) {
  const item = items.value[i];
  if (!item) return;
  if (action === 'go') go(item);
  else if (action === 'edit') void startEditing(i);
  else if (action === 'resolve') resolve(i);
  else if (action === 'category') openCategory(i);
  else if (action === 'delete') remove(i);
  else setMenu(i, true);
}

function onKeydown(event: KeyboardEvent, i: number) {
  // Only keys on the row itself: the edit fields have their own.
  if (event.target !== event.currentTarget) return;
  const key = event.key === 'F10' && event.shiftKey ? 'ContextMenu' : event.key;
  const mod = event.ctrlKey || event.metaKey;
  // Undo and redo work here too, on the script, and focus stays on the list.
  if (mod && !event.altKey && (key.toLowerCase() === 'z' || key.toLowerCase() === 'y')) {
    event.preventDefault();
    if (key.toLowerCase() === 'y' || event.shiftKey) redo(editor.view);
    else undo(editor.view);
    void focusRow(i);
    return;
  }
  if (event.altKey || mod || (event.shiftKey && key !== 'ContextMenu' && key.length > 1)) return;
  const next = notesKey(items.value.length, i, key);
  if (!next) {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) event.preventDefault();
    return;
  }
  event.preventDefault();
  if (next.focus !== undefined) void focusRow(next.focus);
  else if (next.action) run(next.action, i);
}

// After a change, a row that went away hands the tab stop on.
watch(
  () => items.value.length,
  async () => {
    const hadFocus =
      document.activeElement === document.body || !document.activeElement?.isConnected;
    await nextTick();
    if (hadFocus && document.activeElement === document.body && items.value.length > 0) {
      await focusRow(current.value);
    }
  },
);
watch(
  () => filter.group,
  () => {
    active.value = 0;
  },
);
</script>

<template>
  <div class="notes-pane">
    <p v-if="markdown" class="empty">Not available for Markdown documents.</p>
    <template v-else>
      <div class="bar">
        <div role="group" aria-label="Notes to show" class="chips">
          <button
            v-for="group in GROUPS"
            :key="group.id"
            type="button"
            class="chip"
            :aria-pressed="filter.group === group.id ? 'true' : 'false'"
            @click="filter.group = group.id"
          >
            {{ group.label }}
          </button>
        </div>
        <div class="actions">
          <button
            ref="newButton"
            type="button"
            class="btn"
            :aria-disabled="why ? 'true' : undefined"
            :aria-describedby="why ? 'notes-why' : undefined"
            @click="onNewNote"
          >
            New note…
          </button>
          <button
            v-if="filter.group !== 'setups' && filter.group !== 'boneyard'"
            ref="resolveButton"
            type="button"
            class="btn"
            :aria-disabled="why || toResolve.length === 0 ? 'true' : undefined"
            :aria-describedby="why ? 'notes-why' : undefined"
            @click="askResolveAll"
          >
            Resolve all shown
          </button>
          <button
            v-if="!wide"
            ref="filtersButton"
            type="button"
            class="btn"
            aria-haspopup="dialog"
            @click="filtersOpen = true"
          >
            Filters<template v-if="filtering > 0"> ({{ filtering }})</template>
          </button>
        </div>
        <NoteFilterFields
          v-if="wide"
          id-prefix="notes"
          :categories="categories"
          :people="people"
          :scenes="scenes"
        />
      </div>
      <p v-if="why" id="notes-why" class="why">{{ why }}</p>
      <p v-if="notes.entries.value.length === 0" class="empty">
        No notes yet. A note is words in double brackets, <code>[[like this]]</code>; it never prints.
      </p>
      <p v-else-if="items.length === 0" class="empty">No notes match.</p>
      <div v-else role="listbox" aria-label="Notes" class="list">
        <template v-if="filter.group === 'setups'">
          <div
            v-for="thread in threads"
            :key="thread.key"
            role="group"
            :aria-label="thread.label"
            class="thread"
          >
            <div class="thread-title" aria-hidden="true">{{ thread.label }}</div>
            <NoteRow
              v-for="item in thread.items"
              :key="indexOf(item)"
              :entry="item.entry"
              :scene="item.scene"
              :line="item.line"
              :page="item.page"
              :categories="item.categories"
              :swatches="swatches"
              :dom-id="domId(indexOf(item))"
              :current="indexOf(item) === current"
              :editing="editing === indexOf(item)"
              :read-only="why"
              :menu-open="menuFor === indexOf(item)"
              :menu-items="menuFor === indexOf(item) ? menuItems(indexOf(item)) : NO_ITEMS"
              :menu-content="MENU_CONTENT"
              :chip-items="chipItems"
              v-model:draft-head="draftHead"
              v-model:draft-body="draftBody"
              @update:menu-open="(open: boolean) => setMenu(indexOf(item), open)"
              @edited="finishEditing"
              @resolve="resolve(indexOf(item))"
              @keydown="onKeydown($event, indexOf(item))"
              @focus="active = indexOf(item)"
              @click="active = indexOf(item)"
              @dblclick="go(item)"
            />
          </div>
        </template>
        <template v-else>
          <NoteRow
            v-for="(item, i) in items"
            :key="i"
            v-model:draft-head="draftHead"
            v-model:draft-body="draftBody"
            :entry="item.entry"
            :scene="item.scene"
            :line="item.line"
            :reply="item.reply"
            :categories="item.categories"
            :swatches="swatches"
            :dom-id="domId(i)"
            :current="i === current"
            :editing="editing === i"
            :read-only="why"
            :menu-open="menuFor === i"
            :menu-items="menuFor === i ? menuItems(i) : NO_ITEMS"
            :menu-content="MENU_CONTENT"
            :chip-items="chipItems"
            @update:menu-open="(open: boolean) => setMenu(i, open)"
            @edited="finishEditing"
            @resolve="resolve(i)"
            @keydown="onKeydown($event, i)"
            @focus="active = i"
            @click="active = i"
            @dblclick="go(item)"
          />
        </template>
      </div>
    </template>
    <NoteFiltersDialog
      :open="filtersOpen"
      :categories="categories"
      :people="people"
      :scenes="scenes"
      @close="onFiltersClose"
    />
    <NoteCategoryDialog
      :entry="categoryFor"
      :categories="categories"
      @save="onCategorySave"
      @close="onCategoryClose"
    />
    <dialog
      ref="askDialog"
      class="ask"
      aria-labelledby="notes-ask-title"
      @close="onAskClose"
    >
      <template v-if="asking">
        <h2 id="notes-ask-title">Resolve {{ notesWord(asking.length) }}?</h2>
        <p>Each gets <code>#resolved</code>; one undo takes them all back.</p>
        <div class="buttons">
          <button type="button" class="btn" autofocus @click="askDialog?.close()">Cancel</button>
          <button type="button" class="btn primary" @click="confirmResolveAll">Resolve</button>
        </div>
      </template>
    </dialog>
  </div>
</template>

<style scoped>
.notes-pane {
  font-size: 13px;
}
.empty {
  margin: 0;
  padding: 24px 16px;
  color: var(--muted);
}
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
}
.chips,
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 13px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.chip[aria-pressed='true'] {
  border-color: var(--heading);
  background: var(--tab-on);
  color: var(--text);
}
.btn {
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn.primary {
  border-color: var(--heading);
}
.btn[aria-disabled='true'] {
  opacity: 0.6;
  cursor: not-allowed;
}
.why {
  margin: 0;
  padding: 8px 12px;
  color: var(--muted);
}
.thread-title {
  padding: 10px 10px 4px;
  color: var(--heading);
  font-weight: 700;
}
.ask {
  box-sizing: border-box;
  width: min(24rem, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
.ask h2 {
  margin: 0 0 6px;
  font-size: 16px;
}
.ask p {
  margin: 0;
  color: var(--muted);
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
@media (forced-colors: active) {
  .chip[aria-pressed='true'] {
    border: 2px solid CanvasText;
  }
}
</style>
