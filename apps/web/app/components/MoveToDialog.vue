<script setup lang="ts">
import type { MoveTarget, OutlineItem, SceneIndex } from '@drafter/outline';
import { sceneNumber } from '~/outline/labels';

// Move to… (Phase 2 design §6.2): "Put INT. HALL after:", with every place it can go: the start
// of the script, after each scene, and at the start of each section. A filter narrows the list.
// Not the moved section's own scenes and sections: a section can't go inside itself.

const props = defineProps<{ item: OutlineItem | null; index: SceneIndex }>();
const emit = defineEmits<{ choose: [target: MoveTarget]; close: [] }>();

const dialog = ref<HTMLDialogElement>();
const filter = ref('');
const nameOf = (item: OutlineItem) =>
  (item.kind === 'scene' ? item.heading : item.title) || 'Untitled';

interface Option {
  key: string;
  label: string;
  target: MoveTarget;
  depth: number;
}

const options = computed<Option[]>(() => {
  const item = props.item;
  if (!item) return [];
  const inside = (other: OutlineItem) =>
    item.kind === 'section' && other.span.from >= item.span.from && other.span.from < item.span.to;
  const out: Option[] = [
    { key: 'start', label: 'The start of the script', target: { start: true }, depth: 0 },
  ];
  for (const other of props.index.items) {
    if (other === item || inside(other)) continue;
    const depth = other.kind === 'scene' ? other.sections.length : 0;
    out.push(
      other.kind === 'scene'
        ? {
            key: `after-${other.block}`,
            label: `Scene ${sceneNumber(other)}: ${nameOf(other)}`,
            target: { after: other.block },
            depth,
          }
        : {
            key: `start-${other.block}`,
            label: `The start of ${nameOf(other)}`,
            target: { after: other.block },
            depth: other.depth - 1,
          },
    );
  }
  return out;
});

const shown = computed(() => {
  const query = filter.value.trim().toLowerCase();
  return query ? options.value.filter((o) => o.label.toLowerCase().includes(query)) : options.value;
});

watch(
  () => props.item,
  async (item) => {
    filter.value = '';
    await nextTick();
    if (item && dialog.value && !dialog.value.open) dialog.value.showModal();
    if (!item && dialog.value?.open) dialog.value.close();
  },
  { immediate: true },
);

function choose(option: Option) {
  dialog.value?.close();
  emit('choose', option.target);
}

function onClose() {
  if (props.item) emit('close');
}
</script>

<template>
  <dialog
    ref="dialog"
    class="move-to"
    aria-labelledby="move-to-title"
    aria-describedby="move-to-help"
    @close="onClose"
  >
    <template v-if="props.item">
      <h2 id="move-to-title">Move {{ nameOf(props.item) }}</h2>
      <p id="move-to-help">Put it after:</p>
      <label class="filter">
        <span>Filter</span>
        <input v-model="filter" type="search" autocomplete="off" autofocus />
      </label>
      <ul class="options" aria-label="Places">
        <li v-for="option in shown" :key="option.key" :style="{ '--depth': option.depth }">
          <button type="button" class="option" @click="choose(option)">{{ option.label }}</button>
        </li>
        <li v-if="shown.length === 0" class="none">No place matches.</li>
      </ul>
      <div class="buttons">
        <button type="button" class="btn" @click="dialog?.close()">Cancel</button>
      </div>
    </template>
  </dialog>
</template>

<style scoped>
.move-to {
  box-sizing: border-box;
  width: min(30rem, calc(100vw - 32px));
  max-height: min(36rem, calc(100dvh - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
}
.move-to[open] {
  display: flex;
  flex-direction: column;
}
h2 {
  margin: 0 0 4px;
  font-size: 16px;
  overflow-wrap: anywhere;
}
p {
  margin: 0 0 8px;
  color: var(--muted);
  font-size: 13px;
}
.filter {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.filter input {
  flex: 1;
  min-height: 28px;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.options {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  border: 1px solid var(--line);
  border-radius: 6px;
}
.options li {
  padding-left: calc(var(--depth, 0) * 14px);
}
.option {
  width: 100%;
  min-height: 32px;
  padding: 4px 10px;
  border: 0;
  background: none;
  color: var(--text);
  font: 600 13px/1.3 var(--font-sans);
  text-align: left;
  cursor: pointer;
}
.option:hover {
  background: var(--chrome);
}
.option:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.none {
  padding: 8px 10px;
  color: var(--muted);
  font-size: 13px;
}
.buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}
.btn {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
