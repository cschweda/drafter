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
- Drafter's visual identity, in `brand/`: the mark (plain-text source on one side of a line, the formatted script on the other, on a tile of revision-page colors), the "drafter" wordmark in Inter Tight, a palette taken from the colors of revised script pages, a 1200 × 630 share image for links (`og-image.svg` and `.png`), navbar logos for dark and light backgrounds, and favicons and app icons from 16 to 512 px. Every letter is an outline, so the SVGs render the same everywhere; `node brand/build.mjs` regenerates them all, byte for byte. Inter Tight ships in `brand/fonts/` under the SIL Open Font License.
- A README section on the clean-room implementation: what it means, why it works, why it matters for an MIT-licensed engine, and what it asks of future contributors, including those using AI assistants. `docs/DEPENDENCIES.md` lists every dependency and why it's needed.
- The Phase 1 design, `docs/drafter-phase1-design.md`, with clickable mockups and screenshots in `docs/phase1/`. It covers:
  - the first visit: drafter.dev opens on a sample screenplay, with a welcome dialog and a guided tour built on ICJIA's `nuxt-guided-tour` module
  - the editor, laid out like the Inform 7 IDE and dark by default
  - autocomplete for character names and locations
  - focus mode, typewriter scrolling, a sprint timer, a daily goal, and counts
  - saving into synced folders, with a check for a file changed on another computer before you type over it
  - phones, one pane at a time
- The first of five Phase 1 implementation plans, `docs/plans/2026-10-25-phase1-plan1-shell-and-deploy.md`: the app shell, Netlify configuration, and the content security policy.
- The second Phase 1 plan, `docs/plans/2026-10-25-phase1-plan2-editor-packages.md`: the text renderer moved out of the CLI, the linter, the Script pane's HTML renderer, and the CodeMirror integration.
- `apps/web`, the Nuxt app for drafter.dev (Nuxt 4 with Nuxt UI 4), generated as static files.
  - **Page shell:** `/` is prerendered with Drafter's title, description, and share image. Its loading screen carries the description, for search engines and for readers without JavaScript.
  - **Defaults:** dark by default, with fonts and icons served from drafter.dev itself.
  - **Commands:** `pnpm dev` runs it, and `pnpm e2e` builds it and runs its browser tests in Chromium, Firefox, WebKit, and a phone-sized Chromium.
- Netlify configuration, `apps/web/netlify.toml`, with the build command, the publish directory, and Node 22. Netlify's site settings had the site on Node 16; this overrides them. The app pins Nitro's `static` preset, since on Netlify Nitro would otherwise write the site somewhere the publish directory doesn't look. `pnpm e2e` builds from clean, with Netlify's environment variable set, to keep it that way.
  - **Content security policy:** every build writes a `_headers` file whose policy allows only the inline scripts that build produced, by hash.
  - **Other headers:** `nosniff`, no referrer, no camera, microphone, or location access, and long caching for the fingerprinted build files.
  - **Tests:** the browser tests run under the policy and check that it blocks nothing Drafter needs. They also check that a visitor who chose the light theme gets it before the page draws.
- The editor's shell in `apps/web`, laid out like the Inform 7 IDE:
  - **Panes:** two of them, each with Source, Script, and Problems tabs. A tab shows in one pane at a time, so choosing one that's open in the other pane swaps them.
  - **Keyboard:** the divider resizes with a pointer or arrow keys, and F6 moves between the panes.
  - **Toolbar:** round action buttons and a light/dark switch that's remembered.
  - **Status bar** along the bottom.
  - **Phones:** below 1024px, one pane shows at a time, opening on the Script tab. The page fits a 320px screen without scrolling sideways, tested in Chromium on a Pixel 7 and in WebKit on an iPhone SE.
  - **High contrast:** in Windows High Contrast, a border marks the selected tab.
  - **Toolbar spacing:** more room between the logo and the toolbar's buttons: 28px on a desktop, 14px on smaller screens.
  - **Colors:** design tokens for both themes, with every text color tested for WCAG contrast.
  - **Tests:** the browser tests check the layout, keyboard use, visible focus on every control, and axe in both themes. The toolbar's actions wait for the editor and files in later plans.
- `@drafter/render-text`: `renderText(layout, template)`, the fixed-width text renderer, moved out of `@drafter/cli` into a package of its own, so the app can export plain text without depending on the command line. The text is unchanged: `drafter build --txt` writes what it always did, and the CLI now imports the renderer, so its entry point exports only `run`.
- `@drafter/fountain`: `doc.regions`, every note and boneyard in source order as `{ kind, span, closed }`, so the editor can color them from the parse instead of scanning the text again. An unclosed boneyard runs to the end of the source with `closed: false`; an unclosed `[[` stays text and is no region. `toJSON` is unchanged.
- `@drafter/templates`: `heading` on a role's style, an integer from 2 to 6, the heading level that role's blocks take in the rendered script, so heading navigation follows what prints. `us-screenplay` marks scene headings level 2; `stage-play-standard` marks act headings level 2 and scene headings level 3. The stage play also turns off the `heading-no-time` and `transition-not-last` lint rules, since a play has no sluglines or transitions. The layout ignores `heading`.
- `@drafter/lint`: `lint(doc, template, options)` returns a parsed script's problems sorted by position, each with a rule id, a severity, the text it is about, a message, and sometimes a fix: a list of text changes in the script's own offsets. It starts with the parser's diagnostics, as four rules.
  - **Rules:** `unclosed-region` (an error for a boneyard, a warning for a note), `invalid-meta` (a warning), and the Strict Fountain rules `heading-blank-after` and `multiline-parenthetical` (info).
  - **Fixes:** *Insert a blank line* and *Join onto one line*. Both keep the file's line endings, CRLF included. A heading whose line break falls inside a note or a boneyard is reported with no fix: a blank line in a note would end it, and one in a boneyard would leave the text below the heading where it was.
  - **Options:** `strict` raises the Strict rules to warnings, and a template's `lint.disable` and the `disable` option turn rules off by id.
  - **Tests:** every rule's hits and non-hits; properties over generated scripts for the fixes (each settles its own problem, all can be made at once, and none changes a line ending); and hostile files that must lint in under a second.
- `@drafter/lint`: four more rules, for mistakes the parser can't see on its own.
  - **`character-without-dialogue`** (warning): an upper-case line shaped like a cue (`MARGARET`, `BRICK (V.O.)`, `HANS (on the radio)`), alone in its block, followed by one blank line and an action block that opens with a parenthesis or is about a character cued elsewhere in the script. The parser reads it as action, and the fix, *Remove the blank line*, makes it a cue. Forced action (`!`) and lines with emphasis are left alone.
  - **`manual-contd`** (info): a `(CONT'D)` typed on a cue where the layout would add one itself: the template continues speeches after action, and the same speaker spoke earlier in the scene. So it says nothing on the first speech in a scene, after someone else's, on dual dialogue, or in the stage play. The rule makes the layout's own decision, and a test checks it against `paginate` in seven templates. The fix, *Remove (CONT'D)*, takes out every one on the cue, with the spaces before it.
  - **`heading-no-time`** (warning): a scene heading with no time of day. A forced heading (`.MONTAGE`) is how Fountain writes one without, so it is never reported, and the stage play turns the rule off.
  - **`transition-not-last`** (warning): a transition that isn't followed by a scene heading, a section, or a page break. Notes, boneyard, synopses, and centered text between them are skipped, so `>FADE OUT.` then `> THE END <` passes, and a transition that ends the script passes. The stage play turns this rule off too.
  - **Tests:** hits and non-hits for every rule; the cue test checked against the parser, and `manual-contd` against the layout, on thousands of generated scripts; properties that each fix settles its own problem and keeps the file's line endings; the rules on the classification fixtures; and a 200 KB hostile script, with thirteen other hostile files, that must lint in under a second.
- `@drafter/lint`: the `similar-names` rule (info), the last of Phase 1's rules. It finds two character names one edit apart, such as `MARGERET` beside `MARGARET`, which are probably one character typed two ways, and says so: `"MARGERET" is one letter from "MARGARET", which has 12 cues. A typo?`
  - **When:** both names have at least five letters, one is cued twice or less, and neither is the start of the other. So `MAX` and `MAC` (too short) and `DANNY` and `DANNYS` (a prefix) are left alone. An edit is a letter changed, added, or left out, or two letters side by side swapped, counted in code points, so an emoji is one. Names that differ only in case, such as `@McCLANE` and `MCCLANE`, are one name, and their cues add up. Names that differ only in their digits, such as `GUARD 1` and `GUARD 2` or `GUARD 12` and `GUARD 2`, are numbered characters and are never reported, in any script's digits; `AGENT 47` beside `AGENT47` differs by a space, and still is.
  - **Where:** once for each pair, at the first cue of the rarer name, or of the one that first appears later when they tie. There is no fix.
  - **Marked as distinct:** a pair listed in the metadata block's `distinctNames`, such as `[["MARGARET", "MARGERET"]]`, is never reported, in either order and in any case. A `distinctNames` that isn't a list of pairs is ignored.
  - **Speed:** only names that share a key are compared, where a name's keys are its letters and its letters with any one code point left out, so the work grows with the number of names, not its square. A name of more than 32 code points isn't compared, and neither is a group of more than eight names that differ in one place, a series such as `SOLDIER A` to `SOLDIER I`, so a hostile file can't slow the linter or flood the report.
  - **`withinOneEdit(a, b)`** is exported: whether the restricted Damerau-Levenshtein distance between two strings is at most 1.
  - **Tests:** hits and non-hits for each condition and each kind of edit; ties, and counts that add up across spellings; a `distinctNames` of every wrong shape; numbered characters left alone, and typos beside them still found; differential properties, over names with and without digits, that the index finds exactly the pairs that comparing every name with every other finds, and that `withinOneEdit` agrees with the full distance table; and twenty thousand names, thousands of them a pair, found in under a second, with a count worked out another way.
- `@drafter/render-html`: the Script pane's renderer, which draws a layout's pages as accessible DOM. Each line that prints is its own element, placed by row and column on the character grid the PDF and the text export use, and blank lines aren't drawn. `style.css` positions it all, and takes the paper and the type from the `--drafter-page` and `--drafter-ink` variables.
  - **Reading:** each page begins with a hidden "Page N" marker, or "Title page". Scene headings are level-2 headings, and in the stage play act headings are level 2 and scene headings level 3, read from the templates' `heading`. Each speech is a group labelled by its cue, and a speech that carries on to the next page is labelled there by the cue the layout repeats, `MARGARET (CONT'D)`. Dual dialogue reads the left speech before the right, whichever column is longer. `(MORE)`, page numbers, scene numbers, headers, and footers are hidden from screen readers.
  - **`speechRoles(template)`** reads which roles open a speech, and which carry it on, from a template's role map, so a template that gives sound cues a role of their own gets its groups too.
  - **Safe text:** script text reaches the DOM only through `textContent`. Control characters and the Unicode line and paragraph separators print as spaces, each keeping its column, as in the PDF and the text export.
  - **The view:** `createScriptView(container)` adds the labelled Script region. Drawing into it, reporting clicks as `drafter:goto`, and following the cursor aren't in it yet.
  - **Tests:** the whole contract in jsdom; properties over generated scripts in both built-in templates (every line that prints is drawn once, where the layout puts it; each speech is named from inside; only `(MORE)` and the furniture are hidden; dual dialogue's two columns stay whole across pages); and hostile pages (a cue of twenty thousand lines, ten thousand speeches, and ten thousand rows of dual dialogue) that must build in under a second. `jsdom` and `@types/jsdom` are new development dependencies, for these.
- `@drafter/cm-fountain`: Fountain in CodeMirror 6, starting with the parse in the editor's state and the highlighting read from it. `@drafter/fountain` is still the only parser, and there is no Lezer grammar. The five CodeMirror packages it uses are general-purpose editor libraries, listed in `docs/DEPENDENCIES.md`.
  - **The parse:** `parsedDoc` is a state field that holds the parse of the text, `parse` when the state is created and `reparse` on every change, so every other editor feature reads it and none parses again. It parses the text with `\n` between the lines, whatever the file used, so the parser's offsets are CodeMirror's positions, even when an app sets `EditorState.lineSeparator`.
  - **The highlighting:** `fountainDecorations(state, ranges)` builds the decorations for the ranges given, and `fountainHighlighting()` is the view plugin that keeps them for the visible ranges, folded ranges included.
    - Each line gets `cm-f-<kind>` for its block (`cm-f-scene_heading`, `cm-f-character`, and so on), and each title page line gets `cm-f-title`, with `cm-f-title-key` on each field's `Key:`.
    - Each styled run gets `cm-f-b`, `cm-f-i`, or `cm-f-u`, and each note and boneyard gets `cm-f-note` or `cm-f-boneyard`.
    - Every other character a line doesn't print, except whitespace, gets `cm-f-marker`, so a theme can dim it: forced markers, `#`, `=`, `^`, emphasis markers, scene numbers, and escapes. `INT. HALL - DAY #12#` dims `#12#`, and `**bold**` dims each `**`.
    - Only the blocks that touch the ranges are decorated, so a keystroke costs the lines in view and not the script.
  - **Tests:**
    - The parse equals a fresh one after 200 random sequences of multi-range edits, and with CRLF text and each line separator.
    - Every character that isn't whitespace, in the generated scripts, the repository's fixtures and samples, and strings made of the characters that mean something, is printed, in a note or boneyard, in a key, or a marker, found by comparing the decorations with the parser's own runs.
    - A view in jsdom shows the classes, follows edits, and decorates what an unfold shows again.
    - Hostile scripts and edits must finish in under a second.

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
- The README opens with Drafter's share image.
- The roadmap grows:
  - **Phase 1** adds the first visit and its tour, the Inform-style layout, focus mode, typewriter scrolling, a sprint timer, a daily goal, and counts.
  - **Phase 2** adds a Beat Board, storylines, writing statistics by day, and screen time per character. Testing with NVDA and VoiceOver moves to Phase 2. Phase 1 checks accessibility with automated tests and doesn't claim WCAG conformance.
  - **Phase 3** adds imports from Highland, Fade In, and Celtx, and a template for novels.
  - **Phase 4** adds production revisions and alternate versions of a line.
  - **A later phase** adds direct Open and Save for Dropbox and Google Drive. You sign in with those services, never with Drafter.
- The Phase 1 design is approved, and the architecture and technical design now match it:
  - either pane can show any tab
  - the theme is dark by default
  - a file changed elsewhere goes through the new check
  - screen-reader testing starts in Phase 2

  Proof mode, with reader notes kept as Fountain notes and shown like Word comments, joins Phase 4.

### Security

- `@drafter/fountain` now parses hostile input in linear time. Before this fix, a single 4 KB line could stall the parser for seconds through backtracking regular expressions (cue lines, title-page keys, scene numbers), and long paragraphs of unclosed `[[`, deeply nested emphasis, or thousands of note blocks slowed it quadratically. Emphasis nested past 32,767 levels also lost its styling.
- `drafter` (the CLI) prints control characters from scripts, templates, and file names as visible `\u001b`-style escapes, so a hostile file can't send escape sequences to the terminal through a warning or diagnostic, and it won't write a PDF's bytes to a terminal. Fixed-width text output turns C1 control characters into spaces, as it already did C0.
- `@drafter/templates` now validates a template with any number of roles in linear time, and always reports its problems as a `TemplateError`. A template with 200,000 roles took 15 seconds to reject, and one with enough problems overflowed the call stack with a `RangeError` instead.

[Unreleased]: https://github.com/cschweda/drafter/commits/main
