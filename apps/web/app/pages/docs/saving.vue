<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-saving');
if (!page) throw new Error('The Saving page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'How Save works in each browser; synced folders; opening Final Draft, Highland, Fade In, and Markdown files; exporting; the recovery copy; installing as an app; and the desktop app.',
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
            <th scope="row">
              Export as PDF, plain text, Final Draft, or Markdown (a Markdown document: PDF, its
              Markdown file, or plain text)
            </th>
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

    <h2 id="other-apps">Files from other apps</h2>
    <p>
      <strong>Open a file…</strong>, or dropping a file on the window, opens a Fountain script
      (<code>.fountain</code>), a Markdown file (<code>.md</code> or <code>.markdown</code>), or
      plain text (<code>.txt</code>) as itself, and Save saves it the way Save does in your browser.
      A file from another screenwriting app, a Final Draft (<code>.fdx</code>), Highland
      (<code>.highland</code>), or Fade In (<code>.fadein</code>) file, is opened a different way:
      its script comes in as a new one, and the file you opened is never changed.
    </p>

    <h3 id="final-draft">Final Draft</h3>
    <p>
      Drafter opens a Final Draft file (<code>.fdx</code>) the way it opens any other: choose
      <strong>Open a file…</strong>, or drop it on the window. It comes in as a new script with its
      text turned into Fountain, and the <code>.fdx</code> itself is never changed. The new script
      has no file yet, so the first Save asks where to put it and saves a <code>.fountain</code>.
    </p>
    <p>
      Scene headings, action, characters, parentheticals, dialogue, dual dialogue, transitions,
      shots, centered text, bold, italic, and underline, page breaks, scene numbers and summaries,
      and the title page all come across. A paragraph Drafter has no element for, such as a cast
      list or an act break, comes in as action with a note after it, like
      <code>[[fdx: Cast List]]</code>, so nothing is dropped without a word. Drafter says how many
      came in that way, and the Problems tab lists each one, with a jump to it (Find, with
      <code>fdx:</code>, finds them too). Final Draft’s page layout,
      fonts, element settings, revisions, and other settings are left out.
    </p>
    <p>
      To go the other way, choose Export, then <strong>Final Draft (.fdx)</strong>. Drafter writes a
      <code>.fdx</code> file with the script’s elements as Final Draft names them. Sections, notes,
      synopses, and lyrics, which Final Draft has no element for, are marked so that opening the file
      in Drafter again brings them back.
    </p>

    <h3 id="highland-fade-in">Highland and Fade In</h3>
    <p>
      A Highland file (<code>.highland</code>) or a Fade In file (<code>.fadein</code>) opens the
      same way as a Final Draft file: choose <strong>Open a file…</strong>, or drop it on the
      window, or, in the desktop app, open it with Drafter from your file manager. Its script comes
      in as a new one, not saved yet, so the first Save asks where to put a <code>.fountain</code>,
      and the file you opened is never changed. History keeps the script as it came in.
    </p>
    <ul>
      <li>
        <strong>Highland</strong> already writes in Fountain, so its script comes in exactly as you
        wrote it. Anything else in the file, such as pictures, isn’t brought in, but one
        note at the end names it, like
        <code>[[highland: Also in the file, not brought in: cover.png]]</code>.
      </li>
      <li>
        <strong>Fade In</strong> keeps its script in Open Screenplay Format, which Drafter reads as
        it reads a Final Draft file: scenes, speeches, dual dialogue, scene numbers, bold, italic,
        and underline, notes, and the title page all come across. A paragraph in a style Drafter has
        no element for comes in as action with a note, like <code>[[osf: Cast List]]</code>. Fade
        In’s page layout, fonts, and other settings are left out.
      </li>
    </ul>
    <p>
      Drafter says how many notes came in, and the Problems tab lists each one. A file that isn’t
      one Drafter can read, such as a text file renamed <code>.highland</code>, is turned away with
      the reason, and nothing opens.
    </p>

    <h3 id="markdown-files">Markdown</h3>
    <p>
      A <code>.md</code> or <code>.markdown</code> file opens as a Markdown document: a page of
      notes, an outline, or a treatment, with a Preview beside it instead of script pages. Save
      saves it the way Save does in your browser.
    </p>
    <p>
      If the Markdown file holds a screenplay you typed in Fountain, choose
      <strong>Open as screenplay…</strong> instead (in the palette, the app menu, or the desktop
      app’s File menu). It opens the file as a new screenplay with its text exactly as written. It
      isn’t saved yet, so Save asks where to put a <code>.fountain</code>, and the Markdown file is
      never changed.
    </p>
    <p>
      If it holds an outline, open it as a Markdown document and choose
      <strong>New screenplay from this outline</strong>. Drafter makes a new screenplay from it: the
      <code>#</code> heading at the top, before any other text, is the title, the other headings
      become sections, each list item becomes a scene stub with a stand-in heading, and each
      paragraph a synopsis. The Problems tab lists the stubs that still need a real heading, and the
      outline itself stays as it was.
    </p>

    <h3 id="cant-open">Files Drafter can’t open</h3>
    <p>
      A Word document, an RTF file, a PDF, an OpenDocument or Pages document, an older Final Draft
      file (<code>.fdr</code>), a Celtx project, and a zip archive aren’t scripts Drafter can read,
      so Open turns them away, says what the file is, and says what to do instead: for most, save it
      as plain text or Fountain in the app that made it, then open that. An RTF file or a PDF is
      known by what’s inside it even when its name ends in <code>.txt</code>. Nothing opens, and the
      script you have open is left alone. Any other file of plain text opens as a Fountain script.
    </p>

    <h2 id="export-options">Export options</h2>
    <p>
      <strong>Export options…</strong>, at the end of the Export menu, sets how a script’s PDF,
      plain text, Final Draft file, and Markdown file come out. <strong>Scene numbers</strong>: None
      (the usual), As written (only the numbers you’ve written in the script, like
      <code>#12A#</code>), or Number every scene (a scene with a written number keeps it, and the
      rest are numbered by their place, so two scenes can share a number). <strong>Title
      page</strong>: Full, Title and author only (the title, the credit, the authors, and the
      source, without your contact details or the date), or None. <strong>Notes in
      Markdown</strong>: Leave out (the usual) or Include, for the Markdown export alone.
    </p>
    <p>
      Each script keeps its own choices, in this browser, and the script itself never changes: they
      aren’t in its file, so another browser or computer starts with the usual ones. The export’s
      message names any choice that isn’t the usual one. A Final Draft file gets the title page you
      choose, and always keeps the scene numbers written in the script, since Final Draft decides
      whether to print them. A Markdown document has no scene numbers, title page, or notes to
      choose, so its Export options is off.
    </p>

    <h3 id="export-markdown">Export as Markdown</h3>
    <p>
      Export, then <strong>Markdown (.md)</strong>, saves a screenplay or stage play as a Markdown
      file: plain text that reads well anywhere, in a notes app, on a website, in any Markdown
      viewer, or pasted into an AI chat, which reads Markdown more easily than a PDF. The title is
      the top heading, scene headings are headings (numbered when your Scene numbers choice says
      so), a speech is the character’s name in bold with the dialogue under it, and your bold,
      italic, and underline come through. It follows your Scene numbers and Title page choices just
      as the PDF does.
    </p>
    <p>
      Notes and synopses are left out, as in the PDF, unless <strong>Notes in Markdown</strong> is
      set to Include: then each note and synopsis is a quote where it stands, so a reader, or an AI,
      sees what you were thinking. The boneyard is always left out. Only the Markdown export carries
      notes; a PDF, plain text, or Final Draft file never prints them. A Markdown document’s Markdown
      export is its own text, as it is.
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

    <h2 id="history">History and snapshots</h2>
    <p>
      Besides the recovery copy, Drafter keeps earlier versions of each script in this browser,
      called snapshots, so you can go back to one. It takes one after every 10 minutes of active
      writing, every time you save to a file, and when you open a file. It also takes one before
      Expand outline, Fix all, Revert to Saved, or loading a changed file over the script, and when
      a file from another app comes in, or a Markdown file opens as a screenplay. Samples keep none,
      and a snapshot that matches the newest is not taken again.
    </p>
    <p>
      Open <strong>History…</strong> from the app menu (File, in the desktop app), the command palette,
      or the save item in the status bar. Each snapshot can be restored (one undo takes the restore back, after a
      snapshot of what it replaced), labeled, saved as a file, deleted, or compared with the script
      as it is now or with another snapshot. <strong>Take snapshot…</strong> keeps one on request,
      with a label if you like. Snapshots are thinned as they age: every labeled one stays, all of
      the last 24 hours stay, then one an hour for a week and one a day for 90 days, and the newest
      and the one from your last save always stay. They live in the same storage as the recovery
      copy, so they have the same limits, and they are not in your <code>.fountain</code> file.
    </p>
    <h3 id="compare">Compare</h3>
    <p>
      Compare, from a snapshot in History, shows what changed between two versions. It opens on
      <strong>Changes</strong>: the script’s text, grouped under each scene’s heading, with an added
      line marked <strong>+</strong> in green and a removed one <strong>−</strong> in red, and the
      words you changed within a line underlined or struck through. Unchanged stretches fold away
      behind “Show 40 unchanged lines”. Where there is room, <strong>Side by side</strong> shows the
      two versions in columns. <strong>Pages</strong> shows the newer version as script pages, with an
      asterisk in the margin by each changed line. If red and green are hard to tell apart, choose
      <strong>Blue and orange</strong> under <strong>Colors for changes</strong> in Settings.
    </p>

    <h3 id="deleted-scenes">Deleted scenes</h3>
    <p>
      <strong>Deleted scenes</strong> (in the app menu after History…, in History, or in the command
      palette) lists every scene that is in one of your snapshots but not in the script now, the most
      recently cut first, with when it was last there and its first lines.
      <strong>Put back</strong> puts a scene back where it was, after the scene that came before it;
      one undo takes it out again. It reads your snapshots in the background, and keeps a note of each
      scene in them in this browser, so the next look is quick.
    </p>

    <h3 id="show-changes">Show changes</h3>
    <p>
      The <strong>Changes</strong> button on the Script tab’s bar marks the pages with what you have
      changed since you last saved: a changed or added line gets a colored band and a
      <strong>+</strong>, and where lines were taken out a thin rule with a button shows them. To
      compare with a snapshot instead, choose it from <strong>since</strong>, or use
      <strong>Show changes since this</strong> in History. The marks are only on the screen: they
      never print or export, and Show changes is off each time you open Drafter.
    </p>

    <h3 id="scene-history">History of this scene</h3>
    <p>
      <strong>History of this scene</strong> (a scene’s menu in the Outline or the Cards, the
      Structure strip’s menu on a scene, the command palette for the scene your cursor is in, or
      Deleted scenes) lists every different version of one scene in your snapshots, newest first,
      and shows what changed against now or against the version before.
      <strong>Use this version</strong> puts the scene back as it was, after keeping a snapshot
      called “Before restoring a scene”; one undo brings back what it replaced.
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

    <h2 id="download">Download the desktop app</h2>
    <p>
      Drafter also comes as a desktop app for Linux and Windows. It is the same editor as this
      site, in a window of its own, and it adds what a browser can’t promise everyone:
    </p>
    <ul>
      <li>Save writes back to the file you opened, whatever browser you would have used.</li>
      <li>The recovery copy lives in the app, where no browser can clear it.</li>
      <li>You can open a script by double-clicking a <code>.fountain</code> file.</li>
      <li>It has a menu bar.</li>
      <li>
        Drafter checks for a new version when it starts (you can turn this off), and whenever you
        choose <strong>Help → Check for Updates…</strong>, and never installs
        it by itself: it offers <strong>Restart</strong> once the new version is downloaded, or
        <strong>Get it</strong>, the release page, where it can’t update itself.
      </li>
      <li>
        It saves the same plain-text files as this site, so a script moves freely between the two.
        Each keeps its own recovery copy and recent scripts.
      </li>
    </ul>
    <p>
      <a href="https://github.com/cschweda/drafter/releases/latest">Download the latest release</a>
      from GitHub. Each download is about 100 to 130 MB.
    </p>

    <h3 id="download-linux">Linux</h3>
    <p>Two packages, for 64-bit Intel and AMD computers:</p>
    <ul>
      <li>
        <strong>The <code>.deb</code></strong> is the one to use on Ubuntu 24.04 and later, and on
        other Debian-based systems. On Ubuntu 24.04 and later it is the only package that runs with
        no extra steps. A <code>.fountain</code> file opens in it with a double-click, and
        <code>drafterdev script.fountain</code> opens one from a terminal. It offers
        <strong>Get it</strong> when there is a new version.
      </li>
      <li>
        <strong>The AppImage</strong> is for other distributions. Make it executable and run it. It
        needs <code>libfuse2</code>, doesn’t register file types by itself, and updates itself with
        <strong>Restart</strong>. On Ubuntu 24.04 and later it may ask whether to continue without
        Chromium’s sandbox; the install guide says what to do.
      </li>
    </ul>
    <p>
      The
      <a href="https://github.com/cschweda/drafter/blob/main/docs/desktop-install-linux.md">Linux install guide</a>
      has the steps.
    </p>

    <h3 id="download-windows">Windows</h3>
    <p>
      An installer for Windows 10 and 11: <code>…-windows-x64-setup.exe</code> for most PCs, and
      <code>…-windows-arm64-setup.exe</code> for Windows on Arm (a Snapdragon laptop, or Windows in
      a virtual machine on an Apple silicon Mac). It installs for you alone, without asking for an
      administrator, adds Drafter to the Start menu, and opens <code>.fountain</code> files with a
      double-click. It updates itself with <strong>Restart</strong>.
    </p>
    <p>
      The installer isn’t signed yet, so Windows SmartScreen may stop it with “Windows protected
      your PC”. Choose <strong>More info</strong>, check that the app is Drafter’s installer, then
      <strong>Run anyway</strong>. The
      <a href="https://github.com/cschweda/drafter/blob/main/docs/desktop-install-windows.md">Windows install guide</a>
      has the steps, and how to uninstall.
    </p>

    <h3 id="download-mac">Mac</h3>
    <p>
      There is no macOS download yet: it needs Apple’s developer account to be signed. Until then you
      can <a href="https://github.com/cschweda/drafter/blob/main/docs/desktop-install-macos.md">build it on your Mac</a>
      with one command; the guide says how. Drafter in your browser works on a Mac today, and can
      be installed as an app (above).
    </p>

    <p class="docs-note">
      Everything here stays on your device. See <a href="/docs/privacy/">Privacy</a>, and the
      <a href="/docs/shortcuts/">keyboard shortcuts</a> for Save, Save As, and the rest.
    </p>
  </article>
</template>
