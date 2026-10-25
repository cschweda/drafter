# Decisions

Choices made where the design documents are silent, and contradictions between them, recorded as dated bullets. The technical design wins over the architecture document; the kickoff prompt wins over both for Phase 0.

## Tooling

- **2026-10-25** — Vitest 5 runs one project per package: the root `vitest.config.ts` lists `packages/*`, and each package's own `vitest.config.ts` merges `vitest.shared.ts`. Vitest 5 recommends merging a shared base rather than the root config, because a referenced config that inherits `projects` becomes a container of nested projects.
- **2026-10-25** — Workspace packages resolve to source during development: tests through exact-match aliases in `vitest.shared.ts`, and type-checking through a `source` export condition (`customConditions` in `tsconfig.base.json`). Builds and published packages use `dist/`.
- **2026-10-25** — Biome formats with 2-space indents, single quotes, and 100-column lines. It skips Markdown, which Biome 2.6 now formats and would restyle the design documents, and the generated lockfile. The linter uses `"preset": "recommended"`; `biome migrate` turned the old `"recommended": true` into `"preset": "none"`, which disables every rule.
- **2026-10-25** — tsdown builds with `fixedExtension: false`, so packages ship `index.js` and `index.d.ts` (ESM through `"type": "module"`) rather than `.mjs` and `.d.mts`.
- **2026-10-25** — Vitest 5 made `bench` a test-context fixture; `pnpm bench` runs `vitest bench --run` across the projects.
- **2026-10-25** — Property tests set `size: 'max'` on array arbitraries: fast-check's default size caps generated arrays at about ten items, whatever `maxLength` says.
- **2026-10-25** — Tests compare documents through `toJSON`, because `sem` and `inline` are lazy getters that deep equality doesn't read.

## `@drafter/fountain`

- **2026-10-25** — **Title page detection.** The title page is the first paragraph of the file when every line is a `Key: value` line or an indented continuation, and at least one key is recognized (Title, Credit, Author, Authors, Source, Draft date, Date, Contact, Copyright, Notes). The recognized-key rule keeps an opening `FADE IN:` from reading as a title page. Leading blank lines mean there is no title page.
- **2026-10-25** — **Runs and line-level markers.** A line starting with `#`, `=`, or `===` always starts a new run, so it ends a speech as well as an action paragraph. Within a run, a dialogue group recognizes only parentheticals and `~` lyrics, as §2.5 says.
- **2026-10-25** — **Transparent lines.** Lines that hold only notes or boneyard never start or end a content block. At the start or end of a run they form their own `note` or `boneyard` block, named after the first region they touch; between content lines they belong to the preceding block.
- **2026-10-25** — **Printable text.** `sem.text` and `line.inline` hold the text that prints: markers, notes, boneyard, emphasis markers, and escaping backslashes removed. Action lines keep their leading spaces; every other element is trimmed, as the spec says leading whitespace in non-action elements is ignored.
- **2026-10-25** — **Emphasis matching.** A delimiter run matches only a run of the same marker and the same length: `*`, `**`, or `***` for italic, bold, or both, and a single `_` for underline. Longer runs are literal. A backslash escapes `*`, `_`, and `\`.
- **2026-10-25** — **Character names.** `characters()` groups cues by the name exactly as typed, so `@McCLANE` and `MCCLANE` count as different names. `sem.extension` keeps every parenthetical extension as typed, such as `(V.O.) (CONT'D)`.
- **2026-10-25** — **Scene heading parts.** Location and time split at the last ` - ` or ` – ` (en dash); with neither, `time` is null. A heading prefix must be followed by a period, a space, or the end of the text, so `INTERIOR` is not read as `INT`.
- **2026-10-25** — **Linear time on any input.** Files come from outside and the editor parses on the main thread, so no scan may be super-linear. Cues, title-page keys, and scene numbers are scanned by hand rather than with backtracking regular expressions; a failed search for a note's `]]` is remembered up to the blank line where it stopped; classification finds each run's last content line once; note text uses binary search over the regions; and emphasis keeps one opener stack per delimiter kind, with difference arrays for styles. `test/complexity.test.ts` pins each case.
- **2026-10-25** — **Line endings.** Only `\n` ends a line. A trailing `\r` (CRLF) and a leading byte-order mark are ignored by classification and kept in the raw text; a bare `\r` anywhere else is ordinary text.
