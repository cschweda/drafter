<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-drafts-and-cuts');
if (!page) throw new Error('The Drafts and cuts page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Numbered drafts kept for good, Draft by draft, and Cuts: everything you cut, kept to read, copy, or put back. Where they are kept, and two computers.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Drafter keeps two things for good, so nothing you write is lost: the <strong>drafts</strong>
      you choose to start, and everything you <strong>cut</strong>. Both can sit as plain files next
      to your script, so they are backed up wherever your script is.
    </p>
    <p>
      They work the same for a screenplay, a stage play, and a Markdown document. A sample keeps
      neither; save it to a file and it becomes a script of your own that does.
    </p>

    <h2 id="drafts">Drafts</h2>
    <p>
      <strong>A draft is a version you name: Drafter keeps it exactly as it is, for good.</strong> You
      might write a first draft, send it out, get notes back, and start a second. Drafts are numbered
      Draft 01, Draft 02, and so on, and a number is never used twice.
    </p>
    <p>
      Every draft also has an <strong>ID</strong>, worked out from its exact text, shown as seven
      characters (such as <code>a3f9c2e</code>). The same text always has the same ID, and any change
      gives another, so an ID names one draft for certain. Typing four or more of its characters in
      the command palette finds it, in any of your scripts.
    </p>

    <h3 id="starting-a-draft">Starting a draft</h3>
    <p>
      Choose <strong>Start new draft…</strong> from the Drafter menu, the command palette (where
      “new version” finds it too), the Drafts list, or the File menu in the desktop app. A small
      dialog asks for an optional one-line note about the draft you are finishing, such as “sent to
      Sam for notes”. Press <kbd>Enter</kbd> to start it, or <kbd>Esc</kbd> to leave everything as
      it was.
    </p>
    <p>
      What you have now is kept as that draft, and you carry on writing the next one. A script with
      no drafts yet is in Draft 01, so the first time you start a new draft, your text becomes
      Draft 01 and you are writing Draft 02. Any script works this way, however you got it: one
      written before drafts existed, one from another app, or one opened from Final Draft, Highland,
      or Fade In. Drafter never starts a draft by itself.
    </p>
    <p>
      If nothing has changed since the last draft, Drafter asks whether to start the next one anyway.
      You can: the new number keeps the same text, and the same ID.
    </p>

    <h3 id="the-drafts-list">The Drafts list</h3>
    <p>
      <strong>Drafts…</strong> (the Drafter menu, the command palette, the File menu in the desktop
      app, or the “Draft 03” in the status bar) lists your drafts, newest first: the draft you are
      writing at the top, marked “now”, then each one you kept, with its ID, date, words, and note.
      Each draft starts with a line such as “Draft 03 begins — builds on Draft 02 (a3f9c2e)”, so the
      big changes stand out. The filter finds a draft by number (“2”, “02”, or “draft 2” all find
      Draft 02), by ID, or by its note. For each draft:
    </p>
    <ul>
      <li><strong>Read</strong> opens it read-only beside your script, so you can copy any passage across.</li>
      <li><strong>Compare</strong> shows what changed between it and now, in Compare’s Changes view. Its menu also has <strong>Compare with another draft…</strong>.</li>
      <li>
        <strong>Restore as a new draft</strong> brings its text back without losing anything: the
        text you have now is kept as a draft first (noted “before restoring Draft 03”), then Draft
        03’s text becomes the draft you are writing, noted “from Draft 03”. One undo takes it back.
      </li>
      <li><strong>Copy full ID</strong> and <strong>Edit note…</strong> are in its menu.</li>
    </ul>
    <p>
      Drafts can’t be deleted. They also show in History, above the snapshots, so you can compare a
      snapshot with any of them.
    </p>

    <h3 id="draft-by-draft">Draft by draft</h3>
    <p>
      <strong>Draft by draft…</strong> (the button at the top of the Drafts list, or the command
      palette) shows how the work changed over time, one step at a time: Draft 01 to Draft 02, Draft
      02 to Draft 03, and on to the draft you are writing now. Each step has its note and date, and
      what changed in numbers: words added or taken out, scenes (or chapters and sections) added,
      cut, and changed, and how much of the text is new.
    </p>
    <p>
      <strong>Open</strong> a step to see it in Compare, with <strong>Previous step</strong> and
      <strong>Next step</strong> to walk through the whole history. Beside the changes, “Cut while
      writing Draft 02” lists what you cut in that step, and <strong>Show in Cuts</strong> opens
      them in the Cuts list. To compare any two drafts, such as Draft 01 with Draft 05, use Compare
      in the Drafts list.
    </p>

    <h2 id="cuts">Cuts</h2>
    <p>
      <strong>Cuts…</strong> (the Drafter menu, History, the command palette, or the File menu in
      the desktop app) keeps everything you cut, for good, so you can look back through it for
      ideas, copy a line, or put a scene back weeks later. It replaces the Deleted scenes list of
      earlier versions, and “deleted scenes” in the palette still finds it.
    </p>

    <h3 id="what-counts-as-a-cut">What counts as a cut</h3>
    <ul>
      <li>A whole scene, or a whole chapter or section of a Markdown document, that is no longer there.</li>
      <li>
        From a scene or section that is still there: a whole speech (the character and what they
        say), an action paragraph, a transition, a paragraph, or a list item, whatever its length.
      </li>
      <li>A run of <strong>12 or more words</strong> taken out of one, or replaced by quite different words.</li>
    </ul>
    <p>
      Fixing a typo, changing a few words, rewording a sentence lightly, and moving text somewhere
      else are not cuts. Drafter looks for cuts each time it keeps a snapshot (after every 10 minutes
      of writing, when you save or open a file, and when you take one), by comparing it with the one
      before, so text you type and take out again in between isn’t a cut. Restoring a draft or a
      snapshot, opening a file, and reloading it make no cuts, because the text before was kept
      already. The same text cut twice is one cut, with both dates.
    </p>

    <h3 id="using-cuts">Browsing, copying, and putting back</h3>
    <p>
      Each cut shows its title (the scene or section heading, or its first words), its text, and
      “Cut while writing Draft 03”, with the date. <strong>Group cuts by</strong> chooses how they
      are listed: <strong>Scene</strong> (<strong>Section</strong> in a Markdown document) puts each
      cut under the scene or chapter it came from, so a scene trimmed over several drafts reads as
      one group; <strong>Draft</strong> lists them by the draft you were writing. Newest come first.
      The filter finds words in a cut, its heading, or a draft number. A long cut shows its first
      lines, with <strong>Show all</strong> for the rest. Every cut has three buttons:
    </p>
    <ul>
      <li>
        <strong>Put back</strong> puts it back where it was: a scene between its old neighbours, a
        passage after the line it followed, or at the end of its scene when that line is gone.
      </li>
      <li>
        <strong>Insert at cursor</strong> puts it in where you are writing now: a whole scene at the
        start of the next scene after your cursor, anything else at the start of the next paragraph.
      </li>
      <li><strong>Copy</strong> copies its text, to paste anywhere.</li>
    </ul>
    <p>
      One undo takes back a Put back or an Insert at cursor. A cut you put back stays in the list,
      marked “put back”, because the list is a record. Cuts can’t be deleted. In Compare, a scene or
      section that is gone has <strong>Find in Cuts</strong>.
    </p>

    <h3 id="cut-before-drafts">Cut before drafts</h3>
    <p>
      The first time Drafter v0.24.0 runs, it looks once through the snapshots you already have,
      quietly while you write, and keeps what was cut there too. Those cuts say
      <strong>“Cut before drafts”</strong>, since no draft had been started. It can find only what
      the snapshots still hold: snapshots are thinned as they age, and an unlabeled one is gone after
      90 days. From then on, every cut is kept as you make it.
    </p>

    <h2 id="where-they-are-kept">Where drafts and cuts are kept</h2>
    <p>
      Drafter always keeps your drafts and cuts in its own storage (the same place as the
      <a href="/docs/saving/#recovery-copy">recovery copy</a>), so the lists work offline in any
      browser. Where it can, it also writes them as plain files next to your script, and the Drafts
      and Cuts lists always say which: <strong>“Saved beside Boca.fountain.”</strong> or
      <strong>“In this browser only.”</strong>
    </p>
    <p>For a script saved as <code>Boca.fountain</code>, the files are:</p>
    <ul>
      <li>
        <strong>A drafts folder,</strong> <code>Boca drafts</code>, with one file for each draft:
        <code>Boca – Draft 01.fountain</code>, <code>Boca – Draft 02.fountain</code>, and so on
        (<code>.md</code> for a Markdown document). Each is your script as it was, with a short
        note at the very end that holds the draft’s number, ID, date, and note. Any app that reads
        Fountain opens it, and treats that note as a comment it doesn’t print.
      </li>
      <li>
        <strong>A cuts file,</strong> <code>Boca.fountain.cuts.md</code>: a plain Markdown document,
        newest first, with each cut’s title, when it was cut, where it came from, and its text.
      </li>
    </ul>
    <p>
      Drafter never writes over a draft file and never deletes one; the folder only gains files.
      The cuts file is read first and every cut in it is kept, then it is written again whole.
      <strong>Save As</strong> to a new name or place writes the whole set beside the new file, and
      leaves the old files where they are.
    </p>

    <h3 id="desktop">In the desktop app</h3>
    <p>
      Drafts and cuts are always written beside the script. A script that has never been saved has
      no folder yet; its drafts and cuts are written when you first save it.
    </p>

    <h3 id="chrome-and-edge">In Chrome and Edge on a computer</h3>
    <p>
      A web page may write only to the files and folders you give it, so the first time you start a
      draft, Drafter asks <strong>“Keep drafts and cuts next to Boca.fountain?”</strong>. Choose
      <strong>Choose folder…</strong> and pick the folder that holds the script; Drafter checks that
      it does. It remembers that folder for that script, though the browser may ask you to allow it
      again on a later visit. Choose <strong>Not now</strong>, and they stay in the browser; the
      lists have a <strong>Keep next to Boca.fountain…</strong> button to ask again whenever you like.
    </p>

    <h3 id="other-browsers">In other browsers, and on phones</h3>
    <p>
      Firefox, Safari, and phones can’t write files beside your script, so drafts and cuts stay in
      the browser. <strong>Export drafts and cuts</strong>, in both lists, downloads them as one
      file, <code>Boca drafts and cuts.zip</code>, holding the drafts folder and the cuts file. Do it
      now and then, as you would save a copy: a browser’s storage can be cleared. The button is there
      in every browser, for a copy to send or keep.
    </p>

    <h2 id="two-computers">Using two computers</h2>
    <p>
      Keep the script in a folder that Dropbox, Google Drive, OneDrive, or the like keeps in sync,
      and use the desktop app, or Chrome or Edge with the folder allowed, on both computers. The
      drafts folder and the cuts file sync with the script. When you open the script, and when you
      come back to Drafter after being away a little while, Drafter reads them and adds what the
      other computer kept:
    </p>
    <ul>
      <li>Every cut from either computer is in Cuts, once.</li>
      <li>A draft this computer hasn’t got is added to the Drafts list.</li>
      <li>
        If both computers started a draft with the same number, both are kept. The other computer’s
        is written as <code>Boca – Draft 04 (2).fountain</code> and listed as “Draft 04 (from another
        computer)”.
      </li>
      <li>
        A draft file whose text was changed in another program is kept, and listed as “changed
        outside Drafter”.
      </li>
    </ul>
    <p>
      Nothing from either computer is lost or written over. To avoid two drafts with one number,
      start a new draft on one computer at a time, and let the folder sync before you start one on
      the other.
    </p>
    <p>
      Opening a draft file itself, such as <code>Boca – Draft 03.fountain</code>, opens it
      read-only, as it was frozen, with a bar that says “This is Draft 03 of Boca.” Choose
      <strong>Open a copy to keep writing</strong> to write on from it (Save then asks where to keep
      the copy, and the draft file is never changed), or <strong>Open Boca instead</strong>.
    </p>
  </article>
</template>
