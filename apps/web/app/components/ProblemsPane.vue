<script setup lang="ts">
import { type ModuleRow, type Problem, useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { useSettings } from '~/settings/settings';
import { SPELLING_HEADING_ID, spellingHeading } from '~/spell/rows';
import { useSpell } from '~/spell/use-spell';

// What the Source pane's gutter marks, as a list the writer can read, jump from, and fix from.
// The spellcheck's marks follow, under a Spelling heading of their own (Plan D, Calls 13 and 14):
// they aren't problems, and aren't counted with them.
const { problems, moduleProblems, spelling, locked } = useProblems();
const { settings } = useSettings();
const spell = useSpell();
// What script modules found follows the editor's own, each labelled with its module's name.
const rows = computed<ReadonlyArray<Problem | ModuleRow>>(() => [
  ...problems.value,
  ...moduleProblems.value,
]);
const sourceOf = (row: Problem | ModuleRow) => ('moduleName' in row ? row.moduleName : undefined);
const { goto, kind } = useEditor();

const SEVERITY = { error: 'Error', warning: 'Warning', info: 'Info' } as const;

const root = ref<HTMLElement>();

// A fix takes its problem out of the list a moment later, and the button that was pressed goes
// with it. Focus then goes to the problem that took its place, or to the panel if none is left,
// but only if it was in the pane (on the button, or dropped to the page when the button went).
// A fix that did nothing leaves the list as it is, and focus that has gone elsewhere since (the
// writer clicked into the editor) is not taken back: it stays armed only until focus moves off
// the button.
let focusAfter: { index: number; button: Element | null } | undefined;

function disarm() {
  focusAfter = undefined;
  document.removeEventListener('focusin', onFocusIn);
}

function onFocusIn(event: FocusEvent) {
  if (focusAfter && event.target !== focusAfter.button) disarm();
}

function fix(problem: Problem | ModuleRow, index: number, event: Event) {
  if (locked.value || !problem.fix) return;
  disarm();
  focusAfter = { index, button: event.currentTarget as Element | null };
  document.addEventListener('focusin', onFocusIn);
  problem.fix.apply();
}

// What a module's items say, not where they are: they are mapped through every edit, which must
// not look like the list changing (a fix is waiting for the list to change to move focus).
const moduleSignature = computed(() =>
  moduleProblems.value.map((p) => `${p.key}\0${p.message}\0${p.fix?.title ?? ''}`).join('\u0001'),
);
watch([problems, moduleSignature], async () => {
  if (!focusAfter) return;
  const { index } = focusAfter;
  await nextTick();
  if (!focusAfter) return;
  disarm();
  const active = document.activeElement;
  const inPane = !active || active === document.body || !!root.value?.contains(active);
  if (!inPane) return;
  const jumps = root.value?.querySelectorAll<HTMLElement>('.problem-list .jump');
  const target = jumps?.[Math.min(index, jumps.length - 1)];
  (target ?? root.value?.closest<HTMLElement>('[role="tabpanel"]'))?.focus();
});

onBeforeUnmount(disarm);
</script>

<template>
  <div ref="root">
    <p v-if="kind === 'markdown' && rows.length === 0" class="empty">
      {{
        settings.spellcheck
          ? 'No script checks for Markdown documents.'
          : 'No checks for Markdown documents.'
      }}
    </p>
    <p v-else-if="rows.length === 0" class="empty">No problems found.</p>
    <ul v-else class="problems problem-list">
      <li
        v-for="(problem, index) in rows"
        :key="problem.key"
        class="problem"
        :data-severity="problem.severity"
      >
        <button
          type="button"
          class="jump"
          @click="goto(problem.from, { select: { from: problem.from, to: problem.to } })"
        >
          <span v-if="sourceOf(problem)" class="source">{{ sourceOf(problem) }}</span>
          <span class="severity">{{ SEVERITY[problem.severity] }}:</span>
          <span class="message">{{ problem.message }}</span>
          <span class="line">Line {{ problem.line }}</span>
        </button>
        <button
          v-if="problem.fix"
          type="button"
          class="fix"
          :aria-disabled="locked ? 'true' : undefined"
          @click="fix(problem, index, $event)"
        >
          {{ problem.fix.title }}
        </button>
      </li>
    </ul>
    <template v-if="settings.spellcheck">
      <h2 :id="SPELLING_HEADING_ID" class="spelling-title" tabindex="-1">
        {{ spellingHeading(spelling.length, spell.state.value) }}
      </h2>
      <ul v-if="spelling.length > 0" class="problems" aria-label="Spelling">
        <li v-for="row in spelling" :key="row.key" class="problem spelling">
          <button
            type="button"
            class="jump"
            @click="goto(row.from, { select: { from: row.from, to: row.to } })"
          >
            <span class="message">{{ row.word }}</span>
            <span class="line">Line {{ row.line }}</span>
          </button>
        </li>
      </ul>
    </template>
  </div>
</template>

<style scoped>
.empty {
  margin: 0;
  padding: 24px 16px;
  color: var(--muted);
}
.problems {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}
.problem {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 4px 8px;
  padding: 4px 12px 8px;
  border-bottom: 1px solid var(--line);
  /* The severity is in words too; the bar is for scanning. */
  box-shadow: inset 3px 0 0 var(--heading);
}
.problem[data-severity='info'] {
  box-shadow: inset 3px 0 0 var(--line);
}
/* A misspelling: the mark's own color, as the Source pane underlines it. */
.problem.spelling {
  box-shadow: inset 3px 0 0 var(--spelling);
}
.spelling-title {
  margin: 0;
  padding: 12px 16px 6px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
  font-weight: 700;
}
.spelling-title:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: -2px;
}
.jump {
  display: flex;
  flex: 1 1 18rem;
  flex-wrap: wrap;
  gap: 2px 6px;
  min-height: 32px;
  padding: 6px 4px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
}
.jump:hover {
  background: var(--chrome-2);
}
.severity {
  font-weight: 700;
}
/* The module that found it. */
.source {
  padding: 0 6px;
  border: 1px solid var(--line);
  border-radius: 9px;
  color: var(--muted);
  font-size: 12px;
}
.message {
  flex: 1 1 14rem;
  min-width: 0;
}
.line {
  color: var(--muted);
  white-space: nowrap;
}
.fix {
  min-height: 32px;
  margin-top: 2px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 5px;
  background: var(--chrome-2);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.fix:hover {
  border-color: var(--heading);
}
.fix[aria-disabled='true'] {
  color: var(--muted);
  cursor: not-allowed;
}
.fix[aria-disabled='true']:hover {
  border-color: var(--line);
}
</style>
