<script setup lang="ts">
import { COMMAND_DATA, HELP_PAGES } from '~/commands/data';
import { shortcutGroups } from '~/commands/shortcuts';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-shortcuts');
if (!page) throw new Error('The Shortcuts page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Every Drafter command and its keyboard shortcut, grouped as the command palette groups them, with the keys for a Mac and for Windows, Linux, and ChromeOS.',
});

// Generated from the command data, so it can't drift from the commands the app has. The page is
// prerendered, so each key is shown in both notations.
const groups = shortcutGroups(COMMAND_DATA);
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Every command Drafter has, with its shortcut where it has one. Each shortcut is shown for a
      Mac and for Windows, Linux, and ChromeOS.
    </p>
    <p>
      <strong>Every command can be run from the command palette:</strong> press <kbd>⌘K</kbd> on a
      Mac or <kbd>Ctrl+K</kbd> elsewhere, and type a few letters of the command. On a Mac, ⌘ is
      Command, ⌥ is Option, ⇧ is Shift, and ⌃ is Control. The palette lists only the commands that
      apply to what you’re doing (the Fountain commands are hidden in a Markdown document, for
      instance), and it also lists the commands of any script module you have turned on, which are
      not on this page.
    </p>

    <section v-for="g in groups" :key="g.group" :aria-labelledby="`group-${g.group}`">
      <h2 :id="`group-${g.group}`">{{ g.group }}</h2>
      <table v-if="g.keyed.length > 0">
        <caption>
          {{ g.group }} commands with a shortcut
        </caption>
        <thead>
          <tr>
            <th scope="col">Command</th>
            <th scope="col">Mac</th>
            <th scope="col">Windows, Linux, ChromeOS</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in g.keyed" :key="row.title">
            <th scope="row">{{ row.title }}</th>
            <td><kbd>{{ row.mac }}</kbd></td>
            <td><kbd>{{ row.other }}</kbd></td>
          </tr>
        </tbody>
      </table>
      <p v-if="g.unkeyed.length > 0">
        <strong>{{ g.keyed.length > 0 ? 'Also in the palette, with no shortcut:' : 'In the palette, with no shortcut:' }}</strong>
        {{ g.unkeyed.join('; ') }}.
      </p>
    </section>

    <section aria-labelledby="group-classic">
      <h2 id="group-classic">Classic Mode</h2>
      <p>
        In <a href="/docs/classic-mode/">Classic Mode</a> (Switch writing mode, <kbd>⌘⌥0</kbd> on a
        Mac and <kbd>Ctrl+Alt+0</kbd> elsewhere), these keys move you through the script. The
        <a href="/docs/classic-mode/#keys">Classic Mode page</a> has where each one goes.
      </p>
      <ul>
        <li>
          <kbd>Enter</kbd> goes on to the next element; on an empty line it opens the chooser, where
          <kbd>↑</kbd>, <kbd>↓</kbd>, <kbd>Enter</kbd>, or an element’s underlined letter picks, and
          <kbd>Esc</kbd> closes it.
        </li>
        <li>
          <kbd>Tab</kbd> goes to the element that usually comes next (a Character after Action, a
          Parenthetical in a speech), and on an empty line walks a row of elements;
          <kbd>Shift+Tab</kbd> goes back.
        </li>
        <li><kbd>Shift+Enter</kbd> starts a new line inside the element.</li>
        <li>
          <kbd>Tab</kbd> or <kbd>Enter</kbd> takes a suggestion from autofill, and <kbd>Esc</kbd>
          closes the list until your next letter.
        </li>
        <li>
          <kbd>Backspace</kbd> at the start of a line, or <kbd>Delete</kbd> at its end, joins two
          elements in one press.
        </li>
        <li>
          To leave the text, press <kbd>Esc</kbd>, then <kbd>Tab</kbd>; if a list is open, press
          <kbd>Esc</kbd> twice. <kbd>Ctrl+M</kbd> (<kbd>Shift+Alt+M</kbd> on a Mac) makes
          <kbd>Tab</kbd> move focus until you press it again.
        </li>
      </ul>
    </section>

    <section aria-labelledby="group-other">
      <h2 id="group-other">Other keys</h2>
      <p>
        These are not commands, so they aren’t in the palette. Some are the editor’s own, which
        Drafter keeps.
      </p>
      <ul>
        <li>
          <kbd>F6</kbd> moves between the editor and the Inspector, the pane beside it. It works
          where the two panes are side by side, and not in focus mode.
        </li>
        <li>
          <kbd>Esc</kbd> leaves focus mode, once nothing else (the palette, a menu, a dialog,
          completion, or search) needs it.
        </li>
        <li>
          In the Cards tab, the arrow keys move between the cards as they are drawn, and
          <kbd>Home</kbd> and <kbd>End</kbd> go to the first and last. <kbd>Enter</kbd> edits a
          card’s synopsis (<kbd>Enter</kbd> saves, <kbd>Esc</kbd> cancels), and the context-menu
          key or <kbd>Shift+F10</kbd> opens the card’s menu. <kbd>Alt+←</kbd> and
          <kbd>Alt+→</kbd> move a card one place earlier or later, and <kbd>Alt+↑</kbd> and
          <kbd>Alt+↓</kbd> move it a row up or down (<kbd>⌥</kbd> on a Mac).
        </li>
        <li>
          In the Structure strip (Toggle the structure strip, <kbd>⌘⌥O</kbd> on a Mac and
          <kbd>Ctrl+Alt+O</kbd> elsewhere), <kbd>Tab</kbd> enters on the block you last focused, or
          the cursor’s scene. <kbd>←</kbd> and <kbd>→</kbd> move along a row, <kbd>↑</kbd> and
          <kbd>↓</kbd> to the block above or below, and <kbd>Home</kbd> and <kbd>End</kbd> to a
          row’s ends. <kbd>Enter</kbd> or <kbd>Space</kbd> goes to the scene or section in the
          Source. The context-menu key or <kbd>Shift+F10</kbd> (or a right-click) opens the block’s
          menu: Go to and, on a scene, History of this scene and Scaffold for this scene.
        </li>
        <li>
          In the Stats tab’s Character by scene, <kbd>Tab</kbd> enters the grid on the cell you
          last focused. The arrow keys move from cell to cell, <kbd>Home</kbd> and <kbd>End</kbd>
          go to the ends of a character’s row, <kbd>Ctrl+Home</kbd> and <kbd>Ctrl+End</kbd> to the
          first and last cells (<kbd>⌘</kbd> on a Mac), and <kbd>Page Up</kbd> and
          <kbd>Page Down</kbd> move ten scenes. <kbd>Enter</kbd> goes to the character’s first cue
          in that scene, or, where they’re there without speaking, to the first time the action
          names them. The context-menu key or <kbd>Shift+F10</kbd> (or a right-click) opens the
          cell’s menu: Go to, Scaffold for this character, and Scaffold for this scene.
        </li>
        <li>
          In Scaffold, <kbd>Alt+←</kbd> (<kbd>⌥←</kbd> on a Mac) goes back to the page before, as
          the Back button at the top of the Inspector does, while focus is anywhere in the tab except a filter field,
          where it moves by a word.
        </li>
        <li>
          In the Notes tab, <kbd>↑</kbd> and <kbd>↓</kbd> move between the notes, and
          <kbd>Home</kbd> and <kbd>End</kbd> go to the first and last. On a note, <kbd>Enter</kbd>
          goes to it in the Source, <kbd>E</kbd> edits it in place (<kbd>Enter</kbd> saves,
          <kbd>Esc</kbd> cancels), <kbd>R</kbd> resolves or reopens it, <kbd>C</kbd> sets its
          category, and <kbd>Delete</kbd> (or <kbd>Backspace</kbd>) deletes it. The context-menu key
          or <kbd>Shift+F10</kbd> opens the note’s menu.
        </li>
        <li>
          In History (the app menu’s History…, or the file’s name in the status bar),
          <kbd>↑</kbd> and <kbd>↓</kbd> move between the snapshots, and <kbd>Home</kbd> and
          <kbd>End</kbd> go to the first and last. On a snapshot, <kbd>Enter</kbd> compares it with
          now, <kbd>C</kbd> compares it with another, <kbd>R</kbd> restores it, <kbd>L</kbd> labels
          it, <kbd>S</kbd> saves it as a file, and <kbd>Delete</kbd> (or <kbd>Backspace</kbd>)
          deletes it, after asking. The context-menu key or <kbd>Shift+F10</kbd> opens the
          snapshot’s menu.
        </li>
        <li>
          In Cuts (File’s Cuts…, or History’s Cuts button), every cut’s buttons are in the
          <kbd>Tab</kbd> order: Show all for a long one, Put back, Insert at cursor, and Copy.
        </li>
        <li>
          In History of this scene (a scene’s menu in the Outline, the Cards, or the Structure
          strip, or the palette for the scene holding the cursor), <kbd>↑</kbd> and <kbd>↓</kbd>
          move between the scene’s versions, and <kbd>Home</kbd> and <kbd>End</kbd> go to the first
          and last. On a version, <kbd>Enter</kbd> compares it with now and <kbd>U</kbd> uses it in
          place of the scene now (Undo brings back what it replaced). The context-menu key or
          <kbd>Shift+F10</kbd> opens the version’s menu.
        </li>
        <li>
          In the Compare tab, <kbd>N</kbd> goes to the next change and <kbd>Shift+N</kbd> to the
          previous one, and says what changed; the palette’s Next change and Previous change do the
          same from anywhere while a comparison is open.
        </li>
        <li>
          In the Script tab, while Show changes is on, <kbd>N</kbd> goes to the next marked change
          and <kbd>Shift+N</kbd> to the previous one, and says where it is; with no comparison open,
          the palette’s Next change and Previous change go through these marks.
        </li>
        <li>
          Redo is also <kbd>Ctrl+Y</kbd> on Windows and Linux.
        </li>
        <li>
          Find next is <kbd>⌘G</kbd> on a Mac and <kbd>Ctrl+G</kbd> elsewhere, or <kbd>F3</kbd>;
          add <kbd>Shift</kbd> for find previous. <kbd>Esc</kbd> closes the search panel.
        </li>
        <li>
          Completion (character names, locations, times, transitions, and section titles) opens as you type, or with
          <kbd>Ctrl+Space</kbd> (also <kbd>⌥`</kbd> on a Mac). <kbd>↑</kbd> and <kbd>↓</kbd>
          choose, <kbd>Enter</kbd> accepts, and <kbd>Esc</kbd> closes it.
        </li>
      </ul>
    </section>
  </article>
</template>
