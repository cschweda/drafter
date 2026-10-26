<script setup lang="ts">
import { useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';

// What the Source pane's gutter marks, as a list the writer can read, jump from, and fix from.
const { problems } = useProblems();
const { goto } = useEditor();

const SEVERITY = { error: 'Error', warning: 'Warning', info: 'Info' } as const;
</script>

<template>
  <p v-if="problems.length === 0" class="empty">No problems found.</p>
  <ul v-else class="problems">
    <li
      v-for="problem in problems"
      :key="`${problem.ruleId}:${problem.from}:${problem.to}`"
      class="problem"
      :data-severity="problem.severity"
    >
      <button
        type="button"
        class="jump"
        @click="goto(problem.from, { select: { from: problem.from, to: problem.to } })"
      >
        <span class="severity">{{ SEVERITY[problem.severity] }}:</span>
        <span class="message">{{ problem.message }}</span>
        <span class="line">Line {{ problem.line }}</span>
      </button>
      <button v-if="problem.fix" type="button" class="fix" @click="problem.fix.apply()">
        {{ problem.fix.title }}
      </button>
    </li>
  </ul>
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
</style>
