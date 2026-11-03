# Developing Drafter

How Drafter is built, how to build it yourself, and how to help. The [README](../README.md) is the front door; this page has the detail. [Technical details](technical-details.md) tells the same story in plain words, with diagrams, and the [roadmap](ROADMAP.md) says what comes next.

## Contents

- [How it works](#how-it-works)
- [Samples](#samples)
- [Packages](#packages)
- [Stack](#stack)
- [Storage and browsers](#storage-and-browsers)
- [Development](#development)
- [Clean-room implementation](#clean-room-implementation)
  - [Clean-room verification](#clean-room-verification)
- [Contributing](#contributing)
- [Test counts and diagrams](#test-counts-and-diagrams)
- [Design documents](#design-documents)

## How it works

```
Fountain source ──parse──▶ syntax tree ──────▶ outline · cards · lint · spellcheck · stats
       ▲                        │
       │                        └──layout(template)──▶ pages ──▶ Script pane · PDF · .txt
       │
       └──── every edit, from any view, is a text change to the source
```

- **One parser, one buffer.** `@drafter/fountain` produces a concrete syntax tree that keeps every block's raw text and surrounding whitespace, so `print(parse(text)) === text` for any input, well-formed or not. Editor highlighting comes from the same parse; there is no second grammar to drift out of sync.
- **Edits are text.** Sections, synopses, and scene headings already live in the file, so outlining is not a second document that can drift: renaming a character, moving a scene, or editing a synopsis on a card all become text changes to the source. Everything is undoable, and the file is always the truth.
- **Pagination is a pure function.** Screenplays use 12-point Courier: 10 characters and 6 lines to the inch. Layout works in characters and lines rather than pixels, so it runs anywhere (a Web Worker in the app, Node in the CLI), and the screen and the PDF come from the same page model.
- **Templates drive the format.** A template sets the page size and margins; each element's indent, width, case, and spacing; dialogue-splitting rules (`(MORE)` and `(CONT'D)`); and a *role map* that assigns roles such as stage direction, act heading, or sound cue to standard Fountain elements, so no new syntax is needed.

## Samples

[`samples/`](../samples/) has three sets:

- **The same story twice**, as a [screenplay](../samples/screenplay.fountain) and a [stage play](../samples/stage-play.fountain), to show how Drafter's Fountain works and how the two formats differ. Neither is complete. Notes in double brackets explain each piece of syntax in the source and never print. In the app, a first visit opens on the screenplay, and both are under Open → Samples.
- **Two synthetic Final Draft files** in [`samples/fdx/`](../samples/fdx/), written by hand with invented values (not made in Final Draft), to try Open on. The app doesn't list them.
- **Three much smaller ones**, written for the app, under Help → **Sample scripts**: a screenplay and a stage play, each under a page (the screenplay uses every Fountain element once; the stage play its acts, scenes, cues, and stage directions), and a Markdown document. Each opens as a new script of your own, leaving the one you had open as it was. Below them are the two guided starters, a first screenplay and a first stage play that teach Fountain as you read.

How the two formats differ:

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

The engine is a set of framework-free TypeScript packages, published as `@drafter/*`. Only `cm-fountain` depends on CodeMirror. Two packages touch the DOM (`render-html` builds it, and `cm-fountain` drives CodeMirror's view); the rest run anywhere Node does.

| Package | What it does | Phase |
|---|---|---|
| `@drafter/fountain` | Fountain text ⇄ syntax tree: lossless printing, fast full reparse | 0 |
| `@drafter/templates` | Template schema, validation, inheritance (`extends`), built-in formats | 0 |
| `@drafter/layout` | Pagination: syntax tree + template → pages | 0 |
| `@drafter/render-pdf` | Pages → PDF, with Courier Prime embedded; Markdown documents in Inter Tight | 0 (Markdown documents in 2) |
| `@drafter/cli` | `drafter build` (PDF, HTML, text, JSON), `drafter check`, and `drafter convert` (Final Draft, Highland, and Fade In to Fountain) | 0 (published in 5; `convert` in v0.20.0) |
| `@drafter/cm-fountain` | CodeMirror 6 integration: highlighting, keymap, autocomplete, folding | 1 |
| `@drafter/render-html` | Pages → DOM for the Script tab | 1 |
| `@drafter/render-html-file` | Export as HTML and EPUB: a script or a Markdown document as one self-contained, offline `.html` file, dark by default, with a light switch, or as an e-book | 2 (built in v0.22.0) |
| `@drafter/render-text` | Pages → fixed-width text, as `drafter build --txt` writes it | 1 |
| `@drafter/lint` | Problems-pane rules | 1 (starter set), 2 (setups and payoffs, and duplicate scene fields), 4 (the rest) |
| `@drafter/notes` | Keyed notes (`[[Head: body]]`): reading and writing them, scene headers' field order, categories, and the text helpers structural edits share | 2 (built in Plan B) |
| `@drafter/compare` | The line diff behind Compare: what changed between two versions of a script, and where it sits in the newer one; the rows, word marks, folds, and scene groups of the Changes view | 2 (built in Plan C; the Changes view in version history) |
| `@drafter/history` | Version history and Drafts and Cuts: every version of one scene, what left a text between two versions (scenes, sections, and passages), and the draft and cuts files: their names, writing, reading, and merging | 2 (built in version history) |
| `@drafter/outline` | Condense and expand, scene reordering, synopsis, color, and Scene details edits, the Structure strip's geometry, each scene's timing, and the whole script as Markdown | 2 (built in Plans A and B, and the Structure strip) |
| `@drafter/spell` | Offline spellcheck (nspell): the words worth checking, the two bundled English dictionaries, and a per-script dictionary | 2 (built in Plan D) |
| `@drafter/fdx` | Final Draft (`.fdx`) import and export, and Open Screenplay Format import | 2 (built in Plan FD; OSF in v0.19.0) |
| `@drafter/archive` | Highland and Fade In files: a strict read-only zip reader, and the script inside each; and a small stored-zip writer for the EPUB export | 2 (built in v0.19.0; the writer in v0.22.0) |
| `@drafter/cast` | Who is in each scene and where: presence (a name in the action counts), locations, each character's screen time, dialogue share, and long absences, the character grid, and whole-percent shares that add up to 100 | 2 (built in Plan E, part 1) |
| `@drafter/story-map` | The Story map: a script's model of acts, scenes, places, people, lines of dialogue, and gaps, drawn as one dark HTML page with no script, its fonts inside | 2 (built in v0.24.1) |
| `drafter-mcp` | Drafter for Claude: a local, read-only MCP server an AI app starts, with ten tools and seven prompts over the scripts, drafts, and cuts in the folders named with `--folder`; one bundled file on npm (unscoped, since the `@drafter` scope is someone else's) and on each GitHub Release. See its [README](../packages/mcp/README.md) | 2 (built in v0.24.2) |
| `@drafter/markdown` | Markdown documents: the parser (CommonMark with GitHub's footnotes), footnote numbering, the title, the word count, and a document's trailing metadata comment, shared by the Preview and the PDF (which takes only the footnote walk, `@drafter/markdown/notes`, and never loads the parser) | 2 (moved out of the app in v0.22.0) |
| `@drafter/stats` | Script statistics | 2 (planned) |

Repository layout:

```
drafter/
├── apps/web/      # the Nuxt 4 app for drafter.dev
├── apps/desktop/  # the Electron desktop app for Linux, Windows, and macOS
├── packages/      # the @drafter/* engine packages
├── modules/       # the optional script modules
├── samples/       # the sample scripts
├── fixtures/      # original test scripts
├── brand/         # the logo, icons, and share image
└── docs/          # design documents
```

A `templates/` folder for community templates, as plain JSON, is planned.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript (strict, ESM) in pnpm workspaces |
| App shell | Nuxt 4 as a single-page app, with Nuxt UI v4 |
| Source editor | CodeMirror 6, highlighted by `@drafter/fountain` rather than a second grammar |
| Script rendering | HTML and CSS with Courier Prime, from the same page model as the PDF |
| PDF | pdf-lib, with fontkit for the embedded fonts |
| Storage | IndexedDB (via Dexie) and the File System Access API |
| Offline | Progressive Web App |
| Spellcheck | nspell with offline Hunspell dictionaries |
| Tests | Vitest and fast-check for the engine, Playwright for the app |
| Deploy | Static site on Netlify |

## Storage and browsers

Drafter never needs an account, and it saves like a desktop app. Your script is a `.fountain` file: Save writes it, and Drafter warns you before you leave with unsaved changes. Behind that, your browser keeps a recovery copy at all times, updated as you type, so a crash or a closed tab loses almost nothing.

| | Chrome, Edge, and other Chromium browsers | Firefox | Safari |
|---|---|---|---|
| Recovery copy in the browser | ✅ | ✅ | ✅ |
| Save back to the file you opened | ✅ | Downloads a new copy | Downloads a new copy |
| Warning before leaving with unsaved changes | ✅ | ✅ | ✅ |
| Import by drag-and-drop or file picker | ✅ | ✅ | ✅ |
| Export by download | ✅ | ✅ | ✅ |

- **Brave** is the exception among Chromium browsers: it ships with the File System Access API turned off, so it saves by download, like Firefox and Safari.
- **The leave warning** is a desktop-browser feature; phones and tablets don't show it reliably, which is one more reason the recovery copy is always on.
- **When the recovery copy isn't safe**, because the browser blocks storage or may clear it, Drafter tells you. Safari, for example, can clear storage for websites you haven't used recently; installing Drafter as an app (Add to Dock, or Add to Home Screen) protects it.
- **Every saved file is a complete `.fountain`**, so any copy is a full backup.

The full policy is in the [architecture document, §6](drafter-architecture.md#6-storage-and-files-no-logins-ever).

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

- **Browser tests** need Playwright's browsers, installed once with `pnpm --filter @drafter/web exec playwright install chromium firefox webkit`.
- **Git hooks:** `pnpm install` points Git at `.githooks/`, so the changelog check runs on every push. In a clone where you skip the install, run `git config core.hooksPath .githooks` once.
- **Package READMEs:** [`fountain`](../packages/fountain/README.md), [`templates`](../packages/templates/README.md), [`layout`](../packages/layout/README.md), [`render-pdf`](../packages/render-pdf/README.md), [`render-html`](../packages/render-html/README.md), [`render-html-file`](../packages/render-html-file/README.md), [`render-text`](../packages/render-text/README.md), [`lint`](../packages/lint/README.md), [`cm-fountain`](../packages/cm-fountain/README.md), [`cli`](../packages/cli/README.md), [`notes`](../packages/notes/README.md), [`compare`](../packages/compare/README.md), [`outline`](../packages/outline/README.md), [`spell`](../packages/spell/README.md), [`fdx`](../packages/fdx/README.md), [`archive`](../packages/archive/README.md), [`markdown`](../packages/markdown/README.md), [`story-map`](../packages/story-map/README.md), and [`mcp`](../packages/mcp/README.md) (Drafter for Claude).
- **Decisions and deferred work:** choices the design documents leave open are recorded in [`docs/DECISIONS.md`](DECISIONS.md), and work saved for later phases in [`docs/DEFERRED.md`](DEFERRED.md).

After a build, the CLI runs from the repository root:

```sh
pnpm drafter build samples/screenplay.fountain                 # writes samples/screenplay.pdf
pnpm drafter build samples/stage-play.fountain --txt -         # fixed-width text to the terminal
pnpm drafter check samples/stage-play.fountain                 # diagnostics; exits 1 on any error
pnpm drafter convert ~/scripts --out ~/fountain                # every .fdx, .highland, .fadein to .fountain
```

The stage play picks its own template from the metadata block at the end of the file; `--template` overrides it. The [CLI's README](../packages/cli/README.md) has every option.

**Deployment.** drafter.dev deploys on Netlify from this repository, with the site's package directory set to `apps/web`. That directory's [`netlify.toml`](../apps/web/netlify.toml) sets the build command, the publish directory, and Node 22. Each build writes a `_headers` file whose content security policy allows only the inline scripts that build produced.

## Clean-room implementation

Drafter is written from scratch, from public specifications, without reading anyone else's implementation. A clean-room implementation keeps two things apart: *what a program has to do*, which comes from public written sources, and *how the code does it*, which comes only from the people writing it. Because nobody working on the code reads another implementation's source, nothing in it is copied from one. It describes the project's practice; it isn't legal advice.

- **Permitted:** the [Fountain specification](https://fountain.io/syntax), industry formatting conventions for screenplays and stage plays, general software engineering, `.fdx` files a user owns (read as plain XML), the public descriptions of the `.highland` and `.fadein` packages and the published Open Screenplay Format specification, other applications used as a writer uses them (their documentation, and comparing their output with Drafter's), and the Courier Prime typeface.
- **Excluded:** the source code of other screenwriting applications and Fountain libraries (Beat, Final Draft, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, and any other), not to copy, adapt, or read for ideas; their packages as dependencies; and their test suites, sample files, and scripts.
- **Why:** Drafter's MIT license holds only if none of the code is borrowed, and the engine is meant to be reused by people who need to trust where it came from.
- **From here on:** the rule covers every contributor, every package, and every phase, AI coding assistants included. Where the specification is silent, the decision goes in [`docs/DECISIONS.md`](DECISIONS.md), with a test that pins it.

[Clean-room implementation](clean-room.md) has the whole statement: the permitted sources and what each is used for, why it works in law (and the IBM PC BIOS precedent), why it matters, and what it asks of future development, Final Draft support included.

### Clean-room verification

**The short version: Drafter uses ordinary open-source libraries, but no code from any other screenwriting or playwriting application, and no Fountain library.**

Drafter was audited against these rules on 27 October 2026, and again on 1 November 2026, over everything added since (v0.3.1 to v0.24.0). Both found no code from screenwriting software, no Fountain or screenwriting package among the 1,200 installed, no copied code from anywhere, general-purpose libraries only, each declared in [`docs/DEPENDENCIES.md`](DEPENDENCIES.md) with no GPL code in the app, and original test content; the second also found that every Final Draft, Highland, and Fade In test file is synthetic, and listed two small fixes. Most of Drafter's code was written by AI coding assistants working under these rules and reviewed by the maintainer. An audit finds copying that leaves traces; it can't prove that something was never read or remembered, or rule out what an AI model learned in training.

The [summary of findings](clean-room.md#clean-room-verification) names the commits audited. The full audits, [1 November 2026](clean-room-audit-2026-11-01.md) and [27 October 2026](clean-room-audit-2026-10-27.md), have the method and evidence for each check, and [Audits](AUDITS.md) lists every audit, security and clean-room, newest first.

## Contributing

**The clean-room rule.** While working on Drafter, **don't read the source code of other screenwriting applications or Fountain libraries**, and don't add their packages as dependencies. Reading their documentation, using their apps, and comparing their output are all fine. [Clean-room implementation](clean-room.md) explains what's allowed, why, and how to handle the cases in between.

**Test content is original.** Screenplays are almost never in the public domain, so every fixture is written for this project. Placeholder names and nonsense dialogue are fine; third-party scripts and sample files are not.

**Commits** follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/): `type(scope): summary`, for example `feat(fountain): parse dual dialogue`.

**Every push updates [`CHANGELOG.md`](../CHANGELOG.md).** Add entries under `[Unreleased]` as you work. The pre-push hook in `.githooks/` rejects a push when none of its commits touch the changelog.

**Releasing.** In this order, and never by hand before the tag:

1. On `main`, set the version in every versioned `package.json` (including `apps/desktop/package.json`, which names the desktop packages), move the `[Unreleased]` entries into a section for the version and date, add the release's plain-language items to What's new (`apps/web/app/whats-new/entries.ts`, `banner: true` for a big change or a security update), run the release gates (below) and `pnpm test-counts` (below) after the e2e build, copy its numbers into the README's [Testing](../README.md#testing) section, and commit. Don't push `main` yet: pushing it deploys drafter.dev, whose Saving page links to the latest release.
2. Push the tag first: `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag must match `apps/desktop/package.json`'s version, or the workflow stops.
3. Let `.github/workflows/desktop.yml` make the release. After every check passes, its `publish` job creates the GitHub Release as a draft, uploads the AppImage, the `.deb`, `latest-linux.yml`, the two Windows installers, `latest.yml`, and Drafter for Claude's `drafter-mcp-<version>.js` with its `.sha256` (built, and run as an AI app runs it, in the Linux job), checks them, and only then publishes it. It waits for the Linux job and both Windows jobs; if any of them fails, nothing is published. Once it is published, push `main`, so the site's download link never points at a release without packages.

Every pull request, Dependabot's included, runs `.github/workflows/checks.yml`: lint, the build, every package's typecheck and tests, the trap documents, the web typecheck and unit tests, the desktop shell's unit tests, and the browser tests in Chromium, on macOS and on Linux, each split across four runners (`--shard`), with one `e2e` check over the checks job and the eight shards; all of it is required. Packaging the desktop app stays in `desktop.yml`. Tests with a fixed time limit in their name ("within 3 seconds", "under 50 ms", and in the browser tests "long task", "quickly", "budget") are skipped there, since a shared runner is slower; the release gates run them. A browser test that has to wait for the app waits for what it means, never for time: the Inspector's header and the element bar are `data-fitting` while they fit, a setting is in `stored(page)` before a reload, and a key with Shift is pressed by its code (`ControlOrMeta+Shift+KeyZ`), as a keyboard sends it.
4. Then edit the release's notes on GitHub (the workflow writes a one-line placeholder).
5. Then put Drafter for Claude on npm, from `main` on your own machine: `./publish.sh --dry-run`, then `./publish.sh`. It checks the release exists and passed, builds the tag's commit in a separate worktree, stops unless the staged `drafter-mcp.js` is byte for byte the Release's file, installs and runs the packed package, and asks you to type the version and then to approve the publish on npm (a link to open in a browser on any device, or npm's code on some accounts). It never commits, tags, or pushes. Never run it, or `npm publish`, without `--dry-run` except to publish.

Don't create the release on GitHub (or with `gh release create`) before the workflow does: the workflow never uploads to a release that is already published, so a hand-made release would be left with no packages and no update feed, and the desktop apps would find no update.

## Test counts and diagrams

**The release gates** run every test once, with its time limit, on a real machine, before the release commit. Every one must pass:

```bash
set -e -o pipefail
pnpm install
pnpm -r --filter "./packages/*" build
pnpm check
pnpm -r --filter "./packages/*" typecheck
pnpm -r --workspace-concurrency=1 --filter "./packages/*" test
pnpm --filter @drafter/web typecheck
pnpm --filter @drafter/web exec vitest run
pnpm --filter @drafter/desktop test
pnpm vitest run --project trap
pnpm bench
pnpm --filter @drafter/web e2e
```

**`pnpm test-counts`** (`scripts/test-counts.mjs`) writes `apps/web/app/about/test-counts.json`, which the [What is Drafter?](https://drafter.dev/docs/what-is-drafter/#numbers) page shows with the version and date. It runs every Vitest project once with the JSON reporter (a run is the only way to count the tests a suite makes as it goes, such as one for each trap at each way in) and stops if any fails; it lists the browser tests (once, and in each of the five projects) and the desktop app's end-to-end tests with Playwright's `--list`, without running them; and it counts the trap documents and their checks from `fixtures/trap/MANIFEST.md`. Playwright reads the built site to list its tests, so build the packages (`pnpm -r build`) and the e2e site (`DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm --filter @drafter/web build`) first. Run it at each release, after the version is set, and commit the file with the release.

**`pnpm diagrams`** (`scripts/diagrams.mjs`) draws the Mermaid diagrams in [`docs/diagrams/`](diagrams/) as SVG, one for each theme, in `apps/web/app/assets/diagrams/`, with their sizes in `sizes.json`. The What is Drafter? page shows those files as images, so the app never loads Mermaid. It fetches `@mermaid-js/mermaid-cli` (pinned, with its own headless Chrome) through `npx` the first time. After changing a diagram, copy its source into [How Drafter works](HOW-IT-WORKS.md), where GitHub draws it, run `pnpm diagrams`, and commit the `.mmd`, the page, and the SVGs together; `apps/web/test/diagrams.test.ts` fails if they disagree, or if an SVG was drawn from an older source. Each diagram's text for a screen reader is in `apps/web/app/about/diagrams.ts`.

## Design documents

- [High-level architecture](drafter-architecture.md): the vision, the IDE model, the data model, storage, templates, and the phased plan.
- [Technical design](drafter-technical-design.md): how each package works, from the parser and pagination to storage, linting, accessibility, security, and testing.
- [Phase 0 kickoff prompt](drafter-phase0-kickoff-prompt.md): the self-contained brief for building the engine.
- [Phase 1 design](drafter-phase1-design.md): the first public release, from the first visit and its guided tour to the editor, saving, export, focus mode, and phones, with mockups in [`docs/phase1/`](phase1/).
- [Phase 2 design](drafter-phase2-design.md): structure, from the shared scene index and the keyed-note convention to the Outline, Cards, Notes, snapshots and Compare, spellcheck, the script map, Stats, the Beat Board, reader notes, and Reference, and the plans that ship them.
- [Structure strip design](drafter-structure-strip-design.md): the band of sections and scenes above the panes, its rows, sizes, keys, and how Phase 2's script map and Timeline build on it.
- [Markdown PDF design](drafter-markdown-pdf-design.md): a Markdown document as a printable PDF: what prints, line and page breaks, paper, and page numbers.
- [Getting a script out the door](drafter-out-the-door-design.md): the guided starters, export options, running times, and the Technical details page.
- [Version history design](drafter-version-history-design.md): Deleted scenes (replaced by Cuts in v0.24.0), Show changes, Compare's Changes view, History of this scene, and matching a scene across versions.
- [Seeing the script design](drafter-seeing-the-script-design.md): who is in a scene, the Stats tab and the character grid, Scaffold and its pages, and, next, storylines, the strip's Color by, and pacing.
- [HTML and EPUB export design](drafter-html-export-design.md): one offline web page with Pages and Reading views, dark by default, and an EPUB e-book from the same Reading view.
- [Drafts and Cuts design](drafter-drafts-and-cuts-design.md): numbered drafts with content-hash IDs, Draft by draft, Cuts (what counts as one, and where it goes back), and the drafts folder and cuts file beside the work.
- [Story map design](drafter-story-map-design.md): one dark, script-free page of a screenplay or play for a non-writer: the shape, the people, every scene with a line or two, the gaps, plain words, stage plays, and the dialog.
- [Drafter for Claude design](drafter-for-claude-design.md): a local, read-only MCP server so Claude or another AI app can read the scripts, drafts, and cuts in folders the writer names: its tools and prompts, what it leaves out, and its security.
- **[The `.drafter` package format](spec/drafter-package.md)** — an open specification (CC0) for a whole project in one file, so any screenwriting app can read and write it.
- [How Drafter works](HOW-IT-WORKS.md): four Mermaid diagrams, how a script flows, how saving works, how a file is opened safely, and how a release is made.
- [Technical details](technical-details.md): how Drafter is put together, in plain words first, with diagrams: the packages, from a keystroke to the page, storage, export, offline use, the desktop app, security, the clean-room rule, releases, and every dependency. The same page is in the app, under Help.

The architecture and technical design are drafts (v0.2) and will change as each phase settles open questions.
