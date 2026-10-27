<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-saving');
if (!page) throw new Error('The Saving page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'How Save works in each browser; keeping scripts in a Dropbox, Google Drive, or iCloud Drive folder; the recovery copy; installing Drafter as an app; and downloading the desktop app for Linux.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      A script in Drafter is a file, a plain <code>.fountain</code> text file that any other
      screenwriting program can open. What Save does with that file depends on your browser. Behind
      it, Drafter also keeps a recovery copy of every script in this browser, so a crash or a closed
      tab doesn’t cost you your work.
    </p>

    <h2 id="what-save-does">What Save does</h2>
    <p>
      <strong>In Chrome and Edge on a computer,</strong> Save writes straight back to the file you opened or saved
      before. The first Save of a new script asks where to put it and what to call it, like any
      desktop program. Save As saves a copy somewhere else.
    </p>
    <p>
      <strong>In Firefox, Safari, and Brave,</strong> and in every browser on a phone or tablet, a
      web page isn’t allowed to write to a file on your device. Save instead downloads a fresh, complete copy of the script. Each Save adds a
      new file to your Downloads folder, so repeated saves pile up as numbered copies
      (<code>The Call.fountain</code>, <code>The Call (1).fountain</code>, and so on). Every one is
      a whole script, so any of them is a full backup. (Brave ships with the feature that lets Chrome
      save in place turned off, which is why it saves by download.) Chrome and Edge on Android save
      by download too. On an iPhone or iPad, Chrome, Edge, and Firefox are all built on Safari’s
      engine, so every browser there behaves like Safari.
    </p>
    <p>
      Either way, Drafter marks a script whose changes aren’t in its file yet: a dot in the tab’s
      title, and a note in the status bar. If you close the tab or leave the site with changes that
      aren’t saved, your browser asks first. That question is the browser’s own and doesn’t always
      appear on phones and tablets; the recovery copy, below, is there for those times.
    </p>

    <h2 id="browsers">Browsers compared</h2>
    <div class="docs-scroll" role="region" aria-label="Browsers compared (scrolls sideways)" tabindex="0">
      <table>
        <caption>
          Browsers and what Drafter can do in each
        </caption>
        <thead>
          <tr>
            <th scope="col">What</th>
            <th scope="col">Chrome and Edge on a computer</th>
            <th scope="col">Firefox on a computer</th>
            <th scope="col">Safari, and any browser on an iPhone or iPad</th>
            <th scope="col">Brave</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Keeps a recovery copy in the browser</th>
            <td>Yes</td>
            <td>Yes</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <th scope="row">Save writes back to the file you opened</th>
            <td>Yes</td>
            <td>No: it downloads a copy</td>
            <td>No: it downloads a copy</td>
            <td>No: it downloads a copy</td>
          </tr>
          <tr>
            <th scope="row">Remembers the file between visits</th>
            <td>Yes. It asks your permission again, unless you choose “Allow on every visit”.</td>
            <td>No</td>
            <td>No</td>
            <td>No</td>
          </tr>
          <tr>
            <th scope="row">Asks before you leave with unsaved changes</th>
            <td>Yes, on a computer</td>
            <td>Yes, on a computer</td>
            <td>Yes on a Mac; not reliable on an iPhone or iPad</td>
            <td>Yes, on a computer</td>
          </tr>
          <tr>
            <th scope="row">Open a file by picking it or dropping it on the window</th>
            <td>Yes</td>
            <td>Yes</td>
            <td>Yes</td>
            <td>Yes</td>
          </tr>
          <tr>
            <th scope="row">Export as PDF or plain text</th>
            <td>Yes, as a download</td>
            <td>Yes, as a download</td>
            <td>Yes, as a download</td>
            <td>Yes, as a download</td>
          </tr>
          <tr>
            <th scope="row">Agrees to keep the recovery copy</th>
            <td>Usually, once you have used Drafter for a while</td>
            <td>It asks you</td>
            <td>Only when Drafter is installed as an app</td>
            <td>Varies</td>
          </tr>
          <tr>
            <th scope="row">Risk of the browser deleting the recovery copy</th>
            <td>Low once it agrees</td>
            <td>Low once it agrees</td>
            <td>
              Real. A site that isn’t installed can lose its data after about a week of not being
              visited.
            </td>
            <td>Varies</td>
          </tr>
          <tr>
            <th scope="row">Install Drafter as an app</th>
            <td>Yes</td>
            <td>Not on a computer</td>
            <td>Yes: Add to Dock, or Add to Home Screen</td>
            <td>Varies</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Other Chromium-based browsers behave like Chrome unless they have turned this off, as Brave
      has. “Varies” means it depends on the version and your settings.
    </p>

    <h2 id="synced-folders">Keeping scripts in a synced folder</h2>
    <p>
      Drafter doesn’t sync anything itself, and it never talks to Dropbox, Google Drive, or iCloud.
      But a script is an ordinary file, so a folder that one of those services keeps in sync syncs
      your scripts like any other file.
    </p>
    <ul>
      <li>
        <strong>Dropbox, Google Drive, or iCloud Drive, in Chrome or Edge on a computer.</strong> Save the script
        into the service’s folder on your computer (the Dropbox, Google Drive, or iCloud Drive
        folder that its app made). From then on, Save writes back to that file, and the service’s
        own app carries the change to your other computers.
      </li>
      <li>
        <strong>On a Chromebook,</strong> Google Drive appears in the Save dialog itself.
      </li>
      <li>
        <strong>In Firefox, Safari, Brave, or any browser on a phone or tablet,</strong> each Save
        downloads a copy. Set the browser to
        download into the synced folder, or move the files there. Open the newest one when you
        return.
      </li>
    </ul>

    <h2 id="changed-elsewhere">When the file changed somewhere else</h2>
    <p>
      With a synced folder, a script’s file can change on another computer while this browser’s copy
      stays as it was. Drafter checks the file before you type over it.
    </p>
    <ul>
      <li>
        When you open a script that has a file, Drafter reads the file first. If your browser has
        been told to allow that (<strong>Allow on every visit</strong>, in Chrome’s permission
        question), the check just happens. Otherwise the script opens read-only under a bar that
        says “This script is saved in” and the file’s name, with a <strong>Check for changes</strong>
        button. One click asks permission and checks.
      </li>
      <li>
        If only the file changed, Drafter loads it and says “Updated from” and the file’s name.
      </li>
      <li>
        If the file changed and so did this browser’s copy, Drafter asks which to keep working on:
        <strong>Open the file</strong> or <strong>Keep this browser’s version</strong>. Whichever
        you choose, the other is kept as a separate script in this browser, so nothing is lost.
      </li>
      <li>
        If the file was moved or deleted, or its drive isn’t there, Drafter says so and offers
        <strong>Save As</strong> or <strong>Edit this browser’s copy</strong>.
      </li>
    </ul>
    <p>
      The same check runs when you come back to the window. In Firefox, Safari, and Brave there is no
      file to check, because Save downloads a copy. Opening a file with the same title as a script
      already in the browser asks whether to replace that script or open the file beside it.
    </p>

    <h2 id="recovery-copy">The recovery copy</h2>
    <p>
      Drafter keeps a copy of every script in this browser’s own storage, whether or not the script
      has a file. It is written as you type, within a moment of a pause, and it is what brings your
      work back after a crash, a killed tab, or a closed window: open Drafter and each script is as
      you left it, unsaved changes included and still marked as unsaved.
    </p>
    <p>It is a safety net, not a place to keep a script. Know its limits:</p>
    <ul>
      <li>It lives in this browser on this computer. Another browser, or another computer, doesn’t have it.</li>
      <li>Clearing the browser’s site data or cookies deletes it. So does removing a script with <strong>Remove from this browser</strong>; that never touches a file.</li>
      <li>A private or incognito window may not keep it past the window.</li>
      <li>Safari can clear a site’s data after about a week without a visit, unless Drafter is installed as an app.</li>
    </ul>
    <p>
      Drafter tells you when the recovery copy isn’t safe. If the browser may clear it, a note says
      “This browser may clear your recovery copy,” and suggests saving to a file or installing
      Drafter as an app. If the browser won’t let Drafter keep one at all, an alert says “Drafter
      can’t keep a recovery copy in this browser right now. Your changes exist only in memory until
      you save the script to a file.” Take either as a reason to save now. A saved file is always the
      one copy you control.
    </p>

    <h2 id="installing">Installing Drafter as an app</h2>
    <p>
      Installing gives Drafter a window and an icon of its own, and it opens without the browser’s
      toolbars. Drafter works offline after your first visit either way. In Safari, installing also
      makes the recovery copy durable.
    </p>
    <ul>
      <li>
        <strong>Chrome:</strong> choose the install button at the right end of the address bar, or
        open the menu and choose “Cast, save, and share”, then “Install page as app”.
      </li>
      <li>
        <strong>Edge:</strong> choose the install button in the address bar, or open the menu and
        choose “Apps”, then “Install this site as an app”.
      </li>
      <li>
        <strong>Safari on a Mac:</strong> choose File, then <strong>Add to Dock</strong>.
      </li>
      <li>
        <strong>Safari on an iPhone or iPad:</strong> choose Share, then
        <strong>Add to Home Screen</strong>.
      </li>
      <li><strong>Firefox on a computer</strong> can’t install web apps.</li>
    </ul>

    <h2 id="download-linux">Download Drafter for Linux</h2>
    <p>
      If you use Linux, Drafter also comes as a desktop app. It is the same editor as this site,
      in a window of its own, and it adds what a browser can’t promise everyone:
    </p>
    <ul>
      <li>Save writes back to the file you opened, in any desktop environment.</li>
      <li>The recovery copy lives in the app, where no browser can clear it.</li>
      <li>
        You can open a script by double-clicking it, or from a terminal with
        <code>drafterdev script.fountain</code>.
      </li>
      <li>It has a menu bar.</li>
      <li>
        Drafter checks for a new version when it starts (you can turn this off) and asks before
        installing it.
      </li>
    </ul>
    <p>It comes in two packages, for 64-bit Intel and AMD computers. Each is about 100 to 130 MB.</p>
    <ul>
      <li>
        <strong>The <code>.deb</code></strong> is the one to use on Ubuntu 24.04 and later, and on
        other Debian-based systems. On Ubuntu 24.04 and later it is the only package that runs with
        no extra steps.
      </li>
      <li>
        <strong>The AppImage</strong> is for other distributions. Make it executable and run it. It
        needs <code>libfuse2</code>. On Ubuntu 24.04 and later it may ask whether to continue
        without Chromium’s sandbox; the install guide says what to do.
      </li>
    </ul>
    <p>
      <a href="https://github.com/cschweda/drafter/releases/latest">Download the latest release</a>
      from GitHub, and read the
      <a href="https://github.com/cschweda/drafter/blob/main/docs/desktop-install-linux.md">install guide</a>
      for the steps. Windows and macOS are coming; macOS will be last, because it needs Apple’s
      developer account.
    </p>

    <p class="docs-note">
      Everything here stays on your device. See <a href="/docs/privacy/">Privacy</a>, and the
      <a href="/docs/shortcuts/">keyboard shortcuts</a> for Save, Save As, and the rest.
    </p>
  </article>
</template>
