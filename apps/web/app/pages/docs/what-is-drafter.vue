<script setup lang="ts">
import { HOW_IT_WORKS } from '~/about/diagrams';
import { ABOUT_LINKS } from '~/about/info';
import counts from '~/about/test-counts.json';
import { HELP_PAGES, helpHref } from '~/commands/data';
import { longDate } from '~/whats-new/entries';
import sizes from '../../assets/diagrams/sizes.json';

// What is Drafter? (docs/DECISIONS.md, What is Drafter): the help pages' front page, for anyone,
// for writers, for the people a script goes to, for anyone deciding whether to trust it, and for
// technical people. Why Drafter (/docs/why/) stays as the full comparison, which this links. The
// test counts are scripts/test-counts.mjs's (about/test-counts.json), the diagrams are drawn from
// docs/diagrams/*.mmd by scripts/diagrams.mjs, as SVG files shown as images: no Mermaid runs here.

definePageMeta({ layout: 'docs' });

const page = HELP_PAGES.find((p) => p.id === 'help-what-is');
if (!page) throw new Error('The What is Drafter page is not in the list of help pages.');
useDocsHead({
  ...page,
  description:
    'What Drafter is, in one minute; why a writer might choose it over Final Draft; what it offers productions; whether to trust it; and how it is built and tested.',
});

const help = (id: string) => {
  const found = HELP_PAGES.find((p) => p.id === id);
  if (!found) throw new Error(`No help page ${id}.`);
  return helpHref(found);
};

const REPO = ABOUT_LINKS.find((link) => link.id === 'repo')?.href;
if (!REPO) throw new Error('About Drafter has no link to the repository.');
/** A file in the repository, on GitHub. */
const repoHref = (path: string) => `${REPO}/blob/main/${path}`;

/** A count with thousands separators, the same on the server and in the browser. */
const n = (count: number) => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const SECTIONS = [
  { id: 'one-minute', title: 'In one minute' },
  { id: 'writers', title: 'For writers: why Drafter over Final Draft?' },
  { id: 'industry', title: 'For producers, directors, and script coordinators' },
  { id: 'trust', title: 'Can I trust this?' },
  { id: 'technical', title: 'For technical people' },
] as const;
const title = (id: (typeof SECTIONS)[number]['id']) =>
  SECTIONS.find((section) => section.id === id)?.title;

/** What the trap manifest calls each format, as a reader would. */
const FORMAT_NAMES: Record<string, string> = {
  fountain: 'Fountain',
  markdown: 'Markdown',
  text: 'plain text',
  fdx: 'Final Draft',
  highland: 'Highland',
  fadein: 'Fade In',
  html: 'HTML',
  epub: 'EPUB',
  files: 'pipes, links, and folders',
  modules: 'module manifests',
};
const trapFormats = Object.entries(counts.trap.byFormat).map(
  ([format, count]) => `${FORMAT_NAMES[format] ?? format} ${count}`,
);

// Each diagram's two drawings, by file name, as the build's addresses for them.
const drawings = import.meta.glob<string>('../../assets/diagrams/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
});
const drawing = (id: string, theme: 'dark' | 'light') => {
  const url = Object.entries(drawings).find(([file]) => file.endsWith(`/${id}-${theme}.svg`))?.[1];
  if (!url) throw new Error(`No ${theme} drawing of the ${id} diagram: run pnpm diagrams.`);
  return url;
};
const diagrams = HOW_IT_WORKS.map((diagram) => {
  const size = (sizes as Record<string, { dark: { width: number; height: number } }>)[diagram.id];
  if (!size) throw new Error(`No size for the ${diagram.id} diagram: run pnpm diagrams.`);
  return {
    ...diagram,
    dark: drawing(diagram.id, 'dark'),
    light: drawing(diagram.id, 'light'),
    ...size.dark,
  };
});
</script>

<template>
  <article>
    <h1>{{ page.title }}</h1>
    <p class="docs-lead">
      Drafter™ is a free app for writing screenplays and stage plays. You write on the left, and
      the script’s pages build on the right as you type. It runs in your browser at
      <a href="/">drafter.dev</a>, or as a desktop app, and it never asks you to sign in.
    </p>

    <nav aria-label="On this page" class="jump">
      <ol>
        <li v-for="section in SECTIONS" :key="section.id">
          <a :href="`#${section.id}`">{{ section.title }}</a>
        </li>
      </ol>
    </nav>

    <section aria-labelledby="one-minute">
      <h2 id="one-minute">{{ title('one-minute') }}</h2>
      <p>
        A <strong>screenplay</strong> is the written form of a film or a TV episode: a heading for
        each scene that says where and when it happens, what we see, and what each character says.
        A <strong>stage play</strong> is the same for the theatre. Both are set out in a strict
        format that everyone who reads scripts expects. A screenplay page runs about a minute on
        screen, and Drafter’s running time counts it that way, at a rate you can change.
      </p>
      <p>
        Drafter does that formatting for you. You type plain text in a simple style called
        <strong>Fountain</strong>: a line such as <code>INT. KITCHEN - NIGHT</code> becomes a scene
        heading, and a name in capitals becomes a character about to speak. Drafter turns it into
        proper pages as you go, and into a PDF to send.
      </p>
      <p>Who it’s for:</p>
      <ul>
        <li>
          <strong>Screenwriters and playwrights</strong>, from a first script to one that’s going
          into production.
        </li>
        <li>
          <strong>Anyone learning the format.</strong> The element bar writes the marks for you, and a
          guided first screenplay and stage play teach each one as you read.
        </li>
        <li>
          <strong>Novelists, and anyone with notes or a treatment.</strong> Drafter writes Markdown
          documents too, and turns them into a clean PDF.
        </li>
      </ul>
      <p>
        It’s free, with no catch. It works offline, and your script is a plain text file that you
        own.
      </p>
    </section>

    <section aria-labelledby="writers">
      <h2 id="writers">{{ title('writers') }}</h2>
      <p>
        Every app in the
        <a :href="`${help('help-why')}#compares`">comparison on Why Drafter</a> is good at what it
        does. These are the reasons a writer might pick Drafter. What Final Draft costs and asks for
        is from its maker’s own pages, read on 31 October 2026.
      </p>
      <ul>
        <li>
          <strong>Free, with no catch.</strong> Final Draft 13 is $249.99 once, or $99.99 a year,
          after a 5-day trial. Drafter has no price, no trial, no paid version, and no ads.
        </li>
        <li>
          <strong>No login, licence key, or activation.</strong> Final Draft 13 signs in through its
          store, on two computers. Drafter has no account to make and nothing to activate, on the web
          or on the desktop.
        </li>
        <li>
          <strong>Instant.</strong> drafter.dev opens straight into a script. Nothing to install
          first, and no setup.
        </li>
        <li>
          <strong>Offline and private.</strong> Once it has loaded, Drafter runs with no connection.
          No cookies, no analytics, no tracking: your script never leaves your device.
        </li>
        <li>
          <strong>Your files are plain text you own.</strong> A <code>.fountain</code> file opens in
          any text editor, and will still open in fifty years. A lapsed licence can never lock you
          out of your own work.
        </li>
        <li>
          <strong>Final Draft files go in and out.</strong> Open the <code>.fdx</code> a producer
          sends, and hand one back.
        </li>
        <li>
          <strong>On every computer.</strong> In any browser, on a computer or a phone; desktop apps
          for Windows and Linux; and a Mac app you build with one command. Final Draft 13 runs on a
          Mac and Windows, not Linux.
        </li>
        <li>
          <strong>The features that matter.</strong> Industry-standard pages, stage plays, an
          outline and index cards, notes, version history and Compare, character and scene stats,
          offline spellcheck, focus mode, goals and sprints, and a dark theme.
        </li>
      </ul>

      <h3 id="not-yet">What Final Draft has that Drafter doesn’t, yet</h3>
      <p>Each of these is planned, and each will be free.</p>
      <ul>
        <li>
          <strong>Production features</strong>: revision colors and marks, locked pages and scene
          numbers, OMITTED scenes, and a breakdown report. Coming in v0.27.0, with sides.
        </li>
        <li><strong>PDF import</strong>: planned, in Phase 3.</li>
        <li><strong>TV templates</strong>: Phase 3.</li>
        <li><strong>Read aloud</strong>, for a table read: Phase 4.</li>
        <li><strong>Real-time co-writing</strong>: later.</li>
        <li>
          <strong>A Mac download and an iPhone app.</strong> Final Draft has both. Drafter builds on
          a Mac with one command, and a signed Mac download comes later; on an iPhone, Drafter works
          in the browser.
        </li>
      </ul>
      <p>
        <a :href="`${help('help-why')}#compares`">How Drafter compares</a> has the full table, with
        WriterDuet, Fade In, Highland Pro, Arc Studio, and Celtx too.
      </p>
    </section>

    <section aria-labelledby="industry">
      <h2 id="industry">{{ title('industry') }}</h2>
      <ul>
        <li>
          <strong>Industry-standard pages.</strong> Screenplay and stage-play format, laid out as you
          type, with page counts you can trust, and a PDF that looks like what readers, agents, and
          productions expect.
        </li>
        <li>
          <strong>Final Draft round trips.</strong> An <code>.fdx</code> file opens as a new script.
          Anything Drafter can’t map comes in as a note, listed in Problems, so nothing is lost
          silently. Export as Final Draft writes the scene headings and numbers, action, dialogue and
          dual dialogue, notes, and the title page.
        </li>
        <li>
          <strong>Nothing to install to read it.</strong> Send a PDF, a web page that opens in any
          browser with no connection, or an EPUB for an e-reader.
        </li>
        <li>
          <strong>Export options for each script.</strong> Scene numbers (none, as written, or every
          scene), the title page, and whether notes go along.
        </li>
        <li>
          <strong>Numbered drafts, and every cut kept.</strong> Start new draft keeps Draft 01, 02,
          and so on, and Cuts keeps everything you cut, for good. Both are saved beside the script as
          plain files, on the desktop and in Chrome or Edge.
          <a :href="help('help-drafts-and-cuts')">Drafts and cuts</a>
        </li>
      </ul>
      <h3 id="coming-soon">Coming soon</h3>
      <ul>
        <li>
          <strong>Story map</strong> (v0.24.1): a visual page of your script or play, to send to
          anyone.
        </li>
        <li>
          <strong>Production, free</strong> (v0.27.0): colored revision sets with marks in the
          margin, locked pages (12A) and scene numbers (5A), OMITTED scenes, revised pages to send
          out, a breakdown report, and sides for actors.
        </li>
      </ul>
      <p>There is no paid version, and there won’t be one. The production features are free too.</p>
    </section>

    <section aria-labelledby="trust">
      <h2 id="trust">{{ title('trust') }}</h2>
      <ul>
        <li><strong>No account.</strong> Nothing to sign up for, and nothing to sign in to.</li>
        <li>
          <strong>No server keeping your scripts.</strong> drafter.dev is a static site: it has no
          server that could receive your script. Your work stays on your device, in the files you
          save and in a recovery copy in your browser.
        </li>
        <li>
          <strong>No cookies, no analytics, no tracking, no telemetry.</strong> See
          <a :href="help('help-privacy')">Privacy</a>.
        </li>
        <li><strong>Works offline</strong>, once it has loaded.</li>
        <li>
          <strong>Open source.</strong> The code is MIT-licensed and
          <a :href="REPO" target="_blank" rel="noopener noreferrer">on GitHub</a>, for anyone to
          read. It is written from scratch, with no code from any other screenwriting app.
        </li>
        <li>
          <strong>No forced updates.</strong> The web app updates when you reload. The desktop app
          asks GitHub once at start-up whether there’s a new version, never installs or restarts by
          itself, and can be told not to check at all.
        </li>
      </ul>
      <p>
        <strong>Who makes it.</strong> One writer, for writers. Drafter isn’t a business.
      </p>
      <MadeBy />
      <p class="docs-note">
        Drafter™ and the Drafter logo are trademarks of Christopher Schweda. The MIT licence covers the
        code; it doesn’t grant use of the name or logo.
      </p>

      <h3 id="security">Security</h3>
      <ul>
        <li>
          <strong>Nothing in a file ever runs.</strong> A script is read as text, and your words are
          shown as words, never as web code.
        </li>
        <li>
          <strong>A strict content security policy.</strong> The web app tells your browser to run
          only Drafter’s own scripts, so nothing slipped into a page or a file can run there.
        </li>
        <li>
          <strong>Size limits are checked before anything is unpacked</strong>, and a Final Draft
          file never makes Drafter fetch or read anything else.
        </li>
        <li>
          <strong>The trap documents.</strong> Drafter is tested against {{ counts.trap.traps }}
          deliberately broken and hostile files, in every format it opens. Each must open with its
          text, or be refused with a plain message, and nothing may crash, run, or fetch anything.
          <a href="#traps">More below</a>.
        </li>
        <li>
          <strong>Found a problem?</strong> Please report it privately:
          <a :href="repoHref('SECURITY.md')" target="_blank" rel="noopener noreferrer">SECURITY.md</a>
          says how.
        </li>
      </ul>
      <p>
        The README’s
        <a :href="`${REPO}#security`" target="_blank" rel="noopener noreferrer">Security section</a>
        and <a :href="`${help('help-technical')}#security`">Technical details</a> have the specifics.
      </p>
    </section>

    <section aria-labelledby="technical">
      <h2 id="technical">{{ title('technical') }}</h2>

      <h3 id="numbers">The numbers</h3>
      <p>
        As of Drafter {{ counts.version }} ({{ longDate(counts.date) }}), Drafter has these
        tests:
      </p>
      <ul data-test-counts>
        <li>
          <strong>{{ n(counts.unit.packages) }}</strong> unit tests of the engine, across
          {{ counts.unit.packageCount }} packages.
        </li>
        <li><strong>{{ n(counts.unit.web) }}</strong> unit tests of the web app.</li>
        <li><strong>{{ n(counts.unit.desktop) }}</strong> unit tests of the desktop app.</li>
        <li><strong>{{ n(counts.unit.modules) }}</strong> tests of the script modules.</li>
        <li>
          <strong>{{ n(counts.e2e.web) }}</strong> browser tests of the whole app, each run in
          {{ counts.e2e.webProjects.length }} projects (Chromium, Firefox, and WebKit, Safari’s
          engine, at desktop size, and an Android phone and an iPhone): {{ n(counts.e2e.webRuns) }} runs.
        </li>
        <li>
          <strong>{{ n(counts.e2e.desktop) }}</strong> end-to-end tests of the desktop app, in
          Electron.
        </li>
        <li>
          <strong>{{ n(counts.trap.traps) }}</strong> trap documents, with
          {{ n(counts.trap.checks) }} checks: each trap, at each way in it goes through.
        </li>
        <li>
          <strong>{{ n(counts.unit.trapHarness) }}</strong> tests of the trap suite’s own, which run
          the trap documents through the engine, the command line, and the modules folder.
        </li>
      </ul>
      <p class="docs-note">
        <code>scripts/test-counts.mjs</code> counts them at each release. It runs the unit tests
        once, and lists the browser and desktop tests without running them, with Playwright’s
        <code>--list</code>. A listed test may skip itself where it doesn’t apply, such as a
        phone-only test on a desktop browser.
      </p>

      <h3 id="stack">The stack</h3>
      <ul>
        <li>TypeScript, in a pnpm monorepo.</li>
        <li>
          The web app: Nuxt 4, Vue 3.5, and Nuxt UI 4, built as a static site on Netlify, and an
          offline app (a PWA).
        </li>
        <li>The editor: CodeMirror 6.</li>
        <li>
          The engine: framework-free <code>@drafter/*</code> packages (the parser, the layout, and
          the renderers), shared by the web app, the desktop app, and the command line.
        </li>
        <li>
          PDFs with pdf-lib; storage in IndexedDB, with Dexie; spellcheck with nspell and Hunspell
          dictionaries.
        </li>
        <li>The desktop app: Electron.</li>
        <li>Tests: Vitest and fast-check, Playwright, and axe. Formatting and lint: Biome.</li>
      </ul>

      <h3 id="how-it-works">How it works</h3>
      <p>
        Four diagrams, drawn from the Mermaid in
        <a :href="repoHref('docs/HOW-IT-WORKS.md')" target="_blank" rel="noopener noreferrer"
          >How it works</a
        >
        on GitHub. <a :href="help('help-technical')">Technical details</a> has more.
      </p>
      <figure
        v-for="diagram in diagrams"
        :key="diagram.id"
        class="diagram"
        :data-diagram="diagram.id"
      >
        <figcaption>{{ diagram.title }}</figcaption>
        <img
          class="diagram-dark"
          :src="diagram.dark"
          :alt="diagram.description"
          :width="diagram.width"
          :height="diagram.height"
          loading="lazy"
          decoding="async"
        />
        <img
          class="diagram-light"
          :src="diagram.light"
          :alt="diagram.description"
          :width="diagram.width"
          :height="diagram.height"
          loading="lazy"
          decoding="async"
        />
      </figure>

      <h3 id="traps">The trap documents</h3>
      <p>
        The trap documents are {{ counts.trap.traps }} files made to break things: empty, huge,
        malformed, mislabelled, or hostile. By format: {{ trapFormats.join(', ') }}. Each has the
        one outcome it must have, opened with its text or refused with a plain message, at every way
        in that applies: the web app’s Open, the desktop app’s, the command line, and each format’s
        reader. The tests check that nothing crashes, runs, or fetches anything, and that each
        finishes in time.
        <a :href="repoHref('fixtures/trap/README.md')" target="_blank" rel="noopener noreferrer"
          >The trap documents’ README</a
        >
        has the whole list and how they run.
      </p>

      <h3 id="links">Links</h3>
      <ul>
        <li>
          <a :href="REPO" target="_blank" rel="noopener noreferrer">The source code on GitHub</a>
        </li>
        <li>
          <a :href="repoHref('docs/DEVELOPMENT.md')" target="_blank" rel="noopener noreferrer"
            >Developing Drafter</a
          >: building it, the packages, and releasing.
        </li>
        <li>
          <a :href="repoHref('docs/ROADMAP.md')" target="_blank" rel="noopener noreferrer"
            >The roadmap</a
          >
        </li>
        <li>
          <a :href="repoHref('CHANGELOG.md')" target="_blank" rel="noopener noreferrer"
            >The changelog</a
          >, every change in detail.
        </li>
        <li>
          <a :href="help('help-whats-new')">What’s new</a>, the changes in plain words, newest
          first.
        </li>
      </ul>
    </section>
  </article>
</template>

<style scoped>
.jump {
  margin: 16px 0 8px;
  padding: 10px 16px 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.jump ol {
  margin: 0;
}
.diagram {
  margin: 16px 0 20px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--raised);
  break-inside: avoid;
}
.diagram figcaption {
  margin: 0 0 8px;
  font-weight: 600;
}
.diagram img {
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}
p code,
li code {
  font-family: var(--font-mono, monospace);
  font-size: 0.92em;
}
</style>

<style>
/* One drawing for each theme, dark unless the page is light. Not scoped, so the theme's class on
   <html> can choose (a scoped :global() would make the whole rule global). */
.diagram-dark,
.diagram-light {
  display: block;
}
.diagram-light,
.light .diagram-dark {
  display: none;
}
.light .diagram-light {
  display: block;
}
</style>
