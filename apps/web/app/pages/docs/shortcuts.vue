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
      <ul>
        <li><kbd>F6</kbd> moves between the two panes.</li>
        <li><kbd>Esc</kbd> leaves focus mode, once nothing else (the palette, a menu, a dialog, completion, or search) needs it.</li>
      </ul>
    </section>
  </article>
</template>
