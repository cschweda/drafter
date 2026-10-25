# drafter.dev — Phase 0 Build Prompt (Engine, no UI)

*Self-contained kickoff prompt for an implementation session. Paste this whole file as the first message. The repository is [github.com/cschweda/drafter](https://github.com/cschweda/drafter); the two design documents (`drafter-architecture.md`, `drafter-technical-design.md`) are in `docs/` and are the authority on anything this prompt doesn't specify.*

---

You are building **Phase 0 of drafter.dev**: the engine packages for an open-source, local-first screenwriting and playwriting IDE. Phase 0 has **no UI**. It ends when a CLI turns a `.fountain` file into a correctly paginated PDF and the full test suite passes.

## Clean-room rule (non-negotiable)

This is a clean-room implementation under the MIT license. You derive everything from:

1. The public Fountain specification at fountain.io/syntax. Read it directly. `docs/drafter-technical-design.md` §2 records where Drafter deliberately reads Fountain more leniently, and it wins where the two differ.
2. The visible XML structure of `.fdx` files (not needed in Phase 0).
3. General software engineering.

**Do not** search for, fetch, read, or reproduce source code from Beat, Final Draft, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, or any other screenwriting application or Fountain library. Do not install any Fountain-parsing npm package. If you are unsure whether a dependency is a screenwriting tool, don't use it. Courier Prime is explicitly permitted: it's an OFL-licensed font, not code. Get it from Google Fonts. Permitted dependencies are listed below; anything else requires a comment in `docs/DEPENDENCIES.md` explaining why it's needed and confirming it is not screenwriting-related.

## What to build

A pnpm monorepo with these packages, in this order. Each package is complete — code, tests, `README.md` — before the next begins.

```
drafter/
├── README.md, LICENSE, CHANGELOG.md, .nvmrc, .gitignore   # already present
├── .githooks/pre-push        # already present: rejects pushes that don't update CHANGELOG.md
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts          # root config; test.projects: ['packages/*']
├── .gitattributes            # fixtures/** -text, so CRLF and BOM fixtures stay byte-exact
├── docs/                     # the design docs (already present)
├── samples/                  # a sample screenplay and stage play (already present)
├── fixtures/                 # shared test scripts (see "Fixtures")
└── packages/
    ├── fountain/             # @drafter/fountain   — CST parser + printer + full reparse
    ├── templates/            # @drafter/templates  — schema, loader, us-screenplay, stage-play-standard
    ├── layout/               # @drafter/layout     — paginate(doc, template) → Layout
    ├── render-pdf/           # @drafter/render-pdf — Layout → PDF bytes
    └── cli/                  # @drafter/cli        — `drafter build <file.fountain> [--pdf out.pdf] [--txt] [--json]`
```

### Tooling (fixed — do not deviate)

- Node 22 (from `.nvmrc`; packages declare `"engines": { "node": ">=22" }`), pnpm 10 (pin the exact version in the root `packageManager` field), TypeScript 5.x strict, ESM only.
- Build: `tsdown` per package → `dist/` with `.d.ts`. (tsup's README says it's no longer maintained and points to tsdown.)
- Tests: Vitest, configured once in the root `vitest.config.ts` with `test.projects` (the separate workspace file was deprecated in Vitest 3.2 and removed in 4); property tests with `fast-check`.
- Lint/format: Biome.
- Package names `@drafter/<name>`, version `0.0.1`, `"license": "MIT"`, `"sideEffects": false`.
- Permitted runtime deps: `pdf-lib` and `@pdf-lib/fontkit` (render-pdf only; pdf-lib can't embed a custom font without fontkit), `commander` (cli only). **Nothing else at runtime.** Dev deps: `tsdown`, `vitest`, `fast-check`, `@biomejs/biome`, `typescript`, `@types/node`, `pdfjs-dist` (for PDF text and position tests).
- Fonts: Courier Prime regular/bold/italic/bold-italic (OFL), from Google Fonts, vendored under `packages/render-pdf/fonts/` with the OFL license file beside them. Include them in the package's `files` and `exports` so the CLI can load them.

### `@drafter/fountain`

Implement exactly `docs/drafter-technical-design.md` §2. Public API:

```ts
export function parse(source: string): Doc
export function reparse(doc: Doc, changes: readonly TextChange[]): Doc
export function print(doc: Doc): string
export function toJSON(doc: Doc): DocJSON
export function blockAt(doc: Doc, offset: number): { block: Block; index: number } | null
export function characters(doc: Doc): Array<{ name: string; count: number; lastSpan: Span }>
export function locations(doc: Doc): Array<{ text: string; count: number }>
export type { Doc, Block, Line, BlockKind, Span, InlineRun, TitlePage, TextChange, ParseDiagnostic, DrafterMeta, DocJSON }
// TextChange = { from: number; to: number; insert: string }, in old-document offsets
```

Hard requirements:
- The CST keeps raw text and leading whitespace per block, plus `doc.trailing` for whatever follows the last block. `print(parse(s)) === s` for **every** string `s`.
- Block classification follows §2.5 exactly: the rule table, the definition of a blank line (including the two-space rule), and the two lenient readings, each of which records a portability diagnostic. A lone uppercase line is action (no look-ahead exception).
- Notes and boneyard come from the pre-pass in §2.4. A note ends at the first blank line, and an unclosed `[[` stays literal text. A boneyard may span anything, and an unclosed `/*` runs to end of file. The `/* drafter … */` metadata block (§8.6) is parsed into `doc.meta` (`null` plus an `invalid-meta` diagnostic if its JSON is invalid) and printed back verbatim.
- Multi-line parentheticals follow §4.3: the first line opens a `(` that stays open, the last line ends with the `)` that closes it, and no line in between starts with `(`.
- `reparse` applies the changes and runs a full `parse` (§2.7). Changes are sorted and non-overlapping, the shape of a CodeMirror ChangeSet.
- `doc.diagnostics` carries the parse diagnostics in §2.10.
- Semantic fields are computed on first read and cached; `sem` is `null` only for kinds without semantic data.
- `pnpm bench` reports parse time for a generated 120-page script against the budget in §2.7.

### `@drafter/templates`

Implement §4. Ship `us-screenplay.json` and `stage-play-standard.json`. Public API:

```ts
export function loadTemplate(json: unknown, registry?: Map<string, Template>): Template  // validates, resolves `extends`, converts { in: n } to chars/lines
export function resolveRole(template: Template, block: Block, prevRole: Role | null): Role
export const builtins: Record<string, Template>
export type { Template, Role, RoleStyle, RoleRule }
```

- Validation errors are thrown as one `TemplateError` listing every problem; never partially apply. `extends` merges per §4.4, and validation runs on the merged result.
- Role rules match character names with exact, case-insensitive `names` lists (§4.3). Templates contain no regular expressions.
- `us-screenplay`: as §4.4 describes. `section`, `synopsis`, `note`, and `boneyard` map to `omit`; scene numbers are off by default; `dialogueSplit.contdAfterAction` is `true`; `(MORE)` sits at the character-cue indent.
- `stage-play-standard`: letter page; `# ACT` → `act_heading` (centered, upper, 2 lines before); `## Scene` → `scene_heading_play` (centered); deeper sections, `synopsis`, `note`, and `boneyard` → `omit`; `character` → centered, upper; `dialogue` → full width from left margin; `action` → `stage_direction` (indented 10, italic); `scene_heading` → `disabled`; `transition` → `disabled`; `dialogueSplit.contdAfterAction` is `false`.

### `@drafter/layout`

Implement §5. Public API:

```ts
export function paginate(doc: Doc, template: Template, opts?: { sceneNumbers?: boolean }): Layout
export function wrap(text: string, runs: InlineRun[], width: number): InlineRun[][]   // one array of runs per output line
export type { Layout, Page, LayoutLine, LayoutDiagnostic }
```

- Pure. No DOM, no globals, no Date. Deterministic for identical input.
- Monospace only in Phase 0; if `template.page.font.monospace === false`, throw `UnsupportedTemplateError` with a clear message. (Proportional measurement is Phase 3.)
- Page filling per §5.3, including the keep-with-next look-ahead and its guard. `omit` blocks produce nothing, a `===` on a still-empty page is ignored, the first line on a page is never blank, and `spaceBefore` is suppressed at page top.
- Dialogue splitting per §5.4: the corrected thresholds, `(MORE)` at `moreIndent`, `NAME (CONT'D)`, and the continued-speech `(CONT'D)` when the template asks for it. Dual dialogue per §5.5; scene numbers per §5.6.
- `Page.lines` holds body lines only; page numbers, scene numbers, headers, and footers have their own fields (§5.1).
- Title page is page 0 when the source has one, laid out from `template.titlePage` (implement `centered-feature`: title centered at line 22 from the top edge, credit/author below, contact block bottom-left, draft date bottom-right).

### `@drafter/render-pdf`

Implement §6.2. Public API:

```ts
export async function renderPdf(layout: Layout, template: Template, opts: { fonts: FontSet }): Promise<Uint8Array>
```

- Register `@pdf-lib/fontkit`, then embed Courier Prime (all four styles). Page size from `template.page.paper` (letter 612 × 792 pt, A4 595.28 × 841.89 pt). Char width 7.2 pt, line height 12 pt. `x = marginLeft*7.2 + col*7.2`, `y = pageHeightPt - marginTop*12 - (lineIndex+1)*12`.
- Underline: 0.5 pt rule at baseline − 2. Page numbers from `Page.pageNumber`. Scene numbers at their columns.
- Must run in Node and in a browser worker: no `fs` at runtime. `opts.fonts` is required: the caller passes the fonts in as `Uint8Array`s (`cli` reads them from the package's `fonts/` directory; the web app will fetch them).

### `@drafter/cli`

```
drafter build <input.fountain> [--pdf <out.pdf>] [--txt <out.txt>] [--json <out.json>] [--template <id|path.json>] [--scene-numbers]
drafter check <input.fountain>     # parse + paginate, print page count and any parser/template errors, exit non-zero on error
```

The template is `--template`, else `meta.template`, else `us-screenplay` (§8.6). `--txt` renders the Layout with spaces (fixed-width). `--json` writes `toJSON(doc)`. `check` prints the page count and every parse and layout diagnostic, and exits non-zero on any error-severity diagnostic or template error.

The root `package.json` gets a `drafter` script (`node packages/cli/dist/index.js`) so the CLI runs from the repository root as `pnpm drafter …`. Don't use `pnpm --filter @drafter/cli exec drafter`: it runs inside `packages/cli/`, and a package's own bin isn't on its PATH.

## Fixtures

Write all fixtures yourself. **Do not** download or copy any existing screenplay, Fountain sample file, or another project's test corpus. (The two scripts in `samples/` are original and part of this repository; use them freely.) Create under `fixtures/`:

- `classification/*.fountain` + `*.expected.json` — one file per row of the §2.5 table, plus:
  - an uppercase action line;
  - `INT is short for interior.` three ways: as a standalone line (a scene heading, per spec), forced with `!` (action), and as the first line of a mixed-case paragraph (action);
  - a heading followed directly by action (the lenient split, with its diagnostic);
  - a lone transition, and the lowercase extension `HANS (on the radio)`;
  - dual dialogue, forced markers of every kind, and scene numbers `#1#` and `#12A#`;
  - a multi-line parenthetical, and `(to Horatio) Look.` followed by a line that must stay dialogue;
  - a `~` lyric inside a speech, `# ACT` followed directly by a `=` synopsis, and a two-space line inside a speech;
  - a note that closes before a blank line, an unclosed `[[` that stays literal, and an unclosed boneyard;
  - CRLF line endings and a leading BOM;
  - a title page with a multi-line value, and a `/* drafter */` meta block.
- `layout/` fixtures:
  - `short.fountain` (~3 pages).
  - `dialogue-split.fountain`: a speech that must split with MORE/CONT'D; one that must move whole because of `minLinesBefore`; one that must move whole because of `minLinesAfter`, using a fixture template with `minLinesAfter: 3`; and one with a `(V.O.)` extension.
  - `contd.fountain`: a speech continued after action gets `(CONT'D)`.
  - `keep-with-next.fountain`: a heading and a cue at the bottom of a page.
  - `dual.fountain`.
  - `forced-break.fountain`, including a `===` that lands at the top of a page.
  - `play.fountain`, using the stage-play template.

  Each comes with an `*.expected.json` of `{ pages: number, firstLineOf: { [sourceLine]: { page, line } } }`. `sourceLine` is the 1-based line where a block starts, `page` is `Page.number` (title page = 0), `line` is the 0-based body line, and `pages` counts every page, title page included. Write each expectation **before** implementing layout, with a short derivation beside it, then stop for the maintainer to review them before they're frozen.
- `generators/` — a `fast-check` arbitrary that produces random valid-ish Fountain (random blocks of each kind, random lengths) for property tests.

Fixture content must be original and short; placeholder names and nonsense dialogue are fine.

## Acceptance tests (all must pass before Phase 0 is done)

1. **Round-trip:** `print(parse(s)) === s` for 10,000 arbitrary strings across the full UTF-16 range, including lone surrogates, `\r`, and U+FEFF, and for every fixture. (Configure the arbitrary; the default `fc.string()` is far narrower.)
2. **Reparse:** for 1,000 random edit sequences on generated scripts, including multi-range change sets, `reparse` deep-equals `parse` of the edited text, spans included.
3. **Classification:** every fixture's block-kind sequence and diagnostics match its expected JSON.
4. **Layout structure (property):**
   - No page has more than `height − margin.top − margin.bottom` body lines.
   - No page starts with a blank line.
   - No `character` or `scene_heading` line is the last content line on a page.
   - Every non-synthetic line's `span` lies within its block's `span`.
   - Joining a block's non-synthetic line texts with single spaces equals its printable text (§5.2), with role case applied and whitespace runs collapsed to one space.
5. **Layout positions:** every `layout/*.expected.json` matches.
6. **PDF:** for each layout fixture, `pdfjs-dist` text extraction finds every dialogue and action line at its expected position (within 0.5 pt), and the page count equals the Layout's.
7. **Determinism:** `paginate` on the same input twice is deep-equal.
8. **Template validation:** each of these malformed templates throws `TemplateError` with the right message, and nothing is partially loaded: a missing role, a rule that produces an undefined role, a negative width, an unknown `extends`, an `extends` cycle, and an inch value off the character grid.
9. **CLI:** from the repository root, `pnpm drafter build fixtures/layout/short.fountain --pdf out.pdf --txt out.txt --json out.json` exits 0 and writes all three; `pnpm drafter check` on a fixture with an unclosed boneyard exits non-zero.
10. `pnpm -r build && pnpm -r test && pnpm biome check .` are all clean.
11. **Samples:** `pnpm drafter check` exits 0 on both files in `samples/`, and `pnpm drafter build` turns each into a PDF. The stage-play sample gets its template from its metadata block, with no `--template` flag.

## Working rules

- Work package by package in the order listed. Finish tests for one before starting the next.
- When the design documents are silent, choose the simplest behavior that preserves the invariants, and record the choice in `docs/DECISIONS.md` as a dated bullet.
- When the design documents contradict each other, `drafter-technical-design.md` wins; note the contradiction in `docs/DECISIONS.md`.
- No TODOs left in code. Anything deferred goes in `docs/DEFERRED.md` with the phase it belongs to.
- Commit after each package with a Conventional Commits message such as `feat(fountain): parse dual dialogue`. No AI co-author trailers.
- Every commit that changes behavior also adds an entry under `[Unreleased]` in `CHANGELOG.md`; the pre-push hook rejects any push without one. Add `"prepare": "git config core.hooksPath .githooks"` to the root `package.json` so fresh clones get the hook.
- Don't push; the maintainer pushes.
- Do not add a web app, a worker, a renderer for HTML, FDX, spellcheck, lint, or outline operations. Those are later phases and have their own prompts.

## Done means

`pnpm install && pnpm -r build && pnpm -r test` is green from a clean clone, and `pnpm drafter build fixtures/layout/short.fountain --pdf /tmp/short.pdf`, run from the repository root, produces a PDF whose page count and text match the fixture.
