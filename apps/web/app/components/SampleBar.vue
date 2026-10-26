<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { type Command, useCommands } from '~/commands/registry';
import { useWideScreen } from '~/composables/useWideScreen';
import { DOCUMENT_TYPES } from '~/editor/template';
import { useScript } from '~/storage/script';

// The bar above the panes while a sample is open (Phase 1 design §4.2): it says the text is a
// sample and offers the ways to start the writer's own, on every tab. Each button runs the command
// of the same name (`commands/builtin.ts`), so it agrees with the menus, the palette, and the keys,
// and it is off whenever that command is (a tab that only shows a script, a switch under way). On a
// phone it is one row: "Sample", the first button, and a "More" menu with the rest.
const { project } = useScript();
const wide = useWideScreen();
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

/** The phone's menu: every button after the first. */
const more = computed<DropdownMenuItem[]>(() =>
  actions.value.slice(1).map((action) => ({
    label: action.label,
    disabled: off(action),
    onSelect: () => action.command?.run(),
  })),
);
</script>

<template>
  <section v-if="project?.sample" class="bar" :class="{ compact: !wide }" aria-label="Sample">
    <p v-if="wide">This is a sample. Start your own:</p>
    <strong v-else class="name">Sample</strong>
    <div v-if="wide" class="actions">
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
    <template v-if="!wide">
      <button
        v-if="actions[0]"
        type="button"
        class="action"
        :disabled="off(actions[0])"
        @click="actions[0].command?.run()"
      >
        {{ actions[0].label }}
      </button>
      <UDropdownMenu :items="more" :content="{ align: 'end' }">
        <button type="button" class="action" aria-label="More ways to start your own">More</button>
      </UDropdownMenu>
    </template>
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
.compact {
  flex-wrap: nowrap;
  padding: 4px 10px;
}
.name {
  margin-right: auto;
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
