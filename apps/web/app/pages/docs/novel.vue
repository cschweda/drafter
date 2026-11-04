<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

// The Novel help page (Novel design): what a novel is in Drafter, the marks that make chapters,
// sections, and parts, the Outline and Cards, focus, targets, and why the file stays plain
// Markdown. Written for a novelist who is new to Markdown; it teaches each mark.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-novel');
if (!page) throw new Error('The Novel page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Writing a novel in Drafter: chapters, sections, and parts in plain Markdown, the Outline and Cards, focus on one chapter, word targets, and a file any app opens.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Novel is a place to draft a book. You write chapters and sections, and Drafter keeps count: the
      words in each chapter, your progress toward a target, and where every chapter stands. Your
      book is a plain Markdown file that any app opens.
    </p>
    <p>
      It sits beside Screenplay and Stage play when you start something new. Choose
      <strong>New novel</strong> in the Scripts menu or the command palette
      (<kbd>⌘K</kbd>, <kbd>Ctrl+K</kbd> elsewhere), or open <strong>Help → Sample scripts → Novel</strong>
      to see a tiny book first. The manuscript layout, as a PDF or a Word file, comes later, in
      v0.26.1; for now you can print, or export to HTML or EPUB, like any Markdown document.
    </p>

    <h2 id="marks">The marks: chapters, sections, and parts</h2>
    <p>
      Markdown is plain text with a few marks. For a novel you need only these, and you can type
      them yourself.
    </p>
    <div class="docs-scroll" role="region" aria-label="The marks of a novel (scrolls sideways)" tabindex="0">
      <table>
        <caption>
          What you type, and what Drafter makes of it
        </caption>
        <thead>
          <tr>
            <th scope="col">You type</th>
            <th scope="col">It is</th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row"><code># The Night Watch</code></th><td>A chapter: a <code>#</code>, a space, and the title</td></tr>
          <tr><th scope="row"><code>## At the Gate</code></th><td>A section within the chapter: two <code>#</code></td></tr>
          <tr>
            <th scope="row"><code>***</code>, <code>* * *</code>, <code>---</code>, or <code>___</code> on a line of its own</th>
            <td>A scene break, which also starts a new section, with no title</td>
          </tr>
          <tr>
            <th scope="row">A line of text with <code>---</code> directly under it (no empty line between)</th>
            <td>
              A section heading: that line is the section’s title, as with <code>##</code>
              (<code>===</code> under it makes a chapter, as with <code>#</code>). Leave an empty line
              above <code>---</code> when you mean a scene break
            </td>
          </tr>
          <tr><th scope="row"><code># Part One</code></th><td>A part: a chapter heading that starts with the word “Part”, in any case (<code>PART</code> and <code>part</code> too). The chapters after it belong to it</td></tr>
        </tbody>
      </table>
    </div>
    <p>
      The lines under a heading are the chapter’s text. Leave an empty line between paragraphs. A
      scene break before the first chapter is ignored: it has no chapter to divide.
    </p>
    <pre role="group" tabindex="0" aria-label="A novel’s marks, an example"><code># Part One

# Chapter One

The lighthouse had been dark for a week.

## At the Gate

Mara tried the latch.

* * *

Morning came in grey.</code></pre>
    <p>
      Here “Part One” is a part, “Chapter One” is a chapter, “At the Gate” is a section, and the
      scene break starts another section without a title.
    </p>

    <h2 id="outline">The Outline and Cards</h2>
    <p>
      The <strong>Outline</strong> tab (<strong>Show Outline</strong> in the Inspector’s row, and on
      a phone’s bar) lists the book’s parts, chapters, and sections. Each row shows:
    </p>
    <ul>
      <li>its words, counting everything inside it;</li>
      <li>its progress toward a target, if you set one;</li>
      <li>its <strong>status</strong>: To do, Draft, Revised, or Done, from a small menu;</li>
      <li>its <strong>synopsis</strong>, a line or two about what happens, which you edit in place.</li>
    </ul>
    <p>
      <kbd>Enter</kbd> on a row goes to the passage in your text. <kbd>Alt+↑</kbd> and
      <kbd>Alt+↓</kbd> move a chapter or section, with all its text, up or down in the book, and you
      can drag a row too. A move is one step of Undo. A row’s menu (<kbd>Shift+F10</kbd>) has Go to,
      the moves, Edit synopsis, Status, and Set a target.
    </p>
    <p>
      <strong>Cards</strong> show the same book as cards, one for each chapter and section, in the
      book’s order, with its synopsis, status, words, and target. They move with the same keys, or
      by dragging on a wide screen. A plain Markdown document has neither: the Outline and Cards are
      a novel’s.
    </p>

    <h2 id="focus">Focus on one chapter</h2>
    <p>
      A long book is hard to see. <strong>Focus on this passage</strong> (<kbd>⌘⌥F</kbd> on a Mac,
      <kbd>Ctrl+Alt+F</kbd> elsewhere) shows only the section where your cursor is, or its chapter
      when it has no sections. Press it again to widen to the whole chapter, and a third time to
      narrow back to the section. <kbd>⌘⌥⇧F</kbd> (<kbd>Ctrl+Alt+Shift+F</kbd>) shows the whole book.
    </p>
    <ul>
      <li>The rest of the book is only hidden, never removed. Saves, drafts, and every export always hold the whole book.</li>
      <li>The Preview shows the same passage you’re looking at.</li>
      <li>Replace All changes only the matches inside the passage, and says so.</li>
      <li>A bar over the text says what shows, with a button to show the whole book.</li>
      <li>
        If you delete the passage’s heading, search for something elsewhere, or use Go to for
        another passage, the whole book comes back.
      </li>
    </ul>

    <h2 id="targets">Words, targets, and statuses</h2>
    <p>
      Open <strong>Counts</strong> (the status bar’s counts, or the palette on a phone) and set a
      <strong>Book target</strong>: a whole number of words, such as <code>90000</code>. It then
      shows “62,140 of 90,000 words (69%)”. A percentage rounds down, so Drafter never says 100%
      before you have reached it. Past the target the real figure shows, such as 104%.
    </p>
    <p>
      A chapter or section has its own target: choose <strong>Set a target…</strong> from its row’s
      menu in the Outline, or its card’s menu in Cards. <strong>Stats</strong> lists the words in
      each chapter, under its part. Your daily goal and sprints work as they do for any script.
    </p>

    <h2 id="problems">Notes that no longer match</h2>
    <p>
      If you rename or remove a heading outside Drafter, the status, synopsis, or target kept for it
      has nothing to belong to. <strong>Problems</strong> says so, as advice rather than an error,
      with a <strong>Clear them</strong> button that removes only those notes in one undo step.
    </p>

    <h2 id="file">Is my file still Markdown?</h2>
    <p>
      <strong>Yes.</strong> A novel is an ordinary Markdown file. Open it in any text editor, or
      any Markdown app, and you read your book. What Drafter keeps beyond the text, the statuses,
      synopses, and targets, lives in one comment at the very end of the file,
      <code>&lt;!-- drafter {…} --&gt;</code>, which other apps do not show. That comment also says
      <code>"template":"novel"</code>, which is how Drafter knows it is a novel. It is never part
      of your book: the Preview, printing, every export, and the word counts leave it out. Choose
      <strong>Markdown (plain text)</strong> in the document chooser to take that one note out and
      keep everything else.
    </p>
    <p>
      Your book stays on your device. Nothing is sent anywhere, and
      <a href="/docs/drafter-for-claude/">Drafter for Claude</a>, if you set it up, sees a novel
      with its parts, chapters, and sections, and each one’s notes (its status, synopsis, and
      target) and words, and only reads it.
    </p>

    <h2 id="shortcuts">Keys at a glance</h2>
    <div class="docs-scroll" role="region" aria-label="Novel keys (scrolls sideways)" tabindex="0">
      <table>
        <caption>
          Novel keys
        </caption>
        <thead>
          <tr>
            <th scope="col">Do this</th>
            <th scope="col">Mac</th>
            <th scope="col">Windows and Linux</th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row">Focus on the passage, then the chapter, then back</th><td><kbd>⌘⌥F</kbd></td><td><kbd>Ctrl+Alt+F</kbd></td></tr>
          <tr><th scope="row">Show the whole book</th><td><kbd>⌘⌥⇧F</kbd></td><td><kbd>Ctrl+Alt+Shift+F</kbd></td></tr>
          <tr><th scope="row">Move a chapter or section up or down</th><td colspan="2"><kbd>Alt+↑</kbd>, <kbd>Alt+↓</kbd> (in the Outline or Cards)</td></tr>
          <tr><th scope="row">A row’s or card’s menu</th><td colspan="2"><kbd>Shift+F10</kbd></td></tr>
        </tbody>
      </table>
    </div>
  </article>
</template>

<style scoped>
/* A line too long for a phone scrolls inside the example's own box, which a keyboard can reach,
   as the Fountain page's examples do: the page itself never scrolls sideways. */
pre {
  max-width: 100%;
  margin: 0.5em 0 1em;
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--raised);
  font: 13px/1.5 var(--font-mono, monospace);
}
pre:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 2px;
}
</style>
