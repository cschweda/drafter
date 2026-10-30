<script setup lang="ts">
import { HELP_PAGES, helpHref } from '~/commands/data';

definePageMeta({ layout: 'docs' });

useDocsHead({
  title: 'Help',
  description:
    'Help for Drafter: a Fountain cheat sheet, saving and your browser, the keyboard shortcuts, privacy, and third-party licences. Plain pages that read without JavaScript.',
  path: '/docs',
});

const about: Record<string, string> = {
  'help-fountain':
    'Every Fountain element with its mark, its rule, and an example: what the element bar writes for you.',
  'help-saving':
    'What Save does in each browser, keeping scripts in a synced folder, the recovery copy, and installing Drafter as an app.',
  'help-shortcuts': 'Every command and its keys, for a Mac and for Windows and Linux.',
  'help-privacy': 'No account, no analytics, no telemetry: your script never leaves your device.',
  'help-licences':
    'The spellchecker, its dictionaries, and the fonts inside Drafter, each with its licence.',
};
</script>

<template>
  <article>
    <h1>Help</h1>
    <p class="docs-lead">Five short pages about writing in Fountain and how Drafter works.</p>
    <ul>
      <li v-for="page in HELP_PAGES" :key="page.id">
        <a :href="helpHref(page)">{{ page.title }}</a>: {{ about[page.id] }}
      </li>
    </ul>
    <p>
      In Drafter, the Help section of the menu (Help in the desktop app’s menu bar) has these pages,
      <strong>Take the tour</strong>, <strong>Sample scripts</strong> (a tiny screenplay, stage play,
      and Markdown document, and a guided first screenplay and stage play whose notes teach each
      element, each opened as a new script of your own),
      <strong>Check for updates…</strong>, and <strong>About Drafter</strong>: the version you’re
      on, with a button that copies it for a bug report, and links to the source code, the
      releases, and the changelog.
    </p>
  </article>
</template>
