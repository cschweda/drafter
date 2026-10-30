<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { characterRows } from '~/stats/characters';
import { pageRatePhrase } from '~/stats/time-format';
import { useRates } from '~/stats/timing';

// The Stats tab's Characters (seeing-the-script design §4.3): a row per speaking character, most
// speeches first, from the cast the tab holds. Not sortable in v1 (a sortable table needs a keyboard
// model of its own). Screen time waits for the pages; until then the column says "—".
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
    <h2 id="stats-characters" tabindex="-1">Characters</h2>
    <p v-if="!rows" class="note">Counting…</p>
    <p v-else-if="rows.length === 0" class="note">No one speaks yet. A character’s cue starts their row.</p>
    <template v-else>
      <!-- Its own scrolling region on a narrow screen, which the keyboard can scroll too; a named
           region only while it scrolls. -->
      <div
        ref="region"
        class="scroll"
        :role="scrolls ? 'region' : undefined"
        :aria-labelledby="scrolls ? 'stats-characters-caption' : undefined"
        :tabindex="scrolls ? 0 : undefined"
      >
        <table class="tally">
          <caption id="stats-characters-caption">
            Characters<span v-if="waiting" class="caption-note"> Screen time waits for the pages.</span>
          </caption>
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
              <th scope="row">{{ row.name }}</th>
              <td class="num">{{ row.speeches }}</td>
              <td class="num">{{ row.scenes }}</td>
              <td class="num">{{ row.speaksIn }}</td>
              <td class="num">{{ row.words.toLocaleString('en-US') }}</td>
              <td class="num">{{ row.share }}</td>
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
              <td>{{ row.often || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="note">
        Scenes counts every scene a character is in, speaking or not; Speaks in, the scenes they
        speak in. Words are their dialogue and lyrics, and the dialogue shares are of those words.
        A character is counted once, whatever the extension, such as (V.O.).
      </p>
    </template>
  </section>
</template>

<style scoped>
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
.scroll {
  /* Holds the cells' hidden words, which are positioned, inside its own scrolling: else they sit
     where the cell is, past the screen's edge, and widen the page on a phone. */
  position: relative;
  overflow-x: auto;
}
.scroll:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.tally {
  width: 100%;
  margin-top: 4px;
  border-collapse: collapse;
}
.tally caption {
  margin-bottom: 4px;
  font-weight: 600;
  text-align: left;
}
.caption-note {
  color: var(--muted);
  font-weight: normal;
}
.tally th,
.tally td {
  padding: 2px 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-weight: normal;
  vertical-align: top;
}
.tally thead th {
  color: var(--muted);
}
.tally .num {
  padding-left: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
.tally td:last-child {
  padding-left: 12px;
}
</style>
