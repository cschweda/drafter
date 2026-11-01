<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { nowLabel, useCompare, type Version } from '~/compare/use-compare';
import DDialog from '~/components/ui/DDialog.vue';
import {
  compareLabel,
  draftName,
  draftWhen,
  KEPT_HERE,
  markerLine,
  shortId,
  typedDraftNumber,
  wordsOf,
} from '~/drafts/labels';
import { type DraftRow, isIdPrefix, NOTE_MAX } from '~/drafts/store';
import { useDrafts } from '~/drafts/use-drafts';
import { useEditor } from '~/editor/session';
import { sayOutline } from '~/outline/notice';
import { historyReadOnly } from '~/snapshots/restore';

// The Drafts list (drafts-and-cuts design §2.3): the draft being written at the top, marked "now",
// then every frozen draft, newest first, each with its number, short ID, date and time, words, note,
// and the marker that says what it builds on. For each: Read (beside the Source, read-only), Compare
// with now, Restore as a new draft (Call 4: it freezes the text now first, and one undo reverses
// it), and under More: Compare with another draft, Copy full ID, Edit note…. No Delete (Call 5).
// Words only, not pages: laying out every draft's text to count its pages costs a layout per draft
// each time the list is read (Task 2's call). The filter finds a draft by its number, ID, or note.

const drafts = useDrafts();
const { rows, current, from, notKept } = drafts;
const editor = useEditor();
const compare = useCompare();
const uid = useId();

const filter = ref('');
const shown = computed(() => {
  const typed = filter.value.trim().toLowerCase();
  if (!typed) return rows.value;
  const number = typedDraftNumber(typed);
  return rows.value.filter(
    (row) =>
      row.n === number ||
      (isIdPrefix(typed) && row.id.startsWith(typed)) ||
      row.note.toLowerCase().includes(typed),
  );
});

/** Why Restore is off here (another tab is editing the script), or null. */
const readOnly = ref<string | null>(null);
const readWhy = () => {
  readOnly.value = historyReadOnly();
};
watch([() => editor.locked.value, () => drafts.version.value], readWhy, { immediate: true });

const tell = (message: string) => void sayOutline(message);

// ---- Actions ----------------------------------------------------------------------------------

async function versionOf(row: DraftRow): Promise<Version | null> {
  const text = await drafts.textOf(row.n);
  if (text === null) {
    tell(`${draftName(row.n)} can’t be read.`);
    return null;
  }
  return { label: compareLabel(row), at: row.frozenAt, text };
}

async function compareNow(row: DraftRow) {
  const version = await versionOf(row);
  if (!version) return;
  compare.open(version, {
    label: nowLabel(Date.now()),
    at: null,
    text: editor.view.state.doc.toString(),
  });
}

async function compareWith(row: DraftRow, other: DraftRow) {
  const a = await versionOf(row);
  const b = a && (await versionOf(other));
  if (a && b) compare.open(a, b);
}

async function restore(row: DraftRow) {
  readWhy();
  if (readOnly.value) return tell(readOnly.value);
  if (await drafts.restore(row.n)) editor.goto(editor.view.state.selection.main.head);
}

async function copyId(row: DraftRow) {
  try {
    await navigator.clipboard.writeText(row.id);
    tell(`Copied the full ID of ${draftName(row.n)}.`);
  } catch {
    tell(`Couldn’t copy. The full ID of ${draftName(row.n)} is ${row.id}.`);
  }
}

// Edit note…: a small dialog on the draft.
const noteFor = shallowRef<DraftRow | null>(null);
const noteText = ref('');
const noteDialog = ref<InstanceType<typeof DDialog>>();
const noteInput = ref<HTMLInputElement>();

async function editNote(row: DraftRow) {
  noteFor.value = row;
  noteText.value = row.note;
  await nextTick();
  noteDialog.value?.showModal();
  noteInput.value?.focus();
  noteInput.value?.select();
}

async function saveNote(event: Event) {
  event.preventDefault();
  const row = noteFor.value;
  noteDialog.value?.close();
  if (!row) return;
  try {
    await drafts.setNote(row.n, noteText.value);
    tell(
      noteText.value.trim()
        ? `Changed the note of ${draftName(row.n)}.`
        : `Took the note off ${draftName(row.n)}.`,
    );
  } catch {
    tell('Couldn’t change the note.');
  }
}

function onNoteClose() {
  noteFor.value = null;
}

// Compare with another draft…: a list in the pane of the other drafts, as History's Compare with…
// is (a submenu would be a popover on a phone, growing with every draft). Escape or Cancel goes back.
const picking = shallowRef<DraftRow | null>(null);
const pickList = ref<HTMLElement>();
const choices = computed(() =>
  picking.value ? rows.value.filter((other) => other.n !== picking.value?.n) : [],
);

// Another script's drafts: its picker goes.
watch(rows, (now) => {
  if (picking.value && !now.some((r) => r.key === picking.value?.key)) picking.value = null;
});

async function pickOther(row: DraftRow) {
  picking.value = row;
  await nextTick();
  pickList.value?.querySelector<HTMLElement>('button')?.focus();
}

async function cancelPick() {
  const was = picking.value;
  picking.value = null;
  await nextTick();
  if (was) document.querySelector<HTMLElement>(`[data-draft="${was.n}"] button`)?.focus();
}

function pick(other: DraftRow) {
  const row = picking.value;
  picking.value = null;
  if (row) void compareWith(row, other);
}

function onPickKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  void cancelPick();
}

// ---- The row's More menu ------------------------------------------------------------------------

const menuFor = ref<string | null>(null);
let afterMenu: (() => void) | null = null;
const later = (act: () => void) => () => {
  afterMenu = act;
};
const NO_ITEMS: DropdownMenuItem[][] = [];

function menuItems(row: DraftRow): DropdownMenuItem[][] {
  const others = rows.value.filter((other) => other.n !== row.n);
  return [
    [
      {
        label: 'Compare with another draft…',
        icon: 'i-lucide-git-compare-arrows',
        disabled: others.length === 0,
        onSelect: later(() => void pickOther(row)),
      },
    ],
    [
      { label: 'Copy full ID', icon: 'i-lucide-copy', onSelect: later(() => void copyId(row)) },
      { label: 'Edit note…', icon: 'i-lucide-pencil', onSelect: later(() => void editNote(row)) },
    ],
  ];
}

function onMenuCloseAutoFocus(event: Event) {
  const act = afterMenu;
  afterMenu = null;
  if (!act) return;
  event.preventDefault();
  requestAnimationFrame(act);
}
const MENU_CONTENT = { align: 'end' as const, onCloseAutoFocus: onMenuCloseAutoFocus };

const metaOf = (row: DraftRow) =>
  [draftWhen(row.frozenAt), wordsOf(row.words), row.note].filter(Boolean).join(' · ');
</script>

<template>
  <div class="drafts">
    <DEmpty v-if="notKept" icon="i-lucide-milestone">{{ notKept }}</DEmpty>
    <template v-else>
      <div class="tools">
        <p class="where">{{ KEPT_HERE }}</p>
        <label v-if="rows.length > 0" class="filter">
          <span>Filter</span>
          <input
            v-model="filter"
            type="search"
            autocomplete="off"
            placeholder="Number, ID, or note"
          />
        </label>
      </div>
      <p v-if="readOnly" :id="`${uid}-why`" class="note">{{ readOnly }}</p>
      <div
        v-if="picking"
        ref="pickList"
        role="group"
        :aria-labelledby="`${uid}-pick`"
        class="pick"
        @keydown="onPickKeydown"
      >
        <h3 :id="`${uid}-pick`" class="pick-title">Compare {{ draftName(picking.n) }} with</h3>
        <ul>
          <li v-for="other in choices" :key="other.key">
            <button type="button" class="choice" @click="pick(other)">
              {{ compareLabel(other) }}<template v-if="other.note"> — {{ other.note }}</template>
            </button>
          </li>
        </ul>
        <DButton @click="cancelPick">Cancel</DButton>
      </div>
      <ol v-else class="list" aria-label="Drafts">
        <li class="item now">
          <h3 :id="`${uid}-now`" class="heading">
            {{ draftName(current) }} <span class="now-mark">now</span>
          </h3>
          <p class="marker">{{ markerLine(current, from, rows) }}</p>
          <p class="meta">The draft you’re writing.</p>
          <div class="buttons">
            <DButton variant="primary" @click="drafts.ask()">Start new draft…</DButton>
          </div>
        </li>
        <li
          v-for="row in shown"
          :key="row.key"
          class="item"
          :data-draft="row.n"
        >
          <h3 :id="`${uid}-h-${row.n}`" class="heading">
            {{ draftName(row.n) }} <code class="id">{{ shortId(row.id) }}</code>
          </h3>
          <p class="marker">{{ markerLine(row.n, row.from, rows) }}</p>
          <p class="meta">{{ metaOf(row) }}</p>
          <div class="buttons">
            <button
              type="button"
              class="act"
              :aria-label="`Read ${draftName(row.n)}`"
              @click="drafts.read(row.n)"
            >
              Read
            </button>
            <button
              type="button"
              class="act"
              :aria-label="`Compare ${draftName(row.n)} with now`"
              title="Compare with now"
              @click="compareNow(row)"
            >
              Compare
            </button>
            <button
              type="button"
              class="act"
              :aria-label="`Restore ${draftName(row.n)} as a new draft`"
              :aria-disabled="readOnly ? 'true' : undefined"
              :aria-describedby="readOnly ? `${uid}-why` : undefined"
              title="Restore as a new draft"
              @click="restore(row)"
            >
              Restore
            </button>
            <MenuButton
              :open="menuFor === row.key"
              :items="menuFor === row.key ? menuItems(row) : NO_ITEMS"
              :content="MENU_CONTENT"
              @update:open="(open: boolean) => (menuFor = open ? row.key : null)"
            >
              <button type="button" class="act more" :aria-label="`More for ${draftName(row.n)}`">
                <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
              </button>
            </MenuButton>
          </div>
        </li>
      </ol>
      <DEmpty v-if="!picking && rows.length === 0" icon="i-lucide-milestone">
        No drafts yet. Start new draft keeps the text as it is now as {{ draftName(current) }}, for
        good.
      </DEmpty>
      <DEmpty v-else-if="!picking && shown.length === 0" icon="i-lucide-search">
        No draft matches “{{ filter.trim() }}”.
      </DEmpty>
    </template>
    <DDialog
      ref="noteDialog"
      size="sm"
      aria-labelledby="draft-note-title"
      @close="onNoteClose"
    >
      <form v-if="noteFor" @submit="saveNote">
        <h2 id="draft-note-title" class="d-dialog-title">Note for {{ draftName(noteFor.n) }}</h2>
        <label class="field">
          <span>Note</span>
          <input
            ref="noteInput"
            v-model="noteText"
            type="text"
            autocomplete="off"
            :maxlength="NOTE_MAX"
          />
        </label>
        <div class="d-dialog-footer">
          <DButton @click="noteDialog?.close()">Cancel</DButton>
          <DButton variant="primary" type="submit">Save</DButton>
        </div>
      </form>
    </DDialog>
  </div>
</template>

<style scoped>
.drafts {
  min-height: 100%;
  padding-bottom: 24px;
  background: var(--bg);
}
.tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 16px;
}
.where,
.note {
  margin: 0;
  color: var(--muted);
}
.note {
  padding: 0 16px 8px;
}
.filter {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter input,
.field input {
  min-width: 0;
  min-height: 28px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: var(--r-sm);
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.filter input::placeholder {
  color: var(--muted);
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.field input {
  flex: 1;
}
.list {
  margin: 0 16px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  list-style: none;
  font-variant-numeric: tabular-nums;
}
.pick {
  margin: 0 16px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
}
.pick-title {
  margin: 0 0 6px;
  font-size: 13px;
}
.pick ul {
  margin: 0 0 8px;
  padding: 0;
  list-style: none;
}
.choice {
  width: 100%;
  min-height: 30px;
  padding: 2px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow-wrap: anywhere;
}
.choice:hover {
  background: var(--overlay);
}
.choice:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.item:last-child {
  border-bottom: 0;
}
/* The draft being written stands apart: an accent edge. */
.item.now {
  box-shadow: inset 3px 0 0 var(--accent);
}
.heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.id {
  color: var(--muted);
  font: 500 12px var(--font-mono, ui-monospace, monospace);
}
.now-mark {
  padding: 0 6px;
  border-radius: var(--r-sm);
  background: var(--accent-soft);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
}
.marker {
  margin: 0;
  color: var(--text);
  font-size: 12px;
}
.meta {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.act:hover {
  background: var(--overlay);
}
.act:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.act[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.6;
}
@media (forced-colors: active) {
  .item.now {
    border-left: 3px solid Highlight;
  }
}
</style>
