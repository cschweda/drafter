# Clean-room audit, 22 November 2026

The third full audit of Drafter against its [clean-room rules](clean-room.md). It covers everything added since the [1 November 2026 audit](clean-room-audit-2026-11-01.md) (v0.24.1 to v0.27.2, and the fixes waiting on `staging` for v0.27.3), and re-runs over the whole repository the checks that can regress anywhere: fixtures, product names, assets, dependencies, and git history. [Audits](AUDITS.md) lists every audit, newest first.

**Date:** 2026-11-22
**Auditor:** an AI agent (Claude), working read-only in a separate worktree (`audit/clean-room-2026-11-22`, cut from `origin/staging`). Nothing was committed or pushed. The only files written are this audit and one row in [Audits](AUDITS.md).
**Overall result:** **PASS WITH FINDINGS.** No copied code, no screenwriting or Fountain dependency, no committed file from another app, and no format knowledge from an AI-written specification, a converter, or a decompiled app were found. Nine findings follow. None is copied code. The two that matter most are regressions the earlier audits already fixed once: a film reference is back in the layout tests (the third time), and `DEPENDENCIES.md` has fallen behind the packages again. The rest are records that are missing or out of date.

## Commits audited

| Ref | Commit | Notes |
|---|---|---|
| Last audit's `main` | `aa6a81759e645f34a0b1f495c134f84c43a902fb` (2026-11-01) | The baseline: every diff below is from here. It is the commit the last audit covered, so the diff also holds that audit's own follow-up fixes (`9cd506dd`) |
| `origin/staging`, this worktree's `HEAD` | `da43bd94bd3c6bc6093b2b827b8167c2097ee87f` (2026-11-22, "Merge pull request #83 from cschweda/fix/cursor-after-focus") | v0.27.2 plus this week's fixes. 417 commits after the baseline (328 without merges); 2,046 tracked files (1,578 at the baseline); 468 added, none deleted; 947 changed |
| `origin/main` | `1ff3e4faa4d0` | Behind `staging`; nothing on it that `staging` lacks was looked for |

The git-history checks (8) covered every ref in the shared repository: 151 refs, 1,299 commits.

**Not covered:** the uncommitted v0.27.3 release work in the maintainer's main checkout (version numbers, CHANGELOG, README, What's new, ROADMAP). It is not in this worktree, and this audit was told to touch no other checkout.

The rules audited against are [`clean-room.md`](clean-room.md), [`DEPENDENCIES.md`](DEPENDENCIES.md)'s own rule that every dependency has an entry first, the trap documents' provenance rule ([`fixtures/trap/README.md`](../fixtures/trap/README.md), lines 174 to 177), and the maintainer's rule for Final Draft files (real files for structure only, never committed, their text never copied, and nothing built from an AI-written specification).

## Compared with earlier audits

| Check | 2026-10-27 | 2026-11-01 | 2026-11-22 | What changed |
|---|---|---|---|---|
| 1. Dependencies | PASS | PASS with finding (fixed) | **PASS with finding** | 3 new third-party direct dependencies (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`, `zod`), 5 new workspace packages (`mcp`, `novel`, `production`, `render-docx`, `story-map`), 23 new names in the lockfile and 5 gone (1,223 to 1,241). None is a screenwriting package, a converter, or a parser for another app's format. The same kind of finding as last time, again: `DEPENDENCIES.md` has no row for two workspace packages and lacks six edges and one font. Not fixed by this audit |
| 2. Vendored or pasted code | PASS | PASS | PASS | 880 new or changed non-Markdown files searched. The only third-party licence texts are the seven kept on purpose for the Drafter for Claude bundle's notices |
| 3. Excluded names in code | PASS | PASS | PASS, one note | Every mention is a file format, user-facing text, or the sourced comparison. Note: the planned "Beat Board" shares its name with a Final Draft feature (finding 8) |
| 4. Fixtures and samples | PASS, one small finding | PASS with finding | **PASS with finding** | No `.fdx` file was added or changed since the baseline; every new fixture is original text. The film reference the last two audits removed is back in a new test (finding 1) |
| 5. Similarity spot-check | No sign of porting | No sign of porting, one note | No sign of porting | The new modules (Classic Mode, Production, Novel, the Word writer, sentence breaks, Drafter for Claude). Last time's note on the hash is fixed |
| 6. Format knowledge sources | not a check | PASS with finding | **PASS with findings** | New Final Draft facts (2026-11-20) are sourced to the maintainer's real Final Draft 13 samples. The Word file is written from ECMA-376. Findings: the rules file says no real Highland file was checked when one was; the rule against AI-written specifications is recorded nowhere it is cited; one Final Draft attribute name in a plan has no source |
| 7. AI-assistant provenance | Recorded, but only implicitly | Recorded plainly | **Recorded plainly, with a gap** | Three of the eight plans since the baseline, and the Production design, don't state the clean-room rule (finding 6) |
| 8. Git history | PASS | PASS | PASS | 1,299 commits. The maintainer, plus 9 Dependabot version bumps (4 of them in `HEAD`). `origin/main` and `origin/staging` only ever fast-forwarded |
| 9a. Brand and assets | not a check | PASS | PASS, one gap in the docs | Liberation Serif (new) and the story map's fonts have licence, source, and checksums beside them, and every checksum matches. Typewriter sounds are made in code; there is no audio file. Liberation Serif is missing from `DEPENDENCIES.md`'s Fonts table (finding 2) |
| 9b. Claims about other apps | not a check | PASS | PASS | Unchanged sources, still dated 31 October 2026 |
| 9c. Classic Mode | not a check | PASS with note (a plan) | PASS (built) | Built as promised: never named after an app, and the trademark line is on its help page |
| 9f. Trademarks | not a check | part of 9b and 9c | PASS | The Final Draft and Anthropic lines the documents promise are all in place |

### Since the last audit

From the 1 November **Must fix** list:

- **The catchphrase** (`apps/web/test/count.test.ts:133`): fixed then, and still fixed there (now `'Mind out.'`). **But the same film is back in a different test** (finding 1). The last audit asked for a test that fails on the phrase; none was added.
- **The 18 Final Draft settings names**: sourced. `packages/fdx/src/import.ts` and `docs/DECISIONS.md` ("Clean room", 2026-11-01) both say they are names only, from Final Draft's own sample scripts the maintainer supplied.

From the **Recommended** list:

- **"Big Fish"**: renamed to "Small Hours" in `apps/web/test/text.test.ts`. Done.
- **The hash's techniques**: named in `packages/history/src/hash.ts:6-8`. Done.
- **Cite EPUB 3**: `docs/DECISIONS.md:1302` now cites the W3C EPUB 3.3 Recommendation. Done.
- **Classic Mode's commitment in the roadmap**: done.
- **Story map's fonts when it lands**: checked here (9a). Done.
- **Keep the plans' constraints files**: still open. `.superpowers/` is gitignored and no copy is committed.
- **Third-party notices for the web bundle**: still open (`docs/DEFERRED.md:11`). The Third-party licences page now covers the spellchecker, its dictionaries, five fonts, and the two packages inside Drafter for Claude, but not Vue, CodeMirror, pdf-lib, or dexie (Apache-2.0).
- **A LICENSE in each npm package**: done for the one package that is published. `packages/mcp/scripts/stage.mjs:71` copies the root `LICENSE` into the staged `drafter-mcp` package. The `@drafter/*` packages are not published.

---

## The rules, one by one

Each rule is quoted from [`clean-room.md`](clean-room.md). "Verified" means a command was run or a file was read in this audit. "Inferred" means the conclusion rests on something else, and says what.

| # | The rule | How it was checked | Result |
|---|---|---|---|
| R1 | "The source code of other screenwriting applications and Fountain libraries ... Not to copy, not to adapt, and not to read for ideas." | Checks 2, 3 and 5: licence markers, provenance phrases, foreign repository links, long lines, vendor folders, and a read of the new modules | **Pass.** Verified that no trace of copying exists. That nothing was read cannot be verified from a repository (see the limits) |
| R2 | "Their packages as dependencies. Drafter installs no Fountain parser and no screenwriting library." | Check 1: every `package.json` and the lockfile's 1,241 names | **Pass.** Verified |
| R3 | "Their test suites, sample files, and scripts. Every fixture in this repository was written for it." | Check 4: every `.fdx` listed with its size and header; every fixture added since the baseline read; history searched for format files added and removed | **Pass with finding 1.** Verified that no file from another app is committed or ever was. The wording of this rule and the structure-only reading of makers' samples pull against each other (finding 9) |
| R4 | "Work from the specification, never from another implementation." | Checks 2, 5 and 6 | **Pass.** Verified for traces; the rest is inferred from the designs and comments |
| R5 | "When the specification is silent, decide and write it down. Add a dated entry to `docs/DECISIONS.md`" | Check 6: DECISIONS sections for each feature since the baseline | **Pass.** Every feature has dated entries. Two sources are missing from it (findings 4 and 7) |
| R6 | "Final Draft support comes from the files, not from another program's converter" | Check 6: the diff of `packages/fdx/src` since the baseline, and where each new fact is sourced | **Pass.** Verified: each new fact is sourced to the maintainer's real Final Draft 13 samples (`docs/DECISIONS.md:1596`, `:1598`). Three small values are open questions |
| R7 | "Highland and Fade In support comes from public descriptions ... No real `.highland` or `.fadein` file has been checked yet." | `git diff aa6a817..HEAD -- packages/archive/src packages/fdx/src/osf.ts`; `docs/DEFERRED.md:174` | **Pass on the code** (`highland.ts`, `fadein.ts`, `osf.ts`, `zip.ts` are unchanged since the baseline). **The sentence is out of date** (finding 3) |
| R8 | "Dependencies stay out of the domain ... A new dependency gets an entry in `docs/DEPENDENCIES.md` first" | Check 1's cross-check script | **Finding 2.** The third-party packages all have entries. Two workspace packages, six edges, and one font do not |
| R9 | "Test content stays original ... Don't paste scenes from real scripts" | Check 4's search for about 90 famous titles, characters and lines, and a read of each new sample | **Finding 1** |
| R10 | "AI coding assistants follow the same rule ... give it the clean-room instructions" | Check 7: each plan since the baseline searched for the rule | **Pass with finding 6** |

## 1. Dependencies: PASS, with a finding

**Method.** A script read every tracked `package.json` at the baseline and at `HEAD` (22 files then, 27 now) with `git show`, and listed each entry added, removed, or changed, and the pnpm overrides. It checked that every declared name appears in backticks in `docs/DEPENDENCIES.md`. A second script checked that each `packages/*` has a row there and that the row's "Depends on" cell names every runtime dependency its `package.json` declares. The lockfile's package names were listed at both commits and compared.

**Licences, and a limit.** This worktree has no `node_modules`, and the audit was told to run no install, so `pnpm licenses list` could not be run and no installed licence file was read. The licence of each of the 23 new lockfile names is the `license` field the npm registry gives for that exact version (`npm view <name>@<version> license`), which is the package's own declaration and nothing more. Packages that were only bumped to a newer version were not looked up again.

**Added since 1 November.**

| Package | Version | Where | Declared licence | Ships? |
|---|---|---|---|---|
| `@modelcontextprotocol/server` | 2.4.0, pinned | `drafter-mcp` | Apache-2.0 | Yes, inside the one-file `drafter-mcp.js` only |
| `@modelcontextprotocol/core` | 2.4.0 (through the server) | `drafter-mcp` | Apache-2.0 | Yes, the same way |
| `zod` | 4.6.7, pinned | `drafter-mcp` | MIT | Yes, the same way |
| `@modelcontextprotocol/client` | 2.4.0, pinned (development) | `drafter-mcp` | Apache-2.0 | No: tests only |
| `eventsource`, `eventsource-parser`, `jose`, `pkce-challenge` | through the client | development | MIT | No |
| `@codemirror/commands`, `@codemirror/search` | already in the app | now also declared by `@drafter/cm-fountain` | MIT (as last time) | Yes, as before |

The other 15 new lockfile names are build and editor tooling brought in by version bumps (`@emnapi/*`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`, `@rolldown/binding-wasm32-wasi`, `@rollup/rollup-android-x64`, `@volar/language-service`, `vscode-jsonrpc`, three `vscode-languageserver-*`, `tinyps`, `bare-buffer` (Apache-2.0), and `@isaacs/nonrecursive-glob-match` (BlueOak-1.0.0)); the rest declare MIT. None ships. Five names left the lockfile. Electron went from 45.0.0 to 45.2.1.

**Inlined code in the Drafter for Claude bundle.** The MCP SDK's own files carry Ajv 8.18.0, ajv-formats 3.0.1, fast-deep-equal 3.1.3, json-schema-traverse 1.0.0, content-type 1.0.5 (all MIT), fast-uri 3.1.8 (BSD-3-Clause), and `@cfworker/json-schema` 4.1.1 (MIT). `packages/mcp/scripts/notices.mjs` appends each licence to the bundle and stops the build on a package it doesn't know, on inlined code with no kept licence, or on a NOTICE file. The seven licence texts are committed in `packages/mcp/scripts/licences/`. **Read, not run:** the bundle was not built here, so that its last lines hold those licences is inferred from the script and from `packages/mcp/test/bundle.test.ts:84-91`.

**Screenwriting packages, converters, and format parsers.** The 1,241 lockfile names were searched for fountain, screenplay, screenwrit, fdx, final draft, celtx, highland, trelby, afterwriting, slugline, fade in, scrite, teleplay, stage play, jouvence, screenplain, writerduet, scenarist, osf, beat, docx, epub, manuscript, scrivener, mammoth, and pandoc. **There are no matches.** The names that match xml or zip are the same general-purpose build and test tools as before (`@xmldom/xmldom`, `xmlbuilder`, `xmlchars`, `xml-name-validator`, `w3c-xmlserializer`, `unzipper`, `zip-stream`, `gzip-size`, `@electron-internal/extract-zip`), brought by jsdom, electron-builder, and Nuxt. None is imported by Drafter's code: the Word file, the EPUB, the zip reader and writer, and the XML reader are all Drafter's own (`packages/render-docx/src/parts.ts:1-2`, `packages/archive/src/zip.ts`, `packages/fdx/src/xml.ts`).

**Finding 2.** `DEPENDENCIES.md` is behind the packages. The cross-check reports:

- **no row** for `@drafter/novel` and `@drafter/production`, both new workspace packages that ship in the app;
- **six missing edges:** `@drafter/cli` to `@drafter/outline`, `@drafter/production`, and `@drafter/story-map`; `@drafter/cm-fountain` to `@codemirror/commands` and `@codemirror/search`; `drafter-mcp` to `@drafter/novel`; and `@drafter/render-pdf` to `@drafter/novel`;
- **Liberation Serif is not in the Fonts table**, though its folder README, the Third-party licences page, and DECISIONS all record it (9a).

Every one is Drafter's own package or a general-purpose library already listed elsewhere in the file, so no rule about *what* may be a dependency is broken. The rule that an entry comes *first* is. The last audit found the same kind of drift and fixed it by hand.

## 2. Vendored or pasted code: PASS

**Method.** Over the 880 non-Markdown files added or changed since the baseline (440 of them new):

- licence markers: `SPDX-License-Identifier`, `@license`, `Licensed under`, `Apache License`, `GNU General/Lesser`, `GPL`/`LGPL`/`AGPL`, `Permission is hereby granted`, `Copyright (c)`, `Copyright <year>`, and `©`;
- provenance phrases: `adapted from`, `based on`, `ported from`, `port of`, `copied from`, `taken from`, `borrowed from`, `inspired by`, `derived from`, `courtesy of`, `credit:`, `stackoverflow`, `gist.github`, `github.com/.../blob`, `lifted from`, `modelled on`, `reverse engineer`, and `decompil`;
- every `github.com/<owner>/<repo>` link that isn't the maintainer's;
- lines over 300 characters in source files, and paths matching `vendor/`, `third_party/`, `external/`, and `*.min.*`; and submodules.

**Results.**

- **No third-party licence header in any source file.** The hits are the notices the Third-party licences page shows on purpose (`apps/web/app/pages/docs/licences.vue:43-195`, checked by `apps/web/e2e/docs.spec.ts:242-254`), the seven licence texts kept for the bundle's notices, the fonts' copyright lines that the story map writes beside each `@font-face` (`packages/story-map/src/render/fonts.ts:17-20`), and test strings.
- **No provenance phrase points outside.** "Copied from" appears only for Drafter's own test helper copied between its packages (`packages/novel/test/scaling.ts:1-3`, `packages/story-map/test/scaling.ts:1`). "Credit: Written by" is the Fountain title-page key. "Based on a story by Ada Quill" and "Based on a dream" are title-page test text.
- **Foreign repository links** are the fonts' upstreams (`packages/story-map/fonts/README.md`), two links inside the kept licence texts, the source of `@cfworker/json-schema`'s licence text (`packages/mcp/scripts/notices.mjs:15`), and two invented ones in tests (`github.com/attacker/repo`, `github.com/x/releases`).
- **No minified or vendored code.** 16 source files have a line over 300 characters. The longest lists (`apps/web/app/about/tech.ts`, 33; `fixtures/trap/entry-points.ts`, 6) and a sample from five others were read: all are prose in strings (help text, tool descriptions for Drafter for Claude, a trap's hostile JSON). There are no vendor folders, `.min.*` files, or submodules.
- **Not checked:** the built web app's remaining licence banners, which the last audit read from a production build. No build was made here.

## 3. Names of excluded projects in code: PASS, with a note

**Method.** `git grep` over every tracked non-Markdown file at `HEAD` for the last audit's list (Beat as a whole word, Trelby, Scrite, BetterFountain, afterwriting, Slugline, jouvence, screenplain, fountain.js, Celtx, WriterDuet, Scenarist, Movie Magic, StudioBinder, Arc Studio, Causality, Storyist, Scrivener, Highland, Fade In, Final Draft, TextBundle, WriterSolo) and for libraries a port might name (JSZip, fflate, fast-xml, xmldom, sax, mammoth, docx4j, python-docx, pandoc, calibre). The files changed since the baseline were also searched for wording that would suggest provenance beside a product's name ("as Final Draft does", "like Highland", "Final Draft's code", and the like).

**Results.** **No code names an excluded product as the source of its code.** None of the library names appears outside the lockfile. Every product mention is one of:

- **a file format Drafter reads, writes, or refuses**, with advice ("a Celtx project ... Export it from Celtx as plain text", `packages/archive/src/formats.ts:57-58`);
- **user-facing text and the sourced comparison** (`apps/web/app/pages/docs/why.vue:331-332`, still "read on 31 October 2026");
- **a statement about a file's structure**, sourced in DECISIONS ("as Final Draft's own files do", `packages/fdx/src/import.ts:576`).

`apps/web/test/tech.test.ts:118-124` still fails the build if the Technical details page names a screenwriting app other than as a file format.

**Classic Mode's naming** (the pending row in Audits asked for this check). "Final Draft mode" appears nowhere in `apps`, `packages`, `brand`, or the README. In Classic Mode's own files "Final Draft" appears only as a palette keyword (`apps/web/app/commands/data.ts:35`), in the help page's "the way writers of apps like Final Draft expect" (`classic-mode.vue:28`), and in its trademark line (`classic-mode.vue:320`). `packages/cm-fountain/src/classic/` names no other app at all. This matches what the design promised (§17.1).

**Note (finding 8).** "Beat Board", Drafter's name for a planned canvas of idea cards, appears in `docs/WHY.md:45`, 25 times in `docs/drafter-phase2-design.md`, and in three code comments (`apps/web/app/components/NotesPane.vue:39`, `apps/web/app/notes/filter.ts:11`). It predates both earlier audits. To the auditor's knowledge it is also the name Final Draft gives a feature of its own; this was recalled, not looked up.

## 4. Fixtures and samples: PASS, with a finding

**Method.** Every `.fdx` in the repository (32) was listed with its size and its opening comment, and `git diff --name-status aa6a817..HEAD` was searched for `.fdx`. Every fixture and sample added since the baseline was listed and its opening read. Every tracked text file was searched for about 90 famous titles, characters, and lines (the last audit's list, plus novels and plays now that Novel exists: Gatsby, Ishmael, Hamlet, and others). Every path ever added in any commit on any ref was searched for format files (`.fdx`, `.fadein`, `.highland`, `.zip`, `.epub`, `.docx`, `.pdf`, `.celtx`, `.scriv`, `.fdr`, `.rtf`, audio, and archives) outside the known fixture folders.

**Real files from other apps.**

- **No `.fdx` file was added, changed, or removed since the baseline** (verified: the diff lists none). The 32 are the ones the last audit described: 17 trap documents of 119 to 601 bytes, 9 hand-written fixtures under 2 KB, the 6 synthetic files that open with "Synthetic test file: written by hand for Drafter, with original text and invented values; not made in Final Draft", their 2 copies in `samples/fdx/`, and Drafter's own export of its own sample. The largest is 12.9 KB. A file saved by Final Draft carries its whole settings block and is far larger; none here has that shape.
- **No `.highland`, `.fadein`, `.epub`, `.zip`, `.docx`, or `.pdf` is tracked**, and none was ever added in any commit on any ref (verified: the history search returns only three of Drafter's own `.html` files).
- **Real files were read, outside the repository.** The maintainer's Final Draft 13 samples (2026-10-29 and again 2026-11-20, `docs/DECISIONS.md:1596`, `:1598`) and Highland's own published sample (2026-10-30, `docs/DEFERRED.md:174`). Each record says structure only, never committed. This audit can confirm they were never committed. It cannot confirm where they sat on disk or what was read from them.
- **No guard stops a real `.fdx` being committed.** `.gitignore` holds `*.highland` and `*.fadein`, but cannot hold `*.fdx`, because synthetic ones are tracked (recommended, below).

**What was added, and how it was made.**

| Fixture or sample | Files | How it was made |
|---|---|---|
| The Novel sample (`apps/web/app/editor/sample-scripts/novel.md`) and `samples/novel.md` | 2 | Written for Drafter: Ines at a station; Wren and a lighthouse |
| `packages/novel/test/fixtures/manuscript-book.md` | 1 | Written for the tests: Marta on a causeway |
| Drafter for Claude's library (`packages/mcp/test/library/`) | 3 `.fountain` | "Signal Hill" 101 to 103. The first note of each says "Written for Drafter for Claude's tests only ... Every line is original" |
| Production fixtures (`packages/production/test/fixtures/v0271/`, `packages/layout/test/fixtures/locked/`) | 4 `.fountain`, 3 `.json` | Generated-looking filler prose ("The window rings and nobody looks") and two short hand-written scenes; the `.json` files are Drafter's own layouts |
| Trap documents | 4 new `.fountain`, `mcp-traps.ts`; 294 traps now (258 last time) | Hand-written hostile files. `fixtures/trap/README.md:174-177`: "Nothing is copied from another app, converter, test suite, or public corpus" |
| Screenshots (`docs/images/drafter-classic-{dark,light}.png`) | 2 | Drafter's own UI showing "Signal Hill" (the dark one was opened and looked at) |

The repository was also searched for the names of public test corpora (naughty strings, SecLists, the XML conformance suite, CommonMark's `spec.json`): no matches.

**Finding 1. The film reference is back, in a new place.** `packages/layout/test/layout.test.ts:228` is:

`lay('@McCLANE\nYippee.\n\nShe waits.\n\nHANS (on the radio)\nWho is this?')`

with `McCLANE` again at lines 229, 234, and 235, in comments at `packages/layout/test/properties.test.ts:77` and `packages/layout/src/lines.ts:257`, and in the release notes at `CHANGELOG.md:87`. It was added on 2026-11-20 (`3acf85cf`, "a forced cue prints as typed"). McClane, Hans, and "Yippee" together are *Die Hard*. Two things are true at once:

- `@McCLANE` is, as far as the auditor recalls, the Fountain specification's own example of a forced character, and the specification is a permitted source. `docs/DECISIONS.md:1596` says the behaviour is "as the Fountain spec has it".
- The project decided on 2026-11-01 to stop using it: "a famous film line and a film's character name and title in tests, the cheat sheet, and fixtures are now original (`@McBRIDE`, `Mind out.`, `Small Hours`)" (`docs/DECISIONS.md`, "Clean room"). `@McBRIDE` is used in 30 files; this test went back to the old name and put part of the line beside it.

A name and one word have no copyright weight. It breaks "every fixture is original" for the third time, and the guard test the last audit suggested was not written.

The Fountain specification's other example names (`HANS`, `MOM`, `BRICK`, `STEEL`) are still used as test inputs, as both earlier audits recorded and `clean-room.md` discloses.

**The maintainer's own outline.** Re-run without opening it: "Boca" is still only a file name in examples (51 files), with generic one-line scenes under it. The outline's palette appears only in the story map's code and plan, the design language that design adopts openly. "Suggested by Claude" and "Boca Outline" appear nowhere.

## 5. Similarity spot-check of the new modules: no sign of porting (a limited check)

**Method.** Read the header comments, constants, and structure of: `packages/fdx/src/color.ts`; `packages/render-docx/src/parts.ts`; `packages/layout/src/sentences.ts`; `packages/production/src/{fingerprint,numbers,sets}.ts`; `packages/archive/src/{crc32,deflate,windows-paths}.ts`; `apps/web/app/editor/key-sounds.ts`; `packages/mcp/scripts/{notices,stage}.mjs`; and the file list and comments of `packages/cm-fountain/src/classic/`. No other implementation's source was fetched or opened. Comparisons are with the auditor's general knowledge.

**Results.**

- **The Word writer** builds each part as a string from ECMA-376's element names, in Drafter's own shape (one function per part, named styles, lengths in twips with a comment for each). It has nothing of the structure or naming of the docx libraries the auditor knows.
- **Sentence breaks** are a small hand-written scanner with a 19-word abbreviation list that the comment says grew from the story map's own (`sentences.ts:1-4`). It is not shaped like a known sentence-segmentation library.
- **Production** uses Drafter's own diff, Web Crypto's SHA-256 for line fingerprints, and its own A-number ordering, worked out in the design and corrected during the build (`docs/drafter-production-design.md:128`). The revision colour order (White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry) is the industry's convention, which the rules permit. Nothing in `packages/production` names another app.
- **The colour mapping** (`color.ts`) is the textbook RGB to hue and saturation conversion and a nearest-hue pick.
- **CRC-32 and the deflate walk** use the constants and tables the standards dictate (APPNOTE.TXT §4.4.7, RFC 1951 §3.2.5), which the comments cite.
- **Classic Mode** is CodeMirror extensions in Drafter's own vocabulary (`offer`, `chooser`, `caret`, `hidden`, `marks`). The design says it read CodeMirror's documentation and source; CodeMirror is a general-purpose editor and a declared dependency, so that is allowed.
- **What this can and cannot show.** As before: it rules out a wholesale port or a copied table from projects the auditor knows. It cannot show that no idea came from memory.

## 6. File-format knowledge sources: PASS, with findings

| Format or feature | Changed since the baseline? | Where the code or the record says its knowledge came from | Verdict |
|---|---|---|---|
| Final Draft (`.fdx`), import | Yes: outline paragraph colours (`Color="#RRRRGGGGBBBB"`), and the Character element's `AllCaps` setting (`ElementSettings Type="Character"`, `FontSpec Style`) | "a real Final Draft 13 file (one of Final Draft's own samples, supplied by the maintainer, read for its structure only and never committed)" (`docs/DECISIONS.md:1596`); "Every color in the three sample files lands on the word a reader would use" (`:1598`); `packages/fdx/src/import.ts:45-52`, `:574-580` | Permitted: real files from the maintainer |
| Final Draft, export | Yes: an option to leave notes out. No new element or attribute | The red/blue audit of 2026-11-03 | Nothing to source |
| Final Draft revisions and locked pages | **Not built, on purpose** | `docs/drafter-production-design.md:24`: "`Revisions`, `RevisionID`, and `LockedPages` are not written or read ... build `.fdx` structures only from real Final Draft files". Verified: `grep` finds none of the three in `packages/fdx/src/export.ts`, and `LockedPages` only in the importer's ignore list | The rule was followed. Its record is missing (finding 4) |
| Highland, Fade In and OSF, zip | No (`highland.ts`, `fadein.ts`, `osf.ts`, `zip.ts` have no diff) | As the last audit recorded: the makers' public descriptions, the OSF example document, APPNOTE.TXT | Unchanged |
| Word (`.docx`), written only | New | "Written by hand from ECMA-376 (WordprocessingML)" (`packages/render-docx/src/parts.ts:1-2`); no docx library | A public standard. Not cited in DECISIONS (finding 7) |
| Standard manuscript format | New | "Standard manuscript format" as agents and editors ask for it; each choice marked as a call in `docs/drafter-manuscript-design.md` (lines 32, 39, 76) | A publishing convention, like the screenplay conventions the rules permit |
| MCP (Drafter for Claude) | New | "built from the public MCP specification and the SDK's own documentation only" (`docs/drafter-for-claude-design.md:320`) | An open standard and a declared dependency |
| Production conventions (revision colours, A-pages, A-scenes, OMITTED, eighths, sides) | New | "the industry's conventions"; "The industry order (WGA convention)" (`docs/drafter-production-design.md:9`, `:59`) | Industry conventions, which the rules permit. No document or date is cited for them |
| EPUB, HTML | No | As last time; EPUB 3.3 now cited | Unchanged |

**No format knowledge is sourced from an AI-written specification, a converter's source or test data, or a decompiled app.** The repository was searched for Gemini, ChatGPT, "AI-generated", "AI-written", and "LLM": the only relevant hit is the Production design's line that such a template was rejected. No file from that template is in the repository or its history, by name (`fd13`, `template`, `spec` in every path ever added).

**Finding 3. The rules file says no real Highland file has been checked. One has.** `docs/clean-room.md:17` says "real files not yet checked" and line 57 says "No real `.highland` or `.fadein` file has been checked yet." `docs/DEFERRED.md:174` says "done for one file, 2026-10-30. The maintainer supplied Highland's own published sample screenplay from the app maker's document library", with the four questions it settled. That was two days before the last audit, which repeated the rules file's sentence. The check itself followed the rule (structure only, never committed). The rules file is wrong about what has been read, which is the one thing it exists to record.

**Finding 4. The rule against AI-written specifications is cited but written down nowhere.** `docs/drafter-production-design.md:24` rests a decision on "[FDX test sources](FORMATS.md); the 2026-11 decision that an AI-generated `.fdx` template contradicted real files". `docs/FORMATS.md` has no such section (it does not contain the words "real", "sample", or "supplied"), `docs/DECISIONS.md` has no entry for that decision, and `docs/clean-room.md` does not mention AI-written specifications. The rule was followed here, but a contributor cannot find it.

**Finding 5. One Final Draft attribute name has no source.** `docs/plans/2026-11-21-sentence-page-breaks.md:30` says Final Draft's "files carry `BreakDialogueAndActionAtSentences="Yes"`". The name appears nowhere else in the repository: not in the code, and not in the DECISIONS notes on what the real samples showed. It is not used by any code, so nothing depends on it. It is the same kind of gap as the 18 settings names last time: a fact about a proprietary format with no recorded source.

**Finding 7. ECMA-376 is named in the code but not in DECISIONS.** The Manuscript exports entry (`docs/DECISIONS.md:1553`) records the choices but not the standard's edition or the date it was read, which Highland, OSF, and (since the last audit) EPUB have.

## 7. AI-assistant provenance: recorded plainly, with a gap

- `clean-room.md:82` still says it in words: most of Drafter's code is written by an AI coding assistant working under these rules and reviewed by the maintainer.
- **Plans since the baseline.** Five of the eight state the clean-room rule: Story map, Classic Mode, Drafter for Claude, Novel, and Manuscript. **Three do not** (finding 6): `docs/plans/2026-11-09-production-plan1.md`, `2026-11-09-production-plan2.md`, and `2026-11-21-sentence-page-breaks.md` have no mention of it, and neither do the Production, Novel, and Manuscript design documents. Production is the feature nearest to another app's behaviour (its design compares its marks with Final Draft's output at line 108), so it is the one where the instruction matters most.
- **The session constraints files** are still not kept: `.superpowers/` is gitignored and no copy is committed, so this audit cannot show what any session was told.
- **Commits.** 328 non-merge commits since the baseline: 324 by the maintainer and 4 by Dependabot (version bumps). No commit on any ref carries a `Co-Authored-By` line (one search hit is the phrase "regenerated with pnpm install").
- **Inherent limit, as before.** Finding 5 is this audit's example of knowledge with no recorded source.

## 8. Git history: PASS

- **Authors:** across all 1,299 commits on 151 refs, `cschweda` (1,242), the same person's merges made on GitHub as `Chris Schweda` (48), and `dependabot[bot]` (9, of which 4 are ancestors of `HEAD`: Caddy image bumps and two dependency groups).
- **Force-pushes:** the reflogs of `origin/main` (135 updates) and `origin/staging` (43) were walked; **every update is a fast-forward** of the one before.
- **Files added and later removed:** 36 paths were once tracked and are not now. One is a fixture, `apps/web/test/fixtures/title-before.ts`, Drafter's own. No path with another app's file extension was ever added outside the fixture folders (check 4).
- **Large files added since the baseline:** every blob over 200 KB is DECISIONS.md, CHANGELOG.md, the lockfile, the four Liberation Serif files, and two brand SVGs. All are accounted for.
- **Not re-checked:** whether any tag moved before its release was published, which the last audit traced for two tags. Tags v0.24.1 to v0.27.2 exist.

## 9. Assets, names, and claims

### 9a. Fonts, dictionaries, icons, sounds: PASS, with one gap in the docs

| Asset | Files | Licence and source beside it | Verified here |
|---|---|---|---|
| Liberation Serif ×4, **new** | `packages/render-pdf/fonts/liberation-serif/` | `OFL.txt` (the release's `LICENSE`); the README names version 2.1.5, the GitHub release, the download date (2026-11-05), and a SHA-256 for each file | All five SHA-256s recomputed and match. Served at `/fonts/liberation-serif/` with `OFL.txt` (`apps/web/scripts/sync-assets.mjs:58-63`); on the Third-party licences page with both copyright lines (`licences.vue:118-131`). **Not in `DEPENDENCIES.md`'s Fonts table** (finding 2) |
| Anton, Archivo ×2, Courier Prime subset | `packages/story-map/fonts/` | `OFL-Anton.txt`, `OFL-Archivo.txt`, `OFL-CourierPrime.txt`; the README gives the `google/fonts` commit, the source files' SHA-256s, and the exact subsetting commands | All seven SHA-256s recomputed and match. In `DEPENDENCIES.md` and on the licences page |
| Courier Prime, Inter Tight | unchanged | As the last audit recorded | Files unchanged since the baseline |
| Spellcheck dictionaries, the en-US `.bdic` | unchanged | As the last audit recorded | Unchanged |
| Icons | Lucide and Heroicons icon data, by name (`i-lucide-*` 319 uses, `i-heroicons-*` 1) | ISC and MIT, declared dependencies | As before; neither is on the licences page (the open web-bundle notices item) |
| Sounds, **new** | none | "Made with the Web Audio API, from noise and two tones: no audio file, nothing fetched" (`apps/web/app/editor/key-sounds.ts:4-9`) | No audio file is tracked (no `.mp3`, `.wav`, `.ogg`, `.m4a`), and no `data:audio` appears in the app |
| Brand files, diagrams, screenshots | `brand/`, `apps/web/app/assets/diagrams/`, `docs/images/` | Generated by `brand/build.mjs` and `scripts/diagrams.mjs`; Drafter's own | By file list; one screenshot opened |

**Liberation Serif's Reserved Font Names.** Unlike the other fonts, its licence reserves names ("Liberation", and Arimo, Tinos, and Cousine). The four files are served and committed unmodified, which the OFL allows under the same name. In a manuscript PDF they are embedded as subsets; the OFL's own FAQ treats embedding in a document as use of the font, not as a modified version to be renamed. This is the auditor's reading, not legal advice.

### 9b. Claims about other apps: PASS

The comparison's sources line is unchanged and still dated (`apps/web/app/pages/docs/why.vue:331-332`, `README.md:230`: "each maker's own pricing, features, and help pages ... read on 31 October 2026"). `why.vue` changed by 19 lines since the baseline; the sources were not re-read against the makers' sites.

### 9c. Trademarks and names: PASS

- **Final Draft:** "Final Draft is a trademark of its owner. Drafter reads and writes its file format so a script can move between the two apps, and isn't connected with or endorsed by Final Draft" is in `README.md:380`, `docs/FORMATS.md:38`, and `apps/web/app/pages/docs/open-formats.vue:57-58`; a shorter line is on the Classic Mode help page (`classic-mode.vue:320`), as its plan promised.
- **Claude and Anthropic:** "It isn't made by or connected with Anthropic" is on the help page (`drafter-for-claude.vue:84`, checked by `apps/web/e2e/docs.spec.ts:722`) and in `packages/mcp/README.md:7`, as the design promised (§11, call 1).
- **Highland, Fade In, WriterDuet, Arc Studio, Celtx, Word, Times New Roman:** named only to describe a format, a comparison, or a font a file asks for. No document promises a trademark line for them, and none has one.
- **Drafter's own mark** is stated in the README, About, and two help pages.

---

## Findings, by severity

None is copied code or a file from another app. "Medium" here means a rule in `clean-room.md` is plainly not met; "Low" means a record is missing or stale.

| # | Severity | Finding | Where | Recommended fix |
|---|---|---|---|---|
| 1 | Medium | A film's character, a second character, and part of its catchphrase are back in a test, after two audits removed them | `packages/layout/test/layout.test.ts:228-235`; comments at `packages/layout/test/properties.test.ts:77` and `packages/layout/src/lines.ts:257`; `CHANGELOG.md:87` | Use `@McBRIDE` and an original line, as the 2026-11-01 decision says. Add a test that fails if `McCLANE`, `Yippee`, or `ki-yay` appears in any tracked test, fixture, or source file, so it cannot come back a fourth time |
| 2 | Medium | `DEPENDENCIES.md` is behind the packages: two workspace packages with no row, six missing edges, one font missing | `docs/DEPENDENCIES.md` (rows for `@drafter/novel`, `@drafter/production`; cells of `@drafter/cli`, `@drafter/cm-fountain`, `drafter-mcp`, `@drafter/render-pdf`; the Fonts table for Liberation Serif) | Add the rows, edges, and font. Then make the cross-check a script that CI runs, since this is the second audit to find the same drift |
| 3 | Low | The rules file says no real Highland file has been checked; one was, on 2026-10-30 | `docs/clean-room.md:17`, `:57`, against `docs/DEFERRED.md:174` | Say what happened: one real `.highland` (the maker's own published sample), structure only, never committed; no real `.fadein` yet |
| 4 | Low | The rule "build `.fdx` only from real files, never from an AI-written specification" is cited but recorded nowhere | `docs/drafter-production-design.md:24` links a section `docs/FORMATS.md` doesn't have; no DECISIONS entry | Add a dated entry under DECISIONS, "Clean room", telling what happened, and one bullet in `clean-room.md` under "Final Draft support comes from the files". Point the design's link at it |
| 5 | Low | A Final Draft attribute name with no recorded source, in a plan | `docs/plans/2026-11-21-sentence-page-breaks.md:30` (`BreakDialogueAndActionAtSentences`) | Confirm it in the maintainer's Final Draft 13 sample and say so in DECISIONS, or remove the parenthesis |
| 6 | Low | Three plans and the Production design don't state the clean-room rule; the sessions' constraints files are still not kept | `docs/plans/2026-11-09-production-plan1.md`, `2026-11-09-production-plan2.md`, `2026-11-21-sentence-page-breaks.md`, `docs/drafter-production-design.md` | Put the rule in a short shared file that every plan must link, and have a test check that each file in `docs/plans/` links it |
| 7 | Low | ECMA-376 is the Word export's source but DECISIONS doesn't cite it | `docs/DECISIONS.md:1553`; `packages/render-docx/src/parts.ts:1-2` | Add the edition and the date read to the Manuscript exports entry, and add ECMA-376 and the MCP specification to `clean-room.md`'s permitted sources table |
| 8 | Low | A planned feature shares its name with a Final Draft feature | `docs/WHY.md:45`, `docs/drafter-phase2-design.md` (25 times), three code comments | Before it ships, check whether the name is claimed as a mark and choose Drafter's own name if so, as was done for Classic Mode and the Fifteen beats guide (`docs/drafter-phase2-design.md:772`) |
| 9 | Low | The Excluded list bans other apps' "sample files", while the same file permits reading makers' samples for structure | `docs/clean-room.md:26`, against `:16` and `:53` | Reword the excluded line: never committed, never copied, never a source of text; reading a file the maintainer owns for its structure, locally, is the one permitted use |

Also recommended, not findings:

- **A guard for real `.fdx` files.** A test that every tracked `.fdx` is under 20 KB and either sits in a trap or fixture folder or opens with the "Synthetic test file" comment would stop a real one being committed by mistake. `.gitignore` cannot do it.
- **Update `clean-room.md`'s verification section** for this audit ("audited against these rules twice" is now three times), with the README's audit record and `docs/DEVELOPMENT.md:187`.
- **Remove the "Pending" Classic Mode row** from the clean-room table in [Audits](AUDITS.md): this audit is the check it was waiting for.
- **Still open from earlier audits:** third-party notices for the web bundle (`docs/DEFERRED.md:11`).

## Open questions for the maintainer

These cannot be settled from the repository.

1. **Are three small values invented, or do they come from a real Final Draft sample?** A character name (`packages/fdx/src/import.ts:577`, `packages/fdx/test/import.test.ts:272-287`); a color value (`packages/fdx/src/color.ts:1`, `import.test.ts:226`, `:262`, under "As Final Draft 13 writes one"); and a page-goal label quoted in `docs/DECISIONS.md:1598`. (The three values were quoted here when this was written; they turned out to come from a sample, so they are no longer repeated.) If any was read off a sample, it is text or a value from a proprietary file, however small, and should be replaced with an invented one.
2. **Where did `BreakDialogueAndActionAtSentences` come from** (finding 5): the real sample, or the assistant's general knowledge?
3. **Where do the real sample files live?** Outside every checkout, or in a working tree where a stray `git add` could reach them?
4. **Were the Production and sentence-break sessions given the clean-room instructions** (finding 6), even though their plans don't say so?
5. **Is "Beat Board" a name Drafter means to keep** (finding 8)?
6. **Does the published `drafter-mcp` on npm match what the scripts would build?** Not unpacked here.

## What this audit could not check

- **Installed packages.** No `node_modules` in this worktree and no install allowed: `pnpm licenses list` was not run, no installed licence file was read, and licences for the 23 new lockfile names are the npm registry's declared field only. Licence changes in packages that were merely bumped were not looked for.
- **Any build.** The web build's surviving licence banners, the Drafter for Claude bundle's appended licences, and the desktop app's packed licences (`check-asar.mjs`) are inferred from scripts and tests that were read, not from output.
- **Released files.** The npm package, the installers, and the GitHub Releases' files were not unpacked.
- **The v0.27.3 release commit**, which is uncommitted work in another checkout.
- **Tests.** No test was run. The browser suite was off limits, and nothing here needed a unit test.
- **What was read off the real sample files**, and whether the assistant's sessions were given the rules.
- **Whether "Beat Board" is a registered or claimed mark**, and whether `@McCLANE` is the specification's exact example. Both are from the auditor's memory; no web page was fetched.

## After the audit: the maintainer's answers, and what was fixed (2026-11-23)

The maintainer answered the open questions the next day, and the fixes went in with this record.

| Question or finding | Answer | What was done |
|---|---|---|
| Question 1: three small values | They came from the sample scripts in Final Draft's own Help menu | All three replaced with invented values or removed; the tests pass on the new ones |
| Question 2, finding 5: the attribute name | "Not sure" | Removed from the plan. No code used it |
| Question 3: where the real samples live | In `samples/fdx/` of the main checkout, kept out by that checkout's local exclude file only | `.gitignore` now closes `samples/fdx/` to everything but its README and Drafter's two synthetic files |
| Question 4, finding 6: were the sessions given the rule | Yes | The three plans say so, with the date it was recorded |
| Question 5, finding 8: "Beat Board" | It is Final Draft's name, from the app itself | Drafter's planned feature is now the Wall, in every living document and comment, and its block in the file is `/* the wall` |
| Question 6: the npm package | Not answered here | Still open |
| Finding 1: the film reference | | Replaced in the layout tests, two comments, and the changelog |
| Finding 2: `DEPENDENCIES.md` | | The two rows, six edges, and the font are added |
| Findings 3, 4, 7, 9: the rules file | | Corrected: the Highland file that was checked, the rule against AI-written specifications, ECMA-376 and the MCP specification as sources, and the wording on sample files |

The guard tests this audit recommends were added on 2026-11-23 (`packages/fdx/test/clean-room.test.ts`): a film-reference check, a size and folder check for tracked `.fdx` files, and a cross-check of `DEPENDENCIES.md` against the packages. The three replaced values remain in the repository's history, which is not rewritten.

## What an audit like this cannot prove

- **Independent creation is a fact about process, and a repository can only record it.** These checks find copying that leaves traces. They cannot detect code paraphrased from memory.
- **AI training data.** The assistant is told not to read other implementations. No one can list or remove what a model learned in training; finding 5 is the example this time.
- **Comparison scope.** The similarity check relies on the auditor's knowledge of well-known projects. Comparing against other screenwriting code would mean reading it, which would break the clean room.
- **The auditor is also an AI model,** of the same family that wrote most of the code. It may share blind spots with the author. An independent human review would not.
- **Point in time.** This covers the commits above.
- **Not legal advice.** Licence classifications rely on declared licence fields and the files read here.
