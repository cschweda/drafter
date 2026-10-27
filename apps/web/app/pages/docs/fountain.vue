<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';
import { CHEAT_SHEET } from '~/editor/cheat-sheet';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-fountain');
if (!page) throw new Error('The Fountain cheat sheet is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Every Fountain element with its mark, its rule in one sentence, and an example, in the order the element bar lists them, plus the title page, notes, and emphasis.',
});

// The entries are plain data (editor/cheat-sheet.ts), so a test can parse every example.
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      A Fountain script is plain text: what a line looks like decides what it is. Most elements need
      no mark at all, and a mark at the start of a line forces it to be one thing when it would
      otherwise read as another. The element bar above the Source writes these marks for you, only
      where they’re needed, and so do <kbd>⌘⌥1</kbd> to <kbd>⌘⌥7</kbd> on a Mac
      (<kbd>Ctrl+Alt+1</kbd> to <kbd>Ctrl+Alt+7</kbd> elsewhere): a scene heading, action, a
      character, a parenthetical, a transition, centered text, and a lyric.
    </p>

    <section v-for="entry in CHEAT_SHEET" :id="entry.id" :key="entry.id" class="entry">
      <h2>{{ entry.name }} <span class="mark">{{ entry.mark }}</span></h2>
      <p>{{ entry.rule }}</p>
      <pre><code>{{ entry.example }}</code></pre>
    </section>
  </article>
</template>

<style scoped>
.entry {
  margin-top: 1.5em;
}
.mark {
  margin-left: 0.4em;
  color: var(--muted);
  font: 400 0.8em var(--font-mono, monospace);
}
pre {
  margin: 0.5em 0 0;
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome-2);
  font: 13px/1.5 var(--font-mono, monospace);
}
</style>
