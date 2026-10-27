<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { templateIdOf } from '~/editor/template';
import { useMarkdown } from '~/markdown/use-markdown';
import { runningTime } from '~/stats/count';
import { useCounts } from '~/stats/counts';
import { statsOpen } from '~/stats/dialog';
import { progressLabel, useGoal } from '~/stats/goal';
import {
  type DayFigure,
  duration,
  lastDays,
  type Month,
  type ScriptTotals,
  type StatsDay,
  scriptTotals,
  signed,
} from '~/stats/history';
import { characterTable, headingCount, headingSplit, readingMinutes } from '~/stats/script-stats';
import { useWritingStats } from '~/stats/writing';
import { useScript } from '~/storage/script';

// The Stats window (docs/drafter-stats-design.md §4): today, the script as a whole, and the last
// 30 days. Same look as Settings; opened from the Counts panel, Show stats, and the Drafter menu.
const dialog = ref<HTMLDialogElement>();
const { doc, kind } = useEditor();
const { tree, words: markdownWords } = useMarkdown();
const { counts, known } = useCounts();
const { progress } = useGoal();
const { project } = useScript();
const writing = useWritingStats();

const markdown = computed(() => kind.value === 'markdown');
const sample = computed(() => !!project.value?.sample);
const today = writing.today;

/** The kept days, read when the window opens; null while they are read, or for a sample. */
const days = shallowRef<Map<string, StatsDay> | null>(null);
/** Where focus was when the window opened, given back when it closes. */
let opener: HTMLElement | null = null;

watch(statsOpen, async (open) => {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    days.value = null;
    el.showModal();
    // The window itself has focus, so it opens at the top, not scrolled down to its Close button.
    el.focus();
    el.scrollTop = 0;
    const kept = await writing.days();
    if (statsOpen.value) days.value = kept;
  } else if (!open && el.open) {
    el.close();
  }
});

// Escape goes through `statsOpen`, as in Settings, so the state is false at once.
function onCancel() {
  statsOpen.value = false;
}

function onClose() {
  if (!dialog.value?.open) statsOpen.value = false;
  // The browser gives focus back too, but not when the opener was in a panel that has closed since.
  if (opener?.isConnected) opener.focus();
  opener = null;
}

// ---- This script ---------------------------------------------------------------------------
/** The character table's longest list; the rest are "and N more". */
const TOP = 20;
const characters = computed(() =>
  statsOpen.value && !markdown.value ? characterTable(doc.value) : [],
);
const shownCharacters = computed(() => characters.value.slice(0, TOP));
const screenplay = computed(() => !markdown.value && templateIdOf(doc.value) === 'us-screenplay');
const split = computed(() =>
  statsOpen.value && screenplay.value ? headingSplit(doc.value) : null,
);
const percent = (n: number, total: number) => `${Math.round((n / total) * 100)}%`;
const splitRows = computed(() => {
  const s = split.value;
  if (!s || s.total === 0) return [];
  return [
    { label: 'Interior', n: s.place.interior },
    { label: 'Exterior', n: s.place.exterior },
    { label: 'Interior and exterior', n: s.place.both },
    { label: 'Other place', n: s.place.other },
    { label: 'Day', n: s.time.day },
    { label: 'Night', n: s.time.night },
    { label: 'Other time', n: s.time.other },
  ].map((row) => ({ ...row, share: percent(row.n, s.total) }));
});
const headings = computed(() => headingCount(tree.value));

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
/** Bars on a zero line: growth above it, a cutting day below, each as tall as its share of the largest. */
const bars = computed(() => {
  const list = month.value?.days ?? [];
  const up = Math.max(0, ...list.map((day) => day.words));
  const down = Math.max(0, ...list.map((day) => -day.words));
  const room = up + down || 1;
  const zero = (up / room) * HEIGHT || (down > 0 ? 0 : HEIGHT);
  return {
    zero,
    list: list.map((day, i) => {
      const size = (Math.abs(day.words) / room) * HEIGHT;
      return {
        ...day,
        x: i * BAR + 1,
        y: day.words >= 0 ? zero - size : zero,
        height: Math.max(day.ms > 0 ? 1 : 0, size),
        label: dayLabel(day),
      };
    }),
  };
});
function dayLabel(day: DayFigure): string {
  const when = SHORT.format(dateOf(day.date));
  if (day.ms <= 0 && day.words === 0) return `${when}: not written`;
  return `${when}: ${signed(day.words)} words, ${duration(day.ms)}`;
}
</script>

<template>
  <dialog ref="dialog" class="stats" tabindex="-1" aria-labelledby="stats-title" @cancel.prevent="onCancel" @close="onClose">
    <h2 id="stats-title">Stats</h2>
    <p v-if="sample" class="note">Stats are kept for your own scripts, not the samples.</p>

    <section v-if="!sample" class="part" aria-labelledby="stats-today-title">
      <h3 id="stats-today-title">Today</h3>
      <p v-if="!today || today.ms <= 0" class="note">Nothing written yet today.</p>
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
    </section>

    <section class="part" aria-labelledby="stats-script-title">
      <h3 id="stats-script-title">This script</h3>
      <dl class="figures">
        <template v-if="markdown">
          <dt>Words</dt>
          <dd>{{ markdownWords.toLocaleString('en-US') }}</dd>
          <dt>Headings</dt>
          <dd>{{ headings }}</dd>
          <dt>Reading time</dt>
          <dd>{{ runningTime(readingMinutes(markdownWords)) }}</dd>
        </template>
        <template v-else-if="counts">
          <dt>Pages</dt>
          <dd>{{ known.pages === null ? 'Counting…' : counts.pages }}</dd>
          <dt>Scenes</dt>
          <dd>{{ counts.scenes }}</dd>
          <dt>Words</dt>
          <dd>{{ counts.words.toLocaleString('en-US') }}</dd>
          <dt>Running time</dt>
          <dd>{{ known.pages === null ? 'Counting…' : runningTime(counts.minutes) }}</dd>
          <dt>Characters</dt>
          <dd>{{ characters.length }}</dd>
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
      <p v-if="markdown" class="note">Reading time is 230 words a minute.</p>
      <p v-else class="note">Running time is a page a minute. A character is counted once, whatever the extension, such as (V.O.).</p>

      <table v-if="shownCharacters.length > 0" class="tally">
        <caption>Characters</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col" class="num">Speeches</th>
            <th scope="col" class="num">Scenes</th>
            <th scope="col" class="num">Words</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in shownCharacters" :key="row.name">
            <th scope="row">{{ row.name }}</th>
            <td class="num">{{ row.speeches }}</td>
            <td class="num">{{ row.scenes }}</td>
            <td class="num">{{ row.words.toLocaleString('en-US') }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="characters.length > TOP" class="note">And {{ characters.length - TOP }} more.</p>

      <table v-if="splitRows.length > 0" class="tally">
        <caption>Scene headings</caption>
        <thead>
          <tr>
            <th scope="col">Heading</th>
            <th scope="col" class="num">Scenes</th>
            <th scope="col" class="num">Share</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in splitRows" :key="row.label">
            <th scope="row">{{ row.label }}</th>
            <td class="num">{{ row.n }}</td>
            <td class="num">{{ row.share }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="!sample" class="part" aria-labelledby="stats-month-title">
      <h3 id="stats-month-title">Last 30 days</h3>
      <p v-if="!days" class="note">Reading…</p>
      <p v-else-if="month && month.daysWritten === 0" class="note">Writing time is counted from now on.</p>
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
    </section>

    <div class="buttons">
      <button type="button" class="btn" @click="statsOpen = false">Close</button>
    </div>
  </dialog>
</template>

<style scoped>
.stats {
  box-sizing: border-box;
  width: min(32rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
  overflow: auto;
}
.stats:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.stats::backdrop {
  background: rgb(0 0 0 / 0.5);
}
h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
h3 {
  margin: 0 0 6px;
  font-size: 13px;
}
.part {
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.figures {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 16px;
  margin: 0;
}
.figures dt {
  color: var(--muted);
}
.figures dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
.tally {
  width: 100%;
  margin-top: 10px;
  border-collapse: collapse;
}
.tally caption {
  margin-bottom: 4px;
  font-weight: 600;
  text-align: left;
}
.tally th,
.tally td {
  padding: 2px 0;
  border-bottom: 1px solid var(--line);
  text-align: left;
  font-weight: normal;
}
.tally thead th {
  color: var(--muted);
}
.tally .num {
  padding-left: 12px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.chart {
  display: block;
  width: 100%;
  height: 80px;
  margin-top: 4px;
}
.chart .zero {
  stroke: var(--line);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}
.chart .grew {
  fill: var(--heading);
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
.buttons {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
.btn {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
@media (forced-colors: active) {
  .chart .grew,
  .chart .cut {
    fill: CanvasText;
  }
}
</style>
