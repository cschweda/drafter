// What the Technical details page says (out-the-door design §4), as plain data: the page
// (`pages/docs/technical.vue`) draws it, and `about/mermaid.ts` writes the same words, with the
// diagrams as Mermaid, to docs/technical-details.md (test/tech.test.ts keeps that file in step and
// checks PACKAGES and DEPENDENCY_NOTES against every package.json). No imports from the app.

/** Words, where `code` in backticks becomes <code> and **these** <strong>; nothing else is markup. */
export type Inline = string;

export type TechBlock =
  | { kind: 'p'; text: Inline }
  | { kind: 'list'; items: Inline[] }
  | { kind: 'diagram'; diagram: Diagram }
  /** A link to a file in the repository, by its path from the root (`docs/clean-room.md`). */
  | { kind: 'link'; text: Inline; path: string }
  /** The third-party dependencies, one line each, from `DEPENDENCY_NOTES`. */
  | { kind: 'dependencies' };

export interface TechSection {
  id: string;
  title: string;
  /** What a curious reader who doesn't program can follow. */
  plain: TechBlock[];
  /** The names and the specifics. */
  details: TechBlock[];
}

export type Diagram =
  /** A chain of steps, top to bottom; with `fan`, the first step leads to each of the others. */
  | {
      id: string;
      kind: 'flow';
      fan?: true;
      caption: string;
      steps: { label: string; detail: string }[];
    }
  /** Drafter's packages in layers, drawn from `PACKAGES`. */
  | { id: string; kind: 'packages'; caption: string };

export interface PackageNote {
  name: string;
  does: string;
  /** Its `@drafter/*` runtime dependencies. */
  uses: string[];
}

/** The page's opening paragraph. */
export const TECH_LEAD =
  'How Drafter is put together, for the curious: each part starts in plain words, then gives the names and the details. Nothing here is needed to write with Drafter.';

/** What the list of dependencies says before its link to the Third-party licences page. */
export const TECH_LICENCES =
  'The spellchecker’s, the dictionaries’, and the fonts’ licences are given in full on the';

/** Every package in `packages/` and `apps/`, with what it does and which of the others it uses. */
export const PACKAGES: readonly PackageNote[] = [
  {
    name: '@drafter/web',
    does: 'The app itself, drafter.dev: the panes, menus, dialogs, storage, and workers.',
    uses: [
      '@drafter/archive',
      '@drafter/cm-fountain',
      '@drafter/compare',
      '@drafter/fdx',
      '@drafter/fountain',
      '@drafter/history',
      '@drafter/layout',
      '@drafter/lint',
      '@drafter/notes',
      '@drafter/outline',
      '@drafter/render-html',
      '@drafter/render-pdf',
      '@drafter/render-text',
      '@drafter/spell',
      '@drafter/templates',
    ],
  },
  {
    name: '@drafter/desktop',
    does: 'The desktop app: an Electron window that serves the web app’s own build from its files.',
    uses: [],
  },
  {
    name: '@drafter/cli',
    does: 'The command line: `drafter build` writes a script as PDF, text, or JSON, and `drafter check` reports its problems.',
    uses: [
      '@drafter/fountain',
      '@drafter/layout',
      '@drafter/render-pdf',
      '@drafter/render-text',
      '@drafter/templates',
    ],
  },
  {
    name: '@drafter/cm-fountain',
    does: 'Fountain in the CodeMirror editor: highlighting, keys, completion, folding, and the Problems underlines.',
    uses: ['@drafter/fountain', '@drafter/lint', '@drafter/notes', '@drafter/templates'],
  },
  {
    name: '@drafter/outline',
    does: 'The scene index (scenes, sections, page counts, running times) and the edits the Outline and Cards make; and a script as Markdown, as a treatment or the whole script.',
    uses: ['@drafter/fountain', '@drafter/layout', '@drafter/notes', '@drafter/templates'],
  },
  {
    name: '@drafter/compare',
    does: 'Compare and Show changes: a line and word diff of two versions of a script, its rows, folds, and scene groups for the Changes view, and where each change falls on the pages.',
    uses: ['@drafter/fountain', '@drafter/layout'],
  },
  {
    name: '@drafter/history',
    does: 'Version history: which scenes of past versions are gone now, one scene’s versions, and where Put back goes.',
    uses: ['@drafter/fountain', '@drafter/outline', '@drafter/templates'],
  },
  {
    name: '@drafter/render-pdf',
    does: 'PDFs: a script’s pages in Courier Prime, and a Markdown document in Inter Tight.',
    uses: ['@drafter/layout', '@drafter/templates'],
  },
  {
    name: '@drafter/render-html',
    does: 'The Script pane: draws laid-out pages as page-shaped, accessible HTML.',
    uses: ['@drafter/layout', '@drafter/templates'],
  },
  {
    name: '@drafter/render-text',
    does: 'Plain-text export: the same pages as fixed-width text.',
    uses: ['@drafter/layout', '@drafter/templates'],
  },
  {
    name: '@drafter/layout',
    does: 'Pagination: puts a parsed script on pages, as its template describes.',
    uses: ['@drafter/fountain', '@drafter/templates'],
  },
  {
    name: '@drafter/lint',
    does: 'The Problems pane’s rules, each with the fixes it offers as text changes.',
    uses: ['@drafter/fountain', '@drafter/notes', '@drafter/templates'],
  },
  {
    name: '@drafter/fdx',
    does: 'Final Draft (.fdx) files: its own strict XML reader and writer, and the mapping to and from Fountain; and Open Screenplay Format (OSF) documents, the script inside a Fade In (.fadein) file, read through the same mapping.',
    uses: ['@drafter/fountain', '@drafter/templates'],
  },
  {
    name: '@drafter/archive',
    does: 'Highland (.highland) and Fade In (.fadein) files, which come packed as a zip: its own strict read-only zip reader, and the script inside each.',
    uses: ['@drafter/fdx'],
  },
  {
    name: '@drafter/templates',
    does: 'The formats: the screenplay and stage-play templates, and the rules for writing one.',
    uses: ['@drafter/fountain'],
  },
  {
    name: '@drafter/notes',
    does: 'Keyed notes (`[[Head: body]]`), and the small text helpers every structural edit shares.',
    uses: ['@drafter/fountain'],
  },
  {
    name: '@drafter/spell',
    does: 'Spellcheck: the words of a script worth checking, and the two English dictionaries.',
    uses: ['@drafter/fountain'],
  },
  {
    name: '@drafter/fountain',
    does: 'The parser: reads Fountain text into a syntax tree that prints back to exactly the same text.',
    uses: [],
  },
];

/**
 * Each third-party package a `package.json` in `apps/` or `packages/` lists under `dependencies`,
 * with one plain line on what it does for Drafter. docs/DEPENDENCIES.md has why each is allowed.
 */
export const DEPENDENCY_NOTES: Readonly<Record<string, string>> = {
  nuxt: 'Builds drafter.dev as a set of static files, with nothing running on a server.',
  vue: 'Draws the app’s screens and keeps them up to date as you write.',
  'vue-router': 'Gives the app and each help page an address of its own.',
  '@nuxt/ui': 'The menus, dialogs, tabs, and command palette.',
  tailwindcss: 'Styling, built into a stylesheet when the app is built.',
  '@iconify-json/lucide':
    'The icons in the menus and toolbar, built into the app so none is fetched.',
  '@iconify-json/heroicons': 'A few icons the guided tour draws, built in the same way.',
  'nuxt-guided-tour': 'The welcome and the guided tour on a first visit.',
  '@vueuse/core': 'Small helpers the guided tour needs; Drafter’s own code doesn’t use it.',
  '@vite-pwa/nuxt':
    'Writes the service worker that lets the app open offline, and the file that lets it install as an app.',
  dexie: 'Keeps your recovery copy, scripts, and snapshots in the browser’s own database.',
  '@codemirror/state': 'The editor’s text, selection, and undo history, held as data.',
  '@codemirror/view': 'Draws the editor and handles typing, the mouse, and touch.',
  '@codemirror/commands': 'The editor’s everyday commands: undo, redo, and moving by word or line.',
  '@codemirror/language':
    'Folding, and the structure of a Markdown document as the editor reads it.',
  '@codemirror/search': 'Find and replace in the editor.',
  '@codemirror/lint': 'Underlines a problem in the text and shows its fixes.',
  '@codemirror/autocomplete': 'Suggests character names and places as you type.',
  '@codemirror/lang-markdown': 'The editor’s mode for a Markdown document.',
  'mdast-util-from-markdown':
    'Reads a Markdown document for its Preview, its word count, and its PDF.',
  'pdf-lib': 'Writes PDF files.',
  '@pdf-lib/fontkit': 'Embeds the fonts in a PDF, only the letters it uses.',
  nspell: 'The spellchecker: checks each word against a dictionary and suggests corrections.',
  'dictionary-en': 'The American English dictionary.',
  'dictionary-en-gb': 'The British English dictionary.',
  commander: 'Reads the command line’s options.',
  'electron-updater':
    'Lets the Linux and Windows apps check GitHub for a new version, and the AppImage and the Windows app update themselves.',
};

const PACKAGE_DIAGRAM: Diagram = {
  id: 'packages',
  kind: 'packages',
  caption:
    'Drafter’s packages in layers: each one uses only packages in the layers below it, and the parser, which uses none, is at the bottom. Each use shown, a line or a “uses”, is a direct one; a package also uses whatever those use.',
};

const KEYSTROKE: Diagram = {
  id: 'keystroke',
  kind: 'flow',
  caption: 'From a keystroke to the page: the editor, the parse, then everything that reads it.',
  steps: [
    { label: 'You type', detail: 'CodeMirror, the editor, changes its text' },
    { label: 'The parse', detail: '@drafter/fountain reads the whole script again' },
    {
      label: 'The editor reads it',
      detail: 'Highlighting, the Problems, and the scene index',
    },
    {
      label: 'The layout worker',
      detail: 'Puts the script on pages, off the main thread, after a pause in typing',
    },
    { label: 'The Script pane', detail: '@drafter/render-html draws the pages' },
  ],
};

const STORAGE: Diagram = {
  id: 'storage',
  kind: 'flow',
  fan: true,
  caption:
    'Where your script is kept: the text in the editor goes three ways, each in its own time: a recovery copy as you type, your file when you save, and snapshots along the way.',
  steps: [
    { label: 'You type', detail: 'The text in the editor' },
    {
      label: 'The recovery copy',
      detail: 'In the browser’s IndexedDB, a moment after you stop typing',
    },
    { label: 'Save', detail: 'Writes your .fountain file, or downloads a copy, when you choose' },
    {
      label: 'Snapshots',
      detail: 'Copies of the whole script in IndexedDB, as you write, save, or ask',
    },
  ],
};

const EXPORT: Diagram = {
  id: 'export',
  kind: 'flow',
  caption:
    'Exporting: the export worker lays the script out and writes the file, with a progress bar.',
  steps: [
    { label: 'Export', detail: 'From the Export menu, with the script’s export options' },
    {
      label: 'The export worker',
      detail: 'Parses the script and, for a PDF or text, puts it on pages',
    },
    {
      label: 'Drawing the file',
      detail: 'PDF (pdf-lib), plain text, Markdown, or Final Draft XML',
    },
    { label: 'Your file', detail: 'Saved where you choose, or downloaded' },
  ],
};

const RELEASE: Diagram = {
  id: 'release',
  kind: 'flow',
  caption: 'How a release ships: tests, a tag, the desktop builds on GitHub, then the website.',
  steps: [
    { label: 'Tests', detail: 'Vitest and Playwright, on the maintainer’s computer' },
    { label: 'The version', detail: 'Set in each package.json, and the changelog written' },
    { label: 'A tag', detail: 'vX.Y.Z, pushed to GitHub' },
    {
      label: 'The desktop workflow',
      detail: 'Builds and tests the Linux and Windows apps on GitHub Actions',
    },
    {
      label: 'The GitHub Release',
      detail: 'Published only when the Linux and Windows jobs pass and every file is checked',
    },
    { label: 'drafter.dev', detail: 'Netlify builds the site when main is pushed' },
  ],
};

/** The page's ten parts (design §4.1), plain words first in each. */
export const TECH_SECTIONS: readonly TechSection[] = [
  {
    id: 'short-version',
    title: 'The short version',
    plain: [
      {
        kind: 'p',
        text: 'Drafter is a web app that runs entirely in your browser, or in a window of its own on the desktop. There is no server behind it and no account to make: once the page has loaded, everything happens on your device, and your script never leaves it.',
      },
    ],
    details: [
      {
        kind: 'p',
        text: 'drafter.dev is a set of static files: HTML, JavaScript, CSS, fonts, and dictionaries, built with Nuxt and Vue and served by Netlify. Nothing on the site runs code for you or stores anything. It is written in TypeScript, and every part of it, down to the Fountain parser, is Drafter’s own, written from public specifications (the clean-room rule, below).',
      },
    ],
  },
  {
    id: 'organized',
    title: 'How it’s organized',
    plain: [
      {
        kind: 'p',
        text: 'Drafter is built from small pieces, each with one job: one reads Fountain, one puts a script on pages, one draws a PDF, and so on. The app sits on top and puts them together. A piece only uses the pieces beneath it, so each can be tested on its own.',
      },
    ],
    details: [
      {
        kind: 'p',
        text: 'One repository holds them all as pnpm workspaces: the engine packages in `packages/` (published as `@drafter/*`), the app in `apps/web`, and the desktop app in `apps/desktop`. Only `@drafter/cm-fountain` knows about CodeMirror, and only it and `@drafter/render-html` touch a web page; the rest run anywhere Node does, which is how the command line uses them.',
      },
      { kind: 'diagram', diagram: PACKAGE_DIAGRAM },
      {
        kind: 'p',
        text: 'The desktop app isn’t drawn: it uses none of the packages directly, and serves the web app’s finished build instead.',
      },
    ],
  },
  {
    id: 'keystroke',
    title: 'From a keystroke to the page',
    plain: [
      {
        kind: 'p',
        text: 'When you type a letter, Drafter reads the whole script again. That sounds slow, but Fountain is simple to read, and even a long script takes a moment too short to notice. Everything else, the colors, the Problems, the Outline, reads that one reading, so they always agree. Putting the script on pages takes longer, so that happens to one side, without holding up your typing.',
      },
    ],
    details: [
      { kind: 'diagram', diagram: KEYSTROKE },
      {
        kind: 'list',
        items: [
          '**The editor** is CodeMirror 6. `@drafter/cm-fountain` keeps the parse in the editor’s state: `parse` once, then `reparse` on every change, which parses the full text again.',
          '**The parse** is `@drafter/fountain`, a lossless parser: printing the tree gives back exactly the text it read, spaces and mistakes included. There is no second grammar for highlighting; the colors come from the same parse, drawn for the part of the script on screen.',
          '**The Problems** are `@drafter/lint`’s rules, run on the parse, with any fixes they offer as text changes. **The scene index** (`@drafter/outline`) feeds the Outline, Cards, and the Structure strip, with each scene’s pages and running time.',
          '**The layout** is `@drafter/layout`, in a Web Worker (`layout.worker.ts`): 50 ms after you stop typing, the text goes to the worker, which parses it and paginates it by the template. A slower, older layout never replaces a newer one.',
          '**The Script pane** is `@drafter/render-html`, which draws those pages as positioned HTML a screen reader can follow.',
          'A Markdown document has its own worker (`markdown.worker.ts`), which reads it with `mdast-util-from-markdown` for the Preview. Spellcheck has one too (`spell.worker.ts`): `@drafter/spell` loads a dictionary into nspell there and checks the script’s words, so typing never waits on it.',
        ],
      },
    ],
  },
  {
    id: 'storage',
    title: 'Where your script is kept',
    plain: [
      {
        kind: 'p',
        text: 'While you write, your browser keeps a recovery copy of the script, updated as you type, so a crash or a closed tab loses almost nothing. When you save, Drafter writes your script to a file on your computer: a plain `.fountain` file that any text editor can open. Along the way it keeps snapshots, earlier copies you can go back to.',
      },
    ],
    details: [
      { kind: 'diagram', diagram: STORAGE },
      {
        kind: 'list',
        items: [
          '**The recovery copy** is in the browser’s IndexedDB, through Dexie. It is written 750 ms after you stop typing, or every 5 seconds while you keep going. The database has five tables: `projects`, `snapshots`, `templates`, `handles`, and `settings`.',
          '**Only one tab edits a script.** A second tab with the same script open shows it read-only, so two tabs never write one recovery copy.',
          '**Save** goes through one interface, `FileAccess`. In Chrome and Edge it uses the File System Access API to save back to the file you opened; Firefox and Safari can’t, so Save downloads a complete copy. The desktop app reads and writes files by path, through its main process.',
          '**Snapshots** are copies of the whole text, in the `snapshots` table: after every 10 minutes of writing, when you save or open a file, before a change that rewrites much of it, and when you ask for one. They are compressed where the browser can, and thinned out as they age.',
          '**Version history** reads the snapshots in a worker of its own (`history.worker.ts`), newest first: `@drafter/history` parses each one, notes each scene’s heading, a hash of its text, and a sketch of its wording, and matches scenes across versions, for Deleted scenes and History of this scene. The notes are cached in a second database, `drafter-cache`, so no snapshot is read twice, and removing a script removes them. Show changes and Compare’s Changes view are `@drafter/compare`’s line and word diff; Show changes’ marks come from the layout worker, after the pages.',
        ],
      },
    ],
  },
  {
    id: 'exporting',
    title: 'Exporting',
    plain: [
      {
        kind: 'p',
        text: 'Exporting turns your script into a PDF to print or send, plain text, Markdown, or a Final Draft file. It happens to one side, like the page layout, so the editor stays free while a long script is drawn, and a bar shows how far it has got.',
      },
    ],
    details: [
      { kind: 'diagram', diagram: EXPORT },
      {
        kind: 'list',
        items: [
          '**The export worker** (`export.worker.ts`) parses the script and, for a PDF or plain text, lays it out again with the same engine as the Script pane, then hands the pages to a renderer. It reports how far it has got, at most ten times a second, for the toast’s progress bar.',
          '**PDF** is `@drafter/render-pdf`, with `pdf-lib`, embedding Courier Prime, the font the Script pane shows. A Markdown document’s PDF is set in Inter Tight, with Courier Prime for code.',
          '**Plain text** is `@drafter/render-text`: the same pages as fixed-width text. **Final Draft** is `@drafter/fdx`, which writes the XML itself, and reads `.fdx` files too.',
          '**Markdown** is `@drafter/outline`’s: the title, sections, and scenes as headings, a speech as the name in bold over its lines, and every line escaped so nothing in it reads as Markdown it wasn’t. A Markdown document’s Markdown file is its own text.',
          '**Export options** are each script’s own: scene numbers (none, as written, or every scene) and the title page (full, title and author only, or none), and, for a Markdown file alone, notes (left out or included). They are kept with the script’s record in the browser, never in the script’s text.',
          'Where the browser has a save picker, it asks where to save; elsewhere the file downloads.',
        ],
      },
    ],
  },
  {
    id: 'offline',
    title: 'Working offline',
    plain: [
      {
        kind: 'p',
        text: 'After your first visit, Drafter opens with no internet at all: your browser keeps its own copy of the app. You can also install it, so it opens in a window of its own like any other app. When a new version is out, Drafter tells you, and waits for you to choose when to reload.',
      },
    ],
    details: [
      {
        kind: 'p',
        text: 'A service worker (`/sw.js`, written at build time by `@vite-pwa/nuxt` and Workbox) precaches the app’s own files: the pages, scripts, styles, workers, fonts, dictionaries, and icons, and nothing else. A web app manifest makes it installable (a PWA). A new version waits until you reload; it never reloads a tab by itself. The site sends a strict content security policy, so a page may only load scripts from drafter.dev itself.',
      },
    ],
  },
  {
    id: 'desktop',
    title: 'The desktop app',
    plain: [
      {
        kind: 'p',
        text: 'The desktop app is the same Drafter, in a window of its own, with a menu bar and real files: it saves straight back to your file, and opens a `.fountain` file with a double-click. It needs no internet, except to check for a new version.',
      },
    ],
    details: [
      {
        kind: 'list',
        items: [
          'It is Electron, with the web app’s build inside it, served from the app’s own files at `app://drafter/`. It has no service worker: everything is already on your computer.',
          'The page talks to the main process only through a small bridge (the preload), with named calls and plain data. Files go through the same `FileAccess` interface as in the browser, so the rest of the app doesn’t know which one it is in.',
          'For Linux there is an AppImage and a `.deb`, and for Windows an installer (x64 and Arm). A Mac app is built on your own Mac with one command, until there is a signed download.',
          'Updates come from GitHub Releases. The app checks once when it starts, never installs by itself, and you can turn the check off in Settings. The AppImage and the Windows app download a new version through `electron-updater` and install it when you choose Restart; the `.deb` checks the same way and offers the download page. A Mac app reads the latest release’s version with its own small check, not `electron-updater`, which installs only a signed app, and offers the download page too.',
        ],
      },
    ],
  },
  {
    id: 'clean-room',
    title: 'The clean-room rule',
    plain: [
      {
        kind: 'p',
        text: 'Drafter is written from scratch. Nobody working on it reads the code of another screenwriting app or Fountain library, and nothing in it, code, text, or pictures, comes from one. What Drafter has to do comes from public, written sources; how it does it comes only from the people writing it.',
      },
    ],
    details: [
      {
        kind: 'p',
        text: 'So none of Drafter’s dependencies is a screenwriting tool or a Fountain library, and every sample and test script is written for the project. Reading other apps’ documentation, using them, and comparing their output are all fine. The repository has the whole statement and an audit of it.',
      },
      {
        kind: 'link',
        text: 'The clean-room statement (docs/clean-room.md)',
        path: 'docs/clean-room.md',
      },
      {
        kind: 'link',
        text: 'Clean-room implementation, in the README',
        path: 'README.md#clean-room-implementation',
      },
    ],
  },
  {
    id: 'releases',
    title: 'How a release ships',
    plain: [
      {
        kind: 'p',
        text: 'Before a new version goes out, thousands of automatic tests check it, in three browsers. Then it gets a version number, and the Linux and Windows apps are built and tested on GitHub’s computers. The release is published only if all of those builds pass, and the website is updated after it.',
      },
    ],
    details: [
      { kind: 'diagram', diagram: RELEASE },
      {
        kind: 'list',
        items: [
          '**Unit and property tests** run in Vitest (with fast-check generating scripts), and **end-to-end tests** in Playwright, in Chromium, Firefox, and WebKit, with axe checking accessibility in both themes.',
          '**A release** sets the version in every `package.json`, moves the changelog’s entries under it, and pushes a tag, `vX.Y.Z`, which must match the desktop app’s version.',
          '**The desktop workflow** (`.github/workflows/desktop.yml`) builds and tests the Linux and Windows packages, then makes the GitHub Release as a draft, uploads every file, checks them, and only then publishes it. If the Linux job or either Windows job fails, nothing is published. The Mac build is a check on branch pushes only: nothing for a Mac is published until it can be signed.',
          '**drafter.dev** is built by Netlify from `main`, which is pushed after the release is out, so the site’s download link never points at a release without its files.',
        ],
      },
    ],
  },
  {
    id: 'dependencies',
    title: 'What it depends on',
    plain: [
      {
        kind: 'p',
        text: 'Drafter takes as few of other people’s packages as it can, and none from the screenwriting world. Here is each one the app, the desktop app, and the command line need to build and run, and what it does for Drafter.',
      },
    ],
    details: [
      { kind: 'dependencies' },
      {
        kind: 'p',
        text: 'Building and testing use a few more tools that never reach you: TypeScript, Vitest, Playwright, Biome (formatting and linting), tsdown (building each package), and electron-builder (packaging the desktop app).',
      },
      {
        kind: 'link',
        text: 'Why each one is allowed (docs/DEPENDENCIES.md)',
        path: 'docs/DEPENDENCIES.md',
      },
    ],
  },
];
