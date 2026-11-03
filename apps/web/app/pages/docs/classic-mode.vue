<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

// The Classic Mode help page (Classic Mode design §16), in its order: what it is, switching, the
// keys of §6 in plain words, autofill, the chooser, leaving the text in §12's words, phones, what's
// hidden, and the file. The element bar's chip and ?, and the first-run hint's Learn more, open it.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-classic-mode');
if (!page) throw new Error('The Classic Mode page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Typing a script with Enter and Tab, the way many screenwriters expect: switching, each key, autofill, the chooser, leaving the text, phones, and why the file stays Fountain.',
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Classic Mode is a way of typing a script where <kbd>Enter</kbd> and <kbd>Tab</kbd> move you
      from one part to the next, and the left side looks like a script. It isn’t Fountain typing;
      it’s what many script writers expect, and your file stays Fountain.
    </p>
    <p>
      It works the way writers of apps like Final Draft expect: start a name, let it fill itself
      in, and press <kbd>Tab</kbd> to go on. You don’t need to learn a single Fountain mark. The
      Script pane, exports, and everything else read the same file as before.
    </p>

    <h2 id="switching">Switching</h2>
    <p>
      The top bar has a <strong>Fountain | Classic</strong> switch beside the script’s title, there
      the whole time you write. Click <strong>Classic</strong>. On a narrow screen it’s one button
      with the mode’s word, and a tap changes it; in focus mode the word is a small button too.
      Drafter starts in Fountain, and remembers your choice for every script you open.
    </p>
    <p>
      You can also choose <strong>Writing mode</strong> in Settings (Writing), search for
      <strong>Switch to Classic Mode</strong> or <strong>Switch to Fountain Mode</strong> with
      <kbd>⌘K</kbd> (<kbd>Ctrl+K</kbd> elsewhere), or press <kbd>⌘⌥0</kbd> on a Mac
      (<kbd>Ctrl+Alt+0</kbd> elsewhere), which switches either way.
    </p>
    <p>
      A switch changes nothing you’ve written. Your place stays where it was, Undo still reaches
      what you typed before it, and the cursor goes back into the text. A Markdown document has no
      switch, since it isn’t a script; your choice applies again at the next script.
    </p>

    <h2 id="first-scene">Your first scene</h2>
    <p>Start on an empty script, and type:</p>
    <ol>
      <li>
        <code>int.</code> and it turns into <code>INT.</code>, a scene heading. Type the place, or
        pick one already in the script, and then a time, such as <strong>NIGHT</strong>, which goes
        on to Action.
      </li>
      <li>
        Type what we see. <kbd>Enter</kbd> starts a new paragraph of action, and <kbd>Tab</kbd> goes
        to Character.
      </li>
      <li>
        Type <code>JU</code>, and <strong>JUNE</strong> is offered. <kbd>Tab</kbd> or
        <kbd>Enter</kbd> takes it and goes to Dialogue.
      </li>
      <li>
        Type what she says. <kbd>Enter</kbd> goes to the next Character, and <kbd>Tab</kbd> to a
        Parenthetical, such as <em>(quietly)</em>.
      </li>
      <li>After a Parenthetical, <kbd>Enter</kbd> goes back to Dialogue.</li>
      <li>
        <kbd>Enter</kbd> on an empty line lets you choose any element: a Transition, a Scene heading,
        and the rest.
      </li>
    </ol>
    <p>
      Headings, names, and transitions come out in capitals as you type. The status bar shows what
      <kbd>Enter</kbd> and <kbd>Tab</kbd> will do where you are (“Enter: Character · Tab:
      Parenthetical”), and the element bar’s chip names the element you’re in, an empty line’s next
      element too.
    </p>

    <h2 id="keys">Enter and Tab</h2>
    <p>On a line with text, at its end:</p>
    <div class="docs-scroll" role="region" aria-label="Enter and Tab on a line (scrolls sideways)" tabindex="0">
      <table>
        <caption>
          Where Enter and Tab go from a line with text
        </caption>
        <thead>
          <tr>
            <th scope="col">You’re in</th>
            <th scope="col">Enter goes to</th>
            <th scope="col">Tab goes to</th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row">Scene heading</th><td>Action</td><td>Action</td></tr>
          <tr><th scope="row">Action</th><td>Action</td><td>Character</td></tr>
          <tr><th scope="row">Character</th><td>Dialogue</td><td>Dialogue</td></tr>
          <tr><th scope="row">Parenthetical</th><td>Dialogue</td><td>Dialogue</td></tr>
          <tr>
            <th scope="row">Dialogue</th>
            <td>The next Character, or a new line of the speech if more of it follows</td>
            <td>Parenthetical</td>
          </tr>
          <tr><th scope="row">Transition</th><td>Action</td><td>Action</td></tr>
          <tr><th scope="row">Centered, Section, Synopsis</th><td>Action</td><td>Action</td></tr>
          <tr>
            <th scope="row">Lyric</th>
            <td>Lyric</td>
            <td>Dialogue in a speech, Action outside one</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      <strong>On an empty line,</strong> <kbd>Enter</kbd> opens the chooser, and <kbd>Tab</kbd>
      walks a row of elements without writing anything: Action, Character, Transition, Scene
      heading, and round again. <kbd>Shift+Tab</kbd> walks back. On the empty line under a name,
      <kbd>Tab</kbd> makes a Parenthetical, and <kbd>Shift+Tab</kbd> goes back to the end of the
      name. In an empty Parenthetical, <kbd>Enter</kbd>, <kbd>Tab</kbd>, or <kbd>Backspace</kbd>
      takes it away.
    </p>
    <p>
      <strong>In a stage play</strong> it’s the same, with Stage direction in place of Action. An
      Act goes on to a Scene, a Scene to a Stage direction, and a Stage direction’s <kbd>Tab</kbd>
      to Character. On an empty line, <kbd>Tab</kbd> walks Stage direction, Character, Act, and
      Scene.
    </p>
    <p><strong>Elsewhere on a line:</strong></p>
    <ul>
      <li>
        <kbd>Enter</kbd> in the middle of a line splits it. Split a name, and the rest becomes the
        speech; split a heading or a transition, and the rest becomes Action.
      </li>
      <li>
        <kbd>Tab</kbd> never splits a line: it does what it does at the end, wherever the cursor is.
        With text selected, <kbd>Tab</kbd> goes to the end of the selection, and the next
        <kbd>Tab</kbd> moves on.
      </li>
      <li>
        <kbd>Shift+Enter</kbd> starts a new line inside the element, without moving on: a second
        line of action, or of a speech.
      </li>
      <li>
        <kbd>Shift+Tab</kbd> on a line with text goes back to the end of the element above.
      </li>
      <li>
        <kbd>Backspace</kbd> at the start of a line joins it to the element above, in one press.
        On an empty line, it takes the line away, which undoes an <kbd>Enter</kbd>.
      </li>
      <li>
        The arrow keys step over the blank line between two elements, as there’s nothing to type
        there, and over anything hidden.
      </li>
    </ul>
    <p>
      <strong>Wandering leaves nothing behind.</strong> If <kbd>Enter</kbd> or <kbd>Tab</kbd> made
      an empty line, or an empty <code>()</code>, and you go elsewhere without typing, it’s taken
      away. Blank lines that were already in the script stay.
    </p>
    <p>
      <strong>Action stays Action.</strong> A line of capitals typed as action, such as
      <code>BANG</code>, stays action: a name is reached with <kbd>Tab</kbd> or the chooser, never
      by typing capitals. Only on a fresh line you’ve just reached, in a screenplay, does a line
      you start with <code>INT.</code> or <code>EXT.</code> become a scene heading (straight after
      a speech too), and a line of capitals ending in <code>TO:</code> become a transition.
    </p>
    <p>
      <strong>Names are typed in capitals.</strong> For a name with small letters in it, such as
      McGRAW, type it once in Fountain Mode, as <code>@McGRAW</code>; after that, autofill offers it
      in Classic Mode.
    </p>

    <h2 id="autofill">Autofill</h2>
    <p>
      In a Character, a Scene heading, or a Transition, a list opens from the first letter, with
      what’s already in your script:
    </p>
    <ul>
      <li>
        <strong>Names,</strong> the one who spoke most recently above the cursor first.
      </li>
      <li>
        <strong>Scene headings:</strong> after you choose Scene heading (in the chooser, on the
        element bar, or with <kbd>Tab</kbd>’s row), <code>INT.</code>, <code>EXT.</code>,
        <code>INT./EXT.</code>, <code>EST.</code>, and <code>I/E</code>; then, once a heading has
        its <code>INT.</code> or <code>EXT.</code>, the places you’ve used, most recent first. Taking a place offers the times of day, and taking a time writes it with
        its dash (<code>INT. KITCHEN - NIGHT</code>) and goes to Action. Close the list with
        <kbd>Esc</kbd> and there’s no dash left behind.
      </li>
      <li>
        <strong>Extensions,</strong> such as <code>(V.O.)</code> and <code>(O.S.)</code>, when you
        type a space or <code>(</code> after a name. <code>(CONT’D)</code> isn’t offered: the page
        adds it for you.
      </li>
      <li>
        <strong>Transitions,</strong> those in the script, then <code>CUT TO:</code>,
        <code>DISSOLVE TO:</code>, <code>SMASH CUT TO:</code>, and <code>FADE OUT.</code>
      </li>
      <li><strong>A play’s scenes,</strong> the scene titles you’ve used.</li>
    </ul>
    <p>
      <kbd>Tab</kbd> or <kbd>Enter</kbd> takes the highlighted one, and <kbd>↑</kbd> and
      <kbd>↓</kbd> move in the list. Typing fast is fine: <code>JU</code> and <kbd>Tab</kbd> gives
      JUNE even before the list has drawn. <kbd>Esc</kbd> closes the list and writes nothing, and it
      stays closed until your next letter, so if you want <code>JO</code> and not JOHN, press
      <kbd>Esc</kbd>, then <kbd>Tab</kbd>. <kbd>Ctrl+Space</kbd> opens the list anywhere.
      Suggestions come from your script and a short list of standard ones; nothing comes from the
      internet.
    </p>

    <h2 id="chooser">The chooser</h2>
    <p>
      <kbd>Enter</kbd> on an empty line opens a small list, <strong>Choose an element</strong>. In a
      screenplay it has Action, Scene heading, Character, and Transition, then Centered, Lyric,
      Section, Synopsis, and Page break; Dialogue and Parenthetical join them inside a speech. In a
      stage play it has Stage direction, Act, Scene, Character, Centered, Lyric, Synopsis, and Page
      break.
    </p>
    <p>
      <kbd>↑</kbd> and <kbd>↓</kbd> move, and <kbd>Enter</kbd> picks. Each one has an underlined
      letter that picks it at once (<kbd>A</kbd> for Action, <kbd>S</kbd> for Scene heading,
      <kbd>C</kbd> for Character, <kbd>T</kbd> for Transition, and so on). <kbd>Esc</kbd> closes
      it, and a click or a tap picks. Picking writes nothing but the blank line that sets an element
      apart: the element waits for your first letter. A page break, and a Parenthetical’s
      <code>()</code>, are written straight away.
    </p>
    <p>
      The <strong>element bar</strong> does the same: on an empty line its buttons choose what comes
      next, and on a line with text they change that line’s element. <kbd>⌘⌥1</kbd> to
      <kbd>⌘⌥7</kbd> on a Mac (<kbd>Ctrl+Alt+1</kbd> to <kbd>Ctrl+Alt+7</kbd> elsewhere) are its
      keys. Its chip and its <strong>?</strong> open this page.
    </p>

    <h2 id="leaving">Leaving the text</h2>
    <p>
      In Classic Mode <kbd>Tab</kbd> moves through the script, so it doesn’t move you out of the
      text. To leave the text, press <kbd>Esc</kbd>, then <kbd>Tab</kbd> (or <kbd>Shift+Tab</kbd>)
      within two seconds. If a list is open, press <kbd>Esc</kbd> twice: the first one closes the
      list. In focus mode, <kbd>Esc</kbd> leaves focus mode too.
    </p>
    <ul>
      <li>
        <kbd>Ctrl+M</kbd> (<kbd>Shift+Alt+M</kbd> on a Mac) makes <kbd>Tab</kbd> move focus until
        you press it again, if two seconds aren’t enough.
      </li>
      <li><kbd>F6</kbd> moves to the Inspector, on a wide screen and outside focus mode.</li>
      <li><kbd>⌘K</kbd> (<kbd>Ctrl+K</kbd> elsewhere) opens the search from anywhere.</li>
    </ul>
    <p>
      On the title page, and inside a note or a cut, <kbd>Tab</kbd> does nothing, as they aren’t
      part of the page’s flow; <kbd>Esc</kbd> then <kbd>Tab</kbd> leaves from there too.
    </p>

    <h2 id="phones">On a phone</h2>
    <p>
      A phone’s keyboard has no <kbd>Tab</kbd>, so in Classic Mode a <strong>Next</strong> button
      sits first in the row above the keyboard. It does what <kbd>Tab</kbd> does and says where it
      goes (“Next: Character”). The row shows whenever the keyboard is up in Classic Mode, in focus
      mode too, whatever the Element bar setting. <kbd>Enter</kbd> on an empty line opens the
      chooser above the keyboard, and a tap on a suggestion takes it and moves on. Keyboards that
      compose words, as many Android and Chinese, Japanese, and Korean keyboards do, get their
      capitals once the word is in.
    </p>

    <h2 id="hidden">What’s hidden, and why it’s safe</h2>
    <p>
      A Fountain script uses a few marks: <code>@</code> before a name, <code>.</code> before a
      heading, <code>&gt;</code> before a transition, <code>**</code> around bold, and the like.
      Classic Mode adds them for you, only where they’re needed, and hides every one, so the left
      side reads like a script. It also hides:
    </p>
    <ul>
      <li>
        the brackets of a note, <code>[[ ]]</code>: the note stays in place, in italics, with a thin
        rule at each end;
      </li>
      <li>
        the marks of a cut, <code>/* */</code>: what’s cut is struck through;
      </li>
      <li>
        the hidden block at the end of the file where Drafter keeps the script’s template and
        settings. It can’t be selected or deleted in Classic Mode, so Select All then Delete leaves
        your template in place.
      </li>
    </ul>
    <p>
      Scene numbers stay visible, as you need to see them, a page break shows as a thin rule with
      the words “Page break”, and a dual name has a small “dual” tag.
    </p>
    <p>
      Nothing is taken out of your text: the marks are only not drawn. Copy and Cut give the true
      text, marks and all, so what you paste into Fountain Mode, or another app, is the same script.
      Search finds the true text too, so a match can be a mark you can’t see. To see every mark,
      switch to Fountain: one click.
    </p>
    <p>
      Marks typed in a line, such as <code>*word*</code> or <code>[[a note]]</code>, work as Fountain
      reads them, and a lone <code>*</code> shows as itself. <code>/*</code> starts a cut, which
      runs to the next <code>*/</code>: that’s Fountain’s own reading. So a <code>/*</code> typed
      with no <code>*/</code> after it runs on into the hidden block at the end, and closes there:
      the rest of the script looks cut, and the block’s template and settings aren’t read, until
      you type the <code>*/</code> or take the <code>/*</code> away.
    </p>

    <h2 id="still-fountain">Is my file still Fountain?</h2>
    <p>
      <strong>Yes.</strong> A script typed in Classic Mode is plain Fountain, the same as you could
      have typed in Fountain Mode, key for key. Nothing in the file says which mode wrote it, and a
      switch changes nothing you’ve written. A script opened in Classic Mode is shown as it is, with nothing
      changed. Drafts, snapshots, exports, the command line, and Drafter for Claude all see the same
      text, and the file still opens in any app that reads Fountain.
    </p>

    <p class="docs-note">
      Final Draft is a trademark of its owner, and Drafter isn’t connected with it.
    </p>
  </article>
</template>

