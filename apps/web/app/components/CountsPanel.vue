<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { runningTime } from '~/stats/count';
import { useCounts } from '~/stats/counts';
import { isGoal, progressLabel, useGoal } from '~/stats/goal';
import { parseMinutes, SPRINT_MINUTES, useSprint } from '~/stats/sprint';

defineProps<{ id: string }>();
const emit = defineEmits<{ close: [] }>();

const { kind } = useEditor();
const { counts, known } = useCounts();
const { goal, progress, canSet, setGoal } = useGoal();

const markdown = computed(() => kind.value === 'markdown');
const root = ref<HTMLElement>();
onMounted(() => root.value?.focus());

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
    class="counts"
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
        <dd>{{ known.pages === null ? 'Counting…' : runningTime(counts.minutes) }}</dd>
      </template>
    </dl>
    <p v-if="!markdown" class="note">Pages leave out the title page. Running time is a page a minute.</p>

    <section class="goal" aria-labelledby="counts-goal-title">
      <h3 id="counts-goal-title">Daily goal</h3>
      <p v-if="!canSet" class="note">
        This is a sample. Save your edits as a script of your own to set a goal.
      </p>
      <template v-else>
        <p v-if="progress" class="today">
          {{ progressLabel(progress) }}<template v-if="cut">. Cuts since the day began: {{ cut }}.</template>
        </p>
        <p v-else class="note">
          Set a goal, and the status bar shows how far the script has grown today. Cutting counts against it.
        </p>
        <form class="goal-form" @submit.prevent="onSubmit">
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
            <button type="submit" class="btn">Set goal</button>
            <button v-if="goal" type="button" class="btn" @click="onClear">Clear goal</button>
          </div>
          <p v-if="problem" id="counts-goal-problem" class="problem" role="alert">{{ problem }}</p>
          <p class="sr-only" role="status">{{ said }}</p>
        </form>
      </template>
    </section>

    <section class="sprint" aria-labelledby="counts-sprint-title">
      <h3 id="counts-sprint-title">Start a sprint</h3>
      <p v-if="running" class="note">
        A sprint is running. Its time left and its Pause, Stop, and Hide controls are in the status bar.
      </p>
      <template v-else>
        <p class="note">
          A countdown while you write. It says what the sprint added when time is up, and nothing before.
        </p>
        <div class="lengths">
          <button
            v-for="length in SPRINT_MINUTES"
            :key="length"
            type="button"
            class="btn"
            @click="startSprint(length)"
          >
            {{ length }} minutes
          </button>
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
            <button type="submit" class="btn">Start sprint</button>
          </div>
          <p v-if="minutesProblem" id="counts-sprint-problem" class="problem" role="alert">{{ minutesProblem }}</p>
        </form>
      </template>
    </section>

    <div class="buttons">
      <button type="button" class="btn" @click="emit('close')">Close</button>
    </div>
  </div>
</template>

<style scoped>
.counts {
  position: absolute;
  left: 8px;
  bottom: calc(100% + 4px);
  z-index: 6;
  box-sizing: border-box;
  width: min(24rem, calc(100vw - 16px));
  max-height: calc(100dvh - 80px);
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
.counts:focus-visible {
  outline: 2px solid var(--heading);
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
  border-top: 1px solid var(--line);
}
.today {
  margin: 0 0 6px;
  font-weight: 600;
}
.sprint {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
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
  background: var(--chrome);
  color: var(--text);
  font: inherit;
}
input {
  width: 6rem;
}
.problem {
  margin: 6px 0 0;
  padding-left: 8px;
  box-shadow: inset 3px 0 0 var(--heading);
}
.buttons {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.btn {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.btn:focus-visible,
input:focus-visible,
select:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
