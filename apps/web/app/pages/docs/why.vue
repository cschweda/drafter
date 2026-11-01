<script setup lang="ts">
import { HELP_PAGES } from '~/commands/data';

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-why');
if (!page) throw new Error('The Why Drafter page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'Drafter is free with no catch and no login, ever. Its big features, and how it compares with Final Draft, WriterDuet, Fade In, Highland Pro, Arc Studio, and Celtx.',
});

// How Drafter compares: the same cells as the README's table. ✓ and ✗ are read as "yes" and "no",
// and *paid* (a higher plan) is set in italics, as the README sets it.
const APPS = [
  'Final Draft 13',
  'WriterDuet',
  'Fade In',
  'Highland Pro',
  'Arc Studio',
  'Celtx',
] as const;

/** A row: what is compared, Drafter's cell, then one cell for each app in `APPS`. */
type Row = readonly [string, string, ...string[]];

const ROWS: readonly Row[] = [
  [
    'Price',
    'Free, forever',
    '$249.99 once, or $99.99/yr',
    'from $9.99/mo',
    '$99.95 once',
    '$59.99/yr',
    'from $69/yr',
    'from $11.24/mo',
  ],
  [
    'Free version',
    'Everything',
    '5-day trial',
    '3 projects',
    'Watermarked demo',
    '30-day trial',
    '2 scripts, watermark',
    '1 project',
  ],
  [
    'Account or sign-in',
    'Never',
    'Store sign-in, 2 computers',
    'Yes',
    'Registration key',
    'App Store',
    'Yes',
    'Yes',
  ],
  ['Open source', '✓ MIT', '✗', '✗', '✗', '✗', '✗', '✗'],
  [
    'Your data',
    'Stays on your device; no tracking',
    'On your computer',
    'Cloud',
    'On your computer',
    'On your computer',
    'Cloud',
    'Cloud',
  ],
  [
    'Mac / Windows / Linux',
    'build it / ✓ / ✓',
    '✓ / ✓ / ✗',
    '✓ / ✓ / ✓',
    '✓ / ✓ / ✓',
    '✓ / ✗ / ✗',
    '✓ / ✓ / web',
    'web; Mac app',
  ],
  [
    'Web, and phones',
    '✓ web, works on phones',
    'iPhone app',
    '✓',
    'mobile apps',
    'iPhone, iPad',
    '✓',
    '✓ web',
  ],
  ['Works fully offline', '✓', '✓', 'paid plans', '✓', '?', '✓', '✗'],
  [
    'Final Draft (.fdx) open / save',
    '✓ / ✓',
    '✓ / ✓',
    '✓ / ✓',
    '✓ / ✓',
    '✓ / ✓',
    '✓ / ✓',
    'open / ?',
  ],
  [
    'Fountain open / save',
    '✓ / ✓ (its own format)',
    'as plain text only',
    '✓ / ✓',
    'open / ?',
    '✓ / ✓',
    '✓ / ✓',
    '✓ / ✓',
  ],
  ['PDF import', 'planned, free', '✓', '✓', '✓', '✓', '✓', '✓'],
  ['Outline and index cards', '✓', '✓', '✓', 'partial', 'partial', '*paid* outline', '✓'],
  ['Notes', '✓', '✓', '✓', '✓', '✓', '✓', '*paid*'],
  [
    'Version history and Compare',
    '✓ / ✓',
    '✓ / ?',
    '✓ / partial',
    '✓ / ✓',
    '?',
    '*paid*',
    '*paid*',
  ],
  [
    'Character and scene stats',
    '✓',
    '✓ reports',
    '*paid* reports',
    '✓ reports',
    'partial',
    '✓ reports',
    '*paid*',
  ],
  ['Revision colors and marks', 'v0.27.0, free', '✓', '*paid*', '✓', '✓', '*paid*', '*paid*'],
  ['Locked pages and scene numbers, OMITTED', 'v0.27.0, free', '✓', '*paid*', '✓', '?', '✓', '?'],
  [
    'Breakdown report and sides',
    'v0.27.0, free',
    '✓ / ?',
    '✓ / partial',
    '✓ / ?',
    '✗',
    'partial',
    '*paid*',
  ],
  ['Stage play', '✓', '✓', '✓', '✓', '✓', '?', '✓'],
  ['TV templates', 'Phase 3, free', '✓', '✓', '✓', '✓', '✓', '*paid*'],
  ['Spellcheck', '✓ offline', '?', '?', '✓', '?', '✓', '?'],
  ['Focus mode, goals, sprints', '✓', '✓', '✓', 'partial', '✓', '✓', '?'],
  ['Read aloud (table read)', 'Phase 4, free', '✓', '*paid*', '✓', '?', '*paid* credits', '?'],
  ['Dark mode', '✓', '✓', '✓', 'page colors', '✓', '✓', 'page colors'],
  [
    'Real-time co-writing',
    'later, free',
    'each writer needs a licence',
    'inviter pays',
    '✓',
    '✗',
    '*paid*',
    '*paid*',
  ],
];

/** The README sets Drafter's first five cells in bold: price, free version, sign-in, source, data. */
const BOLD_ROWS = 5;

type Part = { kind: 'yes' | 'no' | 'paid' | 'text'; text: string };

/** A cell's text, split so ✓, ✗, and *paid* can each be shown (and read) as they should be. */
function parts(cell: string): Part[] {
  return cell
    .split(/(✓|✗|\*paid\*)/)
    .filter((text) => text !== '')
    .map((text): Part => {
      if (text === '✓') return { kind: 'yes', text };
      if (text === '✗') return { kind: 'no', text };
      if (text === '*paid*') return { kind: 'paid', text: 'paid' };
      return { kind: 'text', text };
    });
}
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Open it and write. Drafter™ is free, and there’s no catch: no sign-up, no sign-in, no licence
      key, no activation, ever. It’s ready the moment the page loads or the app starts.
    </p>
    <p class="docs-note">
      New to Drafter, or deciding whether to trust it?
      <a href="/docs/what-is-drafter/">What is Drafter?</a> starts at the beginning, for writers,
      for productions, and for technical people. This page has the full comparison.
    </p>

    <h2 id="free">Free, with no catch</h2>
    <ul>
      <li>
        <strong>Free, really.</strong> No price, no trial, no subscription, no “free tier” with the
        good parts locked away, no ads, and nothing collected about you to sell. Drafter isn’t a
        business: it’s made by one writer, for writers, and given away. The production features
        professionals need are in it too.
      </li>
      <li>
        <strong>Instant.</strong> <a href="/">drafter.dev</a> opens straight into a script, and the
        desktop app starts the same way. No installer is needed to begin, and no setup.
      </li>
      <li>
        <strong>Open.</strong> The code is MIT-licensed and
        <a href="https://github.com/cschweda/drafter" target="_blank" rel="noopener noreferrer">on GitHub</a>,
        and your script is a plain <code>.fountain</code> text file you own, so a lapsed licence can
        never lock you out of your own work.
      </li>
      <li>
        <strong>Private.</strong> No cookies, no analytics, no tracking, and no telemetry. Your script
        never leaves your device: Drafter has no server that could receive it. See
        <a href="/docs/privacy/">Privacy</a>.
      </li>
      <li>
        <strong>Works offline.</strong> Once it has loaded, Drafter runs with no connection, on a
        plane or a train.
      </li>
      <li>
        <strong>No forced updates.</strong> The web app updates when you reload. The desktop app asks
        GitHub once at start-up whether there’s a new version, never installs or restarts by itself,
        and can be told not to check at all.
      </li>
      <li>
        <strong>Built for working writers, free.</strong> Production features, the kind a script
        needs once it’s greenlit, come to the free app in v0.27.0: colored revision sets with marks in
        the margin, locked pages (12A) and scene numbers, OMITTED scenes, revised pages to send out, a
        breakdown report, and sides for actors. There is no paid version, and there won’t be one.
      </li>
      <li>
        <strong>Plays well with Final Draft.</strong> It opens and saves Final Draft
        (<code>.fdx</code>) files, so you can trade scripts with anyone who uses it.
      </li>
    </ul>

    <h2 id="no-login">No login, ever</h2>
    <p>
      There is no account to make, and nothing to sign in to every time you start. Close it, open it
      again tomorrow, and you’re back in your script. There is no licence key to type in and nothing
      to activate, on the web or in the desktop app.
    </p>

    <h2 id="big-features">The big features</h2>
    <p>All of them are free.</p>
    <ul>
      <li>
        <strong>Industry-standard pages.</strong> Screenplay and stage-play formatting laid out live
        as you type, with page counts you can trust, and a PDF that looks like what readers, agents,
        and productions expect.
      </li>
      <li>
        <strong>Final Draft files in and out.</strong> Open the <code>.fdx</code> a producer sends and
        hand one back; Highland, Fade In, Fountain, and Markdown open too.
      </li>
      <li>
        <strong>Structure tools.</strong> Outline, index cards, the Structure strip, scene colors,
        synopses, notes with readers’ names, setups and payoffs, and running times by scene and act.
      </li>
      <li>
        <strong>See the script.</strong> Scaffold follows your cursor and shows who is in the scene;
        the Stats tab has each character’s screen time, dialogue share, and a character-by-scene grid.
      </li>
      <li>
        <strong>Every draft kept.</strong> Version history, Compare with a GitHub-style view of what
        changed, Show changes on the pages, deleted scenes you can put back, and the history of one
        scene.
      </li>
      <li>
        <strong>Production, coming free in v0.27.0.</strong> Colored revision sets with marks in the
        margin, locked pages (12A) and scene numbers (5A), OMITTED scenes, revised pages to send out,
        a breakdown report, and sides.
      </li>
      <li>
        <strong>Writing help.</strong> Focus mode, typewriter scrolling, daily goals, sprints, writing
        stats, and its own offline spellcheck.
      </li>
      <li>
        <strong>Everywhere you write.</strong> A web app, desktop apps for Windows and Linux (and a
        Mac build), and it works on a phone, offline.
      </li>
    </ul>

    <h2 id="compares">How Drafter compares</h2>
    <p>
      What each app’s maker says on its own site, as of October 2026, at list prices (sales come and
      go). ✓ means it’s there; <em>paid</em> means a higher plan; ? means the maker doesn’t say.
      Drafter’s not-yet-shipped features show the version they’re planned for, never a ✓.
      Corrections are welcome:
      <a href="https://github.com/cschweda/drafter/issues" target="_blank" rel="noopener noreferrer">open an issue</a>.
    </p>
    <div
      class="docs-scroll docs-compare"
      role="region"
      aria-label="How Drafter compares (scrolls sideways)"
      tabindex="0"
    >
      <table>
        <caption>
          Drafter beside six other screenwriting apps, from each maker’s own pages
        </caption>
        <thead>
          <tr>
            <th scope="col"><span class="sr-only">What</span></th>
            <th scope="col">Drafter</th>
            <th v-for="app in APPS" :key="app" scope="col">{{ app }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in ROWS" :key="row[0]">
            <th scope="row">{{ row[0] }}</th>
            <td v-for="(cell, c) in row.slice(1)" :key="c">
              <component :is="c === 0 && r < BOLD_ROWS ? 'strong' : 'span'">
                <template v-for="(part, p) in parts(cell)" :key="p">
                  <template v-if="part.kind === 'yes'"><span aria-hidden="true">✓</span><span class="sr-only">yes</span></template>
                  <template v-else-if="part.kind === 'no'"><span aria-hidden="true">✗</span><span class="sr-only">no</span></template>
                  <em v-else-if="part.kind === 'paid'">paid</em>
                  <template v-else>{{ part.text }}</template>
                </template>
              </component>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Sources: each maker’s own pricing, features, and help pages (Final Draft, WriterDuet, Fade In,
      Quote-Unquote Apps for Highland Pro, Arc Studio, Celtx), read on 31 October 2026. Every app
      here is good at what it does; Drafter’s difference is that all of it is free, open, and never
      asks you to sign in.
    </p>

    <h2 id="made-by">Made by</h2>
    <p>
      Made by Christopher Schweda
      (<a href="https://github.com/cschweda" target="_blank" rel="noopener noreferrer">cschweda</a>),
      who also builds
      <a href="https://metaincognita.com" target="_blank" rel="noopener noreferrer">metaincognita</a>:
      open-source casino simulators that show the math behind the games.
    </p>
    <p class="docs-note">
      Drafter™ and the Drafter logo are trademarks of Christopher Schweda. The MIT licence covers the
      code; it doesn’t grant use of the name or logo.
    </p>
  </article>
</template>
