<script setup lang="ts">
import { notesFilter } from '~/notes/use-notes';

// The Notes tab's filters (Phase 2 design §8): category, person, status, scene, and a text filter.
// Drawn in the tab on a wide screen and in the Filters sheet on a phone (NoteFiltersDialog).

const props = defineProps<{
  categories: string[];
  people: string[];
  scenes: Array<{ ordinal: number; label: string }>;
  /** Tells apart the ids of the tab's fields and the sheet's. */
  idPrefix: string;
}>();

/** A select's value: '' for any. */
const pick = <T>(value: string, as: (v: string) => T): T | null =>
  value === '' ? null : as(value);
</script>

<template>
  <div class="filters">
    <label class="field">
      <span>Category</span>
      <select
        :id="`${props.idPrefix}-category`"
        aria-label="Category"
        :value="notesFilter.category ?? ''"
        @change="notesFilter.category = pick(($event.target as HTMLSelectElement).value, String)"
      >
        <option value="">Any</option>
        <option v-for="name in props.categories" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <label class="field">
      <span>Person</span>
      <select
        :id="`${props.idPrefix}-person`"
        aria-label="Person"
        :value="notesFilter.person ?? ''"
        @change="notesFilter.person = pick(($event.target as HTMLSelectElement).value, String)"
      >
        <option value="">Anyone</option>
        <option v-for="name in props.people" :key="name" :value="name">{{ name }}</option>
      </select>
    </label>
    <label class="field">
      <span>Status</span>
      <select :id="`${props.idPrefix}-status`" v-model="notesFilter.status" aria-label="Status">
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="resolved">Resolved</option>
      </select>
    </label>
    <label class="field">
      <span>Scene</span>
      <select
        :id="`${props.idPrefix}-scene`"
        aria-label="Scene"
        :value="notesFilter.scene === null ? '' : String(notesFilter.scene)"
        @change="notesFilter.scene = pick(($event.target as HTMLSelectElement).value, Number)"
      >
        <option value="">Any scene</option>
        <option v-for="scene in props.scenes" :key="scene.ordinal" :value="String(scene.ordinal)">
          {{ scene.label }}
        </option>
      </select>
    </label>
    <label class="field text">
      <span>Find</span>
      <input
        :id="`${props.idPrefix}-text`"
        v-model="notesFilter.text"
        type="search"
        autocomplete="off"
        aria-label="Find in notes"
      />
    </label>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
}
.field {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
}
.field select,
.field input {
  min-height: 26px;
  max-width: 14rem;
  padding: 1px 6px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-weight: 400;
}
.text input {
  width: 10rem;
}
</style>
