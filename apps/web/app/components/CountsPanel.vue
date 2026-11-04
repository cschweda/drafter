<script setup lang="ts">
import { estimateSeconds } from '@drafter/outline';
import { useEditor } from '~/editor/session';
import { bookLine, parseTarget } from '~/novel/labels';
import { useNovel } from '~/novel/use-novel';
import { runningTime } from '~/stats/count';
import { useCounts } from '~/stats/counts';
import { isGoal, progressLabel, useGoal } from '~/stats/goal';
import {
  lastSprint,
  lastSprintLabel,
  parseMinutes,
  SPRINT_MINUTES,
  useSprint,
} from '~/stats/sprint';
import { ESTIMATE_LABEL, pageRatePhrase } from '~/stats/time-format';
import { useRates } from '~/stats/timing';

defineProps<{ id: string }>();
const emit = defineEmits<{ close: []; stats: [] }>();

const { kind, novel: isNovel } = useEditor();
const { counts, known } = useCounts();
const { goal, progress, canSet, locked, setGoal } = useGoal();

const markdown = computed(() => kind.value === 'markdown');
const rates = useRates();
const root = ref<HTMLElement>();
onMounted(() => root.value?.focus());

// ---- The book's target (a novel) -----------------------------------------------------------
const book = useNovel();
const bookTarget = computed(() => book.facts.value.bookTarget ?? null);
const bookText = ref(bookTarget.value ? String(bookTarget.value) : '');
const bookProblem = ref('');
const bookSaid = ref('');
// Read when the panel draws (it follows the locks, which are reactive), not kept from the first time.
const bookWhy = () => book.readOnly();
watch(bookTarget, (next) => {
  bookText.value = next ? String(next) : '';
});

function onBookSubmit() {
  bookSaid.value = '';
  const parsed = parseTarget(bookText.value);
  if ('problem' in parsed) {
    bookProblem.value = parsed.problem;
    return;
  }
  bookProblem.value = '';
  book.setBookTarget(parsed.target);
  bookSaid.value = parsed.target
    ? `Book target set: ${parsed.target.toLocaleString('en-US')} words.`
    : 'Book target cleared.';
}

function onBookClear() {
  bookProblem.value = '';
  bookText.value = '';
  book.setBookTarget(null);
  bookSaid.value = 'Book target cleared.';
}

// ---- The daily goal ------------------------------------------------------------------------
const unit = ref<'pages' | 'words'>(goal.value?.unit ?? 'pages');
const target = ref(goal.value ? String(goal.value.target) : '');
const problem = ref('');
const said = ref('');

// The goal is read from the table a moment after the script opens: the form follows it.
watch(
  goal,
  (next) => {
    if (next) {
      unit.value = next.unit;
      target.value = String(next.target);
    }
  },
  { immediate: true },
);
// A Markdown document counts words only.
watchEffect(() => {
  if (markdown.value) unit.value = 'words';
});

async function onSubmit() {
  said.value = '';
  const entered = Number(target.value.trim());
  const next = { unit: unit.value, target: entered };
  if (target.value.trim() === '' || !isGoal(next)) {
    problem.value =
      unit.value === 'words'
        ? 'Enter a whole number of words, from 1 to 1,000,000.'
        : 'Enter a number of pages, in tenths, from 0.1 to 1,000.';
    return;
  }
  problem.value = '';
  await setGoal(next);
  said.value = `Daily goal set: ${next.target.toLocaleString('en-US')} ${next.unit}.`;
}

async function onClear() {
  problem.value = '';
  await setGoal(null);
  target.value = '';
  said.value = 'Daily goal cleared.';
}

const cut = computed(() =>
  progress.value && progress.value.done < 0 ? Math.abs(progress.value.done) : 0,
);

// ---- A sprint --------------------------------------------------------------------------------
const sprint = useSprint();
const running = computed(() => sprint.state.value.status !== 'idle');
const minutes = ref('');
const minutesProblem = ref('');

/** Starts a sprint and closes the panel, so the writer is back in the script. */
function startSprint(length: number | null) {
  if (length === null) {
    minutesProblem.value = 'Enter a whole number of minutes, from 1 to 180.';
    return;
  }
  minutesProblem.value = '';
  sprint.start(length);
  emit('close');
}

function onSprintSubmit() {
  startSprint(parseMinutes(minutes.value));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
  }
}
</script>

<template>
  <div
    :id="id"
    ref="root"
    class="counts motion"
    role="dialog"
    aria-modal="false"
    :aria-labelledby="`${id}-title`"
    tabindex="-1"
    @keydown="onKeydown"
  >
    <h2 :id="`${id}-title`">Counts</h2>
    <dl class="figures">
      <template v-if="markdown">
        <dt>Words</dt>
        <dd>{{ (known.words ?? 0).toLocaleString('en-US') }}</dd>
      </template>
      <template v-else-if="counts">
        <dt>Pages</dt>
        <dd>{{ known.pages === null ? 'Counting…' : counts.pages }}</dd>
        <dt>Scenes</dt>
        <dd>{{ counts.scenes }}</dd>
        <dt>Words</dt>
        <dd>{{ counts.words.toLocaleString('en-US') }}</dd>
        <dt>Running time</dt>
        <dd>{{ known.pages === null ? 'Counting…' : runningTime(Math.round(counts.pages * rates.minutesPerPage)) }}</dd>
        <dt>{{ ESTIMATE_LABEL }}</dt>
        <dd>{{ runningTime(Math.round(estimateSeconds(counts.timing, rates.wordsPerMinute) / 60)) }}</dd>
      </template>
    </dl>
    <p v-if="!markdown" class="note">
      Pages leave out the title page. Running time is at {{ pageRatePhrase(rates.minutesPerPage) }}. Set the rates in Stats.
    </p>

    <section v-if="markdown && isNovel" class="goal book" aria-labelledby="counts-book-title">
      <h3 id="counts-book-title">Book target</h3>
      <p v-if="bookTarget" class="today" data-book-progress>
        {{ known.words === null ? 'Counting…' : bookLine(known.words, bookTarget) }}
      </p>
      <p v-else class="note">Set a number of words for the whole book, and this shows how far it has come.</p>
      <p v-if="bookWhy()" class="note">{{ bookWhy() }}</p>
      <form class="goal-form" novalidate @submit.prevent="onBookSubmit">
        <fieldset :disabled="bookWhy() !== null" class="bare">
          <label for="counts-book-target">Words for the book</label>
          <div class="fields">
            <input
              id="counts-book-target"
              v-model="bookText"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :aria-invalid="bookProblem ? 'true' : 'false'"
              :aria-describedby="bookProblem ? 'counts-book-problem' : undefined"
              @input="bookProblem = ''"
            >
            <DButton type="submit">Set target</DButton>
            <DButton v-if="bookTarget" @click="onBookClear">Clear target</DButton>
          </div>
          <p v-if="bookProblem" id="counts-book-problem" class="problem" role="alert">{{ bookProblem }}</p>
          <p class="sr-only" role="status">{{ bookSaid }}</p>
        </fieldset>
      </form>
    </section>

    <section class="goal" aria-labelledby="counts-goal-title">
      <h3 id="counts-goal-title">Daily goal</h3>
      <p v-if="!canSet" class="note">
        This is a sample. Save your edits as a script of your own to set a goal.
      </p>
      <template v-else>
        <p v-if="locked" class="note">
          This tab can’t edit the script, so it can’t change the goal either.
        </p>
        <p v-if="progress" class="today">
          {{ progressLabel(progress) }}<template v-if="cut">. Cuts since the day began: {{ cut }}.</template>
        </p>
        <p v-else class="note">
          Set a goal, and the status bar shows how far the script has grown today. Cutting counts against it.
        </p>
        <form class="goal-form" @submit.prevent="onSubmit">
          <fieldset :disabled="locked" class="bare">
          <label for="counts-goal-target">Goal for today</label>
          <div class="fields">
            <input
              id="counts-goal-target"
              v-model="target"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              :aria-invalid="problem ? 'true' : 'false'"
              :aria-describedby="problem ? 'counts-goal-problem' : undefined"
            >
            <label class="sr-only" for="counts-goal-unit">Unit</label>
            <select id="counts-goal-unit" v-model="unit" :disabled="markdown">
              <option v-if="!markdown" value="pages">pages</option>
              <option value="words">words</option>
            </select>
            <DButton type="submit">Set goal</DButton>
            <DButton v-if="goal" @click="onClear">Clear goal</DButton>
          </div>
          <p v-if="problem" id="counts-goal-problem" class="problem" role="alert">{{ problem }}</p>
          <p class="sr-only" role="status">{{ said }}</p>
          </fieldset>
        </form>
      </template>
    </section>

    <section class="sprint" aria-labelledby="counts-sprint-title">
      <h3 id="counts-sprint-title">Start a sprint</h3>
      <p v-if="lastSprint" class="today" data-last-sprint>
        {{ lastSprintLabel(lastSprint.report, lastSprint.ended) }}
      </p>
      <p v-if="running" class="note">
        A sprint is running. Its time left and its Pause, Stop, and Hide controls are in the status bar.
      </p>
      <template v-else>
        <p class="note">
          A countdown while you write. It says what the sprint added when time is up, and nothing before.
        </p>
        <div class="lengths">
          <DButton v-for="length in SPRINT_MINUTES" :key="length" @click="startSprint(length)">
            {{ length }} minutes
          </DButton>
        </div>
        <form class="sprint-form" @submit.prevent="onSprintSubmit">
          <label for="counts-sprint-minutes">Minutes</label>
          <div class="fields">
            <input
              id="counts-sprint-minutes"
              v-model="minutes"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              :aria-invalid="minutesProblem ? 'true' : 'false'"
              :aria-describedby="minutesProblem ? 'counts-sprint-problem' : undefined"
            >
            <DButton type="submit">Start sprint</DButton>
          </div>
          <p v-if="minutesProblem" id="counts-sprint-problem" class="problem" role="alert">{{ minutesProblem }}</p>
        </form>
      </template>
    </section>

    <div class="buttons">
      <DButton @click="emit('stats')">Stats…</DButton>
      <DButton @click="emit('close')">Close</DButton>
    </div>
  </div>
</template>

<style scoped>
.counts {
  position: absolute;
  /* Above the status bar's counts item, at its right end. */
  right: 8px;
  bottom: calc(100% + 4px);
  z-index: 6;
  box-sizing: border-box;
  width: min(24rem, calc(100vw - 16px));
  max-height: calc(100dvh - 80px);
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--overlay);
  color: var(--text);
  box-shadow:
    0 1px 3px rgb(0 0 0 / 0.2),
    0 8px 24px rgb(0 0 0 / 0.28);
  font-size: 13px;
  line-height: 1.45;
}
.counts:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
h2 {
  margin: 0 0 6px;
  font-size: 15px;
}
h3 {
  margin: 0 0 4px;
  font-size: 13px;
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
.goal {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.today {
  margin: 0 0 6px;
  font-weight: 600;
}
.sprint {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
.lengths {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
}
.sprint-form label {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
}
.bare {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.goal-form label:not(.sr-only) {
  display: block;
  margin-bottom: 4px;
  color: var(--muted);
}
.fields {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
input,
select {
  min-height: 28px;
  padding: 0 6px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
input {
  width: 6rem;
}
.problem {
  margin: 6px 0 0;
  padding-left: 8px;
  box-shadow: inset 3px 0 0 var(--accent-text);
}
.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
/* On the panel's --overlay, a secondary button is a step further up. */
.d-btn--secondary {
  background: var(--highlight);
}
.d-btn--secondary:hover {
  background: var(--raised);
}
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
</style>
