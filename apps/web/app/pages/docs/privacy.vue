<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-privacy');
if (!page) throw new Error('The Privacy page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Your script never leaves your device: no account, no cookies, no telemetry. drafter.dev measures visits with Plausible, privacy-focused analytics.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Your script never leaves your device. Drafter has no account, no cookies, and no telemetry,
      and it doesn’t send what you write to anyone, ours included. drafter.dev measures visitor
      traffic with Plausible, privacy-focused analytics with no cookies; the desktop app sends
      nothing.
    </p>

    <h2 id="what-drafter-doesnt-do">What Drafter doesn’t do</h2>
    <ul>
      <li><strong>No account.</strong> There is nothing to sign up for or sign in to.</li>
      <li><strong>No cookies, and no tracking of you.</strong> Drafter never follows you from site to site and never records your keystrokes. drafter.dev measures visitor traffic with Plausible, privacy-focused analytics with no cookies (<a href="#analytics">below</a>); the desktop app sends nothing.</li>
      <li><strong>No telemetry.</strong> It doesn’t report errors, usage, or the state of your browser back to anyone.</li>
      <li><strong>No uploads.</strong> A script, its title, its word count, and your settings never leave the device. Drafter has no server that could receive them.</li>
      <li><strong>No outside services.</strong> The fonts and icons are part of Drafter and come from drafter.dev itself, not from Google or a content network.</li>
    </ul>
    <p>
      Like every website, the server that sends Drafter to your browser knows that a browser asked
      for the page. It never sees anything you write, because that never leaves your browser.
    </p>

    <h2 id="analytics">Analytics on drafter.dev: Plausible</h2>
    <p>
      <strong>Only the website, drafter.dev, has analytics. The downloaded desktop app has none:</strong>
      it doesn’t load Plausible or anything like it, and it sends nothing about you or your use of
      it to anyone.
    </p>
    <p>
      drafter.dev uses <a href="https://plausible.io/privacy-focused-web-analytics">Plausible</a>
      to measure visitor traffic, so the maintainer can see roughly how many people use Drafter and
      which help pages they read. Plausible is analytics built for privacy, and it was chosen over
      Google Analytics for that reason:
    </p>
    <ul>
      <li><strong>No cookies.</strong> Nothing is stored in your browser, so there is no cookie banner to click through.</li>
      <li><strong>Nothing that identifies you.</strong> Plausible keeps no IP address and builds no profile of you. To count a visitor once a day, it uses a scrambled code that changes every 24 hours, so a visit can’t be tied to you, or to your visit the next day.</li>
      <li><strong>No following you around the web.</strong> Google Analytics links what you do across the many sites that use it, and Google uses that data for advertising. Plausible tracks nothing across sites, and sells and shares nothing.</li>
      <li><strong>Open and small.</strong> Plausible is open-source software, hosted in the European Union, and its script is a few kilobytes, so drafter.dev stays fast.</li>
    </ul>
    <p>
      What it records for each page you open: the page’s address (<code>drafter.dev/</code> or a
      help page), the site that sent you there if your browser says, the kind of device and browser,
      and the country. It never sees your script, its title, anything you type, or which files you
      open or save, because none of that leaves your browser.
    </p>
    <ul>
      <li><strong>Only on the website.</strong> Analytics runs only when you use Drafter at drafter.dev in a browser. The downloaded desktop app for Windows, Linux, or Mac, and a copy you host yourself, have no analytics at all. Drafter running offline sends nothing either.</li>
      <li><strong>Easy to block.</strong> A content blocker, or blocking plausible.io, stops it, and Drafter works just the same.</li>
    </ul>

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
        writing stats are in the same IndexedDB, as are the earlier versions of each script that
        History keeps (snapshots), which removing a script removes too. To find a scene in those
        versions quickly, Drafter keeps a note of each scene in them (its heading, its first lines,
        and a fingerprint of its wording) in a second IndexedDB database, <code>drafter-cache</code>;
        removing the script removes its notes there too. The stats are, for each day you write, the time
        you spent editing the script and how many words and pages it grew; nothing about what you
        typed, and nothing for a sample. Removing a script removes them. The theme you chose, whether you have seen the tour, and which
        What’s new notes you have seen are in the browser’s localStorage, a small store for a website’s own notes. So, for a moment while a
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
      there is one. <strong>Help → Check for updates…</strong> makes that same request when you
      choose it, and nothing else. That request carries nothing from your scripts. When a new
      version is ready,
      Drafter says so and waits for you to choose Reload; it never reloads on its own. You can
      remove the saved files, along with the worker, by clearing this site’s data.
    </p>

    <h2 id="reporting">Reporting a problem or suggesting an idea</h2>
    <p>
      <strong>Help → Report a problem…</strong> and <strong>Suggest an idea…</strong> send nothing
      by themselves. What you type stays on this device until you choose
      <strong>Open on GitHub</strong>. Only then does it leave, and only the report the dialog shows
      you: GitHub’s new-issue page opens with it filled in, in your browser, and you review it and
      submit it there yourself, with your own GitHub account. Drafter has no server and no token, so
      it can’t post anything for you. Your script is never included: not its text, its title, its
      file name, or your notes. <strong>Include version info</strong> adds only what About’s
      <strong>Copy version info</strong> copies (the version, the app, the system, and the browser),
      and you can turn it off.
    </p>
    <p>
      With no GitHub account, you can email cschweda@gmail.com instead. That email goes from your
      own email app, like any other, and Drafter itself sends nothing. <strong>Copy report</strong>
      puts the whole report on your clipboard, to paste wherever you like, and
      <strong>Write an email</strong> and <strong>Open on GitHub</strong> copy it too.
    </p>
    <p>
      The report is kept in this browser’s localStorage (in the desktop app, its own) until you
      choose <strong>Clear</strong>, so closing the tab or restarting loses nothing. Only the
      report’s own fields are kept, never your script. Drafter can’t tell whether GitHub or your
      email app got it, so it never clears it by itself.
    </p>

    <h2 id="updates">Updates in the desktop app</h2>
    <p>
      When it starts, the desktop app makes a few requests to GitHub: the release information, and,
      for the AppImage and the Windows app, the update itself, downloaded in the background.
      Nothing from your scripts is sent. The desktop app never installs or restarts by itself. It
      says a new version is ready (the AppImage and the Windows app, which wait for you to choose
      Restart) or available (a <code>.deb</code>, or
      the app built on a Mac, which offers a link to the release page) and waits for your choice. Turn off
      <strong>Check for updates</strong> in Settings and it makes no network request at all, unless
      you choose <strong>Help → Check for Updates…</strong>, which makes the same requests once, then
      and there.
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
