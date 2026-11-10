<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

// The Production help page: locking, revisions and their colors, A-pages, A-scenes, OMITTED, and the
// long line at the end of the file. Written for a writer who is new to these terms; each is
// explained once, with an example.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-production');
if (!page) throw new Error('The Production page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Locking pages and scene numbers, colored revisions with margin marks, A-pages like 12A, A-scenes like 5A, OMITTED scenes, revised pages, the breakdown report, and sides.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      A script that has been greenlit is read by many people at once: the director, the crew, the
      actors. They all need to point at the same page and the same scene. Production is how Drafter
      keeps that true while you keep rewriting. It is free, and it is for working professionals; if
      you are still writing your first draft, you can ignore all of it.
    </p>
    <p>
      Open the <strong>Production</strong> tab in the Inspector (under <strong>More</strong> for a
      script). Its commands are also in the command palette
      (<kbd>⌘K</kbd>, <kbd>Ctrl+K</kbd> elsewhere): <strong>Lock pages and scene numbers</strong>,
      <strong>Start the next revision</strong>, <strong>Write new scene numbers</strong>,
      <strong>Omit scene</strong>, <strong>Clear marks…</strong>, and <strong>Unlock…</strong>.
      The tab’s <strong>Export</strong> section has the three reports below: revised pages, a
      breakdown, and sides.
    </p>

    <h2 id="locking">Locking</h2>
    <p>
      <strong>Locking</strong> freezes two things at once: the number of every scene and the number
      of every page. After that, an edit never changes a number someone has already printed.
      Locking also records the script as it stands as the <strong>White</strong> draft, in Drafts,
      and opens the first revision, <strong>Blue</strong>.
    </p>
    <ul>
      <li>
        <strong>Scene numbers</strong> are written into your text, as Fountain does it:
        <code>INT. KITCHEN - NIGHT #12#</code>. They are real text, so any Fountain app keeps them.
        One undo takes the lock back.
      </li>
      <li>
        <strong>Page numbers</strong> are remembered where each page starts. Add a page of dialogue
        on page 12 and the pages after it do not move: page 13 is still page 13.
      </li>
    </ul>
    <p>
      A locked script shows a <strong>Blue rev.</strong> chip (or the name of whatever revision is
      open) in the status bar. Selecting it opens the Production tab.
    </p>

    <h2 id="revisions">Revisions and their colors</h2>
    <p>
      A <strong>revision</strong> is one round of changes that goes out to the crew on pages of a
      new color, so everyone can tell the newest pages at a glance. The locked script is White;
      locking opens the first revision, Blue. <strong>Start the next revision</strong> closes it
      and opens the next color. The colors come in this order:
    </p>
    <p>
      White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, and then Double: Double
      White, Double Blue, and so on round again.
    </p>
    <p>
      While a revision is open, Drafter marks what changed. A <strong>mark</strong> is an asterisk
      (<code>*</code>) in the right margin of a changed line. Only the words that changed are
      marked: change one sentence in a long speech and the speech carries a mark only where that
      sentence sits. Edit a line back to the way it was and its mark goes away.
    </p>

    <h2 id="a-pages">A-pages and folded ranges</h2>
    <p>
      Pages that spill past a locked page, such as page 12, are numbered <strong>12A</strong>,
      <strong>12B</strong>, and so on. These are the <strong>A-pages</strong>. Page 13 stays page
      13. New pages at the very start of the script, before page 1, become page 1 and its A-pages,
      <strong>1A</strong>, <strong>1B</strong>: page 1 always starts at the top.
    </p>
    <p>
      The other way round, when a cut leaves a locked page with no text, it is folded into the page
      before it and the two share a label: <strong>13-14</strong> is one page that stands for both.
      A folded range stays folded through later revisions, and a page number is never reused.
    </p>

    <h2 id="a-scenes">A-scenes</h2>
    <p>
      A scene you add after locking cannot take the next number, because that number is taken. It
      usually takes the number of the scene before it plus a letter: between scene 5 and scene 6
      comes <strong>5A</strong>, then <strong>5B</strong> after that. A few places need a letter in
      front instead, such as <strong>A5A</strong> between 5 and 5A, or <strong>A1</strong> before
      scene 1; the table shows each case. Until you write the number, the new
      heading shows the number it will have, dimmer, in the Source pane. Drafter writes the
      numbers into the text when you start the next revision, lock again, or choose
      <strong>Write new scene numbers</strong>; never while you type.
    </p>
    <div class="docs-scroll" role="region" aria-label="A-scene numbers (scrolls sideways)" tabindex="0">
      <table>
        <caption>
          Where a new scene goes, and its number
        </caption>
        <thead>
          <tr>
            <th scope="col">New scene sits</th>
            <th scope="col">Its number</th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row">Between 5 and 6</th><td>5A</td></tr>
          <tr><th scope="row">Between 5A and 6</th><td>5B</td></tr>
          <tr><th scope="row">Between 5A and 5B</th><td>5AA</td></tr>
          <tr><th scope="row">After 5Z, before 6</th><td>5ZA</td></tr>
          <tr><th scope="row">Between 5 and 5A</th><td>A5A</td></tr>
          <tr><th scope="row">Before scene 1</th><td>A1 (and B1, and so on)</td></tr>
        </tbody>
      </table>
    </div>
    <p>
      Numbers sort like a dictionary: 5, then 5A, 5AA, 5AB, 5B, and on to 5Z, 5ZA, then 6. A letter
      in front, as in A5A, puts a scene just ahead of 5A. A number is <strong>never reused</strong>:
      if scene 5A is cut, the next new scene there is not 5A again.
    </p>

    <h2 id="omitted">Omit scene</h2>
    <p>
      When a locked scene is cut, you cannot simply delete it, because the crew’s scripts would
      then skip a number with no explanation. <strong>Omit scene</strong> (in the Outline’s and
      Cards’ scene menus, and in the palette) replaces the scene with one line:
    </p>
    <pre><code>.OMITTED #12#</code></pre>
    <p>
      The number stays, the page keeps its place, and the scene’s text is cut from the script.
      Drafter first takes a snapshot, so the scene is kept in History and in your cuts.
    </p>

    <h2 id="warnings">Warnings in the Problems pane</h2>
    <p>Locked scripts get three extra checks:</p>
    <ul>
      <li><strong>A scene number is out of order</strong>, so the numbers no longer follow the script.</li>
      <li><strong>A scene number is on more than one scene.</strong></li>
      <li>
        <strong>A locked scene number is gone</strong>, usually because a numbered scene was deleted
        by hand. Its quick fix is <strong>Put back as OMITTED</strong>, which writes the
        <code>.OMITTED #12#</code> line in its place.
      </li>
    </ul>

    <h2 id="stage-plays">Stage plays</h2>
    <p>
      A stage play has revisions and locked pages, with the same colors and marks, but no locked
      scene numbers: a play’s scenes are not numbered on the page the way a film’s are.
    </p>

    <h2 id="long-line">The long line at the end of the file</h2>
    <p>
      Drafter keeps its settings in a block of lines at the end of the file, hidden in the editor
      (see <NuxtLink to="/docs/open-formats/#what-drafter-saves">What Drafter saves</NuxtLink>).
      When a revision is open, the block also holds one long line of squashed text. That is the
      script as it stood when the revision began, compressed. Drafter compares your words with it to
      draw the marks. It is in the file, not just on your computer, so the marks look the same on
      any computer that opens the script, and after the file travels by email. Other apps skip the
      block. Please leave it alone.
    </p>

    <h2 id="unlock">Unlocking and clearing marks</h2>
    <p>
      <strong>Clear marks…</strong> removes every revision’s asterisks and starts again from the
      script as it is now: a fresh White draft and a new Blue revision. The marks go; the lock, the
      scene numbers, and the page numbers stay. <strong>Unlock…</strong> goes further: the scene
      numbers and page numbers are released, and the script is free again. Unlock leaves your text
      as it is, so the scene numbers written into it (<code>#12#</code>) and any
      <code>.OMITTED</code> headings stay; delete them yourself if you no longer want them. Both ask
      first, and both take a snapshot before they act, so what you had is in History.
    </p>
    <h2 id="revised-pages">Revised pages</h2>
    <p>
      <strong>Revised pages</strong> are only the pages that changed, printed to hand to a crew that
      already has the last version, so they can swap them in. They are for a locked script: choose
      <strong>Export → Revised pages (PDF)…</strong>, or use the button in the Production tab.
    </p>
    <ul>
      <li>
        By default you get the pages marked in the open revision. The box can instead take every
        revision, or a range of pages.
      </li>
      <li>
        Each page keeps its locked label (12A) and its asterisks, and carries a header such as
        “Blue Revision — 12 November 2026”. You can write your own header; Drafter keeps it in the
        script.
      </li>
      <li>
        By default only the open revision’s asterisks print; you can print every revision’s. A tint
        of the revision’s paper color on the page is an option, off by default, for productions that
        print on white paper. White revisions get no tint.
      </li>
    </ul>
    <p>
      The full <strong>PDF</strong> of a locked script also prints the locked page labels and the
      open revision’s asterisks, with its name and date in the header. <strong>Plain text</strong>
      prints the locked page labels too, without asterisks. Every export shows a new scene with the
      A-number it will have (5A), as the Script pane does, though it isn’t written into your text
      until you choose <strong>Write new scene numbers</strong>. In
      <strong>Export options…</strong>, <strong>Revision marks</strong> chooses between the open
      revision’s marks and none.
    </p>

    <h2 id="breakdown">Breakdown</h2>
    <p>
      A <strong>breakdown</strong> is a table with a row for each scene, in script order, that a
      production uses to plan the shoot. <strong>Export → Breakdown (CSV)</strong> makes a
      spreadsheet file, and <strong>Breakdown (PDF)</strong> a printable table. For a screenplay or
      a stage play, locked or not. The columns are Scene, INT/EXT, Location, Time, Pages, Page,
      Cast, and Synopsis.
    </p>
    <ul>
      <li>
        <strong>Pages</strong> is the scene’s length in eighths of a page, as productions count it:
        “1 3/8” is one page and three eighths.
      </li>
      <li><strong>Page</strong> is the page the scene starts on, with its locked label.</li>
      <li>
        <strong>Cast</strong> lists the characters in the scene: first those who speak in it, then
        those named in its action, in the order they first appear. A character who never speaks
        anywhere in the script is not listed.
      </li>
      <li>An OMITTED scene is a row that says OMITTED, so the numbers have no gaps.</li>
    </ul>
    <p>Two things to know when you open the CSV in a spreadsheet:</p>
    <ul>
      <li>
        A cell that starts with <code>=</code>, <code>+</code>, <code>-</code>, or <code>@</code>
        gets an apostrophe in front of it, so the spreadsheet shows it as text and does not run it
        as a formula.
      </li>
      <li>
        Some spreadsheets read a page count like 3/8 as a date. When you import the file, set the
        <strong>Pages</strong> column to <strong>Text</strong>.
      </li>
    </ul>

    <h2 id="sides">Sides</h2>
    <p>
      <strong>Sides</strong> are the pages one actor needs for their scenes, so they can learn them
      without the whole script. Choose <strong>Export → Sides (PDF)…</strong>.
    </p>
    <ul>
      <li>Choose a character, and their scenes are ticked.</li>
      <li>
        Untick any scene that is not shooting that day; a day’s shoot is often a few scenes, not
        all of one character’s.
      </li>
      <li>
        You get every page a ticked scene is on, at its locked label. Other scenes on those pages
        are crossed out with a diagonal line, the usual mark for “not this one”.
      </li>
      <li>
        The header names the character, the scenes, and the date. Sides follow the script as it
        stands now, so the open revision’s marks show, since actors learn the current pages.
      </li>
    </ul>
  </article>
</template>
