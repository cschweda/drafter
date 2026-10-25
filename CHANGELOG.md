# Changelog

All notable changes to Drafter are recorded here, and every push updates this file. Add entries under **[Unreleased]**, grouped as Added, Changed, Deprecated, Removed, Fixed, or Security. The pre-push hook in `.githooks/` rejects a push when none of its commits touch this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and packages follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Nothing has been released yet. When a release is cut, its entries move from [Unreleased] into a new section headed with the version and date.

## [Unreleased]

### Added

- Design documents in `docs/`: the high-level architecture, the technical design, and the Phase 0 kickoff prompt.
- README covering the vision, principles, architecture, packages, and the phased roadmap.
- MIT license.
- `.nvmrc` pinning Node 22.
- `.gitignore` for a pnpm, Node, and Nuxt monorepo.
- Pre-push hook (`.githooks/pre-push`) that rejects a push unless at least one of its commits updates this changelog.
- Sample scripts in `samples/`: a short screenplay and a short stage play that tell the same story, with notes in the source explaining each piece of Fountain.
- Phase 0 workspace: pnpm 10, TypeScript 5.9 (strict, ESM), Vitest 5 with one project per package, tsdown builds, Biome, and fast-check.
- `@drafter/fountain`: the lossless Fountain parser. `parse`, `reparse`, `print`, `toJSON`, `blockAt`, `characters`, and `locations`, with diagnostics for unclosed notes and boneyard, invalid metadata, and lenient readings. Tests cover 41 hand-written classification fixtures, 10,000 arbitrary strings for round-tripping, and 1,000 random edit sequences for `reparse`; `pnpm bench` times a 200 KB parse (about 1.5 ms against a 5 ms budget).
- `@drafter/fountain`: `line.transparent`, so pagination can tell a line holding only a note from a blank line inside a speech, and styled `runs` for title-page values.
- `@drafter/templates`: the template schema and loader, with inch conversion, `extends` merging, and validation that reports every problem with its path; `resolveRole`; and the `us-screenplay` and `stage-play-standard` built-ins.
- Layout fixtures in `fixtures/layout/`: seven scripts with hand-derived page positions and the arithmetic behind them, written and reviewed before the layout code existed.
- `@drafter/layout`: `paginate` and `wrap`. Lays a parsed script out on pages as a template describes: word wrap, keep-with-next look-ahead, speeches split with `(MORE)` and `(CONT'D)`, the continued-speech `(CONT'D)`, dual dialogue, scene and page numbers, forced breaks that never make a blank page, and the `centered-feature` title page. Tested against the seven layout fixtures, structural properties over generated scripts in both built-in templates, and hostile inputs that must lay out in under a second; `pnpm bench` times a 190-page script at about 7 ms.
- `docs/DECISIONS.md` and `docs/DEFERRED.md`, recording choices the design leaves open and work saved for later phases.
- `@drafter/render-pdf`: `renderPdf(layout, template, { fonts })` draws laid-out pages as a PDF at the template's paper size, with Courier Prime embedded as subsets of only the styles a script uses, underlines, page and scene numbers, headers and footers, and the title page's title as the document title. It reads no files, so it runs in Node and in a browser worker, and the same layout always gives the same bytes. Courier Prime's four styles ship in the package's `fonts/` folder under the SIL Open Font License, with their source and checksums recorded. Tests read every layout fixture back with pdfjs and find each line within half a point of its grid position.
- `@drafter/cli`: `drafter build` writes a script as PDF, fixed-width text, or JSON, choosing the template from `--template`, the file's metadata block, or `us-screenplay`, with `--scene-numbers` and `-` for standard output. `drafter check` lists every parse and layout diagnostic as `file:line:column` and exits 1 on any error. The root `pnpm drafter` script runs it from the repository root; tests run it that way too, covering the kickoff's acceptance tests 9 and 11 and its "Done means" command.
- A README section on the clean-room implementation: what it means, why it works, why it matters for an MIT-licensed engine, and what it asks of future contributors, including those using AI assistants. `docs/DEPENDENCIES.md` lists every dependency and why it's needed.

### Changed

- Revised the design documents to v0.2 after a pre-implementation review:
  - The parser reads two common mistakes leniently: a heading or transition with no blank line after it, and a parenthetical wrapped across lines. Each is flagged for a Strict Fountain lint rule that rewrites the source into spec form.
  - Notes end at the first blank line, per the spec, and an unclosed `[[` stays literal text.
  - Every edit triggers a full reparse; the windowed incremental design is set aside.
  - The parse result gains `doc.trailing`, so printing is lossless for files that end in a newline, plus parse diagnostics for `drafter check`.
  - Templates gain a reserved `omit` role for elements that never print, a physical paper size, exact-name role rules instead of regular expressions, and explicit `extends` merge rules.
  - Pagination rules are now precise: keep-with-next look-ahead, corrected dialogue-split thresholds, engine-added `(CONT'D)` for continued speeches, and no blank pages from forced breaks.
  - Phase 0 tooling is updated: tsdown, Vitest `test.projects`, pnpm 10, `@pdf-lib/fontkit`, `pdfjs-dist`, `@types/node`, and a "Done means" command that works.
  - The kickoff prompt adds rules for changelog entries, commit trailers, and hook setup.
- Saving now works like a desktop app (design, Phase 1): Save and Save As write a `.fountain` file, in place on Chromium and by download elsewhere; leaving with unsaved changes asks first; and an always-on recovery copy in IndexedDB is written as you type, with warnings when the browser blocks it or may clear it. This replaces the earlier policy of never warning.
- Tightened three v0.2 rules found while writing the samples: a character cue is a name plus optional extensions and nothing else, so `MARGARET (60s) sits…` stays action; dual dialogue never takes a continued-speech `(CONT'D)`; and Brave saves by download, because it ships with the File System Access API turned off.
- Developing Drafter now needs Node 22.13 or later (the root `engines` field): `pdfjs-dist` 6, which the PDF tests use, requires it, and the CLI's `commander` 15 requires 22.12. `.nvmrc` still says `22`, which installs the latest 22.x.
- The README marks Phase 0 done and shows how to install, build, test, benchmark, and run `pnpm drafter` from the repository root. PDFs built from `samples/` and `fixtures/` are ignored by Git.

### Security

- `@drafter/fountain` now parses hostile input in linear time. Before this fix, a single 4 KB line could stall the parser for seconds through backtracking regular expressions (cue lines, title-page keys, scene numbers), and long paragraphs of unclosed `[[`, deeply nested emphasis, or thousands of note blocks slowed it quadratically. Emphasis nested past 32,767 levels also lost its styling.
- `drafter` (the CLI) prints control characters from scripts, templates, and file names as visible `\u001b`-style escapes, so a hostile file can't send escape sequences to the terminal through a warning or diagnostic, and it won't write a PDF's bytes to a terminal. Fixed-width text output turns C1 control characters into spaces, as it already did C0.
- `@drafter/templates` now validates a template with any number of roles in linear time, and always reports its problems as a `TemplateError`. A template with 200,000 roles took 15 seconds to reject, and one with enough problems overflowed the call stack with a `RangeError` instead.

[Unreleased]: https://github.com/cschweda/drafter/commits/main
