# Drafter

**An open-source, local-first, zero-login IDE for screenplays and stage plays.** Write plain-text [Fountain](https://fountain.io) on the left; see the paginated, industry-formatted script on the right, updating as you type.

> [!NOTE]
> **Status: Phase 0, the engine, is under way.** The Fountain parser, the template loader, and the pagination engine are built and tested; the PDF renderer and the CLI are next. There is no app yet. See the [roadmap](#roadmap).

drafter.dev (planned) · [MIT License](LICENSE) · [Changelog](CHANGELOG.md)

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
- [Contributing](#contributing)
- [Design documents](#design-documents)
- [Acknowledgments](#acknowledgments)
- [License](#license)

## The idea

Drafter does for screenwriting what the Inform 7 IDE does for interactive fiction. You work in a plain-text **source** on the left and see the **compiled** result, a paginated script, on the right. Everything Drafter knows about the script is derived from the source. There is no hidden document model, no proprietary file format, no account, and no server.

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

[`samples/`](samples/) holds two short scripts that tell the same story, one as a [screenplay](samples/screenplay.fountain) and one as a [stage play](samples/stage-play.fountain). Neither is complete; together they show how Drafter's Fountain works and how the two formats differ. Notes in double brackets explain each piece of syntax in the source and never print. In the app (Phase 1), both open from the start screen.

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

The engine is a set of framework-free TypeScript packages, published as `@drafter/*`. The web app lives in `apps/web`. Only `render-html` touches the DOM, and only `cm-fountain` depends on CodeMirror.

| Package | What it does | Phase |
|---|---|---|
| `@drafter/fountain` | Fountain text ⇄ syntax tree: lossless printing, fast full reparse | 0 |
| `@drafter/templates` | Template schema, validation, inheritance (`extends`), built-in formats | 0 |
| `@drafter/layout` | Pagination: syntax tree + template → pages | 0 |
| `@drafter/render-pdf` | Pages → PDF, with Courier Prime embedded | 0 |
| `@drafter/cli` | `drafter build` and `drafter check` | 0 (published in 5) |
| `@drafter/cm-fountain` | CodeMirror 6 integration: highlighting, keymap, autocomplete, folding | 1 |
| `@drafter/render-html` | Pages → DOM for the Script tab | 1 |
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
| [0](#phase-0--engine-no-ui) | Engine: parser, templates, pagination, PDF, CLI | **In progress** |
| [1](#phase-1--minimum-ide-first-public-release) | Minimum IDE: the first public release | Planned |
| [2](#phase-2--structure) | Structure: outline, cards, snapshots, spellcheck | Planned |
| [3](#phase-3--formats) | Formats: Final Draft, TV, radio, UK, user templates | Planned |
| [4](#phase-4--craft) | Craft: revisions, clean display mode, table read, offline install | Planned |
| [5](#phase-5--community) | Community: npm packages, CLI, VS Code extension, template gallery | Planned |

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

- The Nuxt 4 single-page app, with Nuxt UI v4 for panes, menus, the command palette, and dialogs.
- The CodeMirror 6 source pane: highlighting driven by the one parser, Tab and Enter conveniences that insert plain Fountain, autocomplete for characters, locations, transitions, and sections, and folding by scene and section.
- The Script tab, with live pagination in a Web Worker.
- The Problems tab, with the starter set of lint rules and the Strict Fountain checks.
- Saving like a desktop app: Save and Save As to a `.fountain` file, a warning before leaving with unsaved changes, and an always-on recovery copy in the browser, with a warning when the browser may clear it.
- Open and save `.fountain` files (save-in-place on Chromium, download elsewhere), and export to PDF and `.txt`.
- A template switcher for screenplay and stage play, with a sample script for each on the start screen.
- Accessibility: keyboard-complete, a rendered pane navigable by headings, and axe-clean.
- Deployment to drafter.dev.

**Done when** a person can write a feature or a play in it, and a screen-reader user can read it.

### Phase 2 — Structure

- Outline, Cards, and Notes tabs, where every change is an edit to the source.
- Condense to outline and expand from outline, plus scene reordering with a keyboard equivalent for every drag.
- Snapshots with a retention schedule, and a Compare view that renders two snapshots as script pages with changed lines marked.
- The Stats tab.
- Spellcheck with nspell and a per-script dictionary that knows your character names.
- The built-in Reference tab.

### Phase 3 — Formats

- Final Draft `.fdx` import and export.
- TV single-camera, TV multi-camera (sitcom), radio and audio drama, and UK/BBC (A4) templates.
- User-added templates, dropped in as JSON, and template export.
- Standalone `.html` export.

### Phase 4 — Craft

- The remaining lint rules.
- Revision marks and colored-page PDF.
- A "clean" display mode that hides Fountain markers without changing the file.
- Table read, using speech synthesis with a different voice per character.
- A PWA install flow and offline dictionary caching.

### Phase 5 — Community

- A template gallery and a docs site.
- The `@drafter/*` packages and `@drafter/cli` published on npm, so `npx @drafter/cli build script.fountain` works without the app.
- A VS Code extension.
- A plugin API, only if there's demand, sandboxed in a Web Worker.

**Not planned:** accounts, a Drafter server, or cloud sync through Drafter. If sync ever arrives, it will be "sync a folder" through your own Dropbox, iCloud, or Syncthing, or peer-to-peer. PDF import is out of scope through Phase 4.

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

You need Node 22 (pinned in `.nvmrc`) and pnpm 10.

```sh
nvm use               # Node 22, from .nvmrc
pnpm install          # also enables the repository's Git hooks
pnpm -r build
pnpm -r test          # every package's tests
pnpm bench            # parse and pagination timings for a feature-length script
pnpm biome check .
```

`pnpm install` points Git at `.githooks/`, so the changelog check runs on every push. In a clone where you skip the install, run `git config core.hooksPath .githooks` once.

Each package has its own README: [`fountain`](packages/fountain/README.md), [`templates`](packages/templates/README.md), and [`layout`](packages/layout/README.md). Choices the design documents leave open are recorded in [`docs/DECISIONS.md`](docs/DECISIONS.md), and work saved for later phases in [`docs/DEFERRED.md`](docs/DEFERRED.md).

The CLI arrives at the end of Phase 0:

```sh
drafter build script.fountain --pdf script.pdf --txt script.txt
drafter check script.fountain    # parse and paginate; exits non-zero on errors
```

## Contributing

**The clean-room rule.** Drafter is a clean-room implementation, built only from the public Fountain specification, the visible XML structure of `.fdx` files, and general software engineering. That is what lets it be MIT-licensed. While working on Drafter, **don't read the source code of other screenwriting applications or Fountain libraries**: Beat, Final Draft, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, and the rest. Reading their documentation, using their apps, and comparing their output are all fine. Don't add Fountain-parsing packages as dependencies.

**Test content is original.** Screenplays are almost never in the public domain, so every fixture is written for this project. Placeholder names and nonsense dialogue are fine; third-party scripts and sample files are not.

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): summary`, for example `feat(fountain): parse dual dialogue`.

**Every push updates [`CHANGELOG.md`](CHANGELOG.md).** Add entries under `[Unreleased]` as you work. The pre-push hook in `.githooks/` rejects a push when none of its commits touch the changelog.

## Design documents

- [High-level architecture](docs/drafter-architecture.md): the vision, the IDE model, the data model, storage, templates, and the phased plan.
- [Technical design](docs/drafter-technical-design.md): how each package works, from the parser and pagination to storage, linting, accessibility, security, and testing.
- [Phase 0 kickoff prompt](docs/drafter-phase0-kickoff-prompt.md): the self-contained brief for building the engine.

The documents are drafts (v0.2) and will change as Phase 0 settles open questions.

## Acknowledgments

- [Fountain](https://fountain.io), the plain-text screenplay format created by John August and Stu Maschwitz, with many contributors.
- The Inform 7 IDE, whose source-and-compiled-story layout inspired the two-pane design.
- [Courier Prime](https://fonts.google.com/specimen/Courier+Prime), the screenplay typeface Drafter targets, released under the SIL Open Font License.

## License

[MIT](LICENSE) © 2026 Christopher Schweda. Courier Prime is distributed under the SIL Open Font License, with its license file alongside the fonts.
