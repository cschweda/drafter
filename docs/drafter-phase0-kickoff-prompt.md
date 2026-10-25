# drafter.dev — Phase 0 Build Prompt (Engine, no UI)

*Self-contained kickoff prompt for an implementation session. Paste this whole file as the first message. The two design documents (`drafter-architecture.md`, `drafter-technical-design.md`) should be in the repo at `docs/` and are the authority on anything this prompt doesn't specify.*

---

You are building **Phase 0 of drafter.dev**: the engine packages for an open-source, local-first screenwriting and playwriting IDE. Phase 0 has **no UI**. It ends when a CLI turns a `.fountain` file into a correctly paginated PDF and the full test suite passes.

## Clean-room rule (non-negotiable)

This is a clean-room implementation under the MIT license. You derive everything from:

1. The public Fountain specification (fountain.io), as summarized in `docs/drafter-technical-design.md` §2.
2. The visible XML structure of `.fdx` files (not needed in Phase 0).
3. General software engineering.

**Do not** search for, fetch, read, or reproduce source code from Beat, Final Draft, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, or any other screenwriting application or Fountain library. Do not install any Fountain-parsing npm package. If you are unsure whether a dependency is a screenwriting tool, don't use it. Permitted dependencies are listed below; anything else requires a comment in `docs/DEPENDENCIES.md` explaining why it's needed and confirming it is not screenwriting-related.

## What to build

A pnpm monorepo with these packages, in this order. Each package is complete — code, tests, `README.md` — before the next begins.

```
drafter/
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.workspace.ts
├── docs/                     # the two design docs live here (already present)
├── fixtures/                 # shared test scripts (see "Fixtures")
└── packages/
    ├── fountain/             # @drafter/fountain   — CST parser + printer + incremental reparse
    ├── templates/            # @drafter/templates  — schema, loader, us-screenplay, stage-play-standard
    ├── layout/               # @drafter/layout     — paginate(doc, template) → Layout
    ├── render-pdf/           # @drafter/render-pdf — Layout → PDF bytes
    └── cli/                  # @drafter/cli        — `drafter build <file.fountain> [--pdf out.pdf] [--txt] [--json]`
```

### Tooling (fixed — do not deviate)

- Node 22, pnpm 9, TypeScript 5.x strict, ESM only.
- Build: `tsup` per package → `dist/` with `.d.ts`.
- Tests: Vitest; property tests with `fast-check`.
- Lint/format: Biome.
- Package names `@drafter/<name>`, version `0.0.1`, `"license": "MIT"`, `"sideEffects": false`.
- Permitted runtime deps: `pdf-lib` (render-pdf only), `commander` (cli only). **Nothing else at runtime.** Dev deps: `tsup`, `vitest`, `fast-check`, `@biomejs/biome`, `typescript`, `pdf-parse` (for PDF text-extraction tests).
- Fonts: Courier Prime regular/bold/italic/bold-italic (OFL) vendored under `packages/render-pdf/fonts/` with the OFL license file beside them.

### `@drafter/fountain`

Implement exactly `docs/drafter-technical-design.md` §2. Public API:

```ts
export function parse(source: string): Doc
export function reparse(doc: Doc, change: { from: number; to: number; insert: string }): Doc
export function print(doc: Doc): string
export function blockAt(doc: Doc, offset: number): { block: Block; index: number } | null
export function characters(doc: Doc): Array<{ name: string; count: number; lastSpan: Span }>
export function locations(doc: Doc): Array<{ text: string; count: number }>
export type { Doc, Block, Line, BlockKind, Span, InlineRun, TitlePage }
```

Hard requirements:
- The CST keeps raw text and leading whitespace per block. `print(parse(s)) === s` for **every** string `s`.
- Block classification follows the table in §2.5 exactly, in that order. A lone uppercase line is action (rule 12 as written; no look-ahead exception).
- Notes and boneyard are extracted in a pre-pass and may span blocks. The special `/* drafter … */` block at end of file is parsed into `doc.meta` (JSON, or `null` if invalid) and printed back verbatim.
- Multi-line parentheticals (consecutive lines in a dialogue group, first starts with `(`, last ends with `)`) are one `parenthetical` block.
- `reparse` is incremental per §2.7 and must produce a Doc structurally equal to a full `parse` of the new source. Add `DRAFTER_DEBUG_FULL_REPARSE=1` env support that performs that check on every call.
- Semantic fields are computed lazily and cached; `sem` is `null` until first access.

### `@drafter/templates`

Implement §4. Ship `us-screenplay.json` and `stage-play-standard.json`. Public API:

```ts
export function loadTemplate(json: unknown, registry?: Map<string, Template>): Template  // validates, resolves `extends`, converts { in: n } to chars/lines
export function resolveRole(template: Template, block: Block, prevRole: Role | null): Role
export const builtins: Record<string, Template>
export type { Template, Role, RoleStyle, RoleRule }
```

- Validation errors are thrown as one `TemplateError` listing every problem; never partially apply.
- `roleMap` regexes are compiled once at load; reject any pattern longer than 200 chars.
- `stage-play-standard`: letter page; `# ACT` → `act_heading` (centered, upper, 2 lines before); `## Scene` → `scene_heading_play` (centered); `character` → centered, upper; `dialogue` → full width from left margin; `action` → `stage_direction` (indented 10, italic); `scene_heading` → `disabled`; `transition` → `disabled`.

### `@drafter/layout`

Implement §5. Public API:

```ts
export function paginate(doc: Doc, template: Template, opts?: { sceneNumbers?: boolean }): Layout
export function wrap(text: string, runs: InlineRun[], width: number): LayoutLineRuns[]
export type { Layout, Page, LayoutLine }
```

- Pure. No DOM, no globals, no Date. Deterministic for identical input.
- Monospace only in Phase 0; if `template.page.font.monospace === false`, throw `UnsupportedTemplateError` with a clear message. (Proportional measurement is Phase 3.)
- Dialogue splitting per §5.4 with `(MORE)` / `NAME (CONT'D)`; keep-with-next per §5.3; dual dialogue per §5.5; scene numbers per §5.6; `===` forces a page break; the first line on a page is never blank; `spaceBefore` is suppressed at page top.
- Title page is page 0, laid out from `template.titlePage` (implement `centered-feature`: title centered at line 22, credit/author below, contact block bottom-left, draft date bottom-right).

### `@drafter/render-pdf`

Implement §6.2. Public API:

```ts
export async function renderPdf(layout: Layout, template: Template, opts?: { fonts?: FontSet }): Promise<Uint8Array>
```

- Embed Courier Prime (all four styles) with pdf-lib. Letter = 612×792 pt. Char width 7.2 pt, line height 12 pt. `x = marginLeft*7.2 + col*7.2`, `y = 792 - marginTop*12 - (lineIndex+1)*12`.
- Underline: 0.5 pt rule at baseline − 2. Page numbers top-right per template. Scene numbers at their columns.
- Must run in Node and in a browser worker: no `fs` at runtime — fonts are passed in as `Uint8Array` by the caller (`cli` reads them from disk; the web app will fetch them).

### `@drafter/cli`

```
drafter build <input.fountain> [--pdf <out.pdf>] [--txt <out.txt>] [--json <out.json>] [--template <id|path.json>] [--scene-numbers]
drafter check <input.fountain>     # parse + paginate, print page count and any parser/template errors, exit non-zero on error
```

Default template `us-screenplay`. `--txt` renders the Layout with spaces (fixed-width). `--json` writes the CST.

## Fixtures

Write all fixtures yourself. **Do not** download or copy any existing screenplay, Fountain sample file, or another project's test corpus. Create under `fixtures/`:

- `classification/*.fountain` + `*.expected.json` — one file per row of the §2.5 table, plus: uppercase action line; `INT` as the first word of an action sentence ("INT is short for interior."); lone transition; dual dialogue; forced markers of every kind; scene numbers `#1#`, `#12A#`; multi-line parenthetical; note spanning three blocks; unclosed boneyard; title page with multi-line value; `/* drafter */` meta block.
- `layout/short.fountain` (~3 pages), `layout/dialogue-split.fountain` (a speech that must split with MORE/CONT'D, one that must not because of `minLinesAfter`, one with a `(V.O.)` extension), `layout/keep-with-next.fountain` (heading and cue at page bottom), `layout/dual.fountain`, `layout/forced-break.fountain`, `layout/play.fountain` (stage-play template). Each with a hand-verified `*.expected.json` of `{ pages: number, firstLineOf: { [blockIndex]: { page, line } } }`.
- `generators/` — a `fast-check` arbitrary that produces random valid-ish Fountain (random blocks of each kind, random lengths) for property tests.

Fixture content must be original and short; placeholder names and nonsense dialogue are fine.

## Acceptance tests (all must pass before Phase 0 is done)

1. **Round-trip:** `print(parse(s)) === s` for 10,000 random strings (any bytes) and for every fixture.
2. **Incremental ≡ full:** for 1,000 random edit sequences on generated scripts, `reparse` output is structurally equal to `parse` of the result (kinds, raw text, sem fields; spans compared separately for correctness).
3. **Classification:** every fixture's block-kind sequence matches its expected JSON.
4. **Layout structure (property):** no page exceeds `height − margins` lines; no page starts with a blank line; no `character` line is the last content line on a page; every non-synthetic line's `span` lies within its block's `span`; concatenating non-synthetic line text per block equals the wrapped block text.
5. **Layout positions:** every `layout/*.expected.json` matches.
6. **PDF:** for each layout fixture, `pdf-parse` text extraction contains every dialogue and action line, and page count equals the Layout's.
7. **Determinism:** `paginate` on the same input twice is deep-equal.
8. **Template validation:** malformed templates (missing role, bad regex, negative width, unknown `extends`) each throw `TemplateError` with the right message; nothing is partially loaded.
9. **CLI:** `drafter build fixtures/layout/short.fountain --pdf out.pdf --txt out.txt --json out.json` exits 0 and writes all three; `drafter check` on a fixture with an unclosed boneyard exits non-zero.
10. `pnpm -r build && pnpm -r test && pnpm biome check .` are all clean.

## Working rules

- Work package by package in the order listed. Finish tests for one before starting the next.
- When the design documents are silent, choose the simplest behavior that preserves the invariants, and record the choice in `docs/DECISIONS.md` as a dated bullet.
- When the design documents contradict each other, `drafter-technical-design.md` wins; note the contradiction in `docs/DECISIONS.md`.
- No TODOs left in code. Anything deferred goes in `docs/DEFERRED.md` with the phase it belongs to.
- Commit after each package with a message of the form `feat(<package>): <what>`.
- Do not add a web app, a worker, a renderer for HTML, FDX, spellcheck, lint, or outline operations. Those are later phases and have their own prompts.

## Done means

`pnpm install && pnpm -r build && pnpm -r test` is green from a clean clone, and `pnpm --filter @drafter/cli exec drafter build fixtures/layout/short.fountain --pdf /tmp/short.pdf` produces a PDF whose page count and text match the fixture.
