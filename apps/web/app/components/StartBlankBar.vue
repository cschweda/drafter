<script setup lang="ts">
import { type Command, useCommands } from '~/commands/registry';
import { useWideScreen } from '~/composables/useWideScreen';
import { kindOf } from '~/storage/projects';
import { useScript } from '~/storage/script';

// The bar above a writer's first document of a kind, which opened with that kind's sample text
// (decided 2026-10-27): it says so and offers Start blank, which runs the command of that name
// (`commands/builtin.ts`), so it agrees with the palette and the app menu. It shows while the
// command applies, and goes once the document is emptied or saved to a file. On a phone it is one
// row: a name and the button.
const { project, canStartBlank } = useScript();
const wide = useWideScreen();
const commands = useCommands();

const command = computed<Command | undefined>(() =>
  commands.value.find((c) => c.id === 'start-blank'),
);

/** What the document is, in the sentence. */
const what = computed(() => {
  const current = project.value;
  if (!current) return 'document';
  if (kindOf(current) === 'markdown') return 'Markdown document';
  return current.templateId === 'stage-play-standard' ? 'stage play' : 'screenplay';
});
</script>

<template>
  <section
    v-if="canStartBlank && command"
    class="bar"
    :class="{ compact: !wide }"
    aria-label="Starting text"
  >
    <p v-if="wide">
      Your first {{ what }} starts with a sample that shows how one is written. It’s yours: keep
      it, change it, or start blank.
    </p>
    <strong v-else class="name">Sample text</strong>
    <button type="button" class="action" @click="command.run()">Start blank</button>
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
.compact {
  flex-wrap: nowrap;
  padding: 4px 10px;
}
.name {
  margin-right: auto;
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
.action:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
