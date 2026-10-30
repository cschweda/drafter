<script setup lang="ts">
import { placeOf } from '@drafter/cast';
import { useCast } from '~/cast/use-cast';
import { useEditor } from '~/editor/session';
import { useOutline } from '~/outline/use-outline';
import { sceneFacts, sceneRows, sceneTitle } from '~/scaffold/labels';
import { useScaffold } from '~/scaffold/session';
import { SCAFFOLD_HEADING_ID } from '~/scaffold/show';
import { useRates } from '~/stats/timing';
import { GONE } from '~/strip/labels';

// Scaffold's scene page (seeing-the-script design §5.2): the scene's heading with Go to, its facts,
// and who is in it, speakers first, then the silent, from the cast Scaffold holds. It follows the
// cursor's scene quietly (no focus moves, nothing is announced), or keeps a pinned one. The heading
// and the facts are the live scene's; the rows read the scene index the cast was worked out from,
// so they agree with the cast while the writer types on.
const editor = useEditor();
const outline = useOutline();
const { cast, basis } = useCast();
const { sceneShown: scene, follow, page } = useScaffold();
const rates = useRates();

/** The scene's place in the index: the cast's lists are by it. */
const position = computed(() => (scene.value ? scene.value.ordinal - 1 : -1));
const facts = computed(() => {
  const s = scene.value;
  if (!s) return [];
  return sceneFacts(s, placeOf(s, editor.doc.value, editor.template.value), rates.value);
});
const rows = computed(() => {
  const c = cast.value;
  const indexed = basis.value?.index.scenes[position.value];
  if (!c || !indexed) return null;
  return sceneRows(c, position.value, indexed, rates.value);
});
// The table's region is a Tab stop only while it scrolls sideways (a phone, a narrow pane).
const region = ref<HTMLElement>();
const scrolls = useScrollsSideways(region);
const firsts = computed(() => rows.value?.filter((row) => row.first).map((row) => row.name) ?? []);
const noScenes = computed(() => outline.index.value.scenes.length === 0);
/** Why there is no scene to show: none yet, the cursor before the first, or a pinned one gone. */
const why = computed(() => {
  if (scene.value) return null;
  if (noScenes.value) return 'No scenes yet. Each scene heading you write shows here.';
  if (!follow.value && page.value.kind === 'scene' && page.value.pinned !== null) return GONE;
  return 'The cursor is before the first scene.';
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
      <button v-if="scene" type="button" class="action" @click="goTo">
        Go to<span class="sr-only"> scene {{ scene.number ?? scene.ordinal }}</span>
      </button>
    </div>
    <p v-if="why" class="note">{{ why }}</p>
    <template v-else-if="scene">
      <dl class="facts">
        <div v-for="fact in facts" :key="fact.term" class="fact">
          <dt>{{ fact.term }}</dt>
          <dd>
            <template v-if="fact.words">
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
        <!-- Its own scrolling region on a narrow screen, which the keyboard can scroll too. -->
        <div
          v-else
          ref="region"
          class="scroll"
          role="region"
          aria-labelledby="scaffold-here"
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
                  {{ row.name }}<template v-if="row.first">
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
                <td class="num">{{ row.more === 0 ? 'None' : `${row.more} more` }}</td>
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
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
</style>
