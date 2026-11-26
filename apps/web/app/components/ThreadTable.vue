<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { openThreadEdit } from '~/threads/dialogs';
import { noThreadsYet, nothingYet } from '~/threads/lane-labels';
import { threadMenuItems } from '~/threads/thread-menu';
import { useLaneView } from '~/threads/use-lane-view';
import { useThreads } from '~/threads/use-threads';

// The Lanes as a table (threads design §7.5): a row per thread, then No thread, with its name, its
// scenes or passages, their length, and their share of the work. What "Show as table" shows in
// the grid's place, for a screen reader or by choice; each thread's ⋯ has its rename, name, color,
// and remove, so it is the place to change threads without the grid.

const threads = useThreads();
const { lanes, rows, noun } = useLaneView();

const unitsHeader = computed(() => (noun.value === 'scene' ? 'Scenes' : 'Passages'));
const lengthHeader = computed(() => (lanes.value?.unit === 'pages' ? 'Pages' : 'Words'));

const menuFor = shallowRef<string | null>(null);
let after: (() => void) | null = null;
const NO_ITEMS: DropdownMenuItem[][] = [];
const buttonId = (r: number) => `thread-table-${r}`;

function items(r: number, label: string): DropdownMenuItem[][] {
  return threadMenuItems(noun.value, threads.readOnly(), (mode) => {
    after = () =>
      openThreadEdit(label, mode, () => {
        // The thread may have a new key after a rename: back to the first thread's button then.
        const el =
          document.getElementById(buttonId(r)) ??
          document.querySelector<HTMLElement>('.thread-table .more');
        el?.focus();
      });
  });
}
function setMenu(key: string, open: boolean) {
  if (open) menuFor.value = key;
  else if (menuFor.value === key) menuFor.value = null;
}
function onCloseAutoFocus(event: Event) {
  const act = after;
  after = null;
  if (!act) return;
  event.preventDefault();
  requestAnimationFrame(act);
}
const CONTENT = { align: 'start' as const, onCloseAutoFocus };
</script>

<template>
  <div class="thread-table">
    <p v-if="!lanes" class="note">Reading the threads…</p>
    <DEmpty v-else-if="lanes.units.length === 0" icon="i-lucide-table">{{ nothingYet(noun) }}</DEmpty>
    <DEmpty v-else-if="lanes.threads.length === 0" icon="i-lucide-git-branch">{{ noThreadsYet(noun) }}</DEmpty>
    <table v-else>
      <caption class="sr-only">Threads</caption>
      <thead>
        <tr>
          <th scope="col">Thread</th>
          <th scope="col">Name</th>
          <th scope="col">{{ unitsHeader }}</th>
          <th scope="col" class="num">{{ lengthHeader }}</th>
          <th scope="col" class="num">Share</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, r) in rows" :key="row.key ?? '-none'">
          <th scope="row">
            <span class="thread">
              <span class="swatch" :class="{ none: !row.swatch }" :style="row.swatch ? { background: row.swatch } : undefined" aria-hidden="true" />
              <span class="label">{{ row.label }}</span>
              <MenuButton
                v-if="row.key !== null"
                :open="menuFor === row.key"
                :items="menuFor === row.key ? items(r, row.label) : NO_ITEMS"
                :content="CONTENT"
                @update:open="(open: boolean) => setMenu(row.key as string, open)"
              >
                <button :id="buttonId(r)" type="button" class="more" :aria-label="`Actions for thread ${row.label}`">
                  <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
                </button>
              </MenuButton>
            </span>
          </th>
          <td>{{ row.name ?? '' }}</td>
          <td class="list">{{ row.list }}</td>
          <td class="num">{{ row.length }}</td>
          <td class="num">{{ row.share }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.thread-table {
  padding: 12px 12px 24px;
  color: var(--text);
  font-size: 13px;
}
.note {
  margin: 0;
  color: var(--muted);
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
thead th {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}
tbody th {
  min-width: 7em;
  font-weight: 600;
}
.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.list {
  overflow-wrap: anywhere;
}
.thread {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.label {
  overflow-wrap: anywhere;
}
.swatch {
  flex: none;
  width: 4px;
  height: 16px;
  border-radius: 1px;
}
.swatch.none {
  border: 1px dashed var(--muted);
  box-sizing: border-box;
}
.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.more:hover {
  background: var(--surface);
}
</style>
