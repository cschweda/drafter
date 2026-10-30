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

    <section aria-labelledby="group-other">
      <h2 id="group-other">Other keys</h2>
      <p>
        These are not commands, so they aren’t in the palette. Some are the editor’s own, which
        Drafter keeps.
      </p>
      <ul>
        <li>
          <kbd>F6</kbd> moves between the two panes. It works where the two panes are side by side,
          and not in focus mode.
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
          Source.
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
          In History (the app menu’s History…, or the save item in the status bar),
          <kbd>↑</kbd> and <kbd>↓</kbd> move between the snapshots, and <kbd>Home</kbd> and
          <kbd>End</kbd> go to the first and last. On a snapshot, <kbd>Enter</kbd> compares it with
          now, <kbd>C</kbd> compares it with another, <kbd>R</kbd> restores it, <kbd>L</kbd> labels
          it, <kbd>S</kbd> saves it as a file, and <kbd>Delete</kbd> (or <kbd>Backspace</kbd>)
          deletes it, after asking. The context-menu key or <kbd>Shift+F10</kbd> opens the
          snapshot’s menu.
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
