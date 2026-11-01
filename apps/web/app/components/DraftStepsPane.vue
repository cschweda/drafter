<script setup lang="ts">
import { draftName, draftWhen, markerLine } from '~/drafts/labels';
import { type DraftStep, stepLine, stepName } from '~/drafts/steps';
import { useDrafts } from '~/drafts/use-drafts';
import { useDraftSteps } from '~/drafts/use-steps';

// Draft by draft (drafts-and-cuts design §2.4): how the work changed, one draft at a time. A short
// timeline, oldest first: each step from one draft to the next (and the last to the text now) with
// its marker, note, date, and what changed in numbers. Open shows the step in Compare's Changes
// view, with Previous step and Next step, and the cuts made while writing it beside it. Any two
// drafts are compared from the Drafts list (Call 25).

const drafts = useDrafts();
const { rows, from, notKept } = drafts;
const session = useDraftSteps();
const { steps, state, kind, shownStep } = session;
const uid = useId();

/** The marker of the draft a step ends at: "Draft 03 begins — builds on Draft 02 (a3f9c2e)". */
function markerOf(step: DraftStep): string {
  if (step.to === 'now') return markerLine(drafts.current.value, from.value, rows.value);
  return markerLine(step.to.n, step.to.from, rows.value);
}

/** "12 Oct 2026, 10:42 · sent to Sam", or "Being written now". */
function metaOf(step: DraftStep): string {
  if (step.to === 'now') return `${draftName(drafts.current.value)}, being written now`;
  return [draftWhen(step.to.frozenAt), step.to.note].filter(Boolean).join(' · ');
}

const titleId = (i: number) => `${uid}-step-${i}`;
</script>

<template>
  <div class="steps">
    <DEmpty v-if="notKept" icon="i-lucide-git-commit-vertical">{{ notKept }}</DEmpty>
    <template v-else>
      <p class="intro">
        How the work changed, one draft at a time. To compare any two drafts, use the Drafts list.
      </p>
      <p v-if="state === 'counting' && steps.length === 0" role="status" class="note">
        Counting the changes…
      </p>
      <DEmpty v-else-if="state === 'failed'" icon="i-lucide-triangle-alert">
        The changes couldn’t be counted: a draft can’t be read.
      </DEmpty>
      <DEmpty v-else-if="steps.length === 0" icon="i-lucide-git-commit-vertical">
        No drafts yet. Once you start a new draft, each draft and what changed in it is listed here.
      </DEmpty>
      <ol v-else class="list" aria-label="Steps">
        <li
          v-for="(step, i) in steps"
          :key="step.from.key"
          class="item"
          :class="{ now: step.to === 'now', shown: shownStep === i }"
          :data-step="step.from.n"
          :aria-labelledby="titleId(i)"
        >
          <h3 :id="titleId(i)" class="heading">
            {{ draftName(step.from.n) }}
            <span aria-hidden="true">→</span><span class="sr-only">to</span>
            {{ step.to === 'now' ? 'now' : draftName(step.to.n) }}
          </h3>
          <p class="marker">{{ markerOf(step) }}</p>
          <p class="meta">{{ metaOf(step) }}</p>
          <p class="numbers">{{ stepLine(step, kind) }}</p>
          <div class="buttons">
            <button
              type="button"
              class="act"
              :aria-label="`Open the step from ${stepName(step)}`"
              :aria-current="shownStep === i ? 'step' : undefined"
              @click="session.openStep(i)"
            >
              Open
            </button>
          </div>
        </li>
      </ol>
    </template>
  </div>
</template>

<style scoped>
.steps {
  min-height: 100%;
  padding-bottom: 24px;
  background: var(--bg);
  color: var(--text);
}
.intro,
.note {
  margin: 0;
  padding: 10px 16px;
  color: var(--muted);
}
.list {
  margin: 0 16px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--surface);
  list-style: none;
  font-variant-numeric: tabular-nums;
}
.item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.item:last-child {
  border-bottom: 0;
}
/* The step Compare shows stands apart: an accent edge. */
.item.shown {
  box-shadow: inset 3px 0 0 var(--accent);
}
.heading {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.marker {
  margin: 0;
  font-size: 12px;
}
.meta {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.numbers {
  margin: 2px 0 0;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.act:hover {
  background: var(--overlay);
}
.act:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
@media (forced-colors: active) {
  .item.shown {
    border-left: 3px solid Highlight;
  }
}
</style>
