<script setup lang="ts">
import { type DeletedScene, headingKey } from '@drafter/history';
import type { DropdownMenuItem } from '@nuxt/ui';
import { nowLabel, useCompare } from '~/compare/use-compare';
import { useEditor } from '~/editor/session';
import { sceneText } from '~/history/client';
import { useDeleted } from '~/history/deleted';
import {
  countLabel,
  deletedKey,
  lastInLabel,
  progressLabel,
  versionsLabel,
} from '~/history/labels';
import { putBack } from '~/history/put-back';
import { sayOutline } from '~/outline/notice';
import { useOutline } from '~/outline/use-outline';
import { snapshotTime } from '~/snapshots/history';
import { snapshotText } from '~/storage/snapshots';

// The Deleted scenes tab (version-history design §3.3, §10, §12): every scene in some version but
// in no scene now, newest deleted first, with a Filter. Each entry is its heading (a level 3
// heading), when it was last in a version, how many held it, and its first lines; Show text shows
// its whole text from that version, Put back puts it back (one undo), and its menu compares that
// version with now or copies the text. The list is one Tab stop, History's pattern (Call 12): Up,
// Down, Home and End move; Enter shows the text, P puts it back, and the context-menu key or
// Shift+F10 opens the menu. In a read-only tab Put back says why it is off.

const deleted = useDeleted();
const { shown, rows, progress, done, failed, filter, why, snapshots, pendingFind } = deleted;
const outline = useOutline();
const editor = useEditor();
const compare = useCompare();

const uid = useId();
const domId = (i: number) => `${uid}-entry-${i}`;
const listedAt = ref(Date.now());
watch(rows, () => (listedAt.value = Date.now()));

// ---- Focus: one tab stop, the entry last focused ---------------------------------------------

const activeKey = ref<string | null>(null);
let lastAt = 0;
const places = computed(() => new Map(shown.value.map((row, i) => [row.key, i])));
const current = computed(() => {
  const at = activeKey.value === null ? undefined : places.value.get(activeKey.value);
  return at ?? Math.min(lastAt, Math.max(shown.value.length - 1, 0));
});
const list = ref<HTMLElement>();

function setActive(row: DeletedScene) {
  activeKey.value = row.key;
  lastAt = Math.max(places.value.get(row.key) ?? 0, 0);
}

async function focusRow(i: number) {
  const row = shown.value[Math.min(Math.max(i, 0), shown.value.length - 1)];
  if (!row) return;
  setActive(row);
  await nextTick();
  document.getElementById(domId(current.value))?.focus();
}

// The list changed (a scan, or the filter): focus that was on an entry that is gone goes to the
// entry now in its place.
watch(shown, async () => {
  const had = list.value?.contains(document.activeElement) ?? false;
  if (activeKey.value !== null && !places.value.has(activeKey.value)) activeKey.value = null;
  if (!had) return;
  await nextTick();
  if (list.value?.contains(document.activeElement)) return;
  // The last entry gone (put back): focus on the panel, which says the list is empty.
  if (shown.value.length === 0) document.getElementById('panel-deleted')?.focus();
  else await focusRow(current.value);
});

// Find in Deleted scenes (from a Compare group): the entry gets focus once it is listed.
watch(
  [shown, pendingFind],
  async ([now, key]) => {
    if (key === null) return;
    const at = now.findIndex((r) => headingKey(r.newest.print.heading) === key);
    if (at < 0) return;
    pendingFind.value = null;
    // The tab may still be coming into view (it was behind another in its pane): a few frames.
    for (let tries = 0; tries < 5; tries++) {
      await focusRow(at);
      if (document.activeElement === document.getElementById(domId(at))) break;
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    document.getElementById(domId(at))?.scrollIntoView({ block: 'nearest' });
  },
  { flush: 'post' },
);

// ---- Show text --------------------------------------------------------------------------------

/** Each entry's text, once Show text has read it: null when it can't be read. */
const texts = shallowRef(new Map<string, string | null>());
const opened = ref(new Set<string>());

async function textOf(row: DeletedScene): Promise<string | null> {
  if (texts.value.has(row.key)) return texts.value.get(row.key) ?? null;
  const text = await sceneText(row.newest.snapshot, row.newest.slot);
  const next = new Map(texts.value);
  next.set(row.key, text);
  texts.value = next;
  return text;
}

/** Opens at once, saying "Reading…" until the text is read; or closes. */
async function toggleText(row: DeletedScene) {
  const next = new Set(opened.value);
  if (next.has(row.key)) {
    next.delete(row.key);
    opened.value = next;
    return;
  }
  next.add(row.key);
  opened.value = next;
  await textOf(row);
}

// ---- Put back ---------------------------------------------------------------------------------

const readOnly = outline.readOnly;
const busy = ref(false);

async function onPutBack(row: DeletedScene) {
  if (readOnly.value) return void sayOutline(readOnly.value);
  if (busy.value) return;
  busy.value = true;
  const at = places.value.get(row.key) ?? 0;
  try {
    // Focus stays in the list, on the next entry, so several can be put back in turn; this one
    // leaves the list when it is next listed.
    if (await putBack(row)) {
      const next = shown.value[at + 1] ?? shown.value[at - 1];
      // It leaves the list now, so it can't be put back twice.
      deleted.putBackDone(row.key);
      if (next) await focusRow(places.value.get(next.key) ?? 0);
    }
  } finally {
    busy.value = false;
  }
}

// ---- The menu: Compare that version with now, Copy text ---------------------------------------

const menuFor = ref<string | null>(null);
const NO_ITEMS: DropdownMenuItem[][] = [];
let afterMenu: (() => void) | null = null;

async function compareWithNow(row: DeletedScene) {
  const text = await snapshotText(row.newest.snapshot);
  if (text === null)
    return void sayOutline(`That version of ${row.newest.print.heading} can’t be read.`);
  compare.openAt(
    { label: snapshotTime(row.newest.at), at: row.newest.at, text },
    { label: nowLabel(Date.now()), at: null, text: editor.view.state.doc.toString() },
    row.newest.print.heading,
  );
}

async function copyText(row: DeletedScene) {
  const text = await textOf(row);
  if (text === null)
    return void sayOutline(`That version of ${row.newest.print.heading} can’t be read.`);
  try {
    await navigator.clipboard.writeText(text);
    void sayOutline(`Copied the text of ${row.newest.print.heading}.`);
  } catch {
    void sayOutline('Couldn’t copy the text.');
  }
}

function menuItems(row: DeletedScene): DropdownMenuItem[][] {
  const later = (act: () => void) => () => {
    afterMenu = act;
  };
  return [
    [
      {
        label: 'Compare that version with now',
        icon: 'i-lucide-git-compare',
        onSelect: later(() => void compareWithNow(row)),
      },
      { label: 'Copy text', icon: 'i-lucide-copy', onSelect: later(() => void copyText(row)) },
    ],
  ];
}

function setMenu(row: DeletedScene, open: boolean) {
  if (open) {
    setActive(row);
    menuFor.value = row.key;
  } else if (menuFor.value === row.key) menuFor.value = null;
}

function onMenuCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = afterMenu;
  afterMenu = null;
  requestAnimationFrame(() => {
    if (act) act();
    else void focusRow(current.value);
  });
}
const MENU_CONTENT = { align: 'end' as const, onCloseAutoFocus: onMenuCloseAutoFocus };

// ---- Keys -------------------------------------------------------------------------------------

function onKeydown(event: KeyboardEvent, row: DeletedScene) {
  if (event.target !== event.currentTarget) return;
  const key = event.key === 'F10' && event.shiftKey ? 'ContextMenu' : event.key;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.shiftKey && key !== 'ContextMenu' && key.length > 1) return;
  const next = deletedKey(shown.value.length, places.value.get(row.key) ?? 0, key);
  if (!next) {
    if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) event.preventDefault();
    return;
  }
  event.preventDefault();
  if (next.focus !== undefined) void focusRow(next.focus);
  else if (next.action === 'show-text') void toggleText(row);
  else if (next.action === 'put-back') void onPutBack(row);
  else setMenu(row, true);
}

// ---- What the tab says ------------------------------------------------------------------------

/**
 * Said politely at each quarter of the first reading, and when the count is known or changes. A
 * reading again after typing, which is quick and mostly says the same, is said only if the count
 * changed, so writing in the Source isn't talked over.
 */
const status = ref('');
let quarter = -1;
/** The first reading (of this opening, or this script) is done. */
let settled = false;
let saidCount = -1;
watch(progress, (p) => {
  // A new opening or another script starts with no progress.
  if (!p) {
    settled = false;
    quarter = -1;
    saidCount = -1;
    return;
  }
  if (settled || p.total === 0) return;
  const q = Math.floor((p.read / p.total) * 4);
  if (q !== quarter && q < 4) {
    quarter = q;
    status.value = progressLabel(p.read, p.total);
  }
});
watch(done, (finished) => {
  if (!finished) return;
  settled = true;
  const n = rows.value.length;
  if (n === saidCount) return;
  saidCount = n;
  status.value = n === 0 ? 'No deleted scenes.' : `${countLabel(n)}.`;
});

/** "Last in today, 10:42 AM (Saved). In 3 versions, from 21 October." */
const metaOf = (row: DeletedScene) =>
  `${lastInLabel(row, snapshots.value.get(row.newest.snapshot), listedAt.value)}. ${versionsLabel(row, listedAt.value)}.`;

const nameOf = (row: DeletedScene) => row.newest.print.heading || 'Untitled scene';
const headingId = (i: number) => `${domId(i)}-heading`;
const metaId = (i: number) => `${domId(i)}-meta`;
const textId = (i: number) => `${domId(i)}-text`;
const whyId = `${uid}-why`;
</script>

<template>
  <div class="deleted">
    <p v-if="why" class="empty">{{ why }}</p>
    <template v-else>
      <div class="tools" data-pane-bar>
        <label class="filter">
          <span>Filter</span>
          <input
            v-model="filter"
            type="search"
            autocomplete="off"
            placeholder="Heading or text"
          />
        </label>
      </div>
      <p v-if="readOnly" :id="whyId" class="note">{{ readOnly }}</p>
      <p v-if="progress && progress.unreadable > 0" class="note">
        {{ progress.unreadable.toLocaleString('en-US') }}
        {{ progress.unreadable === 1 ? 'version' : 'versions' }} couldn’t be read.
      </p>
      <p v-if="progress?.capped" class="note">Only the newest 1,000 versions were read.</p>
      <p v-if="failed" class="note">Couldn’t read the versions: {{ failed }}</p>
      <p v-if="rows.length === 0 && done && progress?.total === 0" class="empty">
        No versions yet. Save, or take a snapshot, and a scene you delete after it is listed here.
      </p>
      <p v-else-if="rows.length === 0 && done" class="empty">
        No deleted scenes. Every scene in your versions is still in the script.
      </p>
      <p v-else-if="rows.length === 0" class="empty">Reading versions…</p>
      <p v-else-if="shown.length === 0 && filter.trim() === ''" class="empty">
        No deleted scenes. Every scene in your versions is still in the script.
      </p>
      <p v-else-if="shown.length === 0" class="empty">
        No deleted scene matches “{{ filter.trim() }}”.
      </p>
      <div v-else ref="list" role="list" aria-label="Deleted scenes" class="list">
        <div v-for="(row, i) in shown" :key="row.key" role="listitem" class="item">
          <div
            :id="domId(i)"
            class="entry"
            role="group"
            :aria-labelledby="headingId(i)"
            :aria-describedby="metaId(i)"
            :tabindex="i === current ? 0 : -1"
            @keydown="onKeydown($event, row)"
            @focus="setActive(row)"
            @click="setActive(row)"
          >
            <h3 :id="headingId(i)" class="heading">
              {{ row.newest.print.heading || 'Untitled scene' }}
            </h3>
            <p :id="metaId(i)" class="meta">{{ metaOf(row) }}</p>
            <p v-if="row.newest.print.preview" class="preview">{{ row.newest.print.preview }}</p>
            <div class="buttons">
              <button
                type="button"
                class="act"
                tabindex="-1"
                :aria-expanded="opened.has(row.key) ? 'true' : 'false'"
                :aria-controls="textId(i)"
                :aria-label="`${opened.has(row.key) ? 'Hide' : 'Show'} text of ${nameOf(row)}`"
                @click.stop="toggleText(row)"
              >
                {{ opened.has(row.key) ? 'Hide text' : 'Show text' }}
              </button>
              <button
                type="button"
                class="act"
                tabindex="-1"
                :aria-disabled="readOnly ? 'true' : undefined"
                :aria-describedby="readOnly ? whyId : undefined"
                :aria-label="`Put back ${nameOf(row)}`"
                @click.stop="onPutBack(row)"
              >
                Put back
              </button>
              <MenuButton
                :open="menuFor === row.key"
                :items="menuFor === row.key ? menuItems(row) : NO_ITEMS"
                :content="MENU_CONTENT"
                @update:open="(open: boolean) => setMenu(row, open)"
              >
                <button
                  type="button"
                  class="act more"
                  tabindex="-1"
                  :aria-label="`More for ${row.newest.print.heading || 'Untitled scene'}`"
                  @click.stop
                >
                  <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
                </button>
              </MenuButton>
            </div>
          </div>
          <div
            v-if="opened.has(row.key)"
            :id="textId(i)"
            role="region"
            :aria-label="`Text of ${row.newest.print.heading || 'Untitled scene'}`"
            class="text"
          >
            <pre v-if="texts.get(row.key) != null">{{ texts.get(row.key) }}</pre>
            <p v-else-if="texts.has(row.key)" class="note">This version can’t be read.</p>
            <p v-else class="note">Reading…</p>
          </div>
        </div>
      </div>
    </template>
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ status }}</p>
  </div>
</template>

<style scoped>
.deleted {
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
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
.note {
  margin: 8px 12px 0;
  color: var(--muted);
}
.list {
  padding: 8px 0;
}
.item {
  border-bottom: 1px solid var(--line);
}
.entry {
  padding: 8px 12px;
}
.entry:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.heading {
  margin: 0;
  font: 700 13px/1.4 var(--font-mono, monospace);
  overflow-wrap: anywhere;
}
.meta {
  margin: 2px 0 0;
  color: var(--muted);
}
.preview {
  margin: 4px 0 0;
  overflow-wrap: anywhere;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.act[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: 0.6;
}
.act:hover {
  background: var(--chrome-2);
}
.text {
  margin: 0 12px 10px;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--page);
  color: var(--ink);
  overflow-x: auto;
}
.text pre {
  margin: 0;
  font: 12px/1.5 var(--font-mono, monospace);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
