<script setup lang="ts">
import { SPEC_URL } from '~/about/info';
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-open-formats');
if (!page) throw new Error('The Open formats page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Every file Drafter writes is an open, documented format you can read without Drafter: Fountain, Markdown, and the open specification for the .drafter package.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Your work belongs to you. Every file Drafter saves or exports is an open, documented format
      that other programs can read, today and in twenty years, with or without Drafter.
    </p>

    <h2 id="what-drafter-saves">What Drafter saves</h2>
    <ul>
      <li>
        <strong>Scripts are Fountain</strong> (<code>.fountain</code>): plain text with a few marks,
        defined by the open <a href="https://fountain.io/syntax" target="_blank" rel="noopener noreferrer">Fountain
        syntax</a>. Any text editor opens it, and so do Highland, Beat, Slugline, and other
        screenwriting apps.
      </li>
      <li>
        <strong>Documents are Markdown</strong> (<code>.md</code>): CommonMark, the open standard,
        with footnotes written as on GitHub.
      </li>
      <li>
        <strong>What Drafter adds</strong> (a scene’s colour, the template, your script’s own
        dictionary, export options) goes in one small block at the end of the file, in plain JSON
        inside a Fountain comment (<code>/* drafter … */</code>), which other Fountain apps skip and
        never print. Nothing is hidden anywhere else.
      </li>
    </ul>

    <h2 id="what-drafter-exports">What Drafter exports</h2>
    <ul>
      <li><strong>PDF</strong>, the pages as they print.</li>
      <li><strong>Final Draft</strong> (<code>.fdx</code>), read and written from its public, XML form.</li>
      <li><strong>Markdown</strong> and <strong>plain text</strong>.</li>
      <li><strong>HTML</strong>: one web page, with everything inside it, that any browser opens.</li>
      <li>
        <strong>EPUB</strong>, the open e-book standard (EPUB 3), for reading a draft on an e-reader
        or a tablet.
      </li>
    </ul>
    <p class="docs-note">
      Final Draft is a trademark of its owner. Drafter reads and writes its file format so a script
      can move between the two apps, and isn’t connected with or endorsed by Final Draft.
    </p>

    <h2 id="reopening-exports">Opening an HTML or EPUB file again</h2>
    <p>
      Drafter can only reopen HTML or EPUB files it saved itself, with
      <strong>Let Drafter reopen this file</strong> turned on in Export options. It can’t open HTML
      or EPUB files made by other apps or sites, or Drafter exports made with the option off.
    </p>
    <p>
      With the option on, the file carries your whole script, notes and all, as plain text. In an
      HTML file it is one <code>&lt;script type="text/plain" id="drafter-source"&gt;</code>
      element, which no browser runs, holding the script in base64. In an EPUB it is the file
      <code>EPUB/drafter-source.fountain</code> (or <code>.md</code> for a Markdown document).
      These names are part of the open specification and won’t change, so any program
      can get your script back out.
    </p>
    <p class="docs-note">
      When Drafter reopens one of these files, it reads only the script inside, as plain text, and
      never runs anything in it. An HTML export is still an ordinary web page: double-click it and
      your browser opens it like any other page, where Drafter’s checks don’t apply, so treat an
      HTML file someone sent you like any page you download. An EPUB opens in whatever e-book app
      you use.
    </p>

    <h2 id="the-drafter-package">The <code>.drafter</code> package: an open specification</h2>
    <p>
      Some projects grow beyond one file: numbered drafts, the material you cut, a workbook, voice
      notes. For moving or keeping a whole project as one file, Drafter will offer an optional
      <code>.drafter</code> package: a plain ZIP of ordinary files that anyone can unzip and read.
    </p>
    <p>
      Its format is written down in full, in the open, so any screenwriting app can read and write
      it too. The specification is in the public domain (CC0): anyone may use it, in any app, free
      or paid, without asking.
    </p>
    <p>
      <a :href="SPEC_URL" target="_blank" rel="noopener noreferrer">Read the .drafter package
      specification on GitHub</a>. It is a draft until Drafter ships the package; comments are
      welcome as GitHub issues.
    </p>

    <p class="docs-note">
      No format here is a secret, and none needs Drafter to open. If you ever stop using Drafter,
      your scripts come with you.
    </p>
  </article>
</template>
