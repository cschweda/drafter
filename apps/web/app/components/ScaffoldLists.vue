<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { lengthLabel, lengthWords } from '~/outline/labels';
import { matchesFilter } from '~/scaffold/pages';
import { useScaffold } from '~/scaffold/session';
import { SCAFFOLD_HEADING_ID } from '~/scaffold/show';
import { characterRows } from '~/stats/characters';
import { pageRatePhrase } from '~/stats/time-format';
import { useRates } from '~/stats/timing';

// Scaffold's Cast and Places (seeing-the-script design §5.5): every character, as the Stats tab's
// Characters table orders them, with their scenes, screen time, and dialogue share (the same rows,
// so the two agree); and every location, A to Z (by its key, so a place and the places inside it
// sit together), with its scenes and pages. Each has a filter that folds case and accents, kept in
// the session, so a page opened from the list and Back find it as it was.
const props = defineProps<{ kind: 'cast' | 'places' }>();
const { cast } = useCast();
const rates = useRates();
const { filters } = useScaffold();
const filter = computed({
  get: () => filters[props.kind].value,
  set: (text: string) => {
    filters[props.kind].value = text;
  },
});
const filterId = useId();

const people = computed(() => (cast.value ? characterRows(cast.value, rates.value) : []));
const places = computed(() =>
  cast.value
    ? [...cast.value.locations.values()].map((f) => ({
        key: f.key,
        name: f.location,
        scenes: f.scenes.length,
        pages:
          f.eighths === null
            ? null
            : { text: lengthLabel(f.eighths), words: lengthWords(f.eighths) },
      }))
    : [],
);
const shownPeople = computed(() =>
  people.value.filter((row) => matchesFilter(row.name, filter.value)),
);
const shownPlaces = computed(() =>
  places.value.filter((row) => matchesFilter(row.name, filter.value)),
);
const total = computed(() => (props.kind === 'cast' ? people.value.length : places.value.length));
const shown = computed(() =>
  props.kind === 'cast' ? shownPeople.value.length : shownPlaces.value.length,
);
const title = computed(() => (props.kind === 'cast' ? 'Cast' : 'Places'));
const waiting = computed(() =>
  props.kind === 'cast'
    ? people.value.some((row) => row.screen === null)
    : places.value.some((row) => row.pages === null),
);
</script>

<template>
  <div class="page">
    <h2 :id="SCAFFOLD_HEADING_ID" tabindex="-1">{{ title }}</h2>
    <p v-if="!cast" class="note">Counting…</p>
    <p v-else-if="total === 0" class="note">
      {{
        props.kind === 'cast'
          ? 'No one speaks yet. A character’s cue starts their row.'
          : 'No scene heading names a place yet.'
      }}
    </p>
    <template v-else>
      <div class="filter">
        <label :for="filterId">Filter {{ props.kind === 'cast' ? 'the cast' : 'the places' }}</label>
        <input :id="filterId" v-model="filter" type="search" autocomplete="off" spellcheck="false" />
      </div>
      <p class="note" role="status">
        {{ filter.trim() === '' ? '' : `${shown} of ${total} shown.` }}
      </p>
      <p v-if="shown === 0" class="note">Nothing matches “{{ filter.trim() }}”.</p>
      <ScaffoldTable
        v-else-if="props.kind === 'cast'"
        heading-id="scaffold-list"
        :caption="`Characters (${shown})`"
      >
        <thead>
          <tr>
            <th scope="col">Character</th>
            <th scope="col" class="num">Scenes</th>
            <th scope="col" class="num">
              Screen time<span class="sr-only">, at {{ pageRatePhrase(rates.minutesPerPage) }}</span>
            </th>
            <th scope="col" class="num">Dialogue share</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shownPeople" :key="row.key">
            <th scope="row">
              <ScaffoldLink :to="{ kind: 'character', key: row.key }">{{ row.name }}</ScaffoldLink>
            </th>
            <td class="num">{{ row.scenes }}</td>
            <td class="num">
              <template v-if="row.screen">
                <span aria-hidden="true">{{ row.screen.text }}</span>
                <span class="sr-only">{{ row.screen.words }}</span>
              </template>
              <template v-else>
                <span aria-hidden="true">—</span>
                <span class="sr-only">When the pages are ready</span>
              </template>
            </td>
            <td class="num">{{ row.share }}</td>
          </tr>
        </tbody>
      </ScaffoldTable>
      <ScaffoldTable v-else heading-id="scaffold-list" :caption="`Locations (${shown})`">
        <thead>
          <tr>
            <th scope="col">Location</th>
            <th scope="col" class="num">Scenes</th>
            <th scope="col" class="num">Pages</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shownPlaces" :key="row.key">
            <th scope="row">
              <ScaffoldLink :to="{ kind: 'location', key: row.key }">{{ row.name }}</ScaffoldLink>
            </th>
            <td class="num">{{ row.scenes }}</td>
            <td class="num">
              <template v-if="row.pages">
                <span aria-hidden="true">{{ row.pages.text }}</span>
                <span class="sr-only">{{ row.pages.words }}</span>
              </template>
              <template v-else>
                <span aria-hidden="true">—</span>
                <span class="sr-only">When the pages are ready</span>
              </template>
            </td>
          </tr>
        </tbody>
      </ScaffoldTable>
      <p v-if="waiting" class="note">
        {{ props.kind === 'cast' ? 'Screen time waits for the pages.' : 'Pages wait for the layout.' }}
      </p>
    </template>
  </div>
</template>

<style scoped>
.filter {
  color: var(--muted);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin: 4px 0 0;
}
.filter input {
  min-height: 28px;
  min-width: 0;
  flex: 1 1 12rem;
  max-width: 20rem;
  padding: 2px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
}
.filter input:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 1px;
}
</style>
