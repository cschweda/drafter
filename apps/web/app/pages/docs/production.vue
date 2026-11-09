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
    'Locking pages and scene numbers, revisions in colors with marks in the margin, A-pages like 12A, A-scenes like 5A, OMITTED scenes, and the long line at the end of the file.',
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
    </p>

    <h2 id="locking">Locking</h2>
    <p>
      <strong>Locking</strong> freezes two things at once: the number of every scene and the number
      of every page. After that, an edit never changes a number someone has already printed.
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
      new color, so everyone can tell the newest pages at a glance. Locking opens the first
      revision. <strong>Start the next revision</strong> closes it and opens the next color. The
      colors come in this order:
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
      A page that comes after a locked page and before the next one gets the first page’s number and
      a letter. If your new material spills past page 12, the extra pages are
      <strong>12A</strong>, <strong>12B</strong>, and so on. These are the
      <strong>A-pages</strong>. Page 13 stays page 13.
    </p>
    <p>
      The other way round, when a cut leaves a locked page with no text, it is folded into the page
      before it and the two share a label: <strong>13-14</strong> is one page that stands for both.
      A folded range stays folded through later revisions, and a page number is never reused.
    </p>

    <h2 id="a-scenes">A-scenes</h2>
    <p>
      A scene you add after locking cannot take the next number, because that number is taken. It
      takes the number before it and a letter: between scene 5 and scene 6 comes
      <strong>5A</strong>, then <strong>5B</strong> after that. Until you write the number, the new
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
      <strong>Clear marks…</strong> removes the asterisks and closes the revision without changing
      any number. <strong>Unlock…</strong> goes further: the scene numbers and page numbers are
      released, and the script is free again. Both ask first, and both take a snapshot before they
      act, so what you had is in History.
    </p>
    <p>
      Next: revised pages, a breakdown report, and sides come in a later release. This page will
      say so when they arrive.
    </p>
  </article>
</template>
