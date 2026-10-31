<script setup lang="ts">
import { estimateSeconds } from '@drafter/outline';
import { useCast } from '~/cast/use-cast';
import { useEditor } from '~/editor/session';
import { templateIdOf } from '~/editor/template';
import { useMarkdown } from '~/markdown/use-markdown';
import { runningTime } from '~/stats/count';
import { useCounts } from '~/stats/counts';
import { progressLabel, useGoal } from '~/stats/goal';
import {
  chartBars,
  type DayFigure,
  duration,
  lastDays,
  type Month,
  type ScriptTotals,
  type StatsDay,
  scriptTotals,
  signed,
} from '~/stats/history';
import { headingCount, headingSplit, readingMinutes } from '~/stats/script-stats';
import { ESTIMATE_LABEL, estimateNote, pageRatePhrase, type Rates } from '~/stats/time-format';
import { parseRate, RATES_READ_ONLY, setRate, useRates } from '~/stats/timing';
import { useWritingStats } from '~/stats/writing';
import { useGuard } from '~/storage/guard';
import { useScript } from '~/storage/script';

// The Stats tab's Overview (seeing-the-script design §4.2): the Stats window's three sections,
// moved here unchanged: today, the script as a whole with its rates, and the last 30 days
// (docs/drafter-stats-design.md §4). Drawn only while the tab shows, so a key costs nothing else.
const { doc, kind } = useEditor();
const { tree, words: markdownWords } = useMarkdown();
const { counts, known } = useCounts();
const { progress } = useGoal();
const { project } = useScript();
const writing = useWritingStats();
const { readOnly } = useGuard();
const { cast } = useCast();

const markdown = computed(() => kind.value === 'markdown');
const sample = computed(() => !!project.value?.sample);
const today = writing.today;

/** The kept days, read when the tab opens and as the day's time moves; null while first read. */
const days = shallowRef<Map<string, StatsDay> | null>(null);
/** The newest read: an older one that answers late is dropped. */
let reading = 0;
async function readDays() {
  const mine = ++reading;
  const kept = await writing.days();
  if (mine === reading) days.value = kept;
}
watch(
  () => project.value?.id,
  () => {
    days.value = null;
    void readDays();
  },
  { immediate: true },
);
// Today's bar in the chart grows with the day: read again when the minute shown moves.
watch(
  () => today.value?.ms,
  () => {
    if (days.value) void readDays();
  },
);

// ---- This script ---------------------------------------------------------------------------
/** The speaking characters, as the Characters section counts them; null until the cast is in. */
const characterCount = computed(() => cast.value?.characters.length ?? null);
const screenplay = computed(() => !markdown.value && templateIdOf(doc.value) === 'us-screenplay');
const split = computed(() => (screenplay.value ? headingSplit(doc.value) : null));
const percent = (n: number, total: number) => `${Math.round((n / total) * 100)}%`;
/** The headings' split (fresh-look design §7): two 100% bars, Place and Time, each a picture of its
 * list, which says every count and share as text. A part of none isn't drawn in the bar. */
const splits = computed(() => {
  const s = split.value;
  if (!s || s.total === 0) return [];
  const parts = (rows: Array<{ label: string; n: number }>) =>
    rows.map((row, i) => ({ ...row, tone: i, share: percent(row.n, s.total) }));
  return [
    {
      name: 'Place',
      parts: parts([
        { label: 'Interior', n: s.place.interior },
        { label: 'Exterior', n: s.place.exterior },
        { label: 'Interior and exterior', n: s.place.both },
        { label: 'Other place', n: s.place.other },
      ]),
    },
    {
      name: 'Time',
      parts: parts([
        { label: 'Day', n: s.time.day },
        { label: 'Night', n: s.time.night },
        { label: 'Other time', n: s.time.other },
      ]),
    },
  ];
});
const headings = computed(() => headingCount(tree.value));

// ---- The rates -------------------------------------------------------------------------------
const rates = useRates();
/** The running time at the script's page rate, in whole minutes. */
const runMinutes = computed(() =>
  counts.value ? Math.round(counts.value.pages * rates.value.minutesPerPage) : 0,
);
/** The estimate from the dialogue at the script's pace, in whole minutes. */
const estimateMinutes = computed(() =>
  counts.value
    ? Math.round(estimateSeconds(counts.value.timing, rates.value.wordsPerMinute) / 60)
    : 0,
);
/** What each rate field holds, and what it says is wrong with it. */
const rateText = reactive<Record<keyof Rates, string>>({ minutesPerPage: '', wordsPerMinute: '' });
const rateProblem = reactive<Record<keyof Rates, string>>({
  minutesPerPage: '',
  wordsPerMinute: '',
});
function showRates() {
  for (const key of ['minutesPerPage', 'wordsPerMinute'] as const) {
    rateText[key] = String(rates.value[key]);
    rateProblem[key] = '';
  }
}
// The fields show the stored rates when the tab opens, and when another script's are read.
watch(() => project.value?.id, showRates, { immediate: true });
/** A rate typed and left: kept when it is one, or the field says why not and the last good one stays. */
async function onRate(key: keyof Rates) {
  const parsed = parseRate(key, rateText[key]);
  if (typeof parsed !== 'number') {
    rateProblem[key] = parsed.problem;
    return;
  }
  rateProblem[key] = '';
  rateText[key] = String(parsed);
  // Then what was kept, so the field never shows a rate the script doesn't have (unless the
  // writer has typed again meanwhile).
  const kept = await setRate(key, parsed);
  if (rateText[key] === String(parsed)) rateText[key] = String(kept[key]);
}
/** The ids that describe a rate field: its hint, and its problem when it has one. */
const describedBy = (key: keyof Rates, hint?: string) =>
  [hint, rateProblem[key] ? `stats-rate-${key}-problem` : undefined].filter(Boolean).join(' ') ||
  undefined;

const DATE = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
/** A `YYYY-MM-DD` as a local date. */
const dateOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
};

const totals = computed<ScriptTotals | null>(() => (days.value ? scriptTotals(days.value) : null));
const month = computed<Month | null>(() => (days.value ? lastDays(days.value, new Date()) : null));
const plural = (n: number, noun: string) =>
  `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`;

// ---- The chart -------------------------------------------------------------------------------
const WIDTH = 300;
const HEIGHT = 80;
const BAR = WIDTH / 30;
/** Bars on a zero line: growth above it, a cutting day below (`chartBars`). */
const bars = computed(() => {
  const list = month.value?.days ?? [];
  const { zero, bars: shapes } = chartBars(list, HEIGHT);
  return {
    zero,
    list: list.map((day, i) => ({
      ...day,
      ...(shapes[i] as { y: number; height: number }),
      x: i * BAR + 1,
      label: dayLabel(day),
    })),
  };
});
function dayLabel(day: DayFigure): string {
  const when = SHORT.format(dateOf(day.date));
  if (day.ms <= 0 && day.words === 0) return `${when}: not written`;
  return `${when}: ${signed(day.words)} words, ${duration(day.ms)}`;
}
</script>

<template>
  <section class="section" aria-labelledby="stats-overview">
    <h2 id="stats-overview" tabindex="-1">Overview</h2>
    <p v-if="sample" class="note">Stats are kept for your own scripts, not the samples.</p>

    <div v-if="!sample" class="part">
      <h3 id="stats-today-title">Today</h3>
      <p v-if="readOnly" class="note">
        Another tab is editing this script, and counts its writing time there. Its days so far are below.
      </p>
      <p v-else-if="!today || today.ms <= 0" class="note">Nothing written yet today.</p>
      <dl v-else class="figures">
        <dt>Words added</dt>
        <dd>{{ today.words === null ? 'Counting…' : signed(today.words) }}</dd>
        <template v-if="!markdown">
          <dt>Pages added</dt>
          <dd>{{ today.pages === null ? 'Counting…' : signed(today.pages) }}</dd>
        </template>
        <dt>Writing time</dt>
        <dd>{{ duration(today.ms) }}</dd>
        <template v-if="progress">
          <dt>Daily goal</dt>
          <dd>{{ progressLabel(progress) }}</dd>
        </template>
      </dl>
    </div>

    <div class="part">
      <div class="title-row">
        <h3 id="stats-script-title">This script</h3>
        <DInfo label="About these figures">
          <p v-if="markdown">Reading time is 230 words a minute.</p>
          <template v-else>
            <p>Running time is the pages at the script’s rate.</p>
            <p>{{ estimateNote(rates) }}</p>
          </template>
        </DInfo>
      </div>
      <!-- The four figures a writer looks for first, as tiles: each a term and its value, the
           value drawn large above its label. -->
      <dl class="tiles">
        <template v-if="markdown">
          <div class="tile" data-stat-tile>
            <dt>Words</dt>
            <dd><span class="tile-value">{{ markdownWords.toLocaleString('en-US') }}</span></dd>
          </div>
          <div class="tile" data-stat-tile>
            <dt>Headings</dt>
            <dd><span class="tile-value">{{ headings }}</span></dd>
          </div>
          <div class="tile" data-stat-tile>
            <dt>Reading time</dt>
            <dd><span class="tile-value">{{ runningTime(readingMinutes(markdownWords)) }}</span></dd>
          </div>
        </template>
        <template v-else-if="counts">
          <div class="tile" data-stat-tile>
            <dt>Pages</dt>
            <dd><span class="tile-value">{{ known.pages === null ? 'Counting…' : counts.pages }}</span></dd>
          </div>
          <div class="tile" data-stat-tile>
            <dt>Scenes</dt>
            <dd><span class="tile-value">{{ counts.scenes }}</span></dd>
          </div>
          <div class="tile" data-stat-tile>
            <dt>Words</dt>
            <dd><span class="tile-value">{{ counts.words.toLocaleString('en-US') }}</span></dd>
          </div>
          <div class="tile" data-stat-tile>
            <dt>Running time</dt>
            <dd>
              <template v-if="known.pages === null"><span class="tile-value">Counting…</span></template>
              <template v-else>
                <span class="tile-value">{{ runningTime(runMinutes) }}</span><span class="tile-sub"><span class="sr-only">, </span>at {{ pageRatePhrase(rates.minutesPerPage) }}</span>
              </template>
            </dd>
          </div>
        </template>
      </dl>
      <dl v-if="!markdown && counts || (!sample && totals && totals.daysWritten > 0)" class="figures">
        <template v-if="!markdown && counts">
          <dt>{{ ESTIMATE_LABEL }}</dt>
          <dd>{{ runningTime(estimateMinutes) }}</dd>
          <dt>Characters</dt>
          <dd>{{ characterCount ?? 'Counting…' }}</dd>
        </template>
        <template v-if="!sample && totals && totals.daysWritten > 0">
          <dt>Total writing time</dt>
          <dd>{{ duration(totals.ms) }}</dd>
          <dt>Days written</dt>
          <dd>{{ totals.daysWritten }}</dd>
          <dt>First day written</dt>
          <dd>{{ totals.firstDay ? DATE.format(dateOf(totals.firstDay)) : '' }}</dd>
        </template>
      </dl>
      <template v-if="!markdown">
        <form class="rates" aria-labelledby="stats-rates-title" @submit.prevent>
          <h4 id="stats-rates-title" class="sr-only">Rates</h4>
          <p v-if="readOnly" class="note">{{ RATES_READ_ONLY }}</p>
          <fieldset :disabled="readOnly" class="bare">
            <div class="rate">
              <label for="stats-rate-minutesPerPage">Minutes a page</label>
              <input
                id="stats-rate-minutesPerPage"
                v-model="rateText.minutesPerPage"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                :aria-invalid="rateProblem.minutesPerPage ? 'true' : 'false'"
                :aria-describedby="describedBy('minutesPerPage', 'stats-rate-minutesPerPage-hint')"
                @change="onRate('minutesPerPage')"
              >
              <p id="stats-rate-minutesPerPage-hint" class="hint">Plays often run longer than a minute a page.</p>
              <p v-if="rateProblem.minutesPerPage" id="stats-rate-minutesPerPage-problem" class="problem" role="alert">{{ rateProblem.minutesPerPage }}</p>
            </div>
            <div class="rate">
              <label for="stats-rate-wordsPerMinute">Spoken words a minute</label>
              <input
                id="stats-rate-wordsPerMinute"
                v-model="rateText.wordsPerMinute"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                :aria-invalid="rateProblem.wordsPerMinute ? 'true' : 'false'"
                :aria-describedby="describedBy('wordsPerMinute')"
                @change="onRate('wordsPerMinute')"
              >
              <p v-if="rateProblem.wordsPerMinute" id="stats-rate-wordsPerMinute-problem" class="problem" role="alert">{{ rateProblem.wordsPerMinute }}</p>
            </div>
          </fieldset>
        </form>
      </template>

      <figure v-if="splits.length > 0" class="splits" aria-labelledby="stats-split-title">
        <figcaption id="stats-split-title">Scene headings</figcaption>
        <div
          v-for="bar in splits"
          :key="bar.name"
          class="split"
          role="group"
          :aria-labelledby="`stats-split-${bar.name}`"
        >
          <div :id="`stats-split-${bar.name}`" class="split-name">{{ bar.name }}</div>
          <!-- A picture of the list under it, which is what a screen reader reads. -->
          <div class="bar" aria-hidden="true">
            <span
              v-for="part in bar.parts.filter((p) => p.n > 0)"
              :key="part.label"
              :class="`tone-${part.tone}`"
              :style="{ flexGrow: part.n }"
            />
          </div>
          <ul class="legend">
            <li v-for="part in bar.parts" :key="part.label" :class="{ none: part.n === 0 }">
              <span class="swatch" :class="`tone-${part.tone}`" aria-hidden="true" />
              {{ part.label }} <span class="count">{{ part.n }}</span> ({{ part.share }})
            </li>
          </ul>
        </div>
      </figure>
    </div>

    <div v-if="!sample" class="part">
      <h3 id="stats-month-title">Last 30 days</h3>
      <p v-if="!days" class="note">Reading…</p>
      <p v-else-if="month && month.daysWritten === 0" class="note">
        {{ readOnly ? 'No writing time is kept for this script yet.' : 'Writing time is counted from now on.' }}
      </p>
      <template v-else-if="month">
        <!-- The chart is a picture of the table below it, which is what a screen reader reads. -->
        <svg
          class="chart"
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <line :x1="0" :x2="WIDTH" :y1="bars.zero" :y2="bars.zero" class="zero" />
          <rect
            v-for="bar in bars.list"
            :key="bar.date"
            :x="bar.x"
            :y="bar.y"
            :width="BAR - 2"
            :height="bar.height"
            :class="bar.words < 0 ? 'cut' : 'grew'"
          >
            <title>{{ bar.label }}</title>
          </rect>
        </svg>
        <div class="axis" aria-hidden="true">
          <span>{{ SHORT.format(dateOf(month.days[0]?.date ?? '')) }}</span>
          <span>Today</span>
        </div>
        <table class="sr-only">
          <caption>Words added each day, and writing time, for the last 30 days</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Words added</th>
              <th scope="col">Writing time</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="day in month.days" :key="day.date">
              <th scope="row">{{ DATE.format(dateOf(day.date)) }}</th>
              <td>{{ signed(day.words) }}</td>
              <td>{{ day.ms > 0 ? duration(day.ms) : 'None' }}</td>
            </tr>
          </tbody>
        </table>
        <dl class="figures">
          <dt>Days written</dt>
          <dd>{{ month.daysWritten }}</dd>
          <dt>Best day</dt>
          <dd>{{ month.best ? `${SHORT.format(dateOf(month.best.date))}, ${signed(month.best.words)} words` : 'None yet' }}</dd>
          <dt>Average words per writing day</dt>
          <dd>{{ month.average === null ? '' : signed(month.average) }}</dd>
          <dt>Current streak</dt>
          <dd>{{ plural(month.streak, 'day') }}</dd>
        </dl>
      </template>
    </div>
  </section>
</template>

<style scoped>
h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.part {
  padding: 16px 0;
  border-top: 1px solid var(--border);
}
.part > h3 {
  margin-bottom: 10px;
}
.title-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
}
/* The tiles (fresh-look design §7): the value 22/650, its label 12/500 in --muted under it. The
   label comes first in the page, so a screen reader hears "Pages, 2". */
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
  gap: 8px;
  margin: 0 0 12px;
}
.tile {
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-end;
  gap: 2px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
}
.tile dt {
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}
.tile dd {
  display: flex;
  flex-direction: column;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.tile-value {
  font-size: 22px;
  font-weight: 650;
  line-height: 28px;
  overflow-wrap: anywhere;
}
.tile-sub {
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.figures {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0;
  margin: 0;
}
.figures dt,
.figures dd {
  display: flex;
  align-items: center;
  min-height: 32px;
  border-bottom: 1px solid var(--border);
}
.figures dt {
  padding-right: 16px;
  color: var(--muted);
}
.figures dd {
  justify-content: flex-end;
  margin: 0;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
/* The headings' split: two 100% bars with their lists. */
.splits {
  margin: 16px 0 0;
}
.splits figcaption {
  margin-bottom: 8px;
  font-weight: 600;
}
.split + .split {
  margin-top: 12px;
}
.split-name {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 500;
}
.bar {
  display: flex;
  gap: 2px;
  height: 10px;
  overflow: hidden;
  border-radius: 5px;
  background: var(--raised);
}
.bar > span {
  flex-basis: 0;
  min-width: 2px;
}
.tone-0 {
  background: var(--accent);
}
.tone-1 {
  background: var(--muted);
}
.tone-2 {
  background: color-mix(in srgb, var(--accent) 45%, var(--surface));
}
.tone-3 {
  background: var(--highlight);
  box-shadow: inset 0 0 0 1px var(--muted);
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 16px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}
.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend li.none {
  color: var(--muted);
}
.count {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}
.chart {
  display: block;
  width: 100%;
  height: 80px;
  margin-top: 4px;
}
.chart .zero {
  stroke: var(--border);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.chart .grew {
  fill: var(--accent);
}
.chart .cut {
  fill: var(--muted);
}
.axis {
  display: flex;
  justify-content: space-between;
  margin: 2px 0 8px;
  color: var(--muted);
  font-size: 11px;
}
.rates {
  margin-top: 10px;
}
.bare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 8px 16px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.rate label {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
}
.rate input {
  box-sizing: border-box;
  width: 6rem;
  min-height: 28px;
  padding: 0 6px;
  border: 1px solid var(--muted);
  border-radius: var(--r-sm);
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.rate input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.rate input:disabled {
  opacity: 0.6;
}
.hint {
  margin: 4px 0 0;
  color: var(--muted);
}
.problem {
  margin: 6px 0 0;
  padding-left: 8px;
  box-shadow: inset 3px 0 0 var(--accent);
}
@media (forced-colors: active) {
  .chart .grew,
  .chart .cut {
    fill: CanvasText;
  }
  .bar > span,
  .swatch {
    border: 1px solid CanvasText;
  }
}
</style>
