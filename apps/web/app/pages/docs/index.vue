<script setup lang="ts">
import { HELP_PAGES, helpHref } from '~/commands/data';
import { PRESENCE_NOTE } from '~/scaffold/presence-note';

definePageMeta({ layout: 'docs' });

useDocsHead({
  title: 'Help',
  description:
    'Help for Drafter: a Fountain cheat sheet, saving and your browser, the keyboard shortcuts, privacy, open formats, licences, technical details, and what the Stats tab and Scaffold count. Plain pages that read without JavaScript.',
  path: '/docs',
});

const about: Record<string, string> = {
  'help-fountain':
    'Every Fountain element with its mark, its rule, and an example: what the element bar writes for you.',
  'help-saving':
    'What Save does in each browser, keeping scripts in a synced folder, the recovery copy, and installing Drafter as an app.',
  'help-shortcuts': 'Every command and its keys, for a Mac and for Windows and Linux.',
  'help-privacy': 'No account, no analytics, no telemetry: your script never leaves your device.',
  'help-open-formats':
    'Every file Drafter writes is an open format you can read without it, including the open specification of the .drafter package.',
  'help-licences':
    'The spellchecker, its dictionaries, and the fonts inside Drafter, each with its licence.',
  'help-technical':
    'How Drafter is put together, for the curious: its packages, workers, storage, offline use, the desktop app, releases, and dependencies, with diagrams.',
};
</script>

<template>
  <article>
    <h1>Help</h1>
    <p class="docs-lead">Seven short pages about writing in Fountain and how Drafter works.</p>
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
      releases, the changelog, and the open specification of the <code>.drafter</code> file.
    </p>

    <h2 id="stats-and-scaffold">Stats and Scaffold</h2>
    <p>
      <strong>Stats</strong> (Show stats, or <strong>Stats…</strong> in the counts) opens a tab
      beside your script. <strong>Overview</strong> has today’s writing, the script’s pages and
      running time at your own minutes a page, and the last 30 days. <strong>Characters</strong>
      lists everyone who speaks: their speeches, the scenes they’re in and the scenes they speak
      in, their words, their share of all the dialogue, their screen time (the length of their
      scenes), and who they share the most scenes with. <strong>Character by scene</strong> is a grid
      of who is in each scene, with how many speeches, a dot for being there without speaking, and
      the long absences (20 pages or more) outlined and listed; <strong>List</strong> says the same
      as text.
    </p>
    <p>
      <strong>Scaffold</strong> (Show Scaffold) opens a tab that shows who is in the scene your
      cursor is in, where it is, and how long it runs, and follows the cursor as you move. Every name
      opens that character’s page (their scenes, screen time, dialogue, absences, and every line they
      speak, each going to its place in the script), and every place opens its location’s page.
      <strong>Cast</strong> and <strong>Places</strong> list them all, and <strong>Back</strong>
      (or <kbd>Alt+←</kbd>, <kbd>⌥←</kbd> on a Mac) goes to the page before. Stats and Scaffold
      count the same way, so their figures always agree, and neither changes your script.
    </p>
    <p><strong>Who is in a scene.</strong> {{ PRESENCE_NOTE }}</p>
    <p>
      A speech is a character’s cue and what follows it. A speech before the first scene, or between
      an act’s heading and its first scene, counts toward the character’s speeches and words but
      puts them in no scene. A Markdown document has no scenes, so it has no Scaffold, and its Stats
      tab has its words, headings, and reading time.
    </p>
  </article>
</template>
