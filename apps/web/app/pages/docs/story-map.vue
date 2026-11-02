<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

// The Story map help page (story-map design; the plan's Task 9): for writers, in plain words.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-story-map');
if (!page) throw new Error('The Story map page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'A story map is one page that answers “What are you writing?” in pictures: how to make one, what goes in, the marks that steer it, and what is never included.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      People ask “What are you writing?” A <strong>story map</strong> is a visual answer: one page
      you can send by text or email, that shows your story at a glance.
    </p>
    <p>
      It is made for people who don’t read scripts: a friend, a parent, a colleague, a producer.
      They open it on a phone, scroll for a few seconds, and see the title, the idea in one line,
      how far along you are, the shape of the story, the people in it, and every scene in order,
      with a line or two of dialogue. It uses no screenwriting words. It is a working view for
      collaborators too: the shape, the pace, the places, your setups and payoffs, and what is still
      to write are all there.
    </p>
    <p>
      A story map is for a screenplay or a stage play. It is not a copy of your script to read (that
      is Export → HTML), and it holds no settings or switches: it is a page to look at.
    </p>

    <h2 id="making-one">Making one</h2>
    <p>
      Choose <strong>Export → Story map…</strong> from the toolbar’s Export menu, the Drafter menu,
      the command palette (“story map”, “visual”, or “share” finds it), or File → Export in the
      desktop app. A short dialog, <strong>Make a story map</strong>, asks a few things. Its
      choices start sensible, so you can just press <kbd>Enter</kbd>. Drafter then saves one file,
      named after your script, such as <code>Boca – story map.html</code>. On a phone the dialog
      comes up from the bottom of the screen.
    </p>

    <h2 id="the-dialog">The dialog’s choices</h2>
    <ul>
      <li>
        <strong>Status:</strong> <strong>In progress</strong> or <strong>Finished</strong>. It
        starts at In progress when Drafter finds something still to write (see
        <a href="#gaps">below</a>), and Finished otherwise. Once you choose, Drafter remembers it
        for this script.
      </li>
      <li>
        <strong>Planned length, in pages</strong> (optional, with In progress). With it, the page
        shows how much is written, such as “About 82% written”, and the pages still to come. It is
        kept in the script’s file, in Drafter’s metadata block.
      </li>
      <li><strong>Logline:</strong> your story in one sentence. See <a href="#logline">Logline</a>.</li>
      <li>
        <strong>The line under your name:</strong> “What I’m writing” to start with. Change it to
        anything.
      </li>
      <li>
        <strong>Explain the page:</strong> on to start with, a short sentence at the top that tells
        your reader what they are looking at. You can change the sentence or turn it off.
      </li>
      <li>
        <strong>Include:</strong> Scene summaries, Lines of dialogue, and Threads (your setups and
        payoffs) are on. <strong>Your contact</strong> is off. When you turn it on, it starts with
        the Contact on your title page, and an email address becomes a link to email you.
      </li>
      <li>
        <strong>Check the lines and hooks</strong> (folded away): the lines of dialogue Drafter
        picked, each with a checkbox, and <strong>Pick another</strong> for another line from the
        same scene; and a short description (a hook) for each leading character. Untick a line and
        it is never used. Drafter finds each hook where the script first introduces the character
        (“JUNE (71), a retired radio operator”); an edited one is kept in the script’s metadata
        block, so it travels with the file.
      </li>
    </ul>
    <p>
      Above the button, the dialog says what goes in: “This page includes a few lines of dialogue
      and a one-line summary of each scene. Notes are never included.” The status, the include
      choices, the line under your name, the explaining sentence, and your contact are kept for this
      script in this browser, like the other export options.
    </p>

    <h2 id="whats-on-it">What’s on the page</h2>
    <ul>
      <li>
        <strong>The top:</strong> the title, your name and the line under it, the logline, how far
        along it is, and a few big numbers: pages, running time, scenes, characters, and places.
      </li>
      <li>
        <strong>The shape:</strong> every scene as a block along the pages, coloured by time of day
        (or by act, when you mark acts), how much is inside or outside and by day or night, and how
        long the scenes run.
      </li>
      <li>
        <strong>Characters:</strong> who is on screen most, cards for the eight leading characters
        (each with a hook, where they appear, and a line of their own), and who shares the most
        scenes.
      </li>
      <li>
        <strong>The scenes,</strong> in order: where and when, how long, a one-line summary, who is
        in it, and now and then a line of dialogue. Past 80 scenes, the list folds into parts you
        open.
      </li>
      <li><strong>Places,</strong> sized by how long the story spends there, and <strong>threads</strong>: your setups joined to their payoffs.</li>
    </ul>
    <p>
      Places say <strong>Inside</strong> and <strong>Outside</strong>, not INT. and EXT., and lengths
      are in minutes and pages. Every chart has <strong>Show as a table</strong> under it, for a
      screen reader or anyone who prefers numbers. The page prints too, in black on white.
    </p>

    <h2 id="lines">Lines of dialogue: [[Quote]] and [[No quote]]</h2>
    <p>
      Drafter picks the lines for you, so a story map works with no setup: about one scene in four
      gets one, at most 12, spread through the story, with no character more than three times. A
      line is one speech by one character, 3 to 18 words, that ends a sentence. Drafter cleans it
      for your reader: no (V.O.), no (CONT’D), no stage directions in brackets.
    </p>
    <p>You can steer it, in your script:</p>
    <ul>
      <li>
        <strong><code>[[Quote]]</code></strong> in a speech, at the end of a line of dialogue or
        alone on the line just under it, means “use this one”. A marked line always goes in, up to
        160 characters.
      </li>
      <li><strong><code>[[No quote]]</code></strong> means “never use this one”.</li>
    </ul>
    <p>
      You don’t have to type them. With the cursor in a speech, choose
      <strong>Use in story map</strong> or <strong>Never use in story map</strong> from the command
      palette, or, in the desktop app, from the Edit menu or the right-click menu. One undo takes it
      back. Like any note, the marks never print, and they travel with your file.
    </p>

    <h2 id="logline">Logline</h2>
    <p>
      The logline is your story in one sentence, shown under the title. Type it in the dialog, and
      Drafter writes it on your title page as <code>Logline:</code> (one undo takes it back). Or
      type <code>Logline: …</code> on the title page yourself. It never prints in your script’s
      PDF. With no logline, the page goes from the title straight on.
    </p>

    <h2 id="gaps">In progress or finished, and what counts as a gap</h2>
    <p>
      An unfinished script is drawn as unfinished, not broken: dashed outlines, quiet colour, and
      plain words. Drafter finds what is still to write in four ways, and guesses nothing:
    </p>
    <ul>
      <li><strong>An act with nothing in it yet</strong> shows as “Not written yet”.</li>
      <li>
        <strong>A planned scene:</strong> a scene heading with no action and no dialogue (perhaps a
        synopsis or a note under it). It shows as a dashed row, “Planned, not written yet”.
      </li>
      <li>
        <strong>A to-do in a scene</strong> (a <code>[[TODO: …]]</code> note, or a
        <code>#todo</code> tag) puts a small “to do” mark on the scene. The note’s words never go
        in.
      </li>
      <li>
        <strong>The planned length,</strong> when you give one: the pages still to write are a
        dashed stretch at the end.
      </li>
    </ul>
    <p>
      One sentence sums it up and never says more than the numbers: “Acts 1 and 2 are written. Act
      3 is under way: 2 scenes planned.” A very early draft (under 10 pages, or under 6 scenes
      written) shows only its pages and scenes.
    </p>
    <p>
      <strong>Finished</strong> leaves the planned scenes out, hides the to-do marks and the
      progress bar, and says “The end” at the close.
    </p>

    <h2 id="acts">Acts, only when you mark them</h2>
    <p>
      Drafter never guesses acts. Your acts are your <code># sections</code>, or, if you have none,
      the sections whose heading starts with the word “Act” (“Act One”, “ACT 2: …”). A screenplay
      with only <code>##</code> sequences has no acts, and that’s fine.
    </p>
    <p>
      With two acts or more, the page draws an act band, gives each act a colour and a card with its
      own mood line (the act’s first synopsis), and groups the scenes by act. With one act or none,
      the scenes are one run called “The story”, and everything else is the same. In an early draft,
      the acts are small “Act 1”, “Act 2” markers until there is more to show.
    </p>
    <p>
      A one-act play is normal: its page reads “A one-act play in progress” (or “A finished one-act
      play”), and says nothing else about acts.
    </p>

    <h2 id="stage-plays">Stage plays: the interval, and who’s on stage</h2>
    <p>
      A play gets the same page, in a play’s words: <strong>settings</strong> in place of places,
      and running time “to watch”.
    </p>
    <ul>
      <li>
        <strong>The interval.</strong> A play with two acts or more has one, between Acts 1 and 2:
        a gap on the shape, a divider in the scene list, and “with an interval” in the running time.
        Put <code>[[Interval]]</code> in the scene it should follow to move it, or
        <code>[[No interval]]</code> anywhere to have none. A one-act play has none unless you mark
        one.
      </li>
      <li>
        <strong>Who’s on stage.</strong> Each scene shows a short bar for each character, from when
        they come on to when they go, with one plain sentence such as “Dev enters halfway”. Drafter
        works it out from the lines: a character arrives with their first speech, their name in
        capitals, or “enters”, “comes in”, “appears”, or “arrives”; they go at “exits”, “leaves”,
        or “goes out”, and “Exeunt” clears the stage. Someone who leaves and comes back in one scene
        reads as there throughout. <strong>Who shares the stage most</strong> lists the pairs who
        are on together longest.
      </li>
    </ul>

    <h2 id="never-included">What is never included</h2>
    <ul>
      <li>
        <strong>Notes are never included</strong>, nor the boneyard, to-do text, revision marks, or
        your script itself. The only words from notes are your Setup and Payoff names, when Threads
        is on.
      </li>
      <li>
        Of the title page, only the title, your name, the logline, and (only when you turn it on)
        your contact.
      </li>
      <li>
        Scenes are numbered 1, 2, 3 in order, whatever your export options say about scene numbers.
      </li>
    </ul>
    <p>
      <strong>The page has no code and fetches nothing.</strong> It is one HTML file with no
      JavaScript at all and a security policy that lets it load nothing, so it opens offline, on any
      phone or computer, and never reports back to anyone. Its fonts are inside the file. It never
      carries your script, so Drafter can’t open it again as a script: keep your
      <code>.fountain</code> file for that. It is dark on screen, and small: a 120-page script’s is
      about 250 KB.
    </p>

    <h2 id="command-line">From the command line</h2>
    <p>
      Drafter’s command line makes the same page:
      <code>drafter build script.fountain --story-map map.html</code>. It uses the dialog’s starting
      choices, with your contact left out. Add <code>--status finished</code> or
      <code>--status in-progress</code> to say which; without it, Drafter decides from what is left
      to write. The planned length, edited hooks, and logline come from the file.
    </p>
  </article>
</template>
