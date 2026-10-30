# Clean-room audit, 27 October 2026

The full record behind the [clean-room verification](clean-room.md#clean-room-verification). Two findings were fixed straight after it: a film catchphrase in one fixture and two tests was replaced with original lines, and one sentence in the architecture document was reworded to match the permitted sources. Notes on the licence housekeeping it recommended are in `docs/DEFERRED.md`.


**Date:** 2026-10-27
**Auditor:** an AI agent (Claude), working read-only. No files in the repository were edited and no git state was changed.
**Overall result:** **PASS WITH FIXES.** No copied code, no screenwriting or Fountain dependency, and no copyleft code in any shipped artifact were found. Three small items should be fixed, or disclosed, before a verification is published (see "Must fix").

## Commits audited

| Ref | Commit | Notes |
|---|---|---|
| `main` | `6af51a75415607380da10ebce21edea592c2862f` (2026-10-27, "docs: note the comparison's clean-room basis in the changelog") | 572 tracked files |
| `phase-1-desktop` | `000e807f974f4fb35727c5d7e3424a7d41147ad2` | 15 commits ahead of main, 5 behind |
| `p6-b` | `7bd04c1620e0f00bc3b4b1c60acbb4c2a97c382a` | 9 ahead, 5 behind |
| `web-samples-sync` | `5347536a67f272b5c1cf245a3ec5fd22002d7b99` | 0 ahead, 3 behind: already fully contained in `main` |

The git-history checks (7) covered every ref: all local branches including `spike-desktop` and `phase-1-editor-packages`, the remotes, the stash, and tags v0.1.0 to v0.3.0. In total that is 185 commits.

The rules audited against are README.md §"Clean-room implementation" (lines 332–382), the Contributing rule (386–388), docs/drafter-technical-design.md §0, and docs/drafter-phase0-kickoff-prompt.md §"Clean-room rule" and §"Fixtures".

---

## 1. Dependencies: PASS

**Method.** For each of the four branches, a script (`audit/deps.mjs`) parsed every tracked `package.json`: the root, `apps/web`, `apps/desktop` on the two desktop branches, and the nine `packages/*`. It checked each `dependencies`, `devDependencies`, `peerDependencies` and `optionalDependencies` entry against that branch's own `docs/DEPENDENCIES.md`, requiring the backticked name to appear there. It then searched the full installed tree:

- `pnpm ls -r --depth Infinity --json` was run in three checkouts: main, plus the phase-1-desktop and p6-b worktrees.
- That gave 706 unique installed packages. For each one, the script read the installed `package.json` and searched `name`, `description` and `keywords` for: fountain, screenplay, screenwrit, fdx, final draft, celtx, highland, trelby, beat app, afterwriting, slugline, fade in, scrite, teleplay, stage play, jouvence and screenplain.
- 44 packages were not installed: platform binaries for other operating systems (`@biomejs/cli-*`, `@rolldown/binding-*`, `@napi-rs/canvas-*`, `@yuku-core/binding-*`). Their names are self-explanatory.
- Every package name in all four `pnpm-lock.yaml` files was also searched by name, about 1,200 entries per branch.

**Results.**
- Every declared dependency, on every branch, has an entry in DEPENDENCIES.md (0 missing). There are 48 distinct third-party and workspace names.
- The only matches on screenwriting terms are Drafter's own workspace packages: `@drafter/fountain`, `layout`, `lint`, `templates` and `cm-fountain`. No third-party package in the installed tree or any lockfile matches by name, description or keywords.
- The direct third-party dependencies are all general-purpose: pdf-lib, @pdf-lib/fontkit, commander, CodeMirror 6, mdast-util-from-markdown, Nuxt/Vue/vue-router, @nuxt/ui, tailwindcss, dexie, nuxt-guided-tour (the maintainer's own MIT module), @vueuse/core, @vite-pwa/nuxt, the Iconify icon data, Electron, electron-updater and electron-builder, plus test and build tools.

**Licences.** These come from `pnpm licenses list -r` (all dependencies) and `--prod`, in the three checkouts. Results for the full tree on p6-b:
- About 1,100 packages are under permissive licences: MIT, ISC, Apache-2.0, BSD-2/3, 0BSD, MIT-0, BlueOak-1.0.0, CC0, and Zlib for pako.
- The non-permissive or unusual ones, and whether each ships:

| Package | Licence | Comes from | Shipped? |
|---|---|---|---|
| `node-forge` 1.4.0 | BSD-3-Clause **OR** GPL-2.0 (dual, choose BSD) | nuxt → nitropack → listhen (dev server's self-signed TLS) | **No.** It is dev and build tooling, and it is absent from the static build. |
| `lightningcss` | MPL-2.0 | Vite/Tailwind CSS build | **No.** It runs at build time; only its CSS output ships. |
| `axe-core`, `@axe-core/playwright` | MPL-2.0 | E2E tests | **No.** |
| `caniuse-lite` | CC-BY-4.0 | browserslist (build) | **No.** It is data used at build time. |
| `argparse` 2.0.1 | Python-2.0 (permissive) | electron-updater → js-yaml | **Yes, in the desktop app** (phase-1-desktop). It is permissive, and electron-builder keeps its LICENSE in the asar's `node_modules`. |
| `sax` 1.6.1 | BlueOak-1.0.0 (permissive) | electron-updater | Yes, in the desktop app. Fine. |
| `vaul-vue` 0.4.1 | "Unknown": no licence field and no LICENSE file in the npm tarball (upstream is MIT) | @nuxt/ui | **No.** Searching the built `.output/public` for "vaul" finds nothing (the drawer component is unused). |

- **There is no GPL, AGPL or LGPL code in any shipped JavaScript.** The only LGPL component anywhere is Chromium's `libffmpeg.so`, which ships inside Electron.
  - It is linked dynamically, as a separate shared library.
  - Its licence is covered by `LICENSES.chromium.html`, which mentions ffmpeg 15 times.
  - The p6-b packaged output (`apps/desktop/release/linux-unpacked/`) contains `LICENSE.electron.txt` and `LICENSES.chromium.html` next to `libffmpeg.so`.
  - This is standard Electron distribution and is compatible with distributing Drafter's own code under MIT.
- **Hunspell en_US dictionary** (`apps/desktop/dictionaries/en-US-10-2.bdic`, phase-1-desktop):
  - It comes from SCOWL, under Kevin Atkinson's permissive, MIT-like notice; the affix data is under Geoff Kuenning's Ispell BSD licence, and parts are public domain. `README_en_US.txt`, lines 88–347, has the details.
  - **It is not LGPL**, so it is compatible with MIT distribution.
  - `README_en_US.txt` sits beside the .bdic and is included by p6-b's `electron-builder.config.cjs` `files: ['dictionaries/**/*', …]`. Both arrive only after the two branches merge.
  - Both are documented in phase-1-desktop's DEPENDENCIES.md, with source and sha256.
- The desktop app's runtime `node_modules` (phase-1-desktop) contain:
  - electron-updater, builder-util-runtime, debug, ms, fs-extra, jsonfile, universalify, js-yaml, lazy-val, lodash.isequal, lodash.escaperegexp and tiny-typed-emitter, all MIT;
  - graceful-fs and semver, under ISC;
  - sax, under BlueOak-1.0.0;
  - argparse, under Python-2.0.

## 2. Vendored or pasted code: PASS

**Method.** On main, phase-1-desktop and p6-b (and a lighter pass on spike-desktop), `git grep` searched the tracked files for:
- licence markers: `SPDX-License-Identifier`, `@license`, `Licensed under`, `Apache License`, `GNU General/Lesser`, `GPL`, `Permission is hereby granted`, `Copyright (c)`, `Copyright <year>` and `©`;
- provenance phrases: `adapted from`, `based on`, `ported from`, `port of`, `copied from`, `taken from`, `borrowed from`, `inspired by`, `stackoverflow`, `gist.github`, `github.com/.../blob`.

It also flagged files with lines over 300 characters (minified-code heuristic), and paths matching `vendor/`, `third_party/`, `external/`, `lib/` and `*.min.*`. Every tracked non-source asset was listed, and `.gitignore` was checked.

**Results.**
- **No third-party licence header appears in any source file.** The only copyright lines are:
  - the maintainer's: README "© 2026 Christopher Schweda", and on p6-b `apps/desktop/electron-builder.config.cjs:10`;
  - the font notices in each font's README and OFL.txt;
  - the SCOWL notice in `README_en_US.txt`.
- **No provenance phrases in code.** The hits are ordinary English:
  - `packages/layout/test/layout.test.ts:255` "Source: Based on a dream" is a title-page test value;
  - "taken from `current`" / "taken from `cwd`" in comments;
  - "copied from the app into the profile" in a test name;
  - `apps/web/app/pages/docs/saving.vue:276` (p6-b) is a link to Drafter's own install guide.
- **No minified or vendored code.** The long-line hits are brand SVGs with path data (generated by the repo's own `brand/build.mjs` from Inter Tight outlines, which the OFL permits) and the hand-written mockups `docs/phase1/editor.html` and `first-visit.html`, which contain inline SVG and CSS and load fonts from Google Fonts.
- There are no vendor or third_party directories, no `.min.*` files and no git submodules.
- `.gitignore` excludes `node_modules/`, `dist/`, `.output/`, `.nuxt/`, `.nitro/`, `.netlify/`, `.cache/` and generated PDFs, so no built output is tracked. `pnpm-lock.yaml` is the only generated file tracked, as intended.
- **Bundled assets and their licences:**

| Asset | Licence | Licence file beside it | DEPENDENCIES/notice entry |
|---|---|---|---|
| Courier Prime ×4 (`packages/render-pdf/fonts/*.ttf`, also served at `/fonts/courier-prime/`) | OFL-1.1 | `packages/render-pdf/fonts/OFL.txt`, also served at `/fonts/courier-prime/OFL.txt` and packed into the desktop asar | Yes: Fonts table; `fonts/README.md` has source and SHA-256 |
| Inter Tight WOFF2 ×2 (`apps/web/app/assets/fonts/inter-tight/`) | OFL-1.1 | `OFL.txt` beside it in the repo. **Not served with the build.** The WOFF2 files carry the copyright and the OFL URL in their name table, which the OFL accepts. | Yes |
| Inter Tight TTF ×2 (`brand/fonts/`) | OFL-1.1 | `brand/fonts/OFL.txt` | Yes, in brand/README.md with SHA-256 |
| en-US Hunspell `.bdic` (phase-1-desktop) | SCOWL/Ispell, permissive | `README_en_US.txt` | Yes, in phase-1-desktop's DEPENDENCIES.md |
| Lucide and Heroicons icon data | ISC and MIT | in their npm packages | Yes |
| Logo, mark, favicons, icons, og-image (`brand/`) | Drafter's own, generated by `brand/build.mjs` | MIT, under the root LICENSE | brand/README.md |
| Screenshots (`docs/images`, `docs/phase1/*.png`) | Drafter's own UI | n/a | n/a |

*Added after the audit (v0.16.0, the Markdown PDF):* Inter Tight TTF ×4 (`packages/render-pdf/fonts/inter-tight/`: Regular, Italic, SemiBold, and SemiBold Italic, version 3.004 from Google Fonts, unmodified), OFL-1.1, with Google Fonts' `OFL.txt` beside them, a source and SHA-256 table in their README that a test checks, and a row in `DEPENDENCIES.md`'s Fonts table. They are embedded in a Markdown document's PDF and served at `/fonts/inter-tight/` beside Inter Tight's `OFL.txt` (`apps/web/scripts/sync-assets.mjs`), which also answers the recommendation below to serve Inter Tight's licence.

## 3. Names of excluded projects in code: PASS

**Method.** `git grep -i` over every non-Markdown tracked file on the three branches, for: Beat, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, Final Draft, jouvence, screenplain, fountain.js, fountain-js, Celtx, WriterDuet and Wrap. Whole-word checks were run separately for `beat`, `wrap`, `highland` and `fdx`.

**Results.** **No code file names any excluded product.** All hits are ordinary words:
- "slugline/sluglines", the industry term for a scene heading, in `packages/lint/src/rules/heading.ts:5` and `packages/templates/test/resolve.test.ts:42,112`;
- CSS `flex-wrap` / `pre-wrap` / `overflow-wrap`;
- the `wrap-in-note` command;
- "beat" as a verb in `apps/web/app/assets/css/tour.css:18,25`.

The products are named only in documentation, and only for these purposes:
- the clean-room exclusion lists (README, technical design §0, kickoff prompt line 17);
- competitive framing (`docs/drafter-architecture.md:322–337`);
- format compatibility ("readable in Beat, Highland, Slugline", architecture.md:15);
- planned Phase 3 import from Highland, Fade In and Celtx, and `.fdx` support from user-owned files;
- the Final Draft feature comparison (`docs/final-draft-comparison.md`, which carries a clean-room statement: public pages and docs only).

"Beat Board" is a Drafter feature name in the Phase 2 roadmap, not a reference to code. `docs/drafter-architecture.md:19` says Drafter "borrows *ideas* from Beat (GPL-3) and others but no code". That is accurate, but see the recommendation below.

## 4. Fixtures and samples: PASS, with one small finding

**Method.** Listed every `.fountain` file (50 per branch: 41 classification fixtures, 7 layout fixtures, 2 samples) and the test files that build scripts inline. Searched all tracked files for:
- famous titles and characters (Brick & Steel, Big Fish, Edward Bloom, Ghostbusters, Wizard of Oz, Casablanca, Star Wars, Die Hard/Gruber/Nakatomi, Godfather, Pulp Fiction and others);
- well-known film quotes;
- the text of the Fountain spec's own sample script (Brick & Steel: Braddock, Leupold, Porsche, retire/retirement, Solvang, "pit boss", "Burn to White", etc.).

For the comparison, the Fountain syntax page (fountain.io/syntax, a *permitted* source) was fetched. All fixture files were read in full, and the layout fixtures were sampled.

**Results.**
- `samples/screenplay.fountain` and `samples/stage-play.fountain` are original: "The Call", by "A. Writer", with Margaret and Danny. They were added in c690c9e.
- The layout fixtures are original filler text ("F1 line 01: the room is quiet.", "Danny, voice over, line 1 of 7."). `fixtures/layout/README.md:3` and CHANGELOG.md:121 record that they were hand-derived and reviewed before the layout code existed, and each has a `*.derivation.md`. The kickoff prompt (lines 135–137) instructs "Write all fixtures yourself. Do not download or copy any existing screenplay, Fountain sample file, or another project's test corpus."
- None of the Fountain spec's sample-script prose (Brick & Steel) appears anywhere.
- **Finding (minor):**
  - A few **single-line example tokens from the Fountain syntax page** are reused as test inputs: `@McCLANE`, `HANS (on the radio)`, `MOM (O. S.)`, the cue `BRICK`, `> BURN TO WHITE` and `>THE END<`. The kickoff prompt itself asks for `HANS (on the radio)` at line 143. They appear in:
    - `fixtures/classification/05-forced-character.fountain:1`
    - `fixtures/classification/18-lowercase-extension.fountain:1,4`
    - `fixtures/generators/fountain.ts:34,61`
    - `packages/cm-fountain/test/complete.test.ts:61–80,241–294,389,398`
    - `packages/cm-fountain/test/fountain.test.ts:102`
    - `packages/cm-fountain/test/highlight.test.ts:109,154`
    - `packages/cm-fountain/test/keymap.test.ts:290`
    - `packages/lint/test/names.test.ts:435,500`
    - `packages/lint/test/rules.test.ts:115,314`
  - The spec is a permitted source, and these are syntax illustrations, not scenes.
  - **However**, `fixtures/classification/05-forced-character.fountain:2` is `Yippee-ki-yay.`, the catchphrase of the film *Die Hard*. It is not in the spec; the spec's McCLANE has no line. "Yippee." also appears in `packages/cm-fountain/test/complete.test.ts:260,277` and `packages/lint/test/rules.test.ts:314–315`.
  - A two-word phrase has no copyright significance, but it contradicts the README's "placeholder names and nonsense dialogue" and would make a flat "every fixture is original" claim slightly inaccurate.
- `fixtures/classification/23-paren-stays-dialogue.fountain` and `41-paren-interrupted.fountain` use `HAMLET`, `Horatio` and "To be." Shakespeare is public domain, and the other lines are original.

## 5. Similarity spot-check of `packages/fountain`: no sign of porting (a limited check)

**Method.** Read the structure and every regular expression in `packages/fountain/src/*.ts` (10 files, 1,401 lines). No other implementation's source was fetched or opened. The comparison is with the auditor's general recollection of the well-known regex-table parser fountain.js: a `regex` object keyed `title_page`, `scene_heading`, `transition`, `dialogue`, `centered`, `section`, `synopsis`, `note`, `note_inline`, `boneyard`, `page_break`, `line_break`, `emphasis`, `splitter`, `cleaner`, `standardizer` and `whitespacer`, with a tokenizer that splits the script on blank lines.

**Results.**
- **Architecture.** Drafter's parser is a lossless CST parser. It works by:
  - a region pre-scan for notes and boneyard (`regions.ts`: `scanRegions`, `findNoteEnd`);
  - per-line `LineInfo` records with kept segments;
  - a title-page reader;
  - classification line by line with lookbehind and lookahead (`lineLevelKind`, `parseCue`, `readTitlePage`, `readMeta`);
  - a character scanner for emphasis (`inline.ts`), not an emphasis regex;
  - full reparse (`reparse.ts`), spans on every node, and `print` for a lossless round trip.

  It never splits on `\n{2,}`. None of the fountain.js table keys (`splitter`, `standardizer`, `whitespacer`, `cleaner`, `note_inline`, `bold_italic_underline`) appears anywhere in the repo. The code cites the technical design (for example "the 'test text' of §2.5", `parse.ts:40`), not any other source.
- **Regexes.** There are only 14, all short:
  - `HEADING = /^(?:INT\.?\/EXT|INT|EXT|EST|I\/E)[. ]/i` (`parse.ts:56`) resembles fountain.js's scene-heading prefix only in the part the spec dictates: "a line beginning with INT, EXT, EST, INT./EXT, INT/EXT, or I/E followed by a dot or a space".
  - `/^={3,}$/` (page break, `parse.ts:378`) and `/^(?:\t| {3,})/` (title-page continuation, `parse.ts:448`) are also direct transcriptions of spec rules.
  - The rest use Unicode property classes (`\p{Lu}`, `\p{L}`) that fountain.js does not use.
- **What this can and cannot show.** It rules out a wholesale port or a copied regex table. It cannot prove that no idea was absorbed from memory, and it does not compare against parsers the auditor doesn't recall (Jouvence, screenplain, afterwriting's parser, Beat's).

## 6. AI-assistant provenance: recorded, but only implicitly

- `docs/drafter-phase0-kickoff-prompt.md` is a "self-contained kickoff prompt for an implementation session. Paste this whole file as the first message". Its clean-room rule (line 17) forbids searching for, fetching, reading or reproducing the source of any screenwriting application or Fountain library, and installing any Fountain-parsing package. Its fixture rule (lines 135–137) requires original fixtures.
- README.md:382 says AI assistants follow the same rule and points to the kickoff prompt.
- Later phases were planned in `docs/plans/*.md`, where each plan derives from the design documents and DECISIONS.md, which records 400+ dated decisions made on the merits.
- **Gap:** the repository never says plainly that Drafter's code was written largely by an AI coding assistant. Commits carry no AI co-author trailer, by the maintainer's policy, and the single git author is `cschweda <cschweda@gmail.com>`. An honest verification should say this in words.
- **Inherent limit:** an AI model's training data includes public code, possibly including open-source Fountain parsers. The instructions prevent the assistant from *reading* that code during the work. They cannot remove what a model learned in training. Checks 2 and 5 found no reproduced code, which is the observable evidence available.

## 7. Git history: PASS

- **Authors and committers** across all refs (185 commits): one identity, `cschweda <cschweda@gmail.com>`. There are no third-party authors.
- **Deleted paths** (`git log --all --diff-filter=D`): only `apps/web/dist`. It was a symlink to `.output/public`, added in 74c0a93 and removed in fe288a1 ("stop tracking the dist link"). It held no content.
- **Every path ever committed** (676) was compared with the trees of all current refs: `apps/web/dist` is the only path no longer present, so no file was added and later scrubbed.
- **Largest blobs ever committed:** screenshots, `pnpm-lock.yaml` revisions, the `.bdic`, the Inter Tight TTFs and DECISIONS.md. All are accounted for above.

---

## Every third-party asset or dependency that ships

**Web app (drafter.dev static build).** The client bundle contains the following, as checked by searching the built `.output/public`:

| Shipped | Licence |
|---|---|
| Vue 3, vue-router, Nuxt runtime | MIT |
| @nuxt/ui, reka-ui, Tailwind CSS output | MIT |
| CodeMirror 6 packages, @lezer/* | MIT |
| mdast-util-from-markdown, micromark | MIT |
| pdf-lib | MIT |
| @pdf-lib/fontkit | MIT |
| pako, inside pdf-lib | MIT AND Zlib |
| dexie | **Apache-2.0** (its npm package has no NOTICE file) |
| nuxt-guided-tour | MIT, by the maintainer |
| @vueuse/core | MIT |
| Workbox, the generated service worker | MIT |
| Lucide icon data | ISC |
| Heroicons icon data | MIT |
| Courier Prime | OFL-1.1, with OFL.txt served |
| Inter Tight | OFL-1.1; the licence is in font metadata, and the OFL.txt is not served |

Drafter's own packages are MIT.

**npm packages** (`@drafter/*`, `private: false`):
- They contain only Drafter's code, plus Courier Prime with its OFL.txt in `@drafter/render-pdf`.
- Their third-party runtime dependencies are pdf-lib, @pdf-lib/fontkit, commander and CodeMirror, all MIT and installed by npm with their own licences.

**Desktop app (Linux AppImage and .deb, from the branches):**
- everything in the web build;
- Electron 45.0.0: MIT, with `LICENSE.electron.txt`;
- Chromium and its components, under BSD and others, including `libffmpeg.so` under LGPL-2.1 (linked dynamically), all covered by `LICENSES.chromium.html`;
- electron-updater and its dependencies (MIT, ISC, BlueOak-1.0.0, Python-2.0);
- the en-US Hunspell .bdic (SCOWL/Ispell, permissive, with `README_en_US.txt`);
- the AppImage runtime and electron-builder's AppArmor profile, both from electron-builder (MIT tooling).

## Must fix before publishing a verification

1. **Replace the film catchphrase in the fixtures, or disclose it.**
   - In `fixtures/classification/05-forced-character.fountain:2`, change `Yippee-ki-yay.` to an original line (for example `Hello?`). The `.expected.json` does not contain the dialogue text, so it needs no change.
   - Ideally, also change `Yippee.` at `packages/cm-fountain/test/complete.test.ts:260,277` and `packages/lint/test/rules.test.ts:314–315` to an original word. Leave the historical `docs/plans/2026-10-25-phase1-plan2-editor-packages.md:277` as it is.
   - Separately, the verification should say that a few test inputs reuse example names from the Fountain specification (a permitted source), or rename them too: `McCLANE`, `HANS`, `MOM` and `BRICK`.
2. **Merge DEPENDENCIES.md correctly when phase-1-desktop and p6-b land.**
   - phase-1-desktop has a placeholder electron-builder row ("Its row is completed when it is added") plus the electron-updater and dictionary rows. p6-b has the complete electron-builder row and lacks the other two.
   - The merged file must keep all three complete rows.
   - After merging, re-run the cross-check: every name in `apps/desktop/package.json` must appear in DEPENDENCIES.md. Confirm that a packaged build's asar contains `dictionaries/README_en_US.txt` and electron-updater's `node_modules/*/LICENSE` files.
3. **State the AI assistance in the verification itself.** The repo implies it (through the kickoff prompt) but never says it. The draft below does.

## Recommended (licence hygiene, not clean-room blockers)

- **Third-party notices for the web bundle.** The minifier strips licence comments: only Tailwind's `/*! … MIT License */` banner survives in `_nuxt/`. MIT, ISC and BSD ask that the copyright and permission notice accompany copies, and Apache-2.0 (dexie) asks for its licence text. Generate a `THIRD-PARTY-NOTICES.txt` at build time and serve it, link it from the About or Privacy page, and include it in the desktop asar. Either use a rollup/Vite licence plugin, or write a small script over `pnpm licenses list --prod` limited to bundled modules.
- **Serve Inter Tight's OFL.txt** at `/fonts/inter-tight/OFL.txt`, as Courier Prime's is (`apps/web/scripts/sync-assets.mjs`).
- **LICENSE in each published npm package.** Each `files: ["dist"]` package has no LICENSE of its own, and npm doesn't pick up the root one. Add a LICENSE to each package directory, or copy it in at prepack.
- **Reword `docs/drafter-architecture.md:19`** from "borrows *ideas* from Beat (GPL-3) and others but no code" to something like "takes feature ideas from using Beat and other apps as a writer does, never from their code". This matches the README's list of permitted sources.

## What an audit like this cannot prove

- **Independent creation is a fact about process, and a repository can only record it.** These checks find copying that leaves traces: headers, identical regexes, foreign files, known sample text and odd names. They cannot detect code paraphrased from memory, or ideas absorbed from code someone read years ago.
- **AI training data.** The assistant was instructed not to read other implementations, and nothing reproduced was found. But no one can list or remove what a model learned in training.
- **Comparison scope.** Only fountain.js was compared, from the auditor's memory, and at a high level. Comparing with other parsers would mean reading them, which would itself break the clean room. A proper similarity analysis would need an independent third party who never contributes to Drafter.
- **Point in time.** This covers the four commits above. Later commits, other branches and the npm-published tarballs were not audited.
- **Not legal advice.** The licence classifications rely on the packages' declared licence fields and the files read here.

---

## Draft README section

### Clean-room verification

On 27 October 2026 we audited Drafter at commit `6af51a7` on `main`, and the desktop branches about to merge, against the [clean-room rules](#clean-room-implementation). The audit found the following:

- **No copied code.** No source file carries another project's licence header or a note that it was adapted from somewhere else. No file is vendored or minified. The git history contains no foreign files that were added and later removed, and every commit has a single author.
- **Nothing from screenwriting software.** No code names, ports or imports any other screenwriting application or Fountain library. The parser's structure and patterns follow the [technical design](docs/drafter-technical-design.md), not any existing parser we know of.
- **General-purpose dependencies only.** Drafter uses open-source libraries such as CodeMirror, Vue, Nuxt, pdf-lib and Electron. Each is listed with its purpose in [`docs/DEPENDENCIES.md`](docs/DEPENDENCIES.md). Of more than 700 installed packages, none is a Fountain or screenwriting package. No GPL code ships in the app.
- **Original test content.** The fixtures and samples were written for Drafter. A few test inputs reuse example names from the Fountain specification itself.

Most of Drafter's code was written by an AI coding assistant working under these rules, which forbid it to read other implementations, and reviewed by the maintainer.

**Limits.** An audit can find copying that leaves traces. It cannot prove that something was never read or remembered, or rule out what an AI model learned in training. The audit covers these commits only, and it isn't legal advice.

*(245 words.)*
