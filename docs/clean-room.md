# Clean-room implementation

Drafter is written from scratch, from public specifications, without reading anyone else's implementation. This document explains what that means, why it works, why it matters, and what it asks of everyone who works on Drafter. It describes the project's practice; it isn't legal advice. The [README](../README.md#clean-room-implementation) has the short version.

## What it means

A clean-room implementation keeps two things apart: *what a program has to do*, which comes from public written sources, and *how the code does it*, which comes only from the people writing it. Because nobody working on the code reads another implementation's source, nothing in it is copied from one.

Drafter's permitted sources:

| Source | Used for |
|---|---|
| The [Fountain specification](https://fountain.io/syntax) | What each element of a script is, and how it's written in plain text |
| Industry formatting conventions for screenplays and stage plays | Margins, indents, `(MORE)` and `(CONT'D)`, title pages, and the rest of what a page looks like |
| General software engineering | Parsing, line breaking, pagination, and browser storage, all common knowledge |
| `.fdx` files a user owns, read as plain XML | Final Draft import and export (Phase 2): built from the structure description and hand-made fixtures, tested on a synthetic set written by hand, and checked against Final Draft 13's own sample scripts; more real files welcome |
| Public descriptions of the `.highland` and `.fadein` packages and the published Open Screenplay Format specification, and files a user owns | Highland and Fade In import (v0.19.0), built from the descriptions and synthetic fixtures; real files not yet checked. The sources, with their URLs and the dates they were read, are in [`DECISIONS.md`](DECISIONS.md) |
| PKWARE's APPNOTE.TXT, the zip format's published description | The read-only zip reader in `@drafter/archive` |
| Other applications, used as a writer uses them | Their documentation, and comparing their output with Drafter's |
| [Courier Prime](https://fonts.google.com/specimen/Courier+Prime) | The typeface: a font under the SIL Open Font License, not code |

Excluded:

- **The source code of other screenwriting applications and Fountain libraries**: Beat, Final Draft, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, and any other. Not to copy, not to adapt, and not to read for ideas.
- **Their packages as dependencies.** Drafter installs no Fountain parser and no screenwriting library. [`docs/DEPENDENCIES.md`](DEPENDENCIES.md) lists every dependency and why it's there.
- **Their test suites, sample files, and scripts.** Every fixture in this repository was written for it.

## Why it works

Copyright protects a program's *expression*, the code as someone wrote it. It doesn't protect the ideas, methods, or formats the code works with; US law says so directly ([17 U.S.C. § 102(b)](https://www.law.cornell.edu/uscode/text/17/102)), and most other countries draw the same line. Fountain was published so that any tool could read and write it, and screenplay conventions such as the standard margins and `(MORE)` at the foot of a split speech belong to the craft, not to any product. Anyone may implement them.

A claim of copying turns on whether code was copied or created independently. Code written only from public specifications, by people who never saw the other source, is independent by construction, and a clean room leaves a record that shows it. The classic case is the IBM PC BIOS: in the 1980s, Phoenix Technologies had one team write down what IBM's BIOS did and a second team, who had never seen IBM's code, write a compatible BIOS from that description alone. Compatible PCs from many makers followed.

Drafter's equivalent of the first team's description is its design documents. The [technical design](drafter-technical-design.md) opens with a clean-room statement and derives every rule from the specification, the conventions, and general engineering; the code is written from the design. Where the specification is silent, the gap is filled by a decision made on the merits and recorded in [`docs/DECISIONS.md`](DECISIONS.md), not by looking up what another implementation does. The layout fixtures go further: their page positions were worked out by hand from the written rules, with the arithmetic beside each one, and reviewed before any layout code existed. The repository is its own record of independent work.

## Why it matters

- **The license means what it says.** Drafter is MIT-licensed, so anyone can use, change, embed, or sell it. That promise holds only if none of the code is borrowed. Code taken from a copyleft project brings that project's license with it (Beat, for example, is GPL-3, and borrowing from it would make Drafter GPL too), and code taken from a commercial product is code nobody licensed to us. Either could force a rewrite or a removal years later, after other projects had come to depend on Drafter.
- **The engine is meant to be reused.** `@drafter/fountain` and `@drafter/layout` are libraries as well as the app's engine: the CLI uses them, and so can CI checks, other editors, and tools nobody has thought of yet. People who build on them need to trust where the code came from.
- **Behavior stays explicit.** A port of another program inherits its quirks without saying so. Writing from the specification forces every choice into the open, where it can be reviewed, tested, and changed on purpose. `DECISIONS.md` exists because of this rule, and the project is better for it.
- **It respects other projects.** Drafter works with other Fountain tools through the shared format, the way the format's authors intended, without taking their work.

## What it means for future development

The rule doesn't end with Phase 0. It covers every contributor, every package, and every phase.

- **Work from the specification, never from another implementation.** That includes a quick look at how another app splits dialogue or detects a title page. If you've studied another screenwriting application's source in the past, say so in your pull request, so a reviewer can take extra care, and write from the specification, not from memory.
- **When the specification is silent, decide and write it down.** Add a dated entry to `docs/DECISIONS.md`, and a fixture or test that pins the behavior. Comparing Drafter's output with another app's is fine; reproducing its code or its test cases isn't.
- **Expect small differences from other tools.** Where the specification is ambiguous, Drafter may read a file differently from another tool. That's a documented decision, not a bug to fix by imitation, and the file stays standard Fountain either way.
- **Final Draft support comes from the files**, not from another program's converter:
  - The `.fdx` import and export were built from the published description of the file's XML structure in the technical design, and from hand-made fixtures.
  - A synthetic test set covers the format's structure: a short film, edge cases, a revised draft, and a stage play, written by hand with original text and invented values, from the element names the technical design documents, without consulting any real `.fdx` file, Final Draft, or converter; and a generated 120-page feature. Two of them are in [`samples/fdx/`](../samples/fdx/) to try Open on.
  - Import has been checked against real files, Final Draft 13's own Outline, Script, and Shooting Script samples (their structure only; nothing from them is in the repository), and fixed where it differed. More real files are welcome, and a round trip through Final Draft itself is still to come.
- **Highland and Fade In support comes from public descriptions**, not from another program's converter, zip, or XML code:
  - The Highland import was built from the app maker's public description of the `.highland` package and the TextBundle specification; the Fade In import from the published Open Screenplay Format example documents and public descriptions of the `.fadein` package; the zip reader from APPNOTE.TXT. [`DECISIONS.md`](DECISIONS.md) names each source and when it was read.
  - Every fixture is synthetic, a zip made in the tests with original text, and no other repository's test files were used.
  - No real `.highland` or `.fadein` file has been checked yet. When the maintainer supplies one, it is read locally through `DRAFTER_REAL_FILES`, only its structure is written down, and it is never committed (`.gitignore` holds `*.highland` and `*.fadein`); see [`DEFERRED.md`](DEFERRED.md).
- **Dependencies stay out of the domain.** No Fountain parsers and no screenwriting libraries, ever. A new dependency gets an entry in `docs/DEPENDENCIES.md` first, saying why it's needed and confirming it isn't screenwriting-related.
- **Test content stays original.** Write new fixtures. Don't paste scenes from real scripts, published or not; screenplays are almost never in the public domain.
- **AI coding assistants follow the same rule.** They've learned from a great deal of public code. If you use one, give it the clean-room instructions (the [Phase 0 kickoff prompt](drafter-phase0-kickoff-prompt.md) shows how), and review what it writes as you would any other contribution.

## Clean-room verification

**The short version: Drafter uses ordinary open-source libraries, but no code from any other screenwriting or playwriting application, and no Fountain library.**

On 27 October 2026 the whole repository was audited against these rules: `main` at commit `6af51a7`, and the branches about to merge into it (the desktop app). [The full audit](clean-room-audit.md) has the method and evidence for each check. It found:

- **No code from screenwriting software.** Nothing names, ports, imports, or depends on another screenwriting or playwriting application or Fountain library. Of more than 700 installed packages, none is a Fountain or screenwriting package. The parser follows the [technical design](drafter-technical-design.md), not any existing parser.
- **No copied code from anywhere.** No source file carries another project's license header or a note that it was adapted from elsewhere, nothing is vendored or minified, and the git history has no foreign files added and later removed. Every commit has one author.
- **General-purpose libraries only, all declared.** Drafter does use open-source libraries, such as Vue, Nuxt, CodeMirror, pdf-lib, Dexie, and Electron, as ordinary dependencies. Each is listed with why it's there in [`docs/DEPENDENCIES.md`](DEPENDENCIES.md). No GPL code ships in the app.
- **Original test content.** Fixtures and samples were written for Drafter. A few test inputs reuse example character names from the Fountain specification itself, a permitted source. One line in a fixture quoted a film; it was replaced.

Most of Drafter's code was written by an AI coding assistant working under these rules, which forbid reading other implementations, and reviewed by the maintainer.

**Limits.** An audit finds copying that leaves traces. It can't prove that something was never read or remembered, or rule out what an AI model learned in training. It covers the commits named above, and it isn't legal advice.
