<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { sceneNumber } from '~/outline/labels';
import { goToCue, goToSceneId, rescueFocus } from '~/scaffold/go';
import { sceneTitle } from '~/scaffold/labels';
import { linesOf, type SpokenLine } from '~/scaffold/lines';
import {
  characterFacts,
  characterSummary,
  NO_LONGER,
  sharePercents,
  speechesOf,
} from '~/scaffold/pages';
import { useScaffold } from '~/scaffold/session';
import { SCAFFOLD_HEADING_ID, SCAFFOLD_SCENES_ID, scaffoldBack } from '~/scaffold/show';
import { useRates } from '~/stats/timing';

// A character's Scaffold page (seeing-the-script design §5.3): their name, a summary line, their
// figures, who they share scenes with, where they go, their scenes, and their lines. Keyed by the
// character's key, never by a place in a list, and read from the cast Scaffold holds and the
// scenes it was worked out from (its basis). A character the script no longer has says so calmly,
// with Back.
const props = defineProps<{ characterKey: string }>();
const { cast, basis } = useCast();
const { canGoBack } = useScaffold();
const rates = useRates();

const figures = computed(() => cast.value?.figures.get(props.characterKey) ?? null);
const gone = computed(() => !!cast.value && !figures.value);
const root = ref<HTMLElement>();
rescueFocus(root, gone);

const percents = computed(() =>
  cast.value ? sharePercents(cast.value) : new Map<string, number>(),
);
const summary = computed(() => {
  const f = figures.value;
  const b = basis.value;
  return f && b ? characterSummary(f, b.index, b.index.scenes.length) : '';
});
const facts = computed(() => {
  const f = figures.value;
  return f ? characterFacts(f, rates.value, percents.value.get(f.character.key) ?? 0) : [];
});
const nameOf = (key: string) => cast.value?.figures.get(key)?.character.name ?? key;
const placeOf = (key: string) => cast.value?.locations.get(key)?.location ?? key;
const scenes = computed(() => {
  const f = figures.value;
  const b = basis.value;
  if (!f || !b) return [];
  return f.scenes.map((p) => {
    const scene = b.index.scenes[p.scene];
    return {
      at: p.scene,
      id: b.ids[p.scene],
      number: scene ? sceneNumber(scene) : '',
      heading: scene?.heading || 'Untitled scene',
      page: scene?.pages?.page ?? null,
      speaking: p.speaking,
      words: p.words,
    };
  });
});
const lines = computed(() => {
  const b = basis.value;
  return b && figures.value ? linesOf(b.doc, speechesOf(b.index, props.characterKey)) : [];
});
/** A group of lines' heading: its scene's title, or where a speech outside the scenes is. */
function lineTitle(scene: number | null, before: boolean): string {
  const s = scene === null ? undefined : basis.value?.index.scenes[scene];
  if (s) return sceneTitle(s);
  return before ? 'Before the first scene' : 'Between scenes';
}
/** The scene a fact links to (the one after the longest absence), by its id now. */
const sceneLink = (at: number) => {
  const b = basis.value;
  const scene = b?.index.scenes[at];
  return scene ? { id: b?.ids[at] ?? null, number: sceneNumber(scene) } : null;
};
function go(line: SpokenLine) {
  const b = basis.value;
  if (b) goToCue(b, line);
}
</script>

<template>
  <div ref="root" class="page">
    <h2 :id="SCAFFOLD_HEADING_ID" tabindex="-1">{{ figures?.character.name ?? props.characterKey }}</h2>
    <p v-if="!cast" class="note">Counting…</p>
    <template v-else-if="gone">
      <p class="note">{{ NO_LONGER }}</p>
      <button v-if="canGoBack" type="button" class="action" @click="scaffoldBack">Back</button>
    </template>
    <template v-else-if="figures">
      <p class="summary">{{ summary }}</p>
      <dl class="facts">
        <div v-for="fact in facts" :key="fact.term" class="fact">
          <dt>{{ fact.term }}</dt>
          <dd>
            <template v-if="fact.words">
              <span aria-hidden="true">{{ fact.value }}</span>
              <span class="sr-only">{{ fact.words }}</span>
            </template>
            <template v-else>{{ fact.value }}</template>
            <template v-if="fact.scene !== undefined && sceneLink(fact.scene)?.id">
              ·
              <ScaffoldLink :to="{ kind: 'scene', pinned: sceneLink(fact.scene)?.id ?? null }">
                back in scene {{ sceneLink(fact.scene)?.number }}
              </ScaffoldLink>
            </template>
          </dd>
        </div>
      </dl>
      <p class="note">
        Someone is in a scene when they speak in it or their name is in its action. A name that is
        also an ordinary word counts in the action only in capitals until the dictionary has
        answered, and always so for a word like Will. A name of two words or more counts only as the
        whole name, never one word of it.
      </p>

      <p v-if="figures.sharedWith.length === 0" class="note">Shares no scene with anyone.</p>
      <ScaffoldTable v-else heading-id="scaffold-shared" :caption="`Shares scenes with (${figures.sharedWith.length})`">
        <thead>
          <tr>
            <th scope="col">Character</th>
            <th scope="col" class="num">Scenes together</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="other in figures.sharedWith" :key="other.key">
            <th scope="row">
              <ScaffoldLink :to="{ kind: 'character', key: other.key }">{{ nameOf(other.key) }}</ScaffoldLink>
            </th>
            <td class="num">{{ other.scenes }}</td>
          </tr>
        </tbody>
      </ScaffoldTable>

      <p v-if="figures.locations.length === 0" class="note">None of their scenes names a place.</p>
      <ScaffoldTable v-else heading-id="scaffold-places" :caption="`Locations (${figures.locations.length})`">
        <thead>
          <tr>
            <th scope="col">Location</th>
            <th scope="col" class="num">Scenes there</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="place in figures.locations" :key="place.key">
            <th scope="row">
              <ScaffoldLink :to="{ kind: 'location', key: place.key }">{{ placeOf(place.key) }}</ScaffoldLink>
            </th>
            <td class="num">{{ place.scenes }}</td>
          </tr>
        </tbody>
      </ScaffoldTable>

      <p v-if="scenes.length === 0" class="note">In no scene: they speak only outside the scenes.</p>
      <ScaffoldTable v-else :heading-id="SCAFFOLD_SCENES_ID" :caption="`Scenes (${scenes.length})`">
        <thead>
          <tr>
            <th scope="col" class="num">Scene</th>
            <th scope="col">Heading</th>
            <th scope="col" class="num">Page</th>
            <th scope="col">Speaks</th>
            <th scope="col" class="num">Words</th>
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
            <td>{{ scene.speaking ? 'Speaks' : 'Silent' }}</td>
            <td class="num">{{ scene.words.toLocaleString('en-US') }}</td>
          </tr>
        </tbody>
      </ScaffoldTable>

      <ScaffoldLines :lines="lines" :title="lineTitle" @go="go" />
    </template>
  </div>
</template>
