<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

// The Threads help page (threads design): what a thread is, tagging a scene, the Lanes view and its
// keys, the [[Thread: …]] note, and novels. Written for a writer, in plain words.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-threads');
if (!page) throw new Error('The Threads page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Threads show which scenes each plot thread is in: tagging a scene, naming and coloring a thread, the Lanes view of the whole script, its keys, the [[Thread: …]] note, and novels.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      A story is rarely one line. There is the heist, and the marriage that is
      coming apart, and the question of who sent the letter. A
      <strong>thread</strong> is one of those lines, followed through the work.
      Tag the scenes a thread is in, and Drafter draws every thread as a lane
      along the whole script, so you can see where it starts, where it goes
      quiet, and where it ends.
    </p>
    <p>
      Threads are for a screenplay, a stage play, and a novel. They are free,
      they stay in your file, and nothing about them is sent anywhere.
    </p>

    <h2 id="tagging">Tagging a scene</h2>
    <p>
      Open a scene’s menu (in the Outline, on a card, or on a block in the
      Lanes) and choose
      <strong>Threads…</strong>. A small box lists every thread you have, each
      with its color and name. Check the ones this scene is in. To start a new
      one, type a short label in <strong>New thread</strong> and press
      <kbd>Enter</kbd>: it is added and checked. Then <strong>Save</strong>. A
      scene can be in up to twelve threads, and a label can be forty characters.
    </p>
    <p>
      There are other ways in. <strong>Scene details…</strong> has a Threads
      field, where you type the labels with commas between them. The command
      palette has <strong>Threads…</strong> for the scene your cursor is in. Or
      just type the note yourself, as <a href="#the-note">below</a>. Saving is
      one change, so one Undo takes it back.
    </p>

    <h2 id="names-and-colors">Names and colors</h2>
    <p>
      A label is the short word a scene carries: <code>Heist</code>,
      <code>A</code>, <code>Mara</code>. A thread can also have a longer
      <strong>name</strong> (“The Harbor heist”, up to 80 characters) and a
      <strong>color</strong>, which Drafter picks for you from the nine color
      words the Outline already uses (a thread’s color also has a bar in its
      swatch, so it never looks like a scene’s color). From a thread’s menu, in
      the Lanes or in the Threads… box:
    </p>
    <ul>
      <li>
        <strong>Name…</strong> and <strong>Color…</strong> change how it is
        shown.
      </li>
      <li>
        <strong>Rename thread…</strong> changes the label in every scene that
        has it. If another thread already has that label, Drafter asks, and
        <strong>Merge</strong> joins the two. Capital letters don’t matter:
        <code>heist</code> and <code>Heist</code> are the same thread.
      </li>
      <li>
        <strong>Remove from every scene…</strong> (every chapter and section, in
        a novel) takes the label out of all of them. A rename, a merge, and a
        remove happen all together or not at all, in one Undo.
      </li>
    </ul>
    <p>
      While the Threads… box has changes you haven’t saved, its thread menus are
      turned off, and say “Save or cancel your changes first.” That way nothing
      you typed is dropped quietly.
    </p>

    <h2 id="lanes">The Lanes</h2>
    <p>
      In the Outline tab, the <strong>Tree | Lanes</strong> switch changes the
      view. Lanes is a grid: a row for each thread, then a row for scenes in no
      thread, with the work running left to right. Each scene is a block, as
      wide as it is long (in pages, or in words until the script has pages), in
      its thread’s color. A ruler above shows where you are in the work. Hover
      or focus a block to see its card: the scene’s number, heading, length, and
      threads. Click a block to go to the scene.
    </p>
    <p>
      The Outline’s rows and the Cards also show a small
      <strong>chip</strong> for each thread the scene is in, so you see them
      even without opening Lanes. A block is never drawn narrower than 4 pixels,
      so a very short scene is still there.
    </p>
    <p>
      <strong>Show as table</strong>, in the Lanes’ menu, lists the same thing
      in words and numbers: each thread, its name, its scenes, its length, and
      its share of the work. It is also the place to rename and recolor without
      the grid, and it is how a screen reader gets the whole picture at once. On
      a phone the Lanes are a list instead of a grid, a thread at a time.
    </p>

    <h2 id="keys">Keys in the Lanes</h2>
    <ul>
      <li>
        <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> move between blocks
        and rows.
      </li>
      <li>
        <kbd>Home</kbd> and <kbd>End</kbd> go to the first and last block in a
        row.
      </li>
      <li>
        <kbd>←</kbd> from a row’s first block goes to the thread’s name;
        <kbd>Enter</kbd> there opens the thread’s menu.
      </li>
      <li><kbd>Enter</kbd> on a block goes to the scene.</li>
      <li>
        <kbd>Shift</kbd>+<kbd>F10</kbd> (or the context-menu key, or the
        <strong>⋯</strong> a focused block shows) opens the block’s menu, with
        Go to and Threads…. The ⋯ is for a touch screen.
      </li>
      <li><kbd>Esc</kbd> hides the card.</li>
    </ul>

    <h2 id="the-note">The note in your script</h2>
    <p>
      In a script a scene’s threads are an ordinary note inside the scene,
      usually in its header:
    </p>
    <pre><code>INT. HARBOR OFFICE - NIGHT

[[Thread: Heist, Mara]]

She counts the keys twice.</code></pre>
    <p>
      Threads… writes this note for you. The older word
      <strong>Storyline</strong> still works: <code>[[Storyline: A]]</code> is
      read as the same thing, forever, and when Drafter rewrites a scene’s
      threads it writes <code>Thread</code>. A note Drafter was not asked to
      touch is never rewritten. A thread’s name and color are kept in the
      script’s settings block (the <code>/* drafter */</code> comment at the end
      of the file), which is hidden in the editor.
    </p>
    <p>
      A label can’t contain a comma or <code>]]</code>, since those would end
      the label or the note, and Drafter refuses to write one rather than change
      what you typed. A version of Drafter older than v0.29.0 shows a Thread
      note as an ordinary note.
    </p>

    <h2 id="novels">Threads in a novel</h2>
    <p>
      In a novel, a chapter or a section is tagged from its menu the same way
      (<strong>Threads…</strong>), and the Lanes draw one block for each, as
      wide as its words. The tags are kept in the novel’s comment at the end of
      the file, beside each passage’s status and synopsis, so the Markdown above
      it stays clean. A chapter’s threads pass to its sections that have none of
      their own, and those are drawn lighter, so you can tell a tag you gave
      from one a section simply inherits. A chapter that has words of its own
      before its first section gets a block for them.
    </p>

    <h2 id="claude">Drafter for Claude, and the Story Atlas</h2>
    <p>
      <a href="/docs/drafter-for-claude/">Drafter for Claude</a> shows each
      scene’s threads in <code>script_overview</code> and
      <code>read_scene</code>, so an AI app you use can answer “which scenes is
      the heist in?” The <a href="/docs/story-atlas/">Story Atlas</a>’s old
      “Threads” section, the arcs from a setup to its payoff, is now called
      <strong>Setups and payoffs</strong>, so that “thread” means a plot thread
      everywhere.
    </p>

    <h2 id="not-yet">Not yet</h2>
    <p>
      Threads don’t yet appear in exports (PDF, HTML, or the Story Atlas’s own
      pictures), in the Structure strip’s colors, or in the script’s margin, and
      Drafter doesn’t yet chart a pace from them. Those are listed in the
      project’s plans.
    </p>
  </article>
</template>
