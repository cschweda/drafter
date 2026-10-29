<script setup lang="ts">
import type { NoteEntry } from '@drafter/notes';
import type { Scene } from '@drafter/outline';
import type { DropdownMenuItem } from '@nuxt/ui';
import { hasStatus } from '~/notes/filter';
import { sceneNumber } from '~/outline/labels';

// One row of the Notes list (Phase 2 design §8): a listbox option named by what it says, its
// categories, its person, its status, and its place; what's drawn is hidden from screen readers,
// which read the name once. A reply is indented under its note. The Resolve button, the ⋯ menu,
// and a category chip's menu are a pointer's (`tabindex="-1"`); the keys are the Notes tab's.

const props = defineProps<{
  entry: NoteEntry;
  scene: Scene | null;
  line: number;
  /** The page the mark is on, for Setups & payoffs; null elsewhere or before a layout. */
  page?: number | null;
  reply?: boolean;
  categories: string[];
  /** Each category's color swatch, by name. */
  swatches: Record<string, string>;
  domId: string;
  current: boolean;
  editing: boolean;
  /** Why nothing can change now, or null. */
  readOnly: string | null;
  menuOpen: boolean;
  menuItems: DropdownMenuItem[][];
  menuContent: object;
  chipItems: (name: string) => DropdownMenuItem[][];
}>();
const emit = defineEmits<{
  'update:menuOpen': [open: boolean];
  edited: [save: boolean];
  resolve: [];
}>();
const headDraft = defineModel<string>('draftHead', { default: '' });
const bodyDraft = defineModel<string>('draftBody', { default: '' });

const note = computed(() => props.entry.note);
const head = computed(() => note.value?.head ?? null);
const person = computed(() => (head.value?.kind === 'person' ? head.value : null));
const status = computed(() =>
  hasStatus(note.value) ? (note.value.resolved ? 'Resolved' : 'Open') : null,
);
const what = computed(() => {
  if (props.entry.kind === 'boneyard') return 'Boneyard';
  if (head.value?.kind === 'mark') return head.value.key === 'setup' ? 'Setup' : 'Payoff';
  return null;
});
/** What the note says: the body, or a boneyard's inside on one line. */
const text = computed(() =>
  (note.value ? note.value.body : props.entry.text).replace(/\s+/g, ' ').trim(),
);
const who = computed(() => {
  const p = person.value;
  if (!p) return null;
  return p.re ? `${p.name} re ${p.re}` : p.on ? `${p.name} on “${p.on}”` : p.name;
});
const place = computed(() => {
  const parts: string[] = [];
  if (props.page !== undefined && props.page !== null) {
    parts.push(props.page === 0 ? 'title page' : `page ${props.page}`);
  }
  if (props.scene) parts.push(`Scene ${sceneNumber(props.scene)}`);
  parts.push(`line ${props.line}`);
  return parts;
});
const placeDrawn = computed(() =>
  place.value.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(' · '),
);
/** The option's name: who, what it says, its categories, status, and place. */
const name = computed(() =>
  [
    [props.reply ? 'Reply' : null, what.value, who.value].filter(Boolean).join(', '),
    text.value || '(empty)',
    ...props.categories,
    status.value?.toLowerCase(),
    ...place.value,
  ]
    .filter((part) => part)
    .join(', ')
    .replace(/^, /, ''),
);

function onEditKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.key === 'Enter') {
    event.preventDefault();
    emit('edited', true);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    emit('edited', false);
  }
}

// Leaving the two fields cancels; moving between them doesn't.
function onEditFocusout(event: FocusEvent) {
  const to = event.relatedTarget as Node | null;
  if (to && (event.currentTarget as HTMLElement).contains(to)) return;
  emit('edited', false);
}
</script>

<template>
  <div
    :id="props.domId"
    role="option"
    class="note-row"
    :class="{ reply: props.reply, resolved: status === 'Resolved' }"
    :tabindex="props.current ? 0 : -1"
    :aria-selected="props.current ? 'true' : 'false'"
  >
    <span class="sr-only">{{ name }}</span>
    <div v-if="props.editing" class="edit" @focusout="onEditFocusout">
      <label class="field head-field">
        <span>Head</span>
        <input
          :id="`${props.domId}-head`"
          v-model="headDraft"
          autocomplete="off"
          aria-label="Head of the note"
          @keydown="onEditKeydown"
        />
      </label>
      <label class="field body-field">
        <span>Note</span>
        <input
          :id="`${props.domId}-body`"
          v-model="bodyDraft"
          autocomplete="off"
          aria-label="Text of the note"
          @keydown="onEditKeydown"
        />
      </label>
    </div>
    <div v-else class="drawn" aria-hidden="true">
      <div class="top">
        <span v-if="what" class="what">{{ what }}</span>
        <span v-if="who" class="who">{{ who }}</span>
        <span class="text">{{ text || '(empty)' }}</span>
      </div>
      <div class="foot">
        <MenuButton
          v-for="category in props.categories"
          :key="category"
          :items="props.chipItems(category)"
          :content="{ align: 'start' }"
        >
          <button
            type="button"
            class="chip"
            tabindex="-1"
            :style="{ '--swatch': props.swatches[category] ?? 'transparent' }"
            :aria-label="`Category ${category}`"
            @click.stop
          >
            <span class="dot" />{{ category }}
          </button>
        </MenuButton>
        <span class="place">{{ placeDrawn }}</span>
        <span v-if="status" class="status">{{ status }}</span>
      </div>
    </div>
    <div v-if="!props.editing" class="buttons" aria-hidden="true">
      <button
        v-if="status"
        type="button"
        class="act"
        tabindex="-1"
        :aria-disabled="props.readOnly ? 'true' : undefined"
        :title="props.readOnly ?? undefined"
        @click.stop="emit('resolve')"
      >
        {{ status === 'Resolved' ? 'Reopen' : 'Resolve' }}
      </button>
      <MenuButton
        :open="props.menuOpen"
        :items="props.menuItems"
        :content="props.menuContent"
        @update:open="(open: boolean) => emit('update:menuOpen', open)"
      >
        <button
          type="button"
          class="more"
          tabindex="-1"
          :aria-label="`Actions for this ${what?.toLowerCase() ?? 'note'}`"
          @click.stop
        >
          <UIcon name="i-lucide-ellipsis" aria-hidden="true" />
        </button>
      </MenuButton>
    </div>
  </div>
</template>

<style scoped>
.note-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--line);
  color: var(--text);
  cursor: default;
}
.note-row.reply {
  padding-left: 32px;
}
.note-row:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.note-row[aria-selected='true'] {
  background: var(--chrome);
}
.drawn,
.edit {
  flex: 1;
  min-width: 0;
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 6px;
}
.what,
.who {
  font-weight: 700;
}
.what {
  color: var(--muted);
}
.text {
  overflow-wrap: anywhere;
}
.resolved .text {
  color: var(--muted);
}
.foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 22px;
  padding: 0 7px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.dot {
  width: 8px;
  height: 8px;
  border: 1px solid var(--muted);
  border-radius: 50%;
  background: var(--swatch);
}
.status {
  font-weight: 600;
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
  background: var(--chrome-2);
  color: var(--text);
}
.edit {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.field {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.head-field input {
  width: 9rem;
}
.body-field {
  flex: 1;
  min-width: 12rem;
}
.body-field input {
  flex: 1;
}
.field input {
  box-sizing: border-box;
  min-height: 26px;
  padding: 2px 6px;
  border: 1px solid var(--heading);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
@media (forced-colors: active) {
  .note-row[aria-selected='true'] {
    outline: 2px solid Highlight;
  }
  .dot {
    forced-color-adjust: none;
  }
}
</style>
