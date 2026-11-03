<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-privacy');
if (!page) throw new Error('The Privacy page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Your script stays with you: nothing about it is stored in the cloud, no AI reads it, and it never leaves your device unless you send it. Audited 3 November 2026.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Your script stays with you. Nothing about it is stored in the cloud, no AI reads it, and it
      never leaves your device unless you send it yourself. Drafter has no account, no cookies, and
      no telemetry. drafter.dev counts visits with Plausible, privacy-focused analytics with no
      cookies; the desktop app has no analytics at all.
    </p>

    <h2 id="your-script-stays-with-you">Your script stays with you</h2>
    <p>
      Writers worry, rightly, about a script getting out before it’s ready. Drafter is built so it
      can’t, and this is checked, not just promised.
    </p>
    <ul>
      <li>
        <strong>Nothing in the cloud.</strong> No server stores anything about your script: not its
        text, its title, its length, or its name. drafter.dev is a set of files that sends the app to
        your browser, with no database, no accounts, and nowhere to upload to. The desktop app has no
        server at all.
      </li>
      <li>
        <strong>Kept on your device only.</strong> Your script is in the files you save, and in a
        recovery copy, its history, drafts, and cuts in this browser’s own storage, or in the
        desktop app’s folder on your computer (<a href="#where-your-work-lives">below</a>).
      </li>
      <li>
        <strong>No AI.</strong> Drafter has no AI in it: no AI service, no model, nothing that reads
        your script to suggest, summarize, or learn from it, and your words never train anything. If
        you want your own AI app to read your scripts, the separate
        <a href="#drafter-for-claude">Drafter for Claude</a> does that, only for folders you name,
        and only if you set it up.
      </li>
      <li>
        <strong>It leaves only when you send it.</strong> A file you share, a report you open on
        GitHub, an email you write: those go because you chose them, and only what you see goes.
      </li>
    </ul>
    <p>
      <strong>What does use the network, all of it:</strong> loading Drafter from drafter.dev (the
      app, its fonts, and its dictionaries all come from drafter.dev itself); on drafter.dev only,
      Plausible’s count of page visits (<a href="#analytics">below</a>); in the desktop app, a check
      with GitHub for a new version when it starts, which you can turn off in Settings; and the links
      and reports you click. None of it carries your script.
    </p>
    <p>
      <strong>The audit.</strong> On 3 November 2026 Drafter was audited for exactly this: every line
      of code that could reach the network, every place it stores anything, its dependencies, and a
      writing session on drafter.dev in Chrome, Firefox, and Safari’s engine with every request
      recorded. A made-up phrase typed into the script appeared in none of them. The audit found one
      leak, fixed the same day: what a report said could reach drafter.dev’s analytics when it was
      opened on GitHub.
      <a href="https://github.com/cschweda/drafter/blob/main/docs/privacy-audit-2026-11-03.md"
        >Read the audit</a
      >.
    </p>

    <h2 id="what-drafter-doesnt-do">What Drafter doesn’t do</h2>
    <ul>
      <li><strong>No account.</strong> There is nothing to sign up for or sign in to.</li>
      <li><strong>No cookies, and no tracking of you.</strong> Drafter never follows you from site to site and never records your keystrokes. drafter.dev measures visitor traffic with Plausible, privacy-focused analytics with no cookies (<a href="#analytics">below</a>); the desktop app has no analytics.</li>
      <li><strong>No telemetry.</strong> Drafter sends no error reports, and nothing about what you do in it or the state of your browser. On drafter.dev only, Plausible counts page visits (<a href="#analytics">below</a>).</li>
      <li><strong>No uploads.</strong> A script, its title, its word count, and your settings never leave the device. Drafter has no server that could receive them.</li>
      <li><strong>No outside services but one.</strong> The fonts, icons, and dictionaries are part of Drafter and come from drafter.dev itself, not from Google or a content network. On drafter.dev, the one outside service is Plausible.</li>
      <li><strong>No browser spellcheck service.</strong> Chrome’s Enhanced spell check and Edge’s Microsoft Editor send what you type to Google or Microsoft, so Drafter turns the browser’s spellcheck off in every field. Its own spellcheck runs on your device. The one exception is Report a problem, whose text you are about to send anyway.</li>
    </ul>
    <p>
      Like every website, the server that sends Drafter to your browser knows that a browser asked
      for the page. It never sees anything you write, because that never leaves your browser.
    </p>

    <h2 id="analytics">Analytics on drafter.dev: Plausible</h2>
    <p>
      <strong>Only the website, drafter.dev, has analytics. The downloaded desktop app has none:</strong>
      it doesn’t load Plausible or anything like it, and it sends nothing about you, your scripts,
      or your use of it. When it checks for a new version, GitHub sees your IP address and which
      version and system you run, as any download does (<a href="#updates">below</a>).
    </p>
    <p>
      drafter.dev uses <a href="https://plausible.io/privacy-focused-web-analytics">Plausible</a>,
      privacy-first analytics with no cookies and no ads, for one thing only: to see the basic
      traffic, how many people use Drafter and which pages they look at, as a reference for making
      it better. It is on every page of drafter.dev, the app included. Plausible was chosen over
      Google Analytics for its privacy:
    </p>
    <ul>
      <li><strong>No cookies.</strong> Nothing is stored in your browser, so there is no cookie banner to click through.</li>
      <li><strong>No ads.</strong> Nothing is collected for advertising, by Drafter or by Plausible, and drafter.dev shows no ads.</li>
      <li><strong>Nothing that identifies you.</strong> Plausible keeps no IP address and builds no profile of you. To count a visitor once a day, it uses a scrambled code that changes every 24 hours, so a visit can’t be tied to you, or to your visit the next day.</li>
      <li><strong>No following you around the web.</strong> Google Analytics links what you do across the many sites that use it, and Google uses that data for advertising. Plausible tracks nothing across sites, and sells and shares nothing.</li>
      <li><strong>Open and small.</strong> Plausible is open-source software, hosted in the European Union, and its script is a few kilobytes, so drafter.dev stays fast.</li>
    </ul>
    <p>
      What it records, and all it records: each page you open, by its address without anything
      after a <code>?</code> or <code>#</code> (<code>drafter.dev/</code> or a help page), the site
      that sent you there if your browser says, the kind of device and browser, the country, and
      how far you scrolled and how long the page was open. Drafter sends Plausible nothing else: no
      clicks, no downloads, no forms. It never sees your script, its title, anything you type, or
      which files you open or save.
    </p>
    <p>
      Plausible’s small script comes from plausible.io and runs in the same page as the editor on
      drafter.dev, so it is the one piece of outside code there. Drafter lets only a page view and
      the time on the page through, cut down first (<code>apps/web/scripts/plausible.mjs</code>).
      Before 3 November 2026, Plausible also counted clicks on outside links, and the address of
      Open on GitHub in Report a problem went whole, with what the report said; the privacy audit
      found that, and it was fixed the same day.
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
      file name, or your notes. <strong>Include technical details</strong> adds only what
      <strong>Help → Copy technical details</strong> copies, and you can turn it off: Drafter’s
      version, which app this is, the system and browser, the language, the screen and window
      size, touch or mouse, whether Drafter is installed, works offline, saves in place, and keeps
      its storage, whether you’re online, and a few of your settings (the kind of script, Fountain
      or Classic Mode, the theme and text size, and spellcheck). The web address is put in words
      (drafter.dev, this computer, or self-hosted), never the name of a server of your own.
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
      and need no network, and no built-in module uses the network.
    </p>
    <p>
      The desktop app also lets you add modules of your own, from its modules folder. Those are code
      nobody at Drafter has checked. While one is on, it can read and change the open script, and a
      module that names addresses on the internet (an AI service, say) can send the script there,
      but only to the addresses it names and only once you agree to them. Drafter asks before you
      turn such a module on, and keeps every other address closed to it. Add only modules you trust.
    </p>

    <h2 id="drafter-for-claude">Drafter for Claude</h2>
    <p>
      Drafter never calls an AI. If you use one, <a href="/docs/drafter-for-claude/">Drafter for
      Claude</a> lets it read the scripts in the folders you choose, and nothing else. It is a
      separate program you set up in your AI app, not part of the app or the website; it opens no
      network connection, and it writes, moves, or deletes nothing.
    </p>
    <p>
      When you ask Claude something, what Drafter hands Claude goes to Anthropic, the same as
      pasting it in. The AI app sends the tool’s answer to its AI service along with your question.
      If your app uses another company’s AI, it goes there. Whatever that service’s terms say about
      your chats applies to this text too. Drafter can’t change that.
    </p>
    <p>
      Your notes and the boneyard are left out unless you ask for them, and every answer says how
      many it left out. Never handed over, whatever you ask: Drafter’s own data at the end of a
      script, your title page’s Contact, anything from Drafter’s storage in your browser, and the
      text of a file Claude didn’t ask about. What each of its tools can return:
    </p>
    <div
      class="docs-scroll"
      role="region"
      aria-label="What each tool can return (scrolls sideways)"
      tabindex="0"
    >
      <table>
        <caption>
          What each of Drafter for Claude’s tools can return
        </caption>
        <thead>
          <tr>
            <th scope="col">Tool</th>
            <th scope="col">Script text</th>
            <th scope="col">Notes and boneyard</th>
            <th scope="col">Other</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">List scripts</th>
            <td>Titles only</td>
            <td>Never</td>
            <td>File names, sizes, dates, counts, and what is inside each file</td>
          </tr>
          <tr>
            <th scope="row">Script overview</th>
            <td>Headings, synopses, and the title page (never the Contact)</td>
            <td>A count of to-dos; their text only if you ask</td>
            <td>Numbers from Drafter</td>
          </tr>
          <tr>
            <th scope="row">Read a scene</th>
            <td>The scenes asked for</td>
            <td>Only if you ask</td>
            <td></td>
          </tr>
          <tr>
            <th scope="row">A character’s lines</th>
            <td>That character’s speeches</td>
            <td>Only if you ask (notes inside a speech)</td>
            <td>Numbers</td>
          </tr>
          <tr>
            <th scope="row">List drafts</th>
            <td>Never a draft’s text</td>
            <td>Never</td>
            <td>The note you typed when you started each draft</td>
          </tr>
          <tr>
            <th scope="row">Compare drafts</th>
            <td>Changed lines, both sides</td>
            <td>Only if you ask</td>
            <td>Counts</td>
          </tr>
          <tr>
            <th scope="row">List cuts</th>
            <td>Cut text (trimmed in a list)</td>
            <td>Only if you ask</td>
            <td>Dates, drafts, and places</td>
          </tr>
          <tr>
            <th scope="row">Search scripts</th>
            <td>About 200 characters around each match</td>
            <td>Searched and shown only if you ask</td>
            <td></td>
          </tr>
          <tr>
            <th scope="row">Story map</th>
            <td>What a story map shows: short summaries, a few lines, hooks, and thread names</td>
            <td>Your Setup and Payoff names only, as the story map shows them</td>
            <td>Numbers</td>
          </tr>
          <tr>
            <th scope="row">Series overview</th>
            <td>Names, ages from introductions, and places</td>
            <td>Never</td>
            <td>Numbers</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="docs-note">
      Drafter is free and open source. If you want to be sure of any of this, the code is there to
      read.
    </p>
  </article>
</template>
