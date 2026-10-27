# Dependencies

Drafter takes as few dependencies as it can, and none from the screenwriting domain: no Fountain parsers, no screenplay formatters, no other screenwriting application's libraries. The README's [clean-room section](../README.md#clean-room-implementation) explains why.

Every dependency is listed here with the reason it's needed. A new one gets an entry **before** it's added, saying why it's needed and confirming that it isn't a screenwriting tool or a Fountain library. If you're unsure whether a package counts, don't use it.

## Runtime

| Package | Depends on | Why |
|---|---|---|
| `@drafter/fountain` | nothing | The parser is self-contained. |
| `@drafter/templates` | `@drafter/fountain` | Types only (`Block`, `BlockKind`); nothing from it runs. |
| `@drafter/layout` | `@drafter/fountain`, `@drafter/templates` | Reads parsed documents and resolves roles. |
| `@drafter/render-pdf` | `@drafter/layout`, `@drafter/templates`, `pdf-lib`, `@pdf-lib/fontkit` | Writing PDF files, from layouts, at the template's paper size. pdf-lib can only embed the 14 standard PDF fonts without fontkit, and Drafter embeds Courier Prime. General-purpose PDF libraries, not screenwriting tools. Its tests also use `@drafter/fountain`, as a development dependency. |
| `@drafter/render-text` | `@drafter/layout`, `@drafter/templates` | Writing layouts as fixed-width text, on the template's character grid. Types only (`Layout`, `LayoutLine`, `Template`); nothing from them runs. Its tests also use `@drafter/fountain`, as a development dependency. |
| `@drafter/render-html` | `@drafter/layout`, `@drafter/templates` | Drawing laid-out pages as accessible DOM for the Script pane. Its API is written in their types (`Layout`, `Page`, `LayoutLine`, `Template`), and the role rules it reads to find speeches are the template's own; nothing from either runs. Its tests also use `@drafter/fountain`, as a development dependency. |
| `@drafter/lint` | `@drafter/fountain`, `@drafter/templates` | Reads parsed documents and the parse diagnostics they carry, and a template's `lint` settings. Its API is written in their types (`Doc`, `Span`, `TextChange`, `Template`), so both are dependencies rather than development dependencies. `manual-contd` also calls `resolveRole` from the templates, to decide which blocks print as the layout does. Its tests also use `@drafter/layout`, as a development dependency: they lay generated scripts out with `paginate` and check that `manual-contd` reports exactly the cues the layout adds a `(CONT'D)` to. |
| `@drafter/cm-fountain` | `@drafter/fountain`, `@drafter/lint`, `@drafter/templates`, `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/autocomplete`, `@codemirror/lint` | The editor: the parse held in the editor's state, the highlighting read from it, and the keymap, completion, folding, and lint that read it too. The CodeMirror packages are CodeMirror 6, a general-purpose editor, not a screenwriting tool, and they know nothing about Fountain. `@drafter/fountain` is the only parser, and Drafter writes no Lezer grammar. `@codemirror/state` holds the text and the parse (a state field), `@codemirror/view` draws the text and the highlighting (decorations and a view plugin), `@codemirror/language` folds ranges, `@codemirror/autocomplete` is the completion popup, and `@codemirror/lint` shows problems and their fixes. `@codemirror/language` brings the `@lezer/*` packages with it, and nothing in Drafter calls them. `@drafter/fountain`'s `Doc` is in the package's API, so it is a dependency rather than a development dependency, and `@drafter/lint` and `@drafter/templates` supply the problems and the template settings the editor shows. Its tests also use `jsdom` and `fast-check`, which the root provides. |
| `@drafter/cli` | `@drafter/fountain`, `@drafter/templates`, `@drafter/layout`, `@drafter/render-pdf`, `@drafter/render-text`, `commander` | The engine packages it drives, and command-line argument parsing; commander is a general-purpose CLI library. |

## Development

All of these are general-purpose tools, declared once at the repository root.

| Dependency | Why |
|---|---|
| `typescript`, `@types/node` | Type-checking. |
| `tsdown` | Building each package to `dist/`. |
| `vitest` | Tests and benchmarks. |
| `fast-check` | Property tests: generated scripts and arbitrary strings. |
| `@biomejs/biome` | Formatting and linting. |
| `pdfjs-dist` | Reading text and positions back out of generated PDFs in tests. Mozilla's general-purpose PDF reader. |
| `jsdom` | A DOM for tests that build and inspect elements without a browser: Vitest's `jsdom` environment runs the tests of `@drafter/render-html` and `@drafter/cm-fountain` in it. A general-purpose implementation of the web standards. |
| `@types/jsdom` | Its type declarations. |

## The app (`apps/web`)

The app's own dependencies, declared in `apps/web/package.json`. None is a screenwriting tool or a Fountain library.

| Dependency | Why |
|---|---|
| `nuxt`, `vue`, `vue-router` | The app framework: Nuxt builds drafter.dev as static files with Vue and its router. General-purpose web frameworks. |
| `@nuxt/ui`, `tailwindcss` | Components (tabs, menus, dialogs, the command palette) and styling. Nuxt UI brings `@nuxt/icon`, `@nuxtjs/color-mode`, and `@nuxt/fonts`; Drafter turns `@nuxt/fonts` off and serves its own fonts. General-purpose UI libraries. |
| `@iconify-json/lucide` | Icon data for the Lucide set Nuxt UI uses, bundled into the build so no icon is fetched at runtime. Icons, not code. |
| `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/search`, `@codemirror/lint`, `@codemirror/autocomplete` | The editor in the Source pane. These are CodeMirror 6, a general-purpose editor that knows nothing about Fountain. `state` and `view` hold and draw the text (the app builds the one `EditorView` and its theme), `commands` supplies undo history and the default keys, `language` supplies the fold gutter and fold keys, `search` supplies Find and Replace, `lint` supplies the lint keys and `forceLinting`, and `autocomplete` supplies the completion keys. The same versions `@drafter/cm-fountain` uses, so pnpm installs one copy of each: two copies of `state` or `view` break the editor at run time. |
| `@codemirror/lang-markdown` | The Source pane's editing mode for a Markdown document (Phase 1 design, Plan 4 Task 6): Markdown highlighting, heading folds, and Enter continuing a list. It replaces `fountain()` in that document, so Fountain's keys, completion, folding, and lint are off. It is CodeMirror's general-purpose Markdown mode, built on `@lezer/markdown`, and knows nothing about Fountain or screenplays. It also brings `@codemirror/lang-html` (for raw HTML in Markdown). Used with its HTML tag completion turned off. |
| `mdast-util-from-markdown` (brings `micromark`) | Reading a Markdown document into a syntax tree for the Preview pane and its word count. `mdast-util-from-markdown` is the general-purpose CommonMark-to-tree step of the unified ecosystem, and it drives `micromark`, the CommonMark tokenizer, which it brings with it; Drafter imports only the former, so `micromark` is not a direct dependency (nothing of ours would import it). Neither is a screenwriting tool or a Fountain library. The tree is drawn as DOM by Drafter's own code, with `textContent` only, never HTML strings; raw HTML in the Markdown is shown as text. |
| `@drafter/fountain`, `@drafter/templates`, `@drafter/cm-fountain` | Drafter's own workspace packages: the parser's `Doc` type, the built-in templates the lint rules read, and the Fountain editor extension. The app resolves them through Vite aliases (`nuxt.config.ts`) to their TypeScript, so it always builds from their current source. |
| `@drafter/lint` | Drafter's own workspace package: the linter. The Problems pane's **Fix all** runs it on the current text (the editor's lint list could be stale) and reads `STRICT_RULES`, to apply every Strict Fountain rule's fix at once. It resolves through the same Vite alias as the other workspace packages. |
| `@drafter/layout`, `@drafter/render-html` | Drafter's own workspace packages: pagination, which the layout worker runs off the main thread, and the Script pane's renderer, which draws the pages as accessible DOM. They resolve through the same Vite aliases as the other workspace packages (`render-html`'s stylesheet, a subpath, through its package exports). |
| `@drafter/render-pdf`, `@drafter/render-text` | Drafter's own workspace packages: the exports. Both run in a worker (`export.worker.ts`), never on the main thread: `render-pdf` draws a laid-out script as a PDF with Courier Prime embedded (it brings `pdf-lib` and `@pdf-lib/fontkit`, already listed above; the app adds nothing of its own), and `render-text` writes the fixed-width text the command line's `build --txt` writes. They resolve through the same Vite aliases as the other workspace packages. The worker fetches the four Courier Prime files from the app's own origin (`/fonts/courier-prime/`), which `connect-src 'self'` allows. |
| `dexie` | The recovery copy and the project list, in the browser's IndexedDB: `projects`, `snapshots`, `templates`, `handles`, and `settings` (technical design §8.1). A general-purpose IndexedDB library. |
| `fake-indexeddb` (development) | An in-memory IndexedDB for the storage tests, which run in Node. A general-purpose testing tool. |
| `nuxt-guided-tour` | The first-visit welcome dialog and the guided tour (Phase 1 design §4.4): `TourWelcome`, `TourIntro`, `TourOverlay`, and the `useGuidedTour` composable, which highlight a part of the screen, move between steps with the arrow keys, keep focus in the card, and announce each step to screen readers. ICJIA's MIT-licensed Nuxt module, written by Drafter's maintainer. A general-purpose product-tour module, not a screenwriting tool or a Fountain library. |
| `@vueuse/core` | The peer dependency of `nuxt-guided-tour` (it needs `>=10`). General-purpose Vue composables; Drafter's own code does not import it. |
| `@iconify-json/heroicons` | Icon data for the Heroicons set: the five icons used are `arrow-left`, `arrow-right`, `check`, and `play`, which `nuxt-guided-tour`'s intro card and steps draw, and `pencil-square`, which Drafter's own tour step names (`app/tour/tour.config.ts`). (The module's unused trigger button would draw `question-mark-circle`.) Bundled into the build, like the Lucide icons, so no icon is fetched at runtime and the content security policy stays as it is. Icons, not code. |
| `@vite-pwa/nuxt` (brings `vite-plugin-pwa` and Workbox) | Offline use and updates (Phase 1 design §11): it writes the service worker and the web app manifest at build time. The worker precaches the app's own files (the shell, scripts, styles, workers, fonts, icons) and nothing else, so the app opens with no network after a first visit, and a new version waits for the writer to choose to reload (`registerType: 'prompt'`). Workbox is Google's general-purpose service-worker toolkit. Build tooling and a generated worker; not a screenwriting tool or a Fountain library. |
| `vue-tsc` (development) | Type-checking `.vue` files, through `nuxt typecheck`. |
| `@playwright/test`, `@axe-core/playwright` (development) | End-to-end tests in Chromium, Firefox, and WebKit, and automated accessibility checks with axe. General-purpose testing tools. |

## The desktop app (`apps/desktop`)

The desktop shell's own dependencies, declared in `apps/desktop/package.json` (Phase 1 Plan 6; the choice of Electron is in `docs/desktop-spike.md`). None is a screenwriting tool or a Fountain library.

| Dependency | Why |
|---|---|
| `electron` (development) | The desktop shell: a Chromium window and a Node main process, which serves the same static build as drafter.dev from the app's own files and does what a browser can't (real files, a menu bar, a close prompt). Pinned to an exact version (45.0.0), as Electron recommends, because its Chromium and Node versions change with each release. A development dependency because the packaged app bundles its own copy of the runtime. It has no install script: the binary for the platform downloads the first time it is used (`require('electron')`, or `pnpm --filter @drafter/desktop exec install-electron`), with `@electron/get` and `@electron-internal/extract-zip`, which it brings. A general-purpose application framework from the OpenJS Foundation. |
| `@playwright/test` (development) | The desktop end-to-end tests, through its Electron driver (`_electron.launch`). The same version `apps/web` uses. |
| `electron-builder` (development, Plan 6 Task 7) | Packaging the AppImage and the `.deb`. Its row is completed when it is added. |
| en-US Hunspell dictionary (`apps/desktop/dictionaries/en-US-10-2.bdic`, with `README_en_US.txt`) | Spellcheck on Linux with no download (Plan 6, Ruling D5). Chromium on Linux checks spelling with Hunspell and would fetch the dictionary from Google; the app copies this one into its profile's `Dictionaries` folder, where Chromium looks first. Source: the `en-US-10-2.bdic` in Electron v45.0.0's `hunspell_dictionaries.zip` release asset (sha256 of the zip `8bb83d71…6322`, of the file `b0d80e6b…1f13`), which Electron builds with Chromium's `convert_dict` from Chromium's `third_party/hunspell_dictionaries/en_US` (en_US Hunspell dictionary version 2020.12.07, from SCOWL, wordlist.aspell.net). License: SCOWL's (Kevin Atkinson's permissive, MIT-like notice; its sources are public domain or under similar notices) and, for the affix data, Geoff Kuenning's Ispell BSD license; the full notice is `README_en_US.txt`, kept beside the dictionary and shipped with it. Data, not code; about 450 KB. |

## Fonts

| Font | License | Why |
|---|---|---|
| Courier Prime (regular, bold, italic, bold italic) | SIL Open Font License 1.1 | The screenplay typeface Drafter lays out for and embeds in PDFs. A font, not code; the OFL permits embedding and redistribution, with its license file kept beside the fonts. The app serves these same files, so the screen and the PDF use identical metrics. |
| Inter Tight (variable, weights 400 to 800; latin and latin-ext WOFF2) | SIL Open Font License 1.1 | The interface typeface, from Drafter's brand. Self-hosted in `apps/web/app/assets/fonts/inter-tight/`, so nothing loads from Google at runtime. A font, not code. |
