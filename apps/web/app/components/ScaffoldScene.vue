<script setup lang="ts">
import { placeOf } from '@drafter/cast';
import { useCast } from '~/cast/use-cast';
import { useEditor } from '~/editor/session';
import { useOutline } from '~/outline/use-outline';
import { rowsFor, sceneFacts, sceneTitle } from '~/scaffold/labels';
import { useScaffold } from '~/scaffold/session';
import { SCAFFOLD_HEADING_ID, SCAFFOLD_SCENES_ID } from '~/scaffold/show';
import { useRates } from '~/stats/timing';
import { GONE } from '~/strip/labels';

// Scaffold's scene page (seeing-the-script design §5.2): the scene's heading with Go to, its facts,
// and who is in it, speakers first, then the silent, from the cast Scaffold holds. It follows the
// cursor's scene quietly (no focus moves, nothing is announced), or keeps a pinned one. The heading
// and the facts are the live scene's; the rows are the cast's for the same scene, found by its id
// in the scenes the cast was worked out from, so a scene added above it never puts another scene's
// people under its heading while the cast catches up (Counting… until it has the scene). Each
// name links to the character's page, "{n} more" to its Scenes, and the place to its page; before
// the first scene, the Cast and Places lists are a link away.
const editor = useEditor();
const outline = useOutline();
const { cast, basis } = useCast();
const { sceneShown: scene, follow, page } = useScaffold();
const rates = useRates();

const facts = computed(() => {
  const s = scene.value;
  if (!s) return [];
  return sceneFacts(s, placeOf(s, editor.doc.value, editor.template.value), rates.value);
});
const rows = computed(() => {
  const s = scene.value;
  return s ? rowsFor(cast.value, basis.value, outline.idOf(s), rates.value) : null;
});
// The table's region is a Tab stop only while it scrolls sideways (a phone, a narrow pane).
const region = ref<HTMLElement>();
const scrolls = useScrollsSideways(region);
const firsts = computed(() => rows.value?.filter((row) => row.first).map((row) => row.name) ?? []);
const noScenes = computed(() => outline.index.value.scenes.length === 0);
const BEFORE_FIRST = 'The cursor is before the first scene.';
/** Why there is no scene to show: none yet, the cursor before the first, or a pinned one gone. */
const why = computed(() => {
  if (scene.value) return null;
  if (noScenes.value) return 'No scenes yet. Each scene heading you write shows here.';
  if (!follow.value && page.value.kind === 'scene' && page.value.pinned !== null) return GONE;
  return BEFORE_FIRST;
});

// A pinned scene deleted while focus is on Go to: the button goes, and focus goes to the page's
// heading rather than to nowhere.
const goButton = ref<HTMLButtonElement>();
watch(scene, (now) => {
  if (now || !goButton.value || document.activeElement !== goButton.value) return;
  void nextTick(() => document.getElementById(SCAFFOLD_HEADING_ID)?.focus());
});

/** Go to: the cursor at the heading and the Source scrolled to it, while focus stays here. */
function goTo() {
  const s = scene.value;
  if (s) editor.goto(s.span.from, { keepFocus: true });
}
</script>

<template>
  <div class="scene-page">
    <div class="title-row">
      <h2 :id="SCAFFOLD_HEADING_ID" tabindex="-1">{{ scene ? sceneTitle(scene) : 'This scene' }}</h2>
      <button v-if="scene" ref="goButton" type="button" class="action" @click="goTo">
        Go to<span class="sr-only"> scene {{ scene.number ?? scene.ordinal }}</span>
      </button>
    </div>
    <template v-if="why">
      <p class="note">{{ why }}</p>
      <p v-if="why === BEFORE_FIRST" class="lists">
        <ScaffoldLink :to="{ kind: 'cast' }">Cast</ScaffoldLink>
        <ScaffoldLink :to="{ kind: 'places' }">Places</ScaffoldLink>
      </p>
    </template>
    <template v-else-if="scene">
      <dl class="facts">
        <div v-for="fact in facts" :key="fact.term" class="fact">
          <dt>{{ fact.term }}</dt>
          <dd>
            <template v-if="fact.link">
              <ScaffoldLink :to="fact.link.page">{{ fact.link.text }}</ScaffoldLink>
              <template v-if="fact.words">
                <span aria-hidden="true">{{ fact.value.slice(fact.link.text.length) }}</span>
                <span class="sr-only">{{ fact.words.slice(fact.link.text.length) }}</span>
              </template>
              <template v-else>{{ fact.value.slice(fact.link.text.length) }}</template>
            </template>
            <template v-else-if="fact.words">
              <span aria-hidden="true">{{ fact.value }}</span>
              <span class="sr-only">{{ fact.words }}</span>
            </template>
            <template v-else>{{ fact.value }}</template>
          </dd>
        </div>
      </dl>
      <p v-if="!rows" class="note">Counting…</p>
      <template v-else>
        <template v-if="rows.length === 0">
          <h3>In this scene (0)</h3>
          <p class="note">No one speaks in this scene or is named in its action.</p>
        </template>
        <!-- Its own scrolling region on a narrow screen, which the keyboard can scroll too; a named
             region only while it scrolls. -->
        <div
          v-else
          ref="region"
          class="scroll"
          :role="scrolls ? 'region' : undefined"
          :aria-labelledby="scrolls ? 'scaffold-here' : undefined"
          :tabindex="scrolls ? 0 : undefined"
        >
          <table class="people">
            <!-- The caption is the section's heading too, so the heading list finds it. -->
            <caption>
              <h3 id="scaffold-here">In this scene ({{ rows.length }})</h3>
            </caption>
            <thead>
              <tr>
                <th scope="col">Character</th>
                <th scope="col" class="num">Speeches</th>
                <th scope="col" class="num">Words</th>
                <th scope="col" class="num">Time speaking</th>
                <th scope="col" class="num">Other scenes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.key">
                <th scope="row">
                  <ScaffoldLink :to="{ kind: 'character', key: row.key }">{{ row.name }}</ScaffoldLink><template v-if="row.first">
                    <span class="sr-only">,</span> <span class="tag">First seen here</span>
                  </template>
                </th>
                <td class="num">{{ row.speeches }}</td>
                <td class="num">{{ row.words.toLocaleString('en-US') }}</td>
                <td class="num">
                  <template v-if="row.time">
                    <span aria-hidden="true">{{ row.time.text }} ({{ row.time.share }})</span>
                    <span class="sr-only">{{ row.time.words }}, {{ row.time.share }} of the scene</span>
                  </template>
                  <template v-else>
                    <span aria-hidden="true">—</span>
                    <span class="sr-only">Silent</span>
                  </template>
                </td>
                <td class="num">
                  <template v-if="row.more === 0">None</template>
                  <ScaffoldLink
                    v-else
                    :to="{ kind: 'character', key: row.key }"
                    :focus="SCAFFOLD_SCENES_ID"
                  >
                    {{ row.more }} more<span class="sr-only">{{
                      ` ${row.more === 1 ? 'scene' : 'scenes'} with ${row.name}`
                    }}</span>
                  </ScaffoldLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="firsts.length > 0" class="firsts">First seen here: {{ firsts.join(', ') }}.</p>
        <p class="note">
          Someone is in a scene when they speak in it or their name is in its action. A name that is
          also an ordinary word, like Will or even Tom, counts in the action only in capitals (WILL,
          TOM), and a mention counts as being there. A voice-over, such as (V.O.), counts as speaking
          in the scene.
        </p>
      </template>
    </template>
  </div>
</template>

<style scoped>
.title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.title-row h2 {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.action {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: none;
  color: var(--text);
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.action:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 2px 12px;
  margin: 4px 0 0;
}
.fact {
  display: contents;
}
.facts dt {
  color: var(--muted);
}
.facts dd {
  margin: 0;
  overflow-wrap: anywhere;
}
h3 {
  margin: 16px 0 4px;
  font-size: 13px;
}
.people caption {
  text-align: left;
}
.scroll {
  /* Holds the cells' hidden words, which are positioned, inside its own scrolling. */
  position: relative;
  overflow-x: auto;
}
.scroll:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.people {
  width: 100%;
  border-collapse: collapse;
}
.people th,
.people td {
  padding: 2px 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-weight: normal;
  vertical-align: top;
}
.people thead th {
  color: var(--muted);
}
.people .num {
  padding-left: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.tag {
  display: inline-block;
  margin-left: 4px;
  padding: 0 6px;
  border: 1px solid var(--heading);
  border-radius: 9px;
  font-size: 11px;
  white-space: nowrap;
}
.firsts {
  margin: 8px 0 0;
}
.lists {
  display: flex;
  gap: 12px;
  margin: 8px 0 0;
}
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
</style>
