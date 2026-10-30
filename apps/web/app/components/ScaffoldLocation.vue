<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { lengthLabel, lengthWords, sceneNumber } from '~/outline/labels';
import { goToSceneId, rescueFocus } from '~/scaffold/go';
import { locationSummary, NO_LONGER, timesOfDay } from '~/scaffold/pages';
import { useScaffold } from '~/scaffold/session';
import { SCAFFOLD_HEADING_ID, scaffoldBack } from '~/scaffold/show';
import { useRates } from '~/stats/timing';

// A location's Scaffold page (seeing-the-script design §5.4): its name, a summary line, its times
// of day, its scenes, and who appears there. Keyed by the location's key (its name, upper-cased,
// spaces and dashes made one), never by a place in a list; a location the script no longer has
// says so calmly, with Back.
const props = defineProps<{ locationKey: string }>();
const { cast, basis } = useCast();
const { canGoBack } = useScaffold();
const rates = useRates();

const figures = computed(() => cast.value?.locations.get(props.locationKey) ?? null);
const gone = computed(() => !!cast.value && !figures.value);
const root = ref<HTMLElement>();
rescueFocus(root, gone);

const summary = computed(() => (figures.value ? locationSummary(figures.value, rates.value) : ''));
const times = computed(() => (figures.value ? timesOfDay(figures.value) : ''));
const nameOf = (key: string) => cast.value?.figures.get(key)?.character.name ?? key;
const scenes = computed(() => {
  const f = figures.value;
  const b = basis.value;
  if (!f || !b) return [];
  return f.scenes.map((at) => {
    const scene = b.index.scenes[at];
    const eighths = scene?.pages?.eighths ?? null;
    return {
      at,
      id: b.ids[at],
      number: scene ? sceneNumber(scene) : '',
      heading: scene?.heading || 'Untitled scene',
      page: scene?.pages?.page ?? null,
      length: eighths === null ? null : { text: lengthLabel(eighths), words: lengthWords(eighths) },
      time: cast.value?.places[at]?.time ?? null,
    };
  });
});
</script>

<template>
  <div ref="root" class="page">
    <h2 :id="SCAFFOLD_HEADING_ID" tabindex="-1">{{ figures?.location ?? props.locationKey }}</h2>
    <p v-if="!cast" class="note">Counting…</p>
    <template v-else-if="gone">
      <p class="note">{{ NO_LONGER }}</p>
      <button v-if="canGoBack" type="button" class="action" @click="scaffoldBack">Back</button>
    </template>
    <template v-else-if="figures">
      <p class="summary">{{ summary }}</p>
      <p v-if="times">Times of day: {{ times }}.</p>

      <ScaffoldTable heading-id="scaffold-location-scenes" :caption="`Scenes (${scenes.length})`">
        <thead>
          <tr>
            <th scope="col" class="num">Scene</th>
            <th scope="col">Heading</th>
            <th scope="col" class="num">Page</th>
            <th scope="col" class="num">Length</th>
            <th scope="col">Time of day</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="scene in scenes" :key="scene.id ?? scene.at">
            <td class="num">{{ scene.number }}</td>
            <th scope="row">
              <button type="button" class="go" @click="goToSceneId(scene.id)">
                <span class="sr-only">Go to scene {{ scene.number }}: </span>{{ scene.heading }}
              </button>
            </th>
            <td class="num">{{ scene.page ?? '—' }}</td>
            <td class="num">
              <template v-if="scene.length">
                <span aria-hidden="true">{{ scene.length.text }}</span>
                <span class="sr-only">{{ scene.length.words }}</span>
              </template>
              <template v-else>
                <span aria-hidden="true">—</span>
                <span class="sr-only">When the pages are ready</span>
              </template>
            </td>
            <td>
              <template v-if="scene.time">{{ scene.time }}</template>
              <template v-else>
                <span aria-hidden="true">—</span>
                <span class="sr-only">None</span>
              </template>
            </td>
          </tr>
        </tbody>
      </ScaffoldTable>

      <p v-if="figures.people.length === 0" class="note">No one is in its scenes.</p>
      <ScaffoldTable v-else heading-id="scaffold-who" :caption="`Who appears here (${figures.people.length})`">
        <thead>
          <tr>
            <th scope="col">Character</th>
            <th scope="col" class="num">Scenes here</th>
            <th scope="col" class="num">Speaks in</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="person in figures.people" :key="person.key">
            <th scope="row">
              <ScaffoldLink :to="{ kind: 'character', key: person.key }">{{ nameOf(person.key) }}</ScaffoldLink>
            </th>
            <td class="num">{{ person.scenes }}</td>
            <td class="num">{{ person.speaksIn }}</td>
          </tr>
        </tbody>
      </ScaffoldTable>
    </template>
  </div>
</template>
