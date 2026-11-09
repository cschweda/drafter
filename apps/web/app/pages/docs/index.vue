<script setup lang="ts">
import { DOWNLOAD_PAGE, HELP_PAGES, helpHref } from '~/commands/data';
import { PRESENCE_NOTE } from '~/scaffold/presence-note';

definePageMeta({ layout: 'docs' });

useDocsHead({
  title: 'Help',
  description:
    'Help for Drafter: what it is, why Drafter, a Fountain cheat sheet, Classic Mode, writing a novel, saving and your browser, drafts and cuts, the story map, Drafter for Claude, self-hosting, the keyboard shortcuts, privacy, open formats, licences, technical details, and what the Stats tab and Scaffold count. Plain pages that read without JavaScript.',
  path: '/docs',
});

const about: Record<string, string> = {
  'help-what-is':
    'What Drafter is, in one minute; why a writer might choose it over Final Draft; what it offers productions; whether you can trust it; and, for technical people, how it is built and tested.',
  'help-why':
    'Free with no catch, no login ever, the big features, and how Drafter compares with other screenwriting apps.',
  'help-fountain':
    'Every Fountain element with its mark, its rule, and an example: what the element bar writes for you.',
  'help-classic-mode':
    'Typing a script with Enter and Tab, the way many screenwriters expect, with names and places filled in, over a file that stays Fountain.',
  'help-novel':
    'Writing a novel in plain Markdown: chapters, sections, and parts, the Outline and Cards, focus on one chapter, and word targets.',
  'help-saving':
    'What Save does in each browser, keeping scripts in a synced folder, autosave, and installing Drafter as an app.',
  'help-drafts-and-cuts':
    'Numbered drafts you can read, compare, and restore, and everything you cut, kept for ideas.',
  'help-story-map':
    'A picture of your script or play to send to anyone who asks what you are writing: making one, what goes in, and what never does.',
  'help-drafter-for-claude':
    'Let Claude, or another AI app you use, read the scripts, drafts, and cuts in folders you choose: setting it up, and what goes to the AI service.',
  'help-self-hosting':
    'Run the web app from your own computer or server with Docker, so nothing loads from drafter.dev.',
  'help-shortcuts': 'Every command and its keys, for a Mac and for Windows and Linux.',
  'help-privacy': 'No account, no cookies, no telemetry: your script never leaves your device.',
  'help-open-formats':
    'Every file Drafter writes is an open format you can read without it, including the open specification of the .drafter package.',
  'help-licences':
    'The spellchecker, its dictionaries, and the fonts inside Drafter, each with its licence.',
  'help-technical':
    'How Drafter is put together, for the curious: its packages, workers, storage, offline use, the desktop app, releases, and dependencies, with diagrams.',
  'help-whats-new': 'What has changed in Drafter, newest first, in plain words.',
};
</script>

<template>
  <article>
    <h1>Help</h1>
    <p class="docs-lead">
      Sixteen short pages: what Drafter is, writing in Fountain, in Classic Mode, or a novel, how Drafter works, running it yourself, and what’s new.
    </p>
    <ul>
      <li v-for="page in HELP_PAGES" :key="page.id">
        <a :href="helpHref(page)">{{ page.title }}</a>: {{ about[page.id] }}
      </li>
      <li>
        <a :href="helpHref(DOWNLOAD_PAGE)">{{ DOWNLOAD_PAGE.title }}</a>: the desktop app for Windows
        and Linux, and how to build it on a Mac.
      </li>
    </ul>
    <p>
      In Drafter, the <strong>Help</strong> menu at the top right (Help in the desktop app’s menu bar too) has these pages,
      <strong>Take the tour</strong>, <strong>Sample scripts</strong> (a tiny screenplay, stage play, novel,
      and Markdown document, and a guided first screenplay and stage play whose notes teach each
      element, each opened as a new script of your own),
      <strong>Report a problem…</strong> and <strong>Suggest an idea…</strong>,
      <strong>Check for updates…</strong>, and <strong>About Drafter</strong>: the version you’re
      on, with a button that copies it for a bug report, and links to the source code, the
      releases, the changelog, and the open specification of the <code>.drafter</code> file.
    </p>

    <h2 id="reporting">Reporting a problem</h2>
    <p>
      Found something wrong, or have an idea? Choose <strong>About → Report a problem…</strong> or
      <strong>Suggest an idea…</strong> (in the search too, and in About). Write a title and a few
      lines, and the dialog shows exactly what will be sent, with your version info if you leave it
      on. <strong>Open on GitHub</strong> opens GitHub’s new-issue page with it all filled in, and you
      submit it there. That needs a free GitHub account. Drafter sends nothing itself, and never
      includes your script.
    </p>
    <p>
      Your report is never lost. <strong>Copy report</strong>, <strong>Write an email</strong>, and
      <strong>Open on GitHub</strong> each put the whole report on your clipboard, so if GitHub
      doesn’t fill it in, or your email app gets only the start, you paste it. And Drafter keeps it
      on this device until you choose <strong>Clear</strong>.
    </p>
    <p>
      No GitHub account, or offline? Copy it, or email cschweda@gmail.com. An email goes from your
      own email app; Drafter itself sends nothing. For a security problem, please
      don’t open a public issue:
      <a
        href="https://github.com/cschweda/drafter/blob/main/SECURITY.md#reporting-a-problem"
        target="_blank"
        rel="noopener noreferrer"
        >report it privately</a
      >, or email the details. The privacy page says
      <a href="/docs/privacy/#reporting">what leaves your device, and when</a>.
    </p>

    <h2 id="finding-your-way">Finding your way around</h2>
    <p>
      The <strong>Drafter</strong> mark at the top left is the menu for the script you have open:
      its template, History, drafts and cuts, its exports, Stats, and Settings. <strong>Help</strong>
      is its own menu at the top right. Between them are the script’s title (with a red dot and
      <strong>Unsaved</strong> while there are changes to save), the
      <strong>Fountain | Classic</strong> switch for how you type, <strong>File</strong> (New, Open,
      Save As, your scripts in this browser, and the samples), <strong>Save</strong> (its arrow has
      Save As, Revert to Saved, and History), and <strong>Export</strong>, the search
      (<kbd>Ctrl+K</kbd>, <kbd>⌘K</kbd> on a Mac), and buttons for the Structure strip, focus mode,
      and the theme.
    </p>
    <p>
      On a wide screen the editor is always on the left, with the element bar and its own buttons
      (line numbers, typewriter scrolling, sync scrolling) at its top. Everything else opens on the
      right, in the <strong>Inspector</strong>: Script, Outline, Cards, Stats, and Scaffold are tabs
      there, and <strong>More</strong> holds Notes, Problems, Compare, Cuts, Drafts, and the tabs of
      any modules you turn on. Each tab’s own buttons sit at the right of the Inspector’s header. The
      status bar at the bottom has the file’s name (which opens History), the pages and running
      time, the words, the problems, and the template.
    </p>
    <p>
      Below 1024 pixels, as on a phone or a narrow window, Drafter shows one thing at a time, with
      a bar at the bottom: <strong>Write</strong> (the editor), <strong>Script</strong>,
      <strong>Outline</strong>, and <strong>More</strong> for the rest. A phone opens on Write. When
      the top bar runs out of room, its buttons move into <strong>More actions</strong> (⋯) at its
      right end, and menus open from the bottom of the screen.
    </p>
    <p>
      <strong>Settings</strong> (<kbd>Ctrl+,</kbd>, <kbd>⌘,</kbd> on a Mac) is one scrolling list
      with a list of its sections beside it: General, Writing, Script, Spelling, Files, Modules,
      and About. Choose a section to jump to it; nothing is hidden, so you can also just scroll, or
      Tab through every setting. <strong>Page colour</strong> there chooses paper pages (the
      default) or a dark page for writing at night; printing and every export stay on white paper.
      Drafter opens dark. Pick light with the theme button, or turn on
      <strong>Match system appearance</strong> to follow your computer; Drafter keeps your choice.
    </p>
    <p>
      <strong>Contrast.</strong> The <strong>Contrast</strong> button in the top bar opens a slider
      for each pane, the Source and the Script, each on its own. Slide right for crisper text, left
      for a softer page; the colours change as you slide, in the light and the dark theme. Both
      start near the highest, and both are in Settings too (on a narrow screen, the button is in
      <strong>More actions</strong>). Printing and every export are unchanged. Under each slider is
      the WCAG 2.1 contrast ratio of that pane’s text against its background (4.5:1 is AA for
      normal text, 7:1 is AAA), and for the Source its weakest colour too, measured from the colours
      on screen as you slide.
    </p>
    <p>
      <strong>Typewriter sounds and typewriter scrolling are two different things.</strong>
      <strong>Typewriter scrolling</strong>, the text-cursor button in the Source’s header (and in
      Settings), keeps the line you’re writing in the middle of the pane, silently.
      <strong>Typewriter sounds</strong>, in Settings → Writing or the palette (“Turn on typewriter
      sounds”), plays a typewriter’s key as you type in the Source and its bell when you start a new
      line. Sounds are off unless you turn them on, are made in your browser with no audio files,
      and a shortcut makes none.
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
