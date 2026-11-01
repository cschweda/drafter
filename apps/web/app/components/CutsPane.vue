<script setup lang="ts">
import { draftName } from '@drafter/history';
import {
  type CutGroup,
  cutLine,
  cutName,
  cutsCount,
  filterCuts,
  type GroupBy,
  groupCuts,
  NO_CUTS,
  NO_CUTS_MARKDOWN,
  wholeLabel,
} from '~/cuts/labels';
import type { CutRow } from '~/cuts/store';
import { useCuts } from '~/cuts/use-cuts';
import { KEPT_HERE } from '~/drafts/labels';
import { useDrafts } from '~/drafts/use-drafts';
import { useEditor } from '~/editor/session';
import { sayOutline } from '~/outline/notice';

// The Cuts list (drafts-and-cuts design §3.2): everything cut from the script, kept for good, to
// browse for ideas. Each passage is listed under the scene or chapter it was cut from (a whole
// scene or section under its own heading), newest first, or under the draft it was cut while
// writing; a filter finds words, headings, and draft numbers. Each cut shows its text, when it was
// cut and while writing which draft, and Put back (between its old neighbours), Insert at cursor,
// and Copy. Putting a cut back keeps it listed, marked (Call 9). No Delete (Call 5). Plain buttons
// in reading order, so every action is a Tab away and named for its cut.

const cuts = useCuts();
const { rows, loaded, filter, notKept, readOnly, pendingFind } = cuts;
const drafts = useDrafts();
const editor = useEditor();
const uid = useId();

const by = ref<GroupBy>('scene');
const GROUP_BY = [
  { value: 'scene' as const, label: 'Scene', name: 'Group by scene' },
  { value: 'draft' as const, label: 'Draft', name: 'Group by draft' },
];
const markdown = computed(() => editor.kind.value === 'markdown');
const groupBy = computed(() =>
  GROUP_BY.map((o) =>
    o.value === 'scene' && markdown.value
      ? { ...o, label: 'Section', name: 'Group by chapter or section' }
      : o,
  ),
);

/** The frozen drafts' IDs by number, for "Draft 03 (a3f9c2e)". */
const ids = computed(() => new Map(drafts.rows.value.map((d) => [d.n, d.id])));
const shown = computed(() => filterCuts(rows.value, filter.value));
const groups = computed<CutGroup<CutRow>[]>(() => groupCuts(shown.value, by.value, ids.value));

// ---- Each cut's text: a few lines, and all of it on asking --------------------------------------

/** A cut longer than this many lines, or characters, shows its start until Show all. */
const SHORT_LINES = 8;
const SHORT_CHARS = 600;
const isLong = (row: CutRow) =>
  row.text.length > SHORT_CHARS || row.text.split('\n').length > SHORT_LINES;
const opened = ref(new Set<string>());
function toggle(row: CutRow) {
  const next = new Set(opened.value);
  if (!next.delete(row.id)) next.add(row.id);
  opened.value = next;
}

// ---- Actions ------------------------------------------------------------------------------------

const busy = ref(false);
async function act(run: () => Promise<unknown>) {
  if (busy.value) return;
  busy.value = true;
  try {
    await run();
  } finally {
    busy.value = false;
  }
}
const putBack = (row: CutRow) => act(() => cuts.putBack(row.id));
const insert = (row: CutRow) => act(() => cuts.insertAtCursor(row.id));
const copy = (row: CutRow) => act(() => cuts.copy(row.id));

// Find in Cuts (from a Compare group): the first cut found gets focus once listed; none, and it says so.
watch(
  [groups, loaded, pendingFind],
  async ([now, ready, wanted]) => {
    if (wanted === null || !ready) return;
    pendingFind.value = null;
    await nextTick();
    const first = now[0]?.rows[0];
    if (!first) {
      void sayOutline(
        `“${wanted}” isn’t in Cuts yet. A cut is kept at the next snapshot: take one to keep it now.`,
      );
      return;
    }
    const item = document.querySelector<HTMLElement>(`#panel-cuts [data-cut="${first.id}"]`);
    item?.focus();
    item?.scrollIntoView({ block: 'nearest' });
  },
  { flush: 'post' },
);

const groupId = (i: number) => `${uid}-group-${i}`;
const titleId = (row: CutRow) => `${uid}-cut-${row.id.slice(0, 16)}`;
const textId = (row: CutRow) => `${titleId(row)}-text`;
</script>

<template>
  <div class="cuts">
    <DEmpty v-if="notKept" icon="i-lucide-scissors">{{ notKept }}</DEmpty>
    <template v-else>
      <div class="tools">
        <p class="where">{{ KEPT_HERE }}</p>
        <div v-if="rows.length > 0" class="controls">
          <label class="filter">
            <span>Filter</span>
            <input
              v-model="filter"
              type="search"
              autocomplete="off"
              placeholder="Words, heading, or draft"
            />
          </label>
          <DSegmented v-model="by" label="Group cuts by" :options="groupBy" />
        </div>
      </div>
      <p v-if="readOnly" :id="`${uid}-why`" class="note">{{ readOnly }}</p>
      <DEmpty v-if="loaded && rows.length === 0" icon="i-lucide-scissors">
        {{ markdown ? NO_CUTS_MARKDOWN : NO_CUTS }}
      </DEmpty>
      <DEmpty v-else-if="loaded && shown.length === 0" icon="i-lucide-search">
        No cut matches “{{ filter.trim() }}”.
      </DEmpty>
      <section
        v-for="(group, i) in groups"
        :key="group.key"
        class="group"
        :aria-labelledby="groupId(i)"
      >
        <h3 :id="groupId(i)" class="group-title">
          <span class="group-name">{{ group.label }}</span>
          <span class="group-count">{{ cutsCount(group.rows.length) }}</span>
        </h3>
        <ol class="list" :aria-labelledby="groupId(i)">
          <li
            v-for="row in group.rows"
            :key="row.id"
            class="item"
            :data-cut="row.id"
            tabindex="-1"
            :aria-labelledby="titleId(row)"
          >
            <h4 class="title">
              <span :id="titleId(row)" class="title-text">{{ row.title || 'Untitled cut' }}</span>
              <span v-if="wholeLabel(row)" class="chip">{{ wholeLabel(row) }}</span>
            </h4>
            <p class="meta">{{ cutLine(row, ids) }}</p>
            <div
              :id="textId(row)"
              class="text"
              :class="{ fountain: row.kind === 'fountain', short: isLong(row) && !opened.has(row.id) }"
            >
              <pre>{{ row.text }}</pre>
            </div>
            <div class="buttons">
              <button
                v-if="isLong(row)"
                type="button"
                class="act"
                :aria-expanded="opened.has(row.id) ? 'true' : 'false'"
                :aria-controls="textId(row)"
                :aria-label="`${opened.has(row.id) ? 'Show less of' : 'Show all of'} ${cutName(row)}`"
                @click="toggle(row)"
              >
                {{ opened.has(row.id) ? 'Show less' : 'Show all' }}
              </button>
              <button
                type="button"
                class="act"
                :aria-label="`Put back ${cutName(row)}`"
                :aria-disabled="readOnly ? 'true' : undefined"
                :aria-describedby="readOnly ? `${uid}-why` : undefined"
                title="Put back where it was"
                @click="putBack(row)"
              >
                Put back
              </button>
              <button
                type="button"
                class="act"
                :aria-label="`Insert at cursor ${cutName(row)}`"
                :aria-disabled="readOnly ? 'true' : undefined"
                :aria-describedby="readOnly ? `${uid}-why` : undefined"
                title="Insert at the cursor"
                @click="insert(row)"
              >
                Insert at cursor
              </button>
              <button
                type="button"
                class="act"
                :aria-label="`Copy ${cutName(row)}`"
                @click="copy(row)"
              >
                Copy
              </button>
            </div>
          </li>
        </ol>
      </section>
      <p v-if="by === 'draft' && groups.length > 0" class="foot">
        The draft being written is {{ draftName(drafts.current.value) }}.
      </p>
    </template>
  </div>
</template>

<style scoped>
.cuts {
  min-height: 100%;
  padding-bottom: 24px;
  background: var(--bg);
  color: var(--text);
}
.tools {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.where,
.note,
.foot {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}
.note {
  padding: 8px 16px 0;
}
.foot {
  padding: 12px 16px 0;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.filter {
  display: flex;
  flex: 1 1 14rem;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.filter input {
  flex: 1;
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
.group {
  margin: 14px 16px 0;
}
.group-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}
.group-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.group-count {
  flex: none;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.list {
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  list-style: none;
}
.item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.item:last-child {
  border-bottom: 0;
}
.item:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: -2px;
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}
.title-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.chip {
  padding: 0 6px;
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--text);
  font-size: 11px;
  font-weight: 600;
}
.meta {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
/* The cut's own words, on the script's paper, so they read as the writer's text. */
.text {
  position: relative;
  margin-top: 2px;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--page);
  color: var(--ink);
  overflow: hidden;
}
.text pre {
  margin: 0;
  font: 13px/1.5 var(--font-sans);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.text.fountain pre {
  font: 13px/1.5 var(--font-mono, monospace);
}
/* A long cut shows its first lines until Show all; the cut-off is a fade, and the button says so. */
.text.short {
  max-height: calc(13px * 1.5 * 8 + 16px);
}
.text.short::after {
  content: '';
  position: absolute;
  inset: auto 0 0;
  height: 2.5em;
  background: linear-gradient(transparent, var(--page));
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
  .text.short::after {
    display: none;
  }
}
</style>
