<script setup lang="ts">
import type { SceneVersion, VersionRow } from '@drafter/history';
import type { DropdownMenuItem } from '@nuxt/ui';
import { diffModel } from '~/compare/rows';
import { useEditor } from '~/editor/session';
import { type HistoryClient, sceneText, useHistoryClient } from '~/history/client';
import { progressLabel } from '~/history/labels';
import {
  gapRowLabel,
  NOT_NOW,
  sceneHistoryOpen,
  useThisVersion,
  type VersionAction,
  versionKey,
  versionRowLabel,
} from '~/history/scene-history';
import { outlineNotice, sayOutline } from '~/outline/notice';
import { useOutline } from '~/outline/use-outline';
import { useSettings } from '~/settings/settings';
import { snapshotTime } from '~/snapshots/history';
import { reasonLabel } from '~/snapshots/labels';
import { useSnapshots } from '~/snapshots/use-snapshots';
import { useScript } from '~/storage/script';
import { listSnapshots, type SnapshotInfo } from '~/storage/snapshots';

// History of this scene (version-history design §6.1, Calls 28 to 30): a dialog, as History is, that
// fills the screen on a phone. On the left, the scene's versions newest first, one row per distinct
// version (a run of snapshots that held the same text is one row, "Unchanged in 14 versions"), and a
// row for a run of snapshots without it ("Not in 3 versions"); the history worker follows the scene
// from version to version, so a renamed heading or a cut-and-restored scene keeps its history. On the
// right, the selected version's diff (Compare's Changes view, one group, unified or side by side as
// Settings says) with now or with the version before; Use this version, which keeps a "Before
// restoring a scene" snapshot and puts the version back as one undo; and Copy text. The list is one
// listbox with one Tab stop, History's pattern: Up, Down, Home, End; Enter compares with now; U uses
// the version; the context-menu key or Shift+F10 opens its menu. In a read-only tab, or for a deleted
// scene (whose action is Put back), Use this version says why it is off.

const DIALOG_ID = 'scene-history-dialog';
const dialog = ref<HTMLDialogElement>();
const editor = useEditor();
const outline = useOutline();
const script = useScript();
const snapshots = useSnapshots();
const { settings } = useSettings();

/** The versions as the worker last listed them; null before the first list. */
const rows = shallowRef<VersionRow[] | null>(null);
/** The hash of the scene's version followed: the scene now's, or a deleted scene's slot's. */
const start = ref<string | null>(null);
const done = ref(false);
const failed = ref<string | null>(null);
const progress = ref<{ read: number; total: number } | null>(null);
/** The snapshots as listed, by id: each row's reason or label. */
const infos = shallowRef<ReadonlyMap<string, SnapshotInfo>>(new Map());
const listedAt = ref(Date.now());

const target = computed(() => sceneHistoryOpen.value);
/** The scene was deleted: there is no "now" to compare with or to replace. */
const deletedScene = computed(() => !!target.value && 'snapshot' in target.value);
const notKept = computed(() => snapshots.notKept.value);
/** Why Use this version is off: a read-only tab, or a deleted scene. */
const useWhy = computed(() => (deletedScene.value ? NOT_NOW : outline.readOnly.value));

const items = computed(() => rows.value ?? []);
const isVersion = (row: VersionRow): row is SceneVersion => !('gap' in row);

/** Each row's words, made once per listing: the change is against the next older version. */
const labels = computed(() => {
  const list = items.value;
  return list.map((row, i) => {
    if (!isVersion(row)) return { name: gapRowLabel(row.snapshots), row: null };
    const older = list.slice(i + 1).find(isVersion);
    const info = infos.value.get(row.snapshots[0] ?? '');
    const said = info ? reasonLabel(info) : '';
    const label = versionRowLabel(row, said, older ? older.words : null, listedAt.value);
    const renamed = target.value && row.heading !== target.value.heading ? row.heading : null;
    const same = !deletedScene.value && row.hash === start.value;
    const name = [
      label.when,
      label.said,
      label.change,
      label.held,
      renamed,
      same ? 'Same as now' : null,
    ]
      .filter(Boolean)
      .join(', ');
    return { name, row: { ...label, renamed, same } };
  });
});

// ---- Reading the versions ----------------------------------------------------------------------

let client: HistoryClient | null = null;
/** The scan asked last; a reply to an older one is dropped. */
let asked = 0;
/** The writer moved in the list: the first selection no longer follows the listing. */
let chosen = false;

function stop() {
  client?.release();
  client = null;
}

async function listInfo(projectId: string) {
  try {
    const found = await listSnapshots(projectId);
    if (script.project.value?.id === projectId) {
      infos.value = new Map(found.map((s) => [s.id, s]));
      listedAt.value = Date.now();
    }
  } catch {
    infos.value = new Map();
  }
}

function scan() {
  const open = target.value;
  const projectId = script.project.value?.id ?? null;
  rows.value = null;
  start.value = null;
  done.value = false;
  failed.value = null;
  progress.value = null;
  if (!open || projectId === null || notKept.value) {
    done.value = true;
    return;
  }
  void listInfo(projectId);
  const mine = ++asked;
  client ??= useHistoryClient();
  const scene =
    'snapshot' in open
      ? { snapshot: open.snapshot, slot: open.slot }
      : { from: open.from, to: open.to };
  client.request(
    { kind: 'versions', projectId, now: editor.view.state.doc.toString(), scene },
    (reply) => {
      if (mine !== asked || !sceneHistoryOpen.value) return;
      if (reply.kind === 'progress') progress.value = { read: reply.read, total: reply.total };
      else if (reply.kind === 'versions') {
        rows.value = reply.rows;
        start.value = reply.start;
        if (reply.done) done.value = true;
        void selectFirst();
      } else if (reply.kind === 'error') {
        failed.value = reply.message;
        done.value = true;
      }
    },
  );
}

// ---- Opening and closing ----------------------------------------------------------------------

/** Where focus was when the dialog opened, given back when it closes. */
let opener: HTMLElement | null = null;
/** Set when focus goes elsewhere on closing (Use this version puts it in the script). */
let keepFocus = false;

watch(sceneHistoryOpen, async (open, was) => {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) {
    const active = document.activeElement;
    opener =
      active instanceof HTMLElement && active !== document.body && !active.closest('[role="menu"]')
        ? active
        : null;
    reset();
    el.showModal();
    el.focus();
    scan();
  } else if (open && el.open && open !== was) {
    reset();
    scan();
  } else if (!open && el.open) {
    el.close();
  }
});

// A take or a delete elsewhere in this tab: the versions are read again.
watch(snapshots.version, () => {
  if (sceneHistoryOpen.value) scan();
});

/** Bumped at each opening, so the diff is made again with the scene as it is now. */
const opening = ref(0);

function reset() {
  opening.value++;
  shown.value = null;
  activeAt.value = null;
  chosen = false;
  mode.value = 'now';
  texts.value = new Map();
  menuFor.value = null;
}

function close() {
  dialog.value?.close();
}

/** When Escape last closed a row's menu: that Escape is the menu's, not the dialog's. */
let menuEscapeAt = -Infinity;
function onKeydownCapture(event: KeyboardEvent) {
  const el = event.target instanceof Element ? event.target : null;
  if (event.key === 'Escape' && el?.closest('[data-reka-menu-content]')) {
    menuEscapeAt = performance.now();
  }
}

function onCancel() {
  if (performance.now() - menuEscapeAt < 500) return;
  sceneHistoryOpen.value = null;
}

function onClose() {
  sceneHistoryOpen.value = null;
  asked++;
  stop();
  menuFor.value = null;
  if (!keepFocus) {
    if (opener?.isConnected) opener.focus();
    else if (editor.view.dom.offsetParent !== null) editor.view.focus();
  }
  keepFocus = false;
  opener = null;
}

// ---- Focus and selection: one Tab stop, the selected row ---------------------------------------

/** The selected row; null until the listing chooses one. */
const activeAt = ref<number | null>(null);
const current = computed(() => Math.min(activeAt.value ?? 0, Math.max(items.value.length - 1, 0)));
const domId = (i: number) => `scene-history-row-${i}`;
const listEl = ref<HTMLElement>();

async function focusRow(i: number) {
  if (items.value.length === 0) return;
  activeAt.value = Math.min(Math.max(i, 0), items.value.length - 1);
  await nextTick();
  document.getElementById(domId(current.value))?.focus();
}

/** Opens on the newest version that differs from now (§6.1), until the writer moves. */
async function selectFirst() {
  if (chosen) return;
  const list = items.value;
  let at = list.findIndex(
    (row) => isVersion(row) && (deletedScene.value || row.hash !== start.value),
  );
  // None differs yet: the older versions may still be read; once all are, the newest.
  if (at < 0 && done.value) at = list.findIndex(isVersion);
  if (at < 0) return;
  const had = activeAt.value;
  activeAt.value = at;
  // Focus goes to the row: the first time, or when it was on another row of the list.
  const inList = listEl.value?.contains(document.activeElement) ?? false;
  if (had === null || (inList && had !== at)) {
    await nextTick();
    if (sceneHistoryOpen.value && !chosen) document.getElementById(domId(at))?.focus();
  }
}

/** The writer chose row `i` (a click, a key, its menu): the listing no longer moves the selection. */
function choose(i: number) {
  chosen = true;
  activeAt.value = i;
}

/** Focus on a row selects it; the first selection's own focus doesn't count as the writer's. */
function onRowFocus(i: number) {
  activeAt.value = i;
}

// ---- The diff ---------------------------------------------------------------------------------

/** Compare the selected version with now, or with the version before it. */
const mode = ref<'now' | 'before'>('now');
const selected = computed(() => items.value[current.value] ?? null);
/** Versions' texts as read, by snapshot and span; null when it can't be read. */
const texts = shallowRef(new Map<string, string | null>());
const textKey = (v: SceneVersion) => `${v.snapshots[0]}|${v.slot.from}|${v.slot.to}`;

async function textOf(version: SceneVersion): Promise<string | null> {
  const key = textKey(version);
  if (texts.value.has(key)) return texts.value.get(key) ?? null;
  const read = await sceneText(version.snapshots[0] ?? '', version.slot);
  const next = new Map(texts.value);
  next.set(key, read);
  texts.value = next;
  return read;
}

/** The scene's text now, as the dialog opened on it; '' for a deleted scene. */
function nowText(): string {
  const open = target.value;
  if (!open || 'snapshot' in open) return '';
  return editor.view.state.doc.sliceString(open.from, open.to);
}

const olderOf = (i: number) => items.value.slice(i + 1).find(isVersion) ?? null;

/** What the diff shows: the two texts, or why there is none. */
const shown = shallowRef<Shown>(null);

/**
 * What the diff depends on, as a key: the selected version, the mode, and for the version before,
 * that version. The rows come again as the worker reads on, so their objects change; this doesn't.
 */
const diffKey = computed(() => {
  const row = selected.value;
  if (!row) return '';
  if (!isVersion(row)) return `${opening.value} gap ${current.value}`;
  const older = mode.value === 'before' ? olderOf(current.value) : null;
  return `${opening.value} ${textKey(row)} ${mode.value} ${older ? textKey(older) : ''}`;
});

type Shown =
  | { kind: 'diff'; older: string; newer: string; before: string; after: string }
  | { kind: 'note'; text: string }
  | null;

/** What the diff shows for the selected row and mode, read from the versions' texts. */
async function diffOf(): Promise<Shown> {
  const row = selected.value;
  if (!row) return null;
  if (!isVersion(row)) return { kind: 'note', text: 'The scene wasn’t in these versions.' };
  const at = current.value;
  const text = await textOf(row);
  if (text === null) return { kind: 'note', text: 'This version can’t be read.' };
  const when = snapshotTime(row.newestAt);
  if (mode.value === 'now')
    return { kind: 'diff', older: text, newer: nowText(), before: when, after: 'Now' };
  const older = olderOf(at);
  if (!older) return { kind: 'note', text: 'This is the oldest version.' };
  const before = await textOf(older);
  if (before === null) return { kind: 'note', text: 'The version before can’t be read.' };
  return {
    kind: 'diff',
    older: before,
    newer: text,
    before: snapshotTime(older.newestAt),
    after: when,
  };
}

watch(
  diffKey,
  async (key) => {
    const made = await diffOf();
    // Another row or mode was chosen while the texts were read.
    if (diffKey.value === key) shown.value = made;
  },
  { immediate: true },
);

const model = computed(() => {
  const s = shown.value;
  return s?.kind === 'diff' ? diffModel(s.older, s.newer, 'fountain') : null;
});
const diffLabels = computed(() => {
  const s = shown.value;
  return s?.kind === 'diff' ? { before: s.before, after: s.after } : { before: '', after: '' };
});

// Side by side only where there is room for it, as Compare.
const wide = ref(false);
let media: MediaQueryList | undefined;
const onMedia = () => (wide.value = !!media?.matches);
onMounted(() => {
  media = window.matchMedia('(min-width: 1024px)');
  onMedia();
  media.addEventListener('change', onMedia);
});
onBeforeUnmount(() => media?.removeEventListener('change', onMedia));
const layout = computed(() => (wide.value ? settings.value.diffLayout : 'unified'));

// ---- Actions ----------------------------------------------------------------------------------

/** Says `message`, which the dialog's status line shows too: the page behind is inert. */
const tell = (message: string) => void sayOutline(message);

function compareWith(which: 'now' | 'before') {
  mode.value = which;
}

async function use(row: VersionRow | null) {
  if (!row || !isVersion(row)) return;
  if (useWhy.value) return tell(useWhy.value);
  const on = sceneHistoryOpen.value;
  if (!on) return;
  // The dialog closes first, so what Use this version says is heard from the page.
  const back = opener;
  keepFocus = true;
  close();
  const done = await useThisVersion(row, on);
  if (done) editor.goto(editor.view.state.selection.main.head);
  else if (back?.isConnected) back.focus();
  else if (editor.view.dom.offsetParent !== null) editor.view.focus();
}

async function copyText(row: VersionRow | null) {
  if (!row || !isVersion(row)) return;
  const text = await textOf(row);
  if (text === null) return tell('This version can’t be read.');
  try {
    await navigator.clipboard.writeText(text);
    tell(`Copied the text of ${row.heading || 'the scene'} from ${snapshotTime(row.newestAt)}.`);
  } catch {
    tell('Couldn’t copy the text.');
  }
}

/** Go to scene, from the diff's group: the dialog closes on the scene in the script. */
function goToScene() {
  const open = target.value;
  if (!open || 'snapshot' in open) return tell('That scene isn’t in the script now.');
  keepFocus = true;
  close();
  editor.goto(open.from);
}

// ---- The row's menu ---------------------------------------------------------------------------

const menuFor = ref<number | null>(null);
const NO_ITEMS: DropdownMenuItem[][] = [];
let afterMenu: (() => void) | null = null;

/** Where the menu's anchor sits: over the row's right end, in the dialog's body. */
const menuPlace = shallowRef({ left: '0px', top: '0px', width: '0px', height: '0px' });

function setMenu(i: number, open: boolean) {
  if (open) {
    choose(i);
    const row = document.getElementById(domId(i));
    const body = row?.closest('.body');
    if (row && body) {
      const box = body.getBoundingClientRect();
      const at = row.getBoundingClientRect();
      menuPlace.value = {
        left: `${at.right - box.left - 24}px`,
        top: `${at.top - box.top}px`,
        width: '24px',
        height: `${at.height}px`,
      };
    }
    menuFor.value = i;
  } else if (menuFor.value === i) menuFor.value = null;
}

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    if (sceneHistoryOpen.value && menuFor.value === null) void focusRow(current.value);
  });
}
const MENU_CONTENT = { align: 'end' as const, onCloseAutoFocus: onMenuCloseAutoFocus };

function menuItems(i: number): DropdownMenuItem[][] {
  const row = items.value[i];
  if (!row || !isVersion(row)) return NO_ITEMS;
  const later = (act: () => void) => () => {
    afterMenu = act;
  };
  const groups: DropdownMenuItem[][] = [];
  if (useWhy.value) groups.push([{ type: 'label', label: useWhy.value }]);
  groups.push([
    {
      label: 'Compare with now',
      icon: 'i-lucide-git-compare',
      onSelect: later(() => compareWith('now')),
    },
    {
      label: 'Compare with the version before',
      icon: 'i-lucide-git-compare-arrows',
      onSelect: later(() => compareWith('before')),
    },
  ]);
  groups.push([
    {
      label: 'Use this version',
      icon: 'i-lucide-history',
      disabled: useWhy.value !== null,
      onSelect: later(() => void use(row)),
    },
    { label: 'Copy text', icon: 'i-lucide-copy', onSelect: later(() => void copyText(row)) },
  ]);
  return groups;
}

// ---- Keys -------------------------------------------------------------------------------------

function run(action: VersionAction, i: number) {
  const row = items.value[i] ?? null;
  if (action === 'compare') compareWith('now');
  else if (action === 'use') void use(row);
  else if (row && isVersion(row)) setMenu(i, true);
}

function onKeydown(event: KeyboardEvent, i: number) {
  if (event.target !== event.currentTarget) return;
  const key = event.key === 'F10' && event.shiftKey ? 'ContextMenu' : event.key;
  const mod = event.ctrlKey || event.metaKey;
  if (event.altKey || mod || (event.shiftKey && key !== 'ContextMenu' && key.length > 1)) return;
  const next = versionKey(items.value.length, i, key);
  if (!next) {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) event.preventDefault();
    return;
  }
  event.preventDefault();
  if (next.focus !== undefined) {
    chosen = true;
    void focusRow(next.focus);
  } else if (next.action) run(next.action, i);
}

const heading = computed(() => target.value?.heading || 'Untitled scene');
const reading = computed(() => !done.value && rows.value === null);
</script>

<template>
  <dialog
    :id="DIALOG_ID"
    ref="dialog"
    class="scene-history"
    tabindex="-1"
    aria-labelledby="scene-history-title"
    aria-describedby="scene-history-heading"
    @cancel.prevent="onCancel"
    @close="onClose"
    @keydown.capture="onKeydownCapture"
  >
    <template v-if="sceneHistoryOpen">
      <div class="head">
        <div class="titles">
          <h2 id="scene-history-title">History of this scene</h2>
          <p id="scene-history-heading" class="scene">{{ heading }}</p>
        </div>
        <button type="button" class="btn" @click="close">Close</button>
      </div>
      <p v-if="notKept" class="empty">{{ notKept }}</p>
      <p v-else-if="failed" class="empty">Couldn’t read the versions: {{ failed }}</p>
      <p v-else-if="reading" class="empty">
        {{ progress ? progressLabel(progress.read, progress.total) : 'Reading versions…' }}
      </p>
      <p v-else-if="done && items.length === 0" class="empty">
        Nothing to compare with yet: save, or take a snapshot.
      </p>
      <div v-else class="body">
        <div ref="listEl" role="listbox" aria-label="Versions" class="list">
          <div
            v-for="(row, i) in items"
            :id="domId(i)"
            :key="i"
            role="option"
            class="row"
            :class="{ gap: !isVersion(row) }"
            :tabindex="i === current ? 0 : -1"
            :aria-selected="i === current ? 'true' : 'false'"
            @keydown="onKeydown($event, i)"
            @focus="onRowFocus(i)"
            @click="choose(i)"
            @contextmenu.prevent="setMenu(i, true)"
          >
            <span class="sr-only">{{ labels[i]?.name }}</span>
            <div class="drawn" aria-hidden="true">
              <template v-if="labels[i]?.row">
                <span class="when">{{ labels[i]?.row?.when }}</span>
                <span v-if="labels[i]?.row?.said" class="said">{{ labels[i]?.row?.said }}</span>
                <span class="words">{{ labels[i]?.row?.change }}</span>
                <span v-if="labels[i]?.row?.held" class="held">{{ labels[i]?.row?.held }}</span>
                <span v-if="labels[i]?.row?.renamed" class="renamed">{{
                  labels[i]?.row?.renamed
                }}</span>
                <span v-if="labels[i]?.row?.same" class="same">Same as now</span>
              </template>
              <span v-else class="missing">{{ labels[i]?.name }}</span>
            </div>
          </div>
          <p v-if="!done" class="more-coming" aria-hidden="true">Reading older versions…</p>
        </div>
        <!-- One menu for every row, anchored over the row it is for: never focused. -->
        <MenuButton
          :open="menuFor !== null"
          :items="menuFor === null ? NO_ITEMS : menuItems(menuFor)"
          :content="MENU_CONTENT"
          :portal="`#${DIALOG_ID}`"
          @update:open="(open: boolean) => menuFor !== null && setMenu(menuFor, open)"
        >
          <button
            type="button"
            class="menu-anchor"
            tabindex="-1"
            aria-hidden="true"
            :style="menuPlace"
          >
            <span class="sr-only">Actions for this version</span>
          </button>
        </MenuButton>
        <section class="side" aria-label="Changes in this version">
          <div class="tools">
            <div role="group" aria-label="Compare with" class="segmented">
              <button
                type="button"
                :aria-pressed="mode === 'now' ? 'true' : 'false'"
                @click="compareWith('now')"
              >
                Now
              </button>
              <button
                type="button"
                :aria-pressed="mode === 'before' ? 'true' : 'false'"
                @click="compareWith('before')"
              >
                Version before
              </button>
            </div>
            <span class="spacer" />
            <button
              type="button"
              class="btn"
              :aria-disabled="useWhy || !selected || !isVersion(selected) ? 'true' : undefined"
              :aria-describedby="useWhy ? 'scene-history-why' : undefined"
              @click="use(selected)"
            >
              Use this version
            </button>
            <button
              type="button"
              class="btn"
              :aria-disabled="!selected || !isVersion(selected) ? 'true' : undefined"
              @click="copyText(selected)"
            >
              Copy text
            </button>
          </div>
          <p v-if="useWhy" id="scene-history-why" class="why">{{ useWhy }}</p>
          <div class="diff">
            <DiffView
              v-if="model"
              :model="model"
              kind="fountain"
              :layout="layout"
              :labels="diffLabels"
              @go="goToScene"
            />
            <p v-else-if="shown?.kind === 'note'" class="empty">{{ shown.text }}</p>
          </div>
        </section>
      </div>
      <!-- The page behind a modal dialog is inert, so what the dialog's actions say is said here too. -->
      <p class="notice" role="status" aria-live="polite" aria-atomic="true">{{ outlineNotice }}</p>
    </template>
  </dialog>
</template>

<style scoped>
.scene-history {
  box-sizing: border-box;
  width: min(72rem, calc(100vw - 32px));
  height: min(48rem, calc(100dvh - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
}
.scene-history[open] {
  display: flex;
  flex-direction: column;
}
.scene-history:focus-visible {
  outline: none;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.titles {
  min-width: 0;
}
h2 {
  margin: 0;
  font-size: 16px;
}
.scene {
  margin: 2px 0 0;
  font: 700 13px/1.4 var(--font-mono, monospace);
  overflow-wrap: anywhere;
}
.empty {
  margin: 0;
  padding: 16px 4px;
  color: var(--muted);
}
.why {
  margin: 0 0 6px;
  color: var(--muted);
}
.body {
  position: relative;
  display: grid;
  flex: 1;
  grid-template-columns: minmax(14rem, 20rem) minmax(0, 1fr);
  gap: 12px;
  min-height: 0;
  margin-top: 10px;
}
.list {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
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
.when {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.said,
.renamed {
  overflow-wrap: anywhere;
}
.renamed {
  font-family: var(--font-mono, monospace);
}
.words,
.held,
.missing {
  color: var(--muted);
}
.same {
  font-style: italic;
}
.more-coming {
  margin: 0;
  padding: 6px 10px;
  color: var(--muted);
}
.menu-anchor {
  position: absolute;
  padding: 0;
  border: 0;
  background: none;
  opacity: 0;
  pointer-events: none;
}
.side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.spacer {
  flex: 1;
}
.segmented {
  display: inline-flex;
  border: 1px solid var(--line);
  border-radius: 6px;
  overflow: hidden;
}
.segmented button {
  min-height: 28px;
  padding: 0 10px;
  border: 0;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.segmented button + button {
  border-left: 1px solid var(--line);
}
.segmented button[aria-pressed='true'] {
  background: var(--tab-on);
  box-shadow: inset 0 -2px 0 var(--heading);
}
.diff {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px;
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
.btn[aria-disabled='true'] {
  opacity: 0.6;
  cursor: not-allowed;
}
/* On a phone it fills the screen: the list over the diff. */
@media (max-width: 1023.98px) {
  .scene-history {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
    border: 0;
    border-radius: 0;
  }
  .body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(6rem, 35%) minmax(0, 1fr);
  }
}
@media (forced-colors: active) {
  .row[aria-selected='true'],
  .segmented button[aria-pressed='true'] {
    outline: 2px solid Highlight;
  }
}
</style>
