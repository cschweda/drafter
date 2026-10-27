<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-fountain');
if (!page) throw new Error('The Fountain cheat sheet is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Every Fountain element with its mark, its rule in one sentence, and an example, in the order the element bar lists them, plus the title page, notes, and emphasis.',
});

// Written for Drafter from the Fountain syntax (fountain.io); the sections are in the order the
// element bar lists its buttons, and their ids are the ones the bar's "You're in" links to
// (`CHEAT_SHEET_ANCHORS` in editor/element-bar.ts).
interface Entry {
  id: string;
  name: string;
  mark: string;
  rule: string;
  example: string;
}

const ELEMENTS: Entry[] = [
  {
    id: 'scene-heading',
    name: 'Scene heading',
    mark: 'INT. or EXT., or a leading .',
    rule: 'A line that starts with INT., EXT., EST., INT./EXT. or I/E, with a blank line before and after it, starts a scene and says where and when. A heading that names no place starts with a dot instead.',
    example: 'INT. KITCHEN - NIGHT\n\n.FLASHBACK',
  },
  {
    id: 'action',
    name: 'Action',
    mark: 'none, or a leading !',
    rule: 'Any paragraph that isn’t another element is action: what we see and hear. Start a line with ! when it would otherwise read as something else, such as a line all in capitals.',
    example: 'Margaret sets down the phone.\n!SILENCE.',
  },
  {
    id: 'character',
    name: 'Character',
    mark: 'capitals, or a leading @',
    rule: 'A name in capitals on its own line, after a blank line and with dialogue straight under it, says who speaks. An @ makes a name a character even when it isn’t all capitals.',
    example: 'MARGARET\n@McCLANE',
  },
  {
    id: 'dialogue',
    name: 'Dialogue',
    mark: 'none',
    rule: 'The lines straight under a character name, with no blank line between, are what they say. A blank line ends the speech.',
    example: 'MARGARET\nYou said seven.',
  },
  {
    id: 'parenthetical',
    name: 'Parenthetical',
    mark: '( )',
    rule: 'A short direction in parentheses, on its own line under a character name or between lines of their dialogue.',
    example: 'MARGARET\n(quietly)',
  },
  {
    id: 'transition',
    name: 'Transition',
    mark: 'ends in TO:, or a leading >',
    rule: 'A line in capitals that ends in TO:, with a blank line before and after it, is a transition. Any other transition starts with >.',
    example: 'CUT TO:\n>FADE OUT.',
  },
  {
    id: 'centered',
    name: 'Centered text',
    mark: '> <',
    rule: 'Text between > and < is centered on the page.',
    example: '>THE END<\n> INTERMISSION <',
  },
  {
    id: 'lyric',
    name: 'Lyric',
    mark: '~',
    rule: 'A line that starts with ~ is a lyric, printed in italics, on its own or within dialogue.',
    example: '~Happy birthday to you,\n~happy birthday to you.',
  },
  {
    id: 'dual-dialogue',
    name: 'Dual dialogue',
    mark: '^',
    rule: 'A ^ after the second of two character names prints the two speeches side by side, as when people talk at once.',
    example: 'MARGARET\nNo.\n\nDANNY ^\nYes.',
  },
  {
    id: 'notes',
    name: 'Note',
    mark: '[[ ]]',
    rule: 'Text between [[ and ]] is a note to yourself. It stays in your file and never prints.',
    example: 'She waits. [[Too long?]]\n[[Check the date.]]',
  },
  {
    id: 'boneyard',
    name: 'Boneyard',
    mark: '/* */',
    rule: 'Text between /* and */ is cut but kept, over as many lines as you like. It never prints, and taking the marks away brings it back.',
    example: '/*\nA scene you might want later.\n*/',
  },
  {
    id: 'section',
    name: 'Section',
    mark: '#',
    rule: 'A line that starts with # names a part of the script, such as an act; ## is a part inside it, and so on. Sections build the outline and never print.',
    example: '# Act One\n## The phone call',
  },
  {
    id: 'synopsis',
    name: 'Synopsis',
    mark: '=',
    rule: 'A line that starts with = sums up the scene or section above it, for you. It never prints.',
    example: '# Act One\n= Margaret waits for a call.',
  },
  {
    id: 'page-break',
    name: 'Page break',
    mark: '===',
    rule: 'A line of three or more = signs, and nothing else, starts a new page.',
    example: 'She hangs up.\n\n===',
  },
];
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      A Fountain script is plain text: what a line looks like decides what it is. Most elements need
      no mark at all, and a mark at the start of a line forces it to be one thing when it would
      otherwise read as another. The element bar above the Source writes these marks for you.
    </p>

    <section v-for="entry in ELEMENTS" :id="entry.id" :key="entry.id" class="entry">
      <h2>{{ entry.name }} <span class="mark">{{ entry.mark }}</span></h2>
      <p>{{ entry.rule }}</p>
      <pre><code>{{ entry.example }}</code></pre>
    </section>

    <section id="emphasis" class="entry">
      <h2>Bold, italic, and underline <span class="mark">** * _</span></h2>
      <p>
        Wrap words in two stars for bold, one star for italics, and underscores for underlining.
        They can be combined, as in <code>***bold italics***</code>.
      </p>
      <pre><code>**Never** again.
She *almost* says it. _Today._</code></pre>
    </section>

    <section id="title-page" class="entry">
      <h2>Title page <span class="mark">Key: value</span></h2>
      <p>
        Lines of the form <code>Key: value</code> at the very top of the file make the title page,
        which ends at the first blank line. The usual keys are Title, Credit, Author, Source, Draft
        date, and Contact; a value can go on over lines indented by three spaces or a tab.
      </p>
      <pre><code>Title: The Call
Author: A. Writer
Contact:
    writer@example.com</code></pre>
    </section>

    <section id="drafter-block" class="entry">
      <h2>Drafter’s settings block <span class="mark">/* drafter */</span></h2>
      <p>
        Drafter keeps what it needs to remember about a script, such as its template, in one
        boneyard at the very end of the file that starts <code>/* drafter</code>. Other Fountain
        programs skip a boneyard, so the file stays portable. Leave it as it is: Drafter writes it.
      </p>
      <pre><code>/* drafter
{ "v": 1, "template": "us-screenplay" }
*/</code></pre>
    </section>
  </article>
</template>

<style scoped>
.entry {
  margin-top: 1.5em;
}
.mark {
  margin-left: 0.4em;
  color: var(--muted);
  font: 400 0.8em var(--font-mono, monospace);
}
pre {
  margin: 0.5em 0 0;
  padding: 10px 12px;
  overflow-x: auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--chrome-2);
  font: 13px/1.5 var(--font-mono, monospace);
}
</style>
