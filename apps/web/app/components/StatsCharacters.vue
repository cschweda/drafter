<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { SCAFFOLD_HEADING_ID, showScaffold } from '~/scaffold/show';
import { characterRows } from '~/stats/characters';
import { pageRatePhrase } from '~/stats/time-format';
import { useRates } from '~/stats/timing';

// The Stats tab's Characters (seeing-the-script design §4.3): a row per speaking character, most
// speeches first, from the cast the tab holds. Not sortable in v1 (a sortable table needs a keyboard
// model of its own). Screen time waits for the pages; until then the column says "—". Each name is
// a link to the character's Scaffold page (design §5.6).
const { cast } = useCast();
const rates = useRates();
const rows = computed(() => (cast.value ? characterRows(cast.value, rates.value) : null));
const waiting = computed(() => !!rows.value?.some((row) => row.screen === null));
// The table's region is a Tab stop only while it scrolls sideways (a phone, a narrow pane).
const region = ref<HTMLElement>();
const scrolls = useScrollsSideways(region);
</script>

<template>
  <section class="section" aria-labelledby="stats-characters">
    <div class="title-row">
      <h2 id="stats-characters" tabindex="-1">Characters</h2>
      <DInfo v-if="rows && rows.length > 0" label="About the Characters table">
        <p>
          Scenes counts every scene a character is in, speaking or not; Speaks in, the scenes they
          speak in. Words are their dialogue and lyrics, and the dialogue shares are of those words.
          A character is counted once, whatever the extension, such as (V.O.). Each name opens the
          character’s page in Scaffold.
        </p>
      </DInfo>
    </div>
    <p v-if="!rows" class="note">Counting…</p>
    <DEmpty v-else-if="rows.length === 0" icon="i-lucide-users">No one speaks yet. A character’s cue starts their row.</DEmpty>
    <template v-else>
      <!-- Its own scrolling region on a narrow screen, which the keyboard can scroll too; a named
           region only while it scrolls. -->
      <div
        ref="region"
        class="d-table-scroll"
        :class="{ fits: !scrolls }"
        :role="scrolls ? 'region' : undefined"
        :aria-labelledby="scrolls ? 'stats-characters' : undefined"
        :tabindex="scrolls ? 0 : undefined"
      >
        <!-- Named by the section's heading, rather than a caption that would say "Characters"
             again under it; until the pages are in, described by the line that says so. -->
        <table
          class="d-table"
          aria-labelledby="stats-characters"
          :aria-describedby="waiting ? 'stats-characters-waiting' : undefined"
        >
          <thead>
            <tr>
              <th scope="col">Character</th>
              <th scope="col" class="num">Speeches</th>
              <th scope="col" class="num">Scenes</th>
              <th scope="col" class="num">Speaks in</th>
              <th scope="col" class="num">Words</th>
              <th scope="col" class="num">Dialogue share</th>
              <th scope="col" class="num">
                Screen time<span class="sr-only">, at {{ pageRatePhrase(rates.minutesPerPage) }}</span>
              </th>
              <th scope="col">Most often with</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.key">
              <th scope="row">
                <a
                  :href="`#${SCAFFOLD_HEADING_ID}`"
                  class="name-link"
                  @click.prevent="showScaffold({ kind: 'character', key: row.key })"
                >
                  {{ row.name }}
                </a>
              </th>
              <td class="num">{{ row.speeches }}</td>
              <td class="num">{{ row.scenes }}</td>
              <td class="num">{{ row.speaksIn }}</td>
              <td class="num">{{ row.words.toLocaleString('en-US') }}</td>
              <td class="num">{{ row.share }}</td>
              <td class="num screen-time">
                <template v-if="row.screen">
                  <!-- "1 4/8 p · about 1 min" may break after its dot, never inside a part. -->
                  <span aria-hidden="true" class="screen"
                    ><template v-for="(part, i) in row.screen.text.split(' · ')" :key="i"
                      ><template v-if="i > 0"> · </template><span class="part">{{ part }}</span></template
                    ></span
                  >
                  <span class="sr-only">{{ row.screen.words }}</span>
                </template>
                <template v-else>
                  <span aria-hidden="true">—</span>
                  <span class="sr-only">When the pages are ready</span>
                </template>
              </td>
              <td class="often">{{ row.often || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="waiting" id="stats-characters-waiting" class="note">Screen time waits for the pages.</p>
    </template>
  </section>
</template>

<style scoped>
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
/* The names and "most often with" may wrap, and the headers do (tables.css); the figures keep to
   one line, but for screen time, which may break after its " · ". So the table fits a 720px column
   at 1440 by 900, and scrolls sideways only in a pane narrower than that. */
.d-table .often {
  padding-top: 8px;
  padding-bottom: 8px;
}
/* Two lines of 16px still fit the 36px row. */
.d-table td.screen-time {
  line-height: 16px;
  white-space: normal;
}
.screen .part {
  white-space: nowrap;
}
</style>
