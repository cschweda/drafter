<script setup lang="ts">
import { type Command, useCommands } from '~/commands/registry';
import { useWideScreen } from '~/composables/useWideScreen';
import { kindOf } from '~/storage/projects';
import { useScript } from '~/storage/script';

// A phone's row above a writer's first document of a kind, which opened with that kind's sample text
// (decided 2026-10-27): it says so and offers Start blank, which runs the command of that name
// (`commands/builtin.ts`), so it agrees with the palette and the app menu. It shows while the
// command applies, and goes once the document is emptied or saved to a file. It is one row: a name
// and the button. A wide screen has this in the top bar's state chip instead (SampleChip.vue).
// Its words differ from the sample's "Sample · Start your own" on purpose: this is the writer's own
// document, and Start blank empties it in place, where the sample's menu starts another script.
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
    v-if="canStartBlank && command && !wide"
    class="bar"
    aria-label="Starting text"
    :title="`Your first ${what} starts with a sample that shows how one is written. It’s yours: keep it, change it, or start blank.`"
  >
    <strong class="name">Sample text</strong>
    <button type="button" class="action" @click="command.run()">Start blank</button>
  </section>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: 6px 12px;
  padding: 4px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
}
.name {
  margin-right: auto;
  font-weight: 600;
}
.action {
  min-height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.action:hover {
  background: var(--overlay);
}
</style>
