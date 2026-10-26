<script setup lang="ts">
import { type Command, useCommands } from '~/commands/registry';
import { DOCUMENT_TYPES } from '~/editor/template';
import { useScript } from '~/storage/script';

// The bar above the Source pane while a sample is open (Phase 1 design §4.2): it says the text is
// a sample and offers the ways to start the writer's own. Each button runs the command of the same
// name (`commands/builtin.ts`), so it agrees with the menus, the palette, and the keys, and it is
// off whenever that command is (a tab that only shows a script, a switch under way).
const { project } = useScript();
const commands = useCommands();

interface Action {
  id: string;
  label: string;
  command: Command | undefined;
}

// The document types' New commands, in order, then Open (its command is "Open…"; the bar says what it does).
const actions = computed<Action[]>(() => {
  const find = (id: string) => commands.value.find((c) => c.id === id);
  return [
    ...DOCUMENT_TYPES.map((type) => ({
      id: `new-${type.newKind}`,
      label: type.newTitle,
      command: find(`new-${type.newKind}`),
    })),
    { id: 'open', label: 'Open a file…', command: find('open') },
  ];
});

const off = (action: Action) => !action.command || action.command.enabled?.() === false;
</script>

<template>
  <section v-if="project?.sample" class="bar" aria-label="Sample">
    <p>This is a sample. Start your own:</p>
    <div class="actions">
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="action"
        :disabled="off(action)"
        @click="action.command?.run()"
      >
        {{ action.label }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  padding: 6px 14px;
  background: var(--chrome-2);
  border-bottom: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  color: var(--text);
  font-size: 13px;
}
p {
  flex: 1 1 14rem;
  margin: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.action {
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
.action:disabled {
  opacity: 0.6;
  cursor: default;
}
.action:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
