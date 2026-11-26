<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { openThreadEdit } from '~/threads/dialogs';
import { lengthText, noThreadsYet, nothingYet, unitTitle } from '~/threads/lane-labels';
import { threadMenuItems } from '~/threads/thread-menu';
import { useLaneView } from '~/threads/use-lane-view';
import { useThreads } from '~/threads/use-threads';

// The Lanes on a phone (threads design §7.3): a list grouped by thread, each thread a heading with
// its count, then its scenes or passages as rows (the heading and the length) that go there, then
// No thread. Each thread's ⋯ has its rename, name, color, and remove, as the table's has.

const threads = useThreads();
const { lanes, rows, noun, current } = useLaneView();

const groups = computed(() => {
  const now = lanes.value;
  if (!now) return [];
  return rows.value.map((row, r) => ({
    ...row,
    id: `thread-list-${r}`,
    units: row.units.map((i) => {
      const u = now.units[i] as (typeof now.units)[number];
      return {
        id: u.id,
        title: unitTitle(u, noun.value),
        length: lengthText(now.unit, u.length),
        inherited: !!u.inherited,
      };
    }),
  }));
});

const menuFor = shallowRef<string | null>(null);
let after: (() => void) | null = null;
const NO_ITEMS: DropdownMenuItem[][] = [];

function items(id: string, label: string): DropdownMenuItem[][] {
  return threadMenuItems(noun.value, threads.readOnly(), (mode) => {
    after = () => openThreadEdit(label, mode, () => document.getElementById(`${id}-more`)?.focus());
  });
}
function setMenu(id: string, open: boolean) {
  if (open) menuFor.value = id;
  else if (menuFor.value === id) menuFor.value = null;
}
function onCloseAutoFocus(event: Event) {
  const act = after;
  after = null;
  if (!act) return;
  event.preventDefault();
  requestAnimationFrame(act);
}
const CONTENT = { align: 'end' as const, onCloseAutoFocus };
</script>

<template>
  <div class="thread-list">
    <p v-if="!lanes" class="note">Reading the threads…</p>
    <DEmpty v-else-if="lanes.units.length === 0" icon="i-lucide-list">{{ nothingYet(noun) }}</DEmpty>
    <DEmpty v-else-if="lanes.threads.length === 0" icon="i-lucide-git-branch">{{ noThreadsYet(noun) }}</DEmpty>
    <template v-else>
      <section v-for="group in groups" :key="group.key ?? '-none'" class="group" :aria-labelledby="group.id">
        <div class="head">
          <span class="swatch" :class="{ none: !group.swatch }" :style="group.swatch ? { background: group.swatch } : undefined" aria-hidden="true" />
          <h2 :id="group.id" :aria-label="group.header">
            <span class="label">{{ group.label }}</span>
            <span v-if="group.name" class="name">{{ group.name }}</span>
            <span class="count">{{ group.units.length }}</span>
          </h2>
          <MenuButton
            v-if="group.key !== null"
            :open="menuFor === group.id"
            :items="menuFor === group.id ? items(group.id, group.label) : NO_ITEMS"
            :content="CONTENT"
            @update:open="(open: boolean) => setMenu(group.id, open)"
          >
            <button :id="`${group.id}-more`" type="button" class="more" :aria-label="`Actions for thread ${group.label}`">
              <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
            </button>
          </MenuButton>
        </div>
        <ul :aria-labelledby="group.id">
          <li v-for="unit in group.units" :key="unit.id">
            <button
              type="button"
              class="unit"
              :aria-current="unit.id === current ? 'location' : undefined"
              @click="threads.go(unit.id)"
            >
              <span class="title">{{ unit.title }}<span v-if="unit.inherited" class="from">, from its chapter</span></span>
              <span class="length">{{ unit.length }}</span>
            </button>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.thread-list {
  padding: 8px 16px 24px;
  color: var(--text);
  font-size: 14px;
}
.note {
  margin: 0;
  color: var(--muted);
}
.group + .group {
  margin-top: 16px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  border-bottom: 1px solid var(--border);
}
h2 {
  display: flex;
  flex: 1;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.name {
  min-width: 0;
  overflow: hidden;
  color: var(--muted);
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.count {
  margin-left: auto;
  color: var(--muted);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.swatch {
  flex: none;
  width: 4px;
  height: 18px;
  border-radius: 1px;
}
.swatch.none {
  border: 1px dashed var(--muted);
  box-sizing: border-box;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.unit {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 44px;
  padding: 6px 0 6px 12px;
  border: 0;
  border-bottom: 1px solid var(--border);
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.unit[aria-current='location'] {
  box-shadow: inset 3px 0 0 var(--accent-text);
}
.title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.from {
  color: var(--muted);
}
.length {
  flex: none;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
</style>
