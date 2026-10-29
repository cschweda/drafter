<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { nowLabel, useCompare, type Version } from '~/compare/use-compare';
import { useEditor } from '~/editor/session';
import { outlineNotice, sayOutline } from '~/outline/notice';
import {
  type HistoryAction,
  type HistoryRow,
  historyDays,
  historyKey,
  historyOpen,
  snapshotFileName,
  snapshotTime,
} from '~/snapshots/history';
import { GONE, historyReadOnly, restoreSnapshot, snapshotNow } from '~/snapshots/restore';
import { snapshotProblem, useSnapshots } from '~/snapshots/use-snapshots';
import { useFiles } from '~/storage/files';
import { useScript } from '~/storage/script';
import {
  deleteSnapshot,
  listSnapshots,
  type SnapshotInfo,
  setSnapshotLabel,
  snapshotText,
} from '~/storage/snapshots';
import { encodeFile, fileBaseName, titleFileOf, titleFor } from '~/storage/text';

// History (Phase 2 design §11.1): the script's snapshots by day, newest first. Take snapshot is at
// the top, with an optional label (Call 13). The list is one listbox with one tab stop, the Notes
// tab's pattern (Call 12): Up and Down move, Enter compares with now, C compares with…, R restores,
// L labels, S saves as a file, Delete deletes (after asking), and the context-menu key or Shift+F10
// opens the row's menu; the row's buttons are a pointer's. Each action is on the snapshot by id,
// read again as it is acted on. In a read-only tab everything is listed, compared, and saved, and
// Restore, Label…, Delete, and Take snapshot say why they are off (Call 25). On a phone it fills
// the screen.

const DIALOG_ID = 'history-dialog';
const dialog = ref<HTMLDialogElement>();
const editor = useEditor();
const script = useScript();
const snapshots = useSnapshots();

/** The snapshots as last listed; null while they are read. */
const rows = shallowRef<SnapshotInfo[] | null>(null);
const listedAt = ref(Date.now());
const days = computed(() => historyDays(rows.value ?? [], listedAt.value));
const items = computed(() => days.value.flatMap((day) => day.rows));
const places = computed(() => new Map(items.value.map((row, i) => [row.id, i])));
const placeOf = (row: HistoryRow) => places.value.get(row.id) ?? -1;

/** Why the edits are off here, or null; Take snapshot also says why none are kept (a sample). */
const why = ref<string | null>(null);
const takeWhy = computed(() => why.value ?? snapshots.notKept.value);
function readWhy() {
  why.value = historyReadOnly();
}
// The guard and the file check change while History is open.
watch(
  () => [script.fileLocked.value, editor.locked.value],
  () => readWhy(),
);

let reading = 0;
async function load() {
  const id = script.project.value?.id;
  const mine = ++reading;
  let listed: SnapshotInfo[] = [];
  try {
    listed = id ? await listSnapshots(id) : [];
  } catch {
    listed = [];
  }
  if (mine !== reading) return;
  listedAt.value = Date.now();
  rows.value = listed;
}

// ---- Opening and closing ----------------------------------------------------------------------

const labelInput = ref<HTMLInputElement>();
const label = ref('');
/** Where focus was when History opened, given back when it closes. */
let opener: HTMLElement | null = null;

watch(historyOpen, async (open) => {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) {
    // A menu's item is never the opener: the menu is closing.
    const active = document.activeElement;
    opener =
      active instanceof HTMLElement && active !== document.body && !active.closest('[role="menu"]')
        ? active
        : null;
    rows.value = null;
    activeId.value = null;
    lastAt = 0;
    label.value = '';
    readWhy();
    el.showModal();
    el.focus();
    await load();
    await nextTick();
    if (!historyOpen.value) return;
    if (open.focusLabel) labelInput.value?.focus();
    else if (items.value.length > 0) await focusRow(0);
  } else if (open && el.open && open.focusLabel) {
    labelInput.value?.focus();
  } else if (!open && el.open) {
    el.close();
  }
});

// A take, a switch of script, or a change elsewhere in this tab: the list is read again.
watch(snapshots.version, () => {
  if (historyOpen.value) void load();
});

function close() {
  dialog.value?.close();
}

/** When Escape last closed a row's menu: that Escape is the menu's, not History's. */
let menuEscapeAt = -Infinity;
function onKeydownCapture(event: KeyboardEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (event.key === 'Escape' && target?.closest('[data-reka-menu-content]')) {
    menuEscapeAt = performance.now();
  }
}

function onCancel() {
  if (performance.now() - menuEscapeAt < 500) return;
  // Escape in Compare with…'s list goes back to the snapshots.
  if (picking.value) return cancelPick();
  historyOpen.value = null;
}

/** Set when focus goes elsewhere on closing (Restore puts it in the script). */
let keepFocus = false;
function onClose() {
  historyOpen.value = null;
  menuFor.value = null;
  picking.value = null;
  if (!keepFocus) {
    if (opener?.isConnected) opener.focus();
    else if (editor.view.dom.offsetParent !== null) editor.view.focus();
  }
  keepFocus = false;
  opener = null;
}

// ---- Focus: one tab stop, the row last focused -----------------------------------------------

/** The row last focused, by id; where it was, for when it is gone. */
const activeId = ref<string | null>(null);
let lastAt = 0;
const current = computed(() => {
  const at = activeId.value === null ? undefined : places.value.get(activeId.value);
  return at ?? Math.min(lastAt, Math.max(items.value.length - 1, 0));
});
const domId = (i: number) => `history-row-${i}`;

function setActive(row: HistoryRow) {
  activeId.value = row.id;
  lastAt = Math.max(placeOf(row), 0);
}

async function focusRow(i: number) {
  const row = items.value[Math.min(Math.max(i, 0), items.value.length - 1)];
  if (row) setActive(row);
  await nextTick();
  const el = document.getElementById(domId(current.value));
  if (el) el.focus();
  else dialog.value?.focus();
}

/** After an action on the row with `id`: that row if it is still there, else the row now where it was. */
async function focusAfter(id: string, was: number) {
  await nextTick();
  await focusRow(places.value.get(id) ?? was);
}

// ---- Actions -----------------------------------------------------------------------------------

const UNREADABLE = 'This snapshot can’t be read. It can only be deleted.';
/** A label or a delete that the browser's storage didn't take. */
const UNCHANGED = 'Couldn’t change the snapshot.';

/** Says `message`, which the dialog's own status line shows too: the page behind is inert. */
const tell = (message: string) => void sayOutline(message);

// Compare (§11.2): History closes and the Compare tab opens on the two, the newer drawn.
const comparing = useCompare();

/** The snapshot as a side of a comparison, or null (and why said) when it can't be read. */
async function versionOf(row: HistoryRow): Promise<Version | null> {
  const text = await snapshotText(row.id);
  if (text === null) {
    tell((await snapshotNow(row.id)) ? UNREADABLE : GONE);
    return null;
  }
  return { label: snapshotTime(row.createdAt), at: row.createdAt, text };
}

/** Now: the editor's text as it is (Call 15). */
const nowVersion = (): Version => ({
  label: nowLabel(Date.now()),
  at: null,
  text: editor.view.state.doc.toString(),
});

function startCompare(a: Version, b: Version) {
  keepFocus = true;
  close();
  comparing.open(a, b);
}

async function compareNow(row: HistoryRow) {
  if (!row.readable) return tell(UNREADABLE);
  const version = await versionOf(row);
  if (version) startCompare(version, nowVersion());
}

// Compare with…: a second list in the dialog, Now and then the other readable snapshots.
const picking = shallowRef<HistoryRow | null>(null);
const choices = computed(() =>
  picking.value ? items.value.filter((r) => r.readable && r.id !== picking.value?.id) : [],
);
const pickList = ref<HTMLElement>();
let pickAt = 0;

async function compareWith(row: HistoryRow) {
  if (!row.readable) return tell(UNREADABLE);
  pickAt = placeOf(row);
  picking.value = row;
  await nextTick();
  pickList.value?.querySelector<HTMLElement>('button')?.focus();
}

function cancelPick() {
  const was = picking.value;
  picking.value = null;
  if (was) void focusAfter(was.id, pickAt);
}

async function pick(other: HistoryRow | null) {
  const row = picking.value;
  if (!row) return;
  const version = await versionOf(row);
  if (!version) return;
  if (other === null) return startCompare(version, nowVersion());
  const second = await versionOf(other);
  if (second) startCompare(version, second);
}

async function restore(row: HistoryRow) {
  if (why.value) return tell(why.value);
  if (!row.readable) return tell(UNREADABLE);
  // History closes first, so what Restore says is heard from the page, and the script has focus.
  const back = opener;
  keepFocus = true;
  close();
  const done = await restoreSnapshot(row.id);
  if (done) editor.goto(editor.view.state.selection.main.head);
  else if (back?.isConnected) back.focus();
  else if (editor.view.dom.offsetParent !== null) editor.view.focus();
}

// Label…: a dialog on the snapshot as it is when it opens.
const labelFor = shallowRef<SnapshotInfo | null>(null);
let labelAt = 0;

async function openLabel(row: HistoryRow) {
  if (why.value) return tell(why.value);
  if (!row.readable) return tell(UNREADABLE);
  labelAt = placeOf(row);
  const fresh = await snapshotNow(row.id);
  if (!fresh) {
    tell(GONE);
    await load();
    return focusRow(labelAt);
  }
  labelFor.value = fresh;
}

async function onLabelSave(typed: string) {
  const was = labelFor.value;
  if (!was) return;
  const when = snapshotTime(was.createdAt);
  try {
    if (!(await snapshotNow(was.id))) {
      tell(GONE);
    } else if (historyReadOnly()) {
      tell(historyReadOnly() as string);
    } else {
      await setSnapshotLabel(was.id, typed === '' ? null : typed);
      tell(
        typed === ''
          ? `Took the label off the snapshot from ${when}.`
          : `Labeled the snapshot from ${when} “${typed}”.`,
      );
    }
  } catch {
    tell(UNCHANGED);
  }
  await load();
}

function onLabelClose() {
  const was = labelFor.value;
  labelFor.value = null;
  if (was) void focusAfter(was.id, labelAt);
}

async function saveAsFile(row: HistoryRow) {
  if (!row.readable) return tell(UNREADABLE);
  const when = snapshotTime(row.createdAt);
  const text = await snapshotText(row.id);
  if (text === null) {
    tell((await snapshotNow(row.id)) ? UNREADABLE : GONE);
    return;
  }
  const project = script.project.value;
  const kind = editor.kind.value;
  const name = snapshotFileName(
    titleFor(kind, text, fileBaseName(titleFileOf(project))),
    row.createdAt,
    kind,
  );
  // The script's own line break and BOM; the file is never the script's (Call 23).
  const data = encodeFile(text, project?.lineBreak ?? '\n', project?.bom ?? false);
  const files = useFiles();
  try {
    if (!files.canSaveInPlace) {
      files.download(name, data, 'text/plain');
      tell(`Downloaded the snapshot from ${when} as ${name}.`);
      return;
    }
    const target = await files.pickToSave(name, kind);
    if (!target) return;
    await files.write(target, data);
    tell(`Saved the snapshot from ${when} as ${target.name}.`);
  } catch {
    tell('Couldn’t save the file.');
  }
}

// Delete asks first: "Delete the snapshot from 10:42?"
const asking = shallowRef<HistoryRow | null>(null);
const askDialog = ref<HTMLDialogElement>();
let askAt = 0;

async function askDelete(row: HistoryRow) {
  if (why.value) return tell(why.value);
  askAt = placeOf(row);
  asking.value = row;
  await nextTick();
  askDialog.value?.showModal();
}

async function confirmDelete() {
  const was = asking.value;
  askDialog.value?.close();
  if (!was) return;
  const when = snapshotTime(was.createdAt);
  try {
    if (!(await snapshotNow(was.id))) tell(GONE);
    else if (historyReadOnly()) tell(historyReadOnly() as string);
    else {
      await deleteSnapshot(was.id);
      tell(`Deleted the snapshot from ${when}.`);
    }
  } catch {
    tell(UNCHANGED);
  }
  await load();
  await focusRow(askAt);
}

function onAskClose() {
  // A dialog's close event comes a moment after it closes. By then it may be open again (Cancel,
  // then Delete again at once), and that event is the earlier close's: the question stays.
  if (askDialog.value?.open) return;
  const was = asking.value;
  asking.value = null;
  // Cancel, or Escape: back to the row.
  if (was && places.value.has(was.id)) void focusAfter(was.id, askAt);
}

// Take snapshot, with its optional label.
const taking = ref(false);
async function take() {
  if (takeWhy.value) return tell(takeWhy.value);
  if (taking.value) return;
  taking.value = true;
  try {
    const named = label.value.trim();
    const result = await snapshots.take(named);
    await load();
    if (result === 'taken') {
      label.value = '';
      tell(named ? `Took a snapshot labeled “${named}”.` : 'Took a snapshot.');
    } else if (result === 'same') {
      const newest = items.value[0];
      // A take for a script that is gone answers 'same' too; then there is no newest to name.
      tell(
        newest
          ? `Nothing has changed since the snapshot from ${snapshotTime(newest.createdAt)}, so no new one was taken.${named ? ' Choose Label… on it to name it.' : ''}`
          : 'Couldn’t take a snapshot: this script isn’t in this browser any more.',
      );
    } else {
      tell(
        snapshots.notKept.value ??
          (snapshotProblem.value ||
            'Couldn’t keep a snapshot in this browser. Your script is safe, and saving still works.'),
      );
    }
  } finally {
    taking.value = false;
  }
}

function onTakeKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  void take();
}

// ---- The row's menu ----------------------------------------------------------------------------

const menuFor = ref<string | null>(null);
const menuGroups = shallowRef<DropdownMenuItem[][]>([]);
let menuRow: HistoryRow | null = null;
let afterMenu: (() => void) | null = null;

function setMenu(row: HistoryRow, open: boolean) {
  if (open) {
    setActive(row);
    menuRow = row;
    menuGroups.value = menuItems(row);
    menuFor.value = row.id;
  } else if (menuFor.value === row.id) menuFor.value = null;
}

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  const row = menuRow;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    else if (menuFor.value === null && row) void focusAfter(row.id, lastAt);
  });
}

const MENU_CONTENT = { align: 'end' as const, onCloseAutoFocus: onMenuCloseAutoFocus };
const NO_ITEMS: DropdownMenuItem[][] = [];

function menuItems(row: HistoryRow): DropdownMenuItem[][] {
  const off = why.value !== null;
  const later = (act: () => void) => () => {
    afterMenu = act;
  };
  const groups: DropdownMenuItem[][] = [];
  if (why.value) groups.push([{ type: 'label', label: why.value }]);
  if (row.readable) {
    groups.push([
      {
        label: 'Compare with now',
        icon: 'i-lucide-git-compare',
        onSelect: later(() => void compareNow(row)),
      },
      {
        label: 'Compare with…',
        icon: 'i-lucide-git-compare-arrows',
        onSelect: later(() => void compareWith(row)),
      },
    ]);
    groups.push([
      {
        label: 'Restore',
        icon: 'i-lucide-history',
        disabled: off,
        onSelect: later(() => void restore(row)),
      },
      {
        label: 'Label…',
        icon: 'i-lucide-tag',
        disabled: off,
        onSelect: later(() => void openLabel(row)),
      },
      {
        label: 'Save as a file',
        icon: 'i-lucide-download',
        onSelect: later(() => void saveAsFile(row)),
      },
    ]);
  }
  groups.push([
    {
      label: 'Delete',
      icon: 'i-lucide-trash-2',
      disabled: off,
      onSelect: later(() => void askDelete(row)),
    },
  ]);
  return groups;
}

// ---- Keys --------------------------------------------------------------------------------------

function run(action: HistoryAction, row: HistoryRow) {
  if (action === 'compare-now') void compareNow(row);
  else if (action === 'compare-with') void compareWith(row);
  else if (action === 'restore') void restore(row);
  else if (action === 'label') void openLabel(row);
  else if (action === 'save') void saveAsFile(row);
  else if (action === 'delete') void askDelete(row);
  else setMenu(row, true);
}

/** Keys on the row drawn for `row`: its actions are on that snapshot, by id. */
function onKeydown(event: KeyboardEvent, row: HistoryRow) {
  if (event.target !== event.currentTarget) return;
  const key = event.key === 'F10' && event.shiftKey ? 'ContextMenu' : event.key;
  const mod = event.ctrlKey || event.metaKey;
  if (event.altKey || mod || (event.shiftKey && key !== 'ContextMenu' && key.length > 1)) return;
  const next = historyKey(items.value.length, placeOf(row), key);
  if (!next) {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) event.preventDefault();
    return;
  }
  event.preventDefault();
  if (next.focus !== undefined) void focusRow(next.focus);
  else if (next.action) run(next.action, row);
}

/** The option's name: its time, what it is, and its change in words. */
const nameOf = (row: HistoryRow) =>
  [snapshotTime(row.createdAt), row.said, row.readable ? row.change : 'can’t be read'].join(', ');
</script>

<template>
  <dialog
    :id="DIALOG_ID"
    ref="dialog"
    class="history"
    tabindex="-1"
    aria-labelledby="history-title"
    @cancel.prevent="onCancel"
    @close="onClose"
    @keydown.capture="onKeydownCapture"
  >
    <template v-if="historyOpen">
      <div class="head">
        <h2 id="history-title">History</h2>
        <button type="button" class="btn" @click="close">Close</button>
      </div>
      <p class="help">
        Snapshots of this script, kept in this browser. They aren’t part of the file.
      </p>
      <p v-if="takeWhy" id="history-why" class="why">{{ takeWhy }}</p>
      <div class="take">
        <label class="field">
          <span>Label</span>
          <input
            ref="labelInput"
            v-model="label"
            type="text"
            autocomplete="off"
            maxlength="200"
            placeholder="Optional"
            :aria-describedby="takeWhy ? 'history-why' : undefined"
            @keydown="onTakeKeydown"
          />
        </label>
        <button
          type="button"
          class="btn primary"
          :aria-disabled="takeWhy ? 'true' : undefined"
          :aria-describedby="takeWhy ? 'history-why' : undefined"
          @click="take"
        >
          Take snapshot
        </button>
      </div>
      <p v-if="rows === null" class="empty">Reading the snapshots…</p>
      <p v-else-if="items.length === 0" class="empty">
        No snapshots yet. One is taken every 10 minutes of writing, and each time you save to a file.
      </p>
      <div
        v-else-if="picking"
        ref="pickList"
        role="group"
        aria-labelledby="history-pick-title"
        class="list pick"
      >
        <h3 id="history-pick-title" class="pick-title">
          Compare the snapshot from {{ snapshotTime(picking.createdAt) }} with
        </h3>
        <ul>
          <li><button type="button" class="choice" @click="pick(null)">Now</button></li>
          <li v-for="other in choices" :key="other.id">
            <button type="button" class="choice" @click="pick(other)">
              {{ snapshotTime(other.createdAt) }}, {{ other.said }}
            </button>
          </li>
        </ul>
        <button type="button" class="btn" @click="cancelPick">Cancel</button>
      </div>
      <div v-else role="listbox" aria-label="Snapshots" class="list">
        <div
          v-for="day in days"
          :key="day.key"
          role="group"
          :aria-label="day.title"
          class="day"
        >
          <div class="day-title" aria-hidden="true">{{ day.title }}</div>
          <div
            v-for="row in day.rows"
            :id="domId(placeOf(row))"
            :key="row.id"
            role="option"
            class="row"
            :class="{ unreadable: !row.readable }"
            :tabindex="placeOf(row) === current ? 0 : -1"
            :aria-selected="placeOf(row) === current ? 'true' : 'false'"
            @keydown="onKeydown($event, row)"
            @focus="setActive(row)"
            @click="setActive(row)"
          >
            <span class="sr-only">{{ nameOf(row) }}</span>
            <div class="drawn" aria-hidden="true">
              <span class="time">{{ snapshotTime(row.createdAt) }}</span>
              <span class="said" :class="{ labeled: !!row.label }">{{ row.said }}</span>
              <span class="words">{{ row.readable ? row.change : 'Can’t be read' }}</span>
            </div>
            <div class="buttons" aria-hidden="true">
              <button
                v-if="row.readable"
                type="button"
                class="act"
                tabindex="-1"
                :aria-disabled="why ? 'true' : undefined"
                :title="why ?? undefined"
                @click.stop="restore(row)"
              >
                Restore
              </button>
              <MenuButton
                :open="menuFor === row.id"
                :items="menuFor === row.id ? menuGroups : NO_ITEMS"
                :content="MENU_CONTENT"
                :portal="`#${DIALOG_ID}`"
                @update:open="(open: boolean) => setMenu(row, open)"
              >
                <button
                  type="button"
                  class="more"
                  tabindex="-1"
                  aria-label="Actions for this snapshot"
                  @click.stop
                >
                  <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
                </button>
              </MenuButton>
            </div>
          </div>
        </div>
      </div>
      <!-- The page behind a modal dialog is inert, so what History's actions say is said here too. -->
      <p class="notice" role="status" aria-live="polite" aria-atomic="true">{{ outlineNotice }}</p>
    </template>
    <dialog
      ref="askDialog"
      class="ask"
      aria-labelledby="history-ask-title"
      @close="onAskClose"
    >
      <template v-if="asking">
        <h2 id="history-ask-title">Delete the snapshot from {{ snapshotTime(asking.createdAt) }}?</h2>
        <p>It can’t be brought back.</p>
        <div class="buttons">
          <button type="button" class="btn" autofocus @click="askDialog?.close()">Cancel</button>
          <button type="button" class="btn primary" @click="confirmDelete">Delete</button>
        </div>
      </template>
    </dialog>
  </dialog>
  <SnapshotLabelDialog :snapshot="labelFor" @save="onLabelSave" @close="onLabelClose" />
</template>

<style scoped>
.history {
  box-sizing: border-box;
  width: min(36rem, calc(100vw - 32px));
  max-height: min(44rem, calc(100dvh - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
}
.history[open] {
  display: flex;
  flex-direction: column;
}
.history:focus-visible {
  outline: none;
}
/* On a phone it fills the screen. */
@media (max-width: 1023.98px) {
  .history {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
    border: 0;
    border-radius: 0;
  }
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
h2 {
  margin: 0;
  font-size: 16px;
}
.help,
.why {
  margin: 4px 0 0;
  color: var(--muted);
}
.take {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
}
.field {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 12rem;
}
.field input {
  flex: 1;
  min-width: 0;
  min-height: 28px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.field input::placeholder {
  color: var(--muted);
}
.empty {
  margin: 0;
  padding: 16px 4px;
  color: var(--muted);
}
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.pick {
  padding: 8px 10px;
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
  min-height: 28px;
  padding: 2px 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.choice:hover {
  background: var(--chrome);
}
.day-title {
  padding: 8px 10px 4px;
  color: var(--heading);
  font-weight: 700;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
  cursor: default;
}
.row:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.row[aria-selected='true'] {
  background: var(--chrome);
}
.drawn {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 2px 10px;
  min-width: 0;
}
.time {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.said {
  overflow-wrap: anywhere;
}
.said.labeled {
  font-weight: 600;
}
.words {
  color: var(--muted);
}
.unreadable .words {
  color: var(--text);
  font-style: italic;
}
.buttons {
  display: flex;
  flex: none;
  align-items: center;
  gap: 2px;
}
.act,
.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.act[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.6;
}
.act:hover,
.more:hover {
  background: var(--chrome);
  color: var(--text);
}
.notice {
  min-height: 1.4em;
  margin: 8px 0 0;
  color: var(--muted);
}
.btn {
  min-height: 28px;
  padding: 0 12px;
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
}
.ask p {
  margin: 0;
  color: var(--muted);
}
.ask .buttons {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
@media (forced-colors: active) {
  .row[aria-selected='true'] {
    outline: 2px solid Highlight;
  }
}
</style>
