<script setup lang="ts">
import { HELP_PAGES, helpHref } from '~/commands/data';

definePageMeta({ layout: 'docs' });

useDocsHead({
  title: 'Help',
  description:
    'Help for Drafter: a Fountain cheat sheet, saving and your browser, the keyboard shortcuts, and privacy. Plain pages that read without JavaScript.',
  path: '/docs',
});

const about: Record<string, string> = {
  'help-fountain':
    'Every Fountain element with its mark, its rule, and an example: what the element bar writes for you.',
  'help-saving':
    'What Save does in each browser, keeping scripts in a synced folder, the recovery copy, and installing Drafter as an app.',
  'help-shortcuts': 'Every command and its keys, for a Mac and for Windows and Linux.',
  'help-privacy': 'No account, no analytics, no telemetry: your script never leaves your device.',
};
</script>

<template>
  <article>
    <h1>Help</h1>
    <p class="docs-lead">Four short pages about writing in Fountain and how Drafter works.</p>
    <ul>
      <li v-for="page in HELP_PAGES" :key="page.id">
        <a :href="helpHref(page)">{{ page.title }}</a>: {{ about[page.id] }}
      </li>
    </ul>
  </article>
</template>
