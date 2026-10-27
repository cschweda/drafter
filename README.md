![Drafter: screenplays and stage plays, written in plain text](brand/og-image.svg)

# Drafter

**An open-source, local-first, zero-login IDE for screenplays and stage plays.** Write plain-text [Fountain](https://fountain.io) on the left; see the paginated, industry-formatted script on the right, updating as you type.

> [!NOTE]
> **Status: v0.3.0. You can write at [drafter.dev](https://drafter.dev).** Phase 1's web app is done, apart from its final accessibility pass. The editor and its live pages, a recovery copy kept in your browser as you type, and Save and Open for real `.fountain` files; the command palette, settings, the Problems pane, Screenplay and Stage play templates, plain Markdown documents, export to PDF and plain text, and optional script modules; focus mode, typewriter scrolling, counts, a daily goal, and sprints; a welcome and a guided tour on a first visit; offline use and installing as an app; and help pages. Saving goes straight back to the file in Chrome and Edge on a computer, and downloads a copy elsewhere. Next: a desktop app, then the accessibility pass. The engine from Phase 0 also runs on its own: `pnpm drafter build script.fountain` makes a paginated PDF. See the [roadmap](#roadmap).

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/drafter-ide-light.png">
  <img src="docs/images/drafter-ide-dark.png" alt="Drafter's editor: the Fountain source of a short screenplay on the left, with scene headings, notes, and markers colored, and the same scene laid out as a printed page on the right.">
</picture>

[drafter.dev](https://drafter.dev) · [MIT License](LICENSE) · [Changelog](CHANGELOG.md)

## Contents

- [The idea](#the-idea)
- [Principles](#principles)
- [What makes it different](#what-makes-it-different)
- [How it works](#how-it-works)
- [Samples](#samples)
- [Packages](#packages)
- [Roadmap](#roadmap)
- [Stack](#stack)
- [Storage and browsers](#storage-and-browsers)
- [Development](#development)
- [Clean-room implementation](#clean-room-implementation)
- [Contributing](#contributing)
- [Design documents](#design-documents)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## The idea

Drafter does for screenwriting what the [Inform 7](https://ganelson.github.io/inform-website/) IDE does for interactive fiction. You work in a plain-text **source** on the left and see the **compiled** result, a paginated script, on the right. Everything Drafter knows about the script is derived from the source. There is no hidden document model, no proprietary file format, no account, and no server.

```
┌──────────────────────────────┬──────────────────────────────────┐
│ SOURCE · Fountain            │ SCRIPT · OUTLINE · CARDS · NOTES │
│                              │ PROBLEMS · STATS · REFERENCE     │
│                              │                              7.  │
│ INT. KITCHEN - NIGHT         │  INT. KITCHEN - NIGHT            │
│                              │                                  │
│ MARGARET sits at the table,  │  MARGARET sits at the table,     │
│ not eating.                  │  not eating.                     │
│                              │                                  │
│ MARGARET                     │              MARGARET            │
│ (quietly)                    │           (quietly)              │
│ You said you'd call.         │        You said you'd call.      │
│                              │                                  │
├──────────────────────────────┴──────────────────────────────────┤
│ p. 7 of 94 · 2 problems · saved 2 min ago · US Screenplay       │
└─────────────────────────────────────────────────────────────────┘
```

The left pane is a [CodeMirror 6](https://codemirror.net) editor showing the raw Fountain, markup and all. The right pane is tabbed:

| Tab | What it shows | Arrives in |
|---|---|---|
| **Script** | The paginated, formatted script, built from the same page model as the PDF export. Click a line to jump to it in the source. | Phase 1 |
| **Problems** | Lint results, like a compiler's error list. Click to jump. | Phase 1 |
| **Outline** | Sections, scenes, synopses, scene colors, and page counts. Reorder scenes by drag or keyboard, and the source is rewritten. | Phase 2 |
| **Cards** | An index-card view of scenes with synopsis and color. | Phase 2 |
| **Beat Board** | A free canvas of idea cards to color, link, and move into the outline, with storylines shown in color. | Phase 2 |
| **Notes** | Every `[[note]]` and `/* boneyard */` in one place, linked to its position. | Phase 2 |
| **Stats** | Page count, estimated runtime, dialogue share per character, INT/EXT and DAY/NIGHT breakdowns, pacing. | Phase 2 |
| **Reference** | Fountain syntax and the active template's formatting rules, built in. | Phase 2 |

Either pane can be collapsed, for "just write" or "just read."

## Principles

1. **The source is the truth.** A `.fountain` file is the whole project. Anything Drafter adds, such as scene colors, a script dictionary, or revision marks, is stored in Fountain syntax or in a single metadata block at the end of the file that other Fountain tools ignore. The file stays readable in Beat, Highland, Slugline, BetterFountain, or any text editor.
2. **Local-first, offline-first.** Your work lives in files on your own disk, with a recovery copy in your browser. Drafter is a static site: nothing to pay for, nothing to log into, nothing that can be shut off.
3. **Formats are templates, and templates are data.** US screenplay, stage play, sitcom, radio drama: each is a declarative JSON template that the engine applies. You can add your own.

## What makes it different

- **Source and script side by side, always.** You edit text, not a rich document, and the markup stays visible. Tab and Enter conveniences insert plain Fountain, so the familiar screenwriting-app keystrokes still work.
- **A Problems pane.** A linter for scripts: unclosed notes, cues with no dialogue, near-duplicate character names, and more, with click-to-jump. Drafter reads common Fountain mistakes leniently, and its Strict Fountain checks can rewrite the file into spec form for other tools.
- **Stage plays as a first-class format.** A Dramatists Guild–style template and a documented convention for writing plays in standard Fountain.
- **Lossless outline ⇄ script.** Sections, synopses, and scene headings already live in the file, so outlining and reordering are edits to the source, not a second document that can drift.
- **Runs anywhere with a browser.** Chromebook, Linux, Windows, Mac, or iPad, with no install and no sign-up. It works offline once installed as an app.
- **Accessibility as a feature.** WCAG 2.2 AA from the first public release. A screen-reader user can navigate the rendered script by structure, and every drag-and-drop has a keyboard equivalent.
- **The engine is a library.** The parser and pagination engine are standalone packages, so they also power a CLI (`drafter build script.fountain --pdf script.pdf`), CI checks, and other tools.
- **Table read** (Phase 4). The browser's speech synthesis reads the script aloud with a different voice for each character.

## How it works

```
Fountain source ──parse──▶ syntax tree ──────▶ outline · cards · lint · spellcheck · stats
       ▲                        │
       │                        └──layout(template)──▶ pages ──▶ Script pane · PDF · .txt
       │
       └──── every edit, from any view, is a text change to the source
```

- **One parser, one buffer.** `@drafter/fountain` produces a concrete syntax tree that keeps every block's raw text and surrounding whitespace, so `print(parse(text)) === text` for any input, well-formed or not. Editor highlighting is drawn from the same parse; there is no second grammar to drift out of sync.
- **Edits are text.** Renaming a character, moving a scene, or editing a synopsis on a card all become text changes to the source. Everything is undoable, and the file is always the truth.
- **Pagination is a pure function.** Screenplays use 12-point Courier: 10 characters and 6 lines to the inch. Layout works in characters and lines rather than pixels, so it runs anywhere (a Web Worker in the app, Node in the CLI), and the screen and the PDF come from the same page model.
- **Templates drive the format.** A template sets the page size and margins; each element's indent, width, case, and spacing; dialogue-splitting rules (`(MORE)` and `(CONT'D)`); and a *role map* that assigns roles such as stage direction, act heading, or sound cue to standard Fountain elements, so no new syntax is needed.

## Samples

[`samples/`](samples/) holds two short scripts that tell the same story, one as a [screenplay](samples/screenplay.fountain) and one as a [stage play](samples/stage-play.fountain). Neither is complete; together they show how Drafter's Fountain works and how the two formats differ. Notes in double brackets explain each piece of syntax in the source and never print. In the app (Phase 1), a first visit opens on the screenplay, and both are under Open → Samples.

| | Screenplay | Stage play |
|---|---|---|
| Template | US Screenplay, the default | Stage Play, chosen by the metadata block at the end of the file |
| Scenes | `INT. KITCHEN - NIGHT` | `## Scene 1`, with the set described in a stage direction |
| Acts | `# Act One`, an outline marker that doesn't print | `# Act One`, printed as a centered heading |
| Description | Action, in plain type | Stage directions, indented and in italics |
| Character names | Indented about 3.7 inches from the page edge | Centered |
| A voice from off stage | `(O.S.)` | `(offstage)` |
| Transitions | `CUT TO:` | None; lighting changes are stage directions |
| A speaker continuing after action | `(CONT'D)`, added automatically | Not marked |

## Packages

The engine is a set of framework-free TypeScript packages, published as `@drafter/*`. The web app lives in `apps/web`. Two packages touch the DOM: `render-html` builds it, and `cm-fountain` drives CodeMirror's view, which does. Only `cm-fountain` depends on CodeMirror. The rest run anywhere Node does.

| Package | What it does | Phase |
|---|---|---|
| `@drafter/fountain` | Fountain text ⇄ syntax tree: lossless printing, fast full reparse | 0 |
| `@drafter/templates` | Template schema, validation, inheritance (`extends`), built-in formats | 0 |
| `@drafter/layout` | Pagination: syntax tree + template → pages | 0 |
| `@drafter/render-pdf` | Pages → PDF, with Courier Prime embedded | 0 |
| `@drafter/cli` | `drafter build` and `drafter check` | 0 (published in 5) |
| `@drafter/cm-fountain` | CodeMirror 6 integration: highlighting, keymap, autocomplete, folding | 1 |
| `@drafter/render-html` | Pages → DOM for the Script tab | 1 |
| `@drafter/render-text` | Pages → fixed-width text, as `drafter build --txt` writes it | 1 |
| `@drafter/lint` | Problems-pane rules | 1 (starter set), 4 (the rest) |
| `@drafter/outline` | Condense and expand, scene reordering, synopsis and color edits | 2 |
| `@drafter/spell` | Offline spellcheck (nspell) with a per-script dictionary | 2 |
| `@drafter/stats` | Script statistics | 2 |
| `@drafter/fdx` | Final Draft (`.fdx`) import and export | 3 |

Planned repository layout:

```
drafter/
├── apps/web/      # the Nuxt 4 app for drafter.dev (Phase 1)
├── packages/      # the @drafter/* engine packages
├── templates/     # community templates, as plain JSON
├── samples/       # a sample screenplay and stage play
├── fixtures/      # original test scripts
└── docs/          # design documents
```

## Roadmap

The ordering principle: the reasons to choose Drafter must be on screen at the first public release. That's why the Problems pane, the stage-play template, and accessibility come early, and Final Draft, radio, and TV formats come later.

| Phase | Theme | Status |
|---|---|---|
| [0](#phase-0--engine-no-ui) | Engine: parser, templates, pagination, PDF, CLI | **Done** |
| [1](#phase-1--minimum-ide-first-public-release) | Minimum IDE: the first public release | **Live at drafter.dev** (v0.3.0); the desktop app and the accessibility pass are next |
| [2](#phase-2--structure) | Structure: outline, cards, beat board, storylines, snapshots, spellcheck, screen-reader testing | Planned |
| [3](#phase-3--formats) | Formats: Final Draft and other imports; TV, radio, UK, and novel templates; user templates | Planned |
| [4](#phase-4--craft) | Craft: revisions and production pages, alternate lines, proof mode, clean display mode, table read, offline install | Planned |
| [5](#phase-5--community) | Community: npm packages, CLI, VS Code extension, template gallery | Planned |
| [Later](#later) | Open from and save to Dropbox and Google Drive directly | Planned |

### Phase 0 — Engine (no UI)

The engine as standalone packages, with no UI at all. The phase ends when a CLI turns a `.fountain` file into a correctly paginated PDF and the full test suite passes. If this phase is right, everything after it is UI.

**Builds**

- `@drafter/fountain`: a concrete-syntax-tree parser and printer that reparses in full on every change. Every block keeps its raw text, so printing is lossless. Where the spec's strict reading would garble a common mistake, the parser reads leniently and flags the spot.
- `@drafter/templates`: the template schema and loader (validation, `extends`, inch-to-character conversion) and two built-in templates, **US Screenplay (Feature)** and **Stage Play (Dramatists Guild standard)**.
- `@drafter/layout`: `paginate(doc, template)`, covering word wrap, keep-with-next, dialogue splitting with `(MORE)` and `(CONT'D)`, dual dialogue, scene numbers, forced page breaks, and the title page.
- `@drafter/render-pdf`: PDF output with Courier Prime embedded. It runs in Node and in a browser worker.
- `@drafter/cli`: `drafter build <file> [--pdf] [--txt] [--json] [--template] [--scene-numbers]` and `drafter check <file>`.

**Done when**

- Printing a parse reproduces the input exactly, for 10,000 random strings and every fixture.
- Reparsing after multi-range edits matches a fresh parse across 1,000 random edit sequences.
- Every classification fixture matches its expected element sequence.
- Layout property tests pass: no overfull page, no page that starts blank, no character cue stranded at the bottom of a page, and every line maps back to its source.
- Hand-checked position fixtures match, the PDF's text and page count match the layout, and pagination is deterministic.
- Malformed templates are rejected with a complete list of errors and are never partially applied.
- The CLI writes PDF, text, and JSON output, and `drafter check` fails on an unclosed boneyard.
- Build, tests, and lint are clean from a fresh clone.

### Phase 1 — Minimum IDE (first public release)

**Builds**

- The Nuxt 4 single-page app, with Nuxt UI v4 for panes, menus, the command palette, and dialogs, laid out like the [Inform 7](https://ganelson.github.io/inform-website/) IDE: two facing panes that can each show any tab, a toolbar of round buttons, and a status bar. Dark by default, with a light theme.
- A first visit that opens on a sample screenplay, with a welcome dialog, an optional two-minute guided tour, and New screenplay, New stage play, and Open a file one click away.
- The CodeMirror 6 source pane: highlighting driven by the one parser, Tab and Enter conveniences that insert plain Fountain, autocomplete for characters, locations, transitions, and sections, and folding by scene and section.
- Focus mode, which leaves only the page you're writing on, and typewriter scrolling, which keeps the line you're typing in the middle of the screen.
- A sprint timer, a daily goal, and a count of pages, scenes, words, and running time.
- The Script tab, with live pagination in a Web Worker.
- The Problems tab, with the starter set of lint rules and the Strict Fountain checks.
- Saving like a desktop app: Save and Save As to a `.fountain` file, a warning before leaving with unsaved changes, and an always-on recovery copy in the browser, with a warning when the browser may clear it.
- Open and save `.fountain` files (save-in-place on Chromium, download elsewhere), and export to PDF and `.txt`. On Chrome and Edge, saving in place means a script kept in a Dropbox, Google Drive, or iCloud folder syncs through that service's own app.
- A template switcher for screenplay and stage play, and a sample script for each.
- Phones and tablets, with one pane at a time on a phone.
- Accessibility: keyboard-complete, a rendered pane navigable by headings, and axe-clean.
- Deployment to drafter.dev.

**Done when** a person can write a feature or a play in it, with the script built for screen readers to read by its structure and checked by automated tests. Testing with NVDA and VoiceOver follows in Phase 2. The [Phase 1 design](docs/drafter-phase1-design.md) has the details.

### Phase 2 — Structure

- Outline, Cards, and Notes tabs, where every change is an edit to the source.
- A Beat Board: a free canvas of idea cards to color, link, and move into the outline. The ideas live in the file as Fountain.
- Storylines: tag scenes with A, B, and C plots, each in its own color, and see them as lanes along the outline's page timeline, on the cards, and in the script's margin.
- Condense to outline and expand from outline, plus scene reordering with a keyboard equivalent for every drag.
- Snapshots with a retention schedule, and a Compare view that renders two snapshots as script pages with changed lines marked.
- The Stats tab, including screen time per character and who shares scenes with whom.
- Writing statistics by day, kept on your device.
- Spellcheck with nspell and a per-script dictionary that knows your character names.
- The built-in Reference tab.
- Testing with NVDA and VoiceOver.
- A script map: every scene as a block sized by its length beside the editor, colored by INT/EXT, day or night, or storyline, and clicked to jump there.
- A pacing view: scene lengths and the balance of dialogue and action along the page timeline, with optional structure guides (three-act, Save the Cat, five-act) laid over it as suggestions, never rules.
- A character-by-scene grid: who is in each scene, as a heat map, with each character's share of the dialogue, so a character who vanishes for 40 pages shows.
- Scene goals: optional goal, conflict, outcome, and value shift for each scene, kept in the file as Fountain notes and shown on the cards and the map.
- Setups and payoffs: mark a setup, link it to its payoff, and see the setups that never pay off.
- Reader notes, with no account: a reader opens your script at drafter.dev in a reader mode, adds comments to lines or selections (their name, a category and colour, replies), and sends them back as a file: the `.fountain` itself, the comments kept as Fountain notes any Fountain tool can show. You add a reader's file to your current draft even after you kept writing: each comment finds its place by its quote, its context, and its scene, a preview says how many matched, and none is ever dropped. You reply and resolve them in the margin, filter by reader or category, and send your replies back the same way. Notes typed by hand (`[[Name: comment]]`) merge too. Nothing passes through a server.
- Note categories and status (open, resolved) in the Notes tab.

### Phase 3 — Formats

- Final Draft `.fdx` import and export.
- Import from Highland, Fade In, and Celtx.
- TV single-camera, TV multi-camera (sitcom), radio and audio drama, and UK/BBC (A4) templates, and a template for novels or graphic novels.
- User-added templates, dropped in as JSON, and template export.
- For plays: French scenes, who is on stage at every moment (entrances and exits), and a doubling chart of roles one actor could play because they never share the stage.
- Standalone `.html` export.
- PDF export with notes in the margin, or a clean copy, and a watermark and header for drafts you send out (for example "CONFIDENTIAL" or the reader's name).
- A self-contained reader file: one `.html` a reader opens in any browser to read and comment, for readers who won't visit a site.

### Phase 4 — Craft

- The remaining lint rules.
- Revision marks and colored-page PDF.
- Production revisions: locked pages (12A), scenes marked OMITTED, and scene numbers that start anywhere.
- Alternate versions of a line, switchable in place.
- A "clean" display mode that hides Fountain markers without changing the file.
- Table read, using speech synthesis with a different voice per character.
- A character pass: one character's lines alone, with their cues and context, to read a voice straight through.
- Story order and script order: arrange the scenes of a nonlinear script in story time, and compare the two orders.
- A breakdown report: locations, time of day, and cast for each scene, to export for production.
- Accept or reject a co-writer's edited copy change by change, from Compare.
- One character's dialogue, exported for an actor.
- A PWA install flow and offline dictionary caching.

### Phase 5 — Community

- A template gallery and a docs site.
- The `@drafter/*` packages and `@drafter/cli` published on npm, so `npx @drafter/cli build script.fountain` works without the app.
- A VS Code extension.
- A plugin API, only if there's demand, sandboxed in a Web Worker.

### Later

- Open from and save to Dropbox and Google Drive directly. You sign in with Dropbox or Google in their own window, never with Drafter, and nothing passes through a Drafter server.

**Not planned:** accounts, a Drafter server, or sync through Drafter. From Phase 1, a script saved in a folder that Dropbox, Google Drive, iCloud, or Syncthing keeps in sync syncs like any other file, in browsers that save in place. PDF import is out of scope through Phase 4.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict, ESM) in pnpm workspaces |
| App shell | Nuxt 4 as a single-page app, with Nuxt UI v4 |
| Source editor | CodeMirror 6, highlighted by `@drafter/fountain` rather than a second grammar |
| Script rendering | HTML and CSS with Courier Prime, from the same page model as the PDF |
| PDF | pdf-lib |
| Storage | IndexedDB (via Dexie) and the File System Access API |
| Offline | Progressive Web App |
| Spellcheck | nspell with offline Hunspell dictionaries |
| Tests | Vitest and fast-check for the engine, Playwright for the app |
| Deploy | Static site on Netlify |

## Storage and browsers

Drafter never needs an account, and it saves like a desktop app. Your script is a `.fountain` file: Save writes it, and Drafter warns you before you leave with unsaved changes. Behind that, your browser keeps a recovery copy of the script at all times, updated as you type, so a crash or a closed tab loses almost nothing.

| | Chrome, Edge, and other Chromium browsers | Firefox | Safari |
|---|---|---|---|
| Recovery copy in the browser | ✅ | ✅ | ✅ |
| Save back to the file you opened | ✅ | Downloads a new copy | Downloads a new copy |
| Warning before leaving with unsaved changes | ✅ | ✅ | ✅ |
| Import by drag-and-drop or file picker | ✅ | ✅ | ✅ |
| Export by download | ✅ | ✅ | ✅ |

Brave is the exception among Chromium browsers: it ships with the File System Access API turned off, so it saves by download, like Firefox and Safari. The leave warning is a desktop-browser feature; phones and tablets don't show it reliably, which is one more reason the recovery copy is always on.

Drafter tells you when the recovery copy isn't safe, because the browser blocks storage or may clear it. Safari, for example, can clear storage for websites you haven't used recently; installing Drafter as an app (Add to Dock, or Add to Home Screen) protects it. Every saved file is a complete `.fountain`, so any copy is a full backup. The full policy is in the [architecture document, §6](docs/drafter-architecture.md#6-storage-and-files-no-logins-ever).

## Development

You need Node 22.13 or later (`.nvmrc` pins Node 22) and pnpm 10.

```sh
nvm use               # Node 22, from .nvmrc
pnpm install          # also enables the repository's Git hooks
pnpm -r build
pnpm -r test          # every package's tests
pnpm bench            # parse and pagination timings for a feature-length script
pnpm biome check .
pnpm dev              # the app, at http://localhost:3000
pnpm e2e              # builds the app from clean, as Netlify would, and runs its browser tests
```

The browser tests need Playwright's browsers, installed once with `pnpm --filter @drafter/web exec playwright install chromium firefox webkit`.

`pnpm install` points Git at `.githooks/`, so the changelog check runs on every push. In a clone where you skip the install, run `git config core.hooksPath .githooks` once.

Each package has its own README: [`fountain`](packages/fountain/README.md), [`templates`](packages/templates/README.md), [`layout`](packages/layout/README.md), [`render-pdf`](packages/render-pdf/README.md), [`render-html`](packages/render-html/README.md), [`render-text`](packages/render-text/README.md), [`lint`](packages/lint/README.md), [`cm-fountain`](packages/cm-fountain/README.md), and [`cli`](packages/cli/README.md). Choices the design documents leave open are recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md), and work saved for later phases in [`docs/DEFERRED.md`](docs/DEFERRED.md).

After a build, the CLI runs from the repository root:

```sh
pnpm drafter build samples/screenplay.fountain                 # writes samples/screenplay.pdf
pnpm drafter build samples/stage-play.fountain --txt -         # fixed-width text to the terminal
pnpm drafter check samples/stage-play.fountain                 # diagnostics; exits 1 on any error
```

The stage play picks its own template from the metadata block at the end of the file; `--template` overrides it. The [CLI's README](packages/cli/README.md) has every option.

**Deployment.** drafter.dev deploys on Netlify from this repository, with the site's package directory set to `apps/web`. That directory's [`netlify.toml`](apps/web/netlify.toml) sets the build command, the publish directory, and Node 22. Each build writes a `_headers` file whose content security policy allows only the inline scripts that build produced.

## Clean-room implementation

Drafter is written from scratch, from public specifications, without reading anyone else's implementation. This section explains what that means, why it works, why it matters for a project like this, and what it asks of everyone who works on Drafter from here on. It describes the project's practice; it isn't legal advice.

### What it means

A clean-room implementation keeps two things apart: *what a program has to do*, which comes from public written sources, and *how the code does it*, which comes only from the people writing it. Because nobody working on the code reads another implementation's source, nothing in it is copied from one.

Drafter's permitted sources:

| Source | Used for |
|---|---|
| The [Fountain specification](https://fountain.io/syntax) | What each element of a script is, and how it's written in plain text |
| Industry formatting conventions for screenplays and stage plays | Margins, indents, `(MORE)` and `(CONT'D)`, title pages, and the rest of what a page looks like |
| General software engineering | Parsing, line breaking, pagination, and browser storage, all common knowledge |
| `.fdx` files a user owns, read as plain XML | Final Draft import and export (Phase 3) |
| Other applications, used as a writer uses them | Their documentation, and comparing their output with Drafter's |
| [Courier Prime](https://fonts.google.com/specimen/Courier+Prime) | The typeface: a font under the SIL Open Font License, not code |

And what's excluded:

- **The source code of other screenwriting applications and Fountain libraries**: Beat, Final Draft, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, and any other. Not to copy, not to adapt, and not to read for ideas.
- **Their packages as dependencies.** Drafter installs no Fountain parser and no screenwriting library. [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md) lists every dependency and why it's there.
- **Their test suites, sample files, and scripts.** Every fixture in this repository was written for it.

### Why it works

Copyright protects a program's *expression*, the code as someone wrote it. It doesn't protect the ideas, methods, or formats the code works with; US law says so directly ([17 U.S.C. § 102(b)](https://www.law.cornell.edu/uscode/text/17/102)), and most other countries draw the same line. Fountain was published so that any tool could read and write it, and screenplay conventions such as the standard margins and `(MORE)` at the foot of a split speech belong to the craft, not to any product. Anyone may implement them.

A claim of copying turns on whether code was copied or created independently. Code written only from public specifications, by people who never saw the other source, is independent by construction, and a clean room leaves a record that shows it. The classic case is the IBM PC BIOS: in the 1980s, Phoenix Technologies had one team write down what IBM's BIOS did and a second team, who had never seen IBM's code, write a compatible BIOS from that description alone. Compatible PCs from many makers followed.

Drafter's equivalent of the first team's description is its design documents. The [technical design](docs/drafter-technical-design.md) opens with a clean-room statement and derives every rule from the specification, the conventions, and general engineering; the code is written from the design. Where the specification is silent, the gap is filled by a decision made on the merits and recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md), not by looking up what another implementation does. The layout fixtures go a step further: their page positions were worked out by hand from the written rules, with the arithmetic beside each one, and reviewed before any layout code existed. The repository is its own record of independent work.

### Why it matters

- **The license means what it says.** Drafter is MIT-licensed, so anyone can use, change, embed, or sell it. That promise holds only if none of the code is borrowed. Code taken from a copyleft project brings that project's license with it (Beat, for example, is GPL-3, and borrowing from it would make Drafter GPL too), and code taken from a commercial product is code nobody licensed to us. Either could force a rewrite or a removal years later, after other projects had come to depend on Drafter.
- **The engine is meant to be reused.** `@drafter/fountain` and `@drafter/layout` are libraries as well as the app's engine: the CLI uses them, and so can CI checks, other editors, and tools nobody has thought of yet. People who build on them need to trust where the code came from.
- **Behavior stays explicit.** A port of another program inherits its quirks without saying so. Writing from the specification forces every choice into the open, where it can be reviewed, tested, and changed on purpose. `DECISIONS.md` exists because of this rule, and the project is better for it.
- **It respects other projects.** Drafter works with other Fountain tools through the shared format, the way the format's authors intended, without taking their work.

### What it means for future development

The rule doesn't end with Phase 0. It covers every contributor, every package, and every phase.

- **Work from the specification, never from another implementation.** That includes a quick look at how another app splits dialogue or detects a title page. If you've studied another screenwriting application's source in the past, say so in your pull request, so a reviewer can take extra care, and write from the specification, not from memory.
- **When the specification is silent, decide and write it down.** Add a dated entry to `docs/DECISIONS.md`, and a fixture or test that pins the behavior. Comparing Drafter's output with another app's is fine; reproducing its code or its test cases isn't.
- **Expect small differences from other tools.** Where the specification is ambiguous, Drafter may read a file differently from another tool. That's a documented decision, not a bug to fix by imitation, and the file stays standard Fountain either way.
- **Final Draft support comes from the files.** Phase 3's `.fdx` import and export will be built from the XML structure of files a user owns, not from another program's converter.
- **Dependencies stay out of the domain.** No Fountain parsers and no screenwriting libraries, ever. A new dependency gets an entry in `docs/DEPENDENCIES.md` first, saying why it's needed and confirming it isn't screenwriting-related.
- **Test content stays original.** Write new fixtures. Don't paste scenes from real scripts, published or not; screenplays are almost never in the public domain.
- **AI coding assistants follow the same rule.** They've learned from a great deal of public code. If you use one, give it the clean-room instructions (the [Phase 0 kickoff prompt](docs/drafter-phase0-kickoff-prompt.md) shows how), and review what it writes as you would any other contribution.

## Contributing

**The clean-room rule.** While working on Drafter, **don't read the source code of other screenwriting applications or Fountain libraries**, and don't add their packages as dependencies. Reading their documentation, using their apps, and comparing their output are all fine. [Clean-room implementation](#clean-room-implementation) explains what's allowed, why, and how to handle the cases in between.

**Test content is original.** Screenplays are almost never in the public domain, so every fixture is written for this project. Placeholder names and nonsense dialogue are fine; third-party scripts and sample files are not.

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): summary`, for example `feat(fountain): parse dual dialogue`.

**Every push updates [`CHANGELOG.md`](CHANGELOG.md).** Add entries under `[Unreleased]` as you work. The pre-push hook in `.githooks/` rejects a push when none of its commits touch the changelog.

## Design documents

- [High-level architecture](docs/drafter-architecture.md): the vision, the IDE model, the data model, storage, templates, and the phased plan.
- [Technical design](docs/drafter-technical-design.md): how each package works, from the parser and pagination to storage, linting, accessibility, security, and testing.
- [Phase 0 kickoff prompt](docs/drafter-phase0-kickoff-prompt.md): the self-contained brief for building the engine.
- [Phase 1 design](docs/drafter-phase1-design.md): the first public release, from the first visit and its guided tour to the editor, saving, export, focus mode, and phones, with mockups in [`docs/phase1/`](docs/phase1/).

The architecture and technical design are drafts (v0.2) and will change as each phase settles open questions.

## Acknowledgments

- [Fountain](https://fountain.io), the plain-text screenplay format created by John August and Stu Maschwitz, with many contributors.
- The [Inform 7](https://ganelson.github.io/inform-website/) IDE, Graham Nelson's environment for writing interactive fiction. Drafter borrows none of the interactive fiction itself (the parser games in the line of Zork and Enchanter). What it takes as inspiration is the IDE: two facing panes, with plain source on one side and the result on the other, tabs that either pane can show, and how easy that makes it to write, see the outcome, and go straight back to the line that produced it.
- [Courier Prime](https://fonts.google.com/specimen/Courier+Prime), the screenplay typeface Drafter targets, released under the SIL Open Font License.
- [Inter Tight](https://fonts.google.com/specimen/Inter+Tight), the typeface of Drafter's wordmark and interface, also under the SIL Open Font License.

## License

[MIT](LICENSE) © 2026 Christopher Schweda. Courier Prime and Inter Tight are distributed under the SIL Open Font License, each with its license file alongside the fonts. The logo, icons, and share image are in [`brand/`](brand/).
