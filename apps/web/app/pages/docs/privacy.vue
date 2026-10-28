<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-privacy');
if (!page) throw new Error('The Privacy page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Drafter never sends your script anywhere: no account, no analytics, no telemetry. Your scripts stay in this browser and in the files you choose.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Your script never leaves your device. Drafter has no account, no analytics, and no telemetry,
      and it doesn’t send what you write to anyone, ours included.
    </p>

    <h2 id="what-drafter-doesnt-do">What Drafter doesn’t do</h2>
    <ul>
      <li><strong>No account.</strong> There is nothing to sign up for or sign in to.</li>
      <li><strong>No analytics.</strong> Drafter doesn’t count visits, clicks, or keystrokes, and it has no tracking of any kind.</li>
      <li><strong>No telemetry.</strong> It doesn’t report errors, usage, or the state of your browser back to anyone.</li>
      <li><strong>No uploads.</strong> A script, its title, its word count, and your settings never leave the device. Drafter has no server that could receive them.</li>
      <li><strong>No outside services.</strong> The fonts and icons are part of Drafter and come from drafter.dev itself, not from Google or a content network.</li>
    </ul>
    <p>
      Like every website, the server that sends Drafter to your browser knows that a browser asked
      for the page. It never sees anything you write, because that never leaves your browser.
    </p>

    <h2 id="where-your-work-lives">Where your work lives</h2>
    <ul>
      <li>
        <strong>In the files you choose.</strong> Save, Save As, and Export write a file where you
        say, or download one. You can open it in any program that reads Fountain or plain text.
      </li>
      <li>
        <strong>In a recovery copy in this browser.</strong> Drafter keeps a copy of each script in
        the browser’s IndexedDB, its database for a website, so a crash doesn’t cost you your work.
        It stays on this device. See
        <a href="/docs/saving/#recovery-copy">Saving and your browser</a> for what it is and what can
        clear it.
      </li>
      <li>
        <strong>In your settings.</strong> Your settings, each script’s daily goal, and its
        writing stats are in the same IndexedDB. The stats are, for each day you write, the time
        you spent editing the script and how many words and pages it grew; nothing about what you
        typed, and nothing for a sample. Removing a script removes them. The theme you chose, and whether you have seen the tour, are in the
        browser’s localStorage, a small store for a website’s own notes. So, for a moment while a
        page closes, is any text not yet written to the recovery copy; the next visit moves it there.
        None of it is a cookie, and none of it leaves this device.
      </li>
    </ul>
    <p>
      Remove a script with <strong>Remove from this browser</strong>, or clear this site’s data in
      your browser’s settings, and it is gone from the device. Neither touches a file you saved.
    </p>

    <h2 id="offline">The service worker</h2>
    <p>
      Drafter installs a <em>service worker</em>, a small program your browser keeps, so Drafter
      opens when you’re offline. It saves Drafter’s own files (the page, its code, the fonts, and the
      icons) and nothing else. It doesn’t save your scripts. The one thing your browser does on its
      own is this: when Drafter opens, the browser asks drafter.dev for the worker’s file
      (<code>/sw.js</code>) to see whether there is a new version, and downloads the new files when
      there is one. That request carries nothing from your scripts. When a new version is ready,
      Drafter says so and waits for you to choose Reload; it never reloads on its own. You can
      remove the saved files, along with the worker, by clearing this site’s data.
    </p>

    <h2 id="updates">Updates in the desktop app</h2>
    <p>
      When it starts, the desktop app makes a few requests to GitHub: the release information, and,
      for the AppImage, the update itself, downloaded in the background. Nothing from your scripts
      is sent. The desktop app never installs or restarts by itself. It says a new version is ready
      (the AppImage, which waits for you to choose Restart) or available (a <code>.deb</code>, or
      the app built on a Mac, which offers a link to the release page) and waits for your choice. Turn off
      <strong>Check for updates</strong> in Settings and it makes no network request at all.
    </p>

    <h2 id="modules">Script modules</h2>
    <p>
      A script module is an extra tool for Drafter, such as one that counts scenes. The modules are
      compiled into Drafter itself. None is downloaded while you work, and each runs in your browser
      on your script only after you turn it on in Settings. The sample scripts are in Drafter too,
      and need no network. If a module ever needs to use the network, it has to say so and ask you
      before you can turn it on.
    </p>

    <p class="docs-note">
      Drafter is free and open source. If you want to be sure of any of this, the code is there to
      read.
    </p>
  </article>
</template>
