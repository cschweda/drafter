# Production, Plan 2: the exports — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put a locked script's page labels and revision marks on paper: the full PDF and every other paged export, a revised-pages PDF, a breakdown report (CSV and PDF), and sides — after fixing the one fold case Plan 1 parked.

**Architecture:** The locked-layout pipeline the app's layout worker runs (resolve anchors, fold, paginate locked, compute marks, apply them) moves into `@drafter/production` as one function, `productionLayout`, which the export worker and the app worker both call, so the screen and the paper can't disagree. `@drafter/render-pdf` learns right-margin asterisks, a per-page revision header, an optional page tint, crossed-out blocks, and a plain table renderer. New export kinds (`revised-pdf`, `breakdown-csv`, `breakdown-pdf`, `sides-pdf`) go through the existing export queue and worker, with dialogs in the web app; their `export-` command ids put them in the desktop app's File → Export automatically.

**Tech Stack:** TypeScript, Vitest, pdf-lib (via `@drafter/render-pdf`), `@drafter/production`, `@drafter/layout`, `@drafter/cast` and `@drafter/outline` (breakdown and sides), Nuxt 4 / Vue, Playwright.

**Spec:** `docs/drafter-production-design.md` (approved 2026-11-09), §8 (revised pages), §9 (breakdown), §10 (sides), §5 (where the exports appear), §7.2 (labels). Plan 1's rulings: `docs/DECISIONS.md` (the 2026-11-09 Production entries).

## Global Constraints

- Every paged export of a locked script prints the locked labels (12A, 13-14) and A-scene numbers exactly as the Script pane shows them; one function computes both (spec §7.2: "every export read[s] the label").
- The full PDF's Export option is **Revision marks: open set / none**, default the open set; with marks on, the header shows the open set's name and date (spec §8).
- Revised-pages header: **"Blue Revision — 12 November 2026"** at the top right, on the page-number line's next line, or the production's own header text when set (spec §8); the date is written out as `D Month YYYY` (the app's existing `longDate` in `apps/web/app/whats-new/`).
- Which asterisks print: by default only the current set's; an option prints every set's (spec §8, "Which asterisks print").
- Page tint: optional, off by default; when on, the set's swatch color at 12% opacity behind the page (spec §8).
- Breakdown columns, in order: Scene, INT/EXT, Location, Time, Pages, Page, Cast, Synopsis (spec §9 table). CSV is UTF-8 with a header row, comma-separated, quoted per RFC 4180; `OMITTED` scenes are a row with "OMITTED" and no other fields.
- Breakdown PDF: landscape US Letter, A4 for A4 templates; the script's title and the export date in the header; Drafter's embedded fonts.
- Sides header: **"SIDES — MARGARET — Scenes 4, 12, 12A — 12 November 2026"**; unticked scenes' blocks on included pages are crossed out with a diagonal line; sides follow the script as it stands, with the open set's marks (spec §10).
- Exports are for locked Fountain scripts; revised pages need a locked script; the breakdown and sides also work unlocked (scene places instead of numbers).
- Nothing leaves the device; exports are made in the export worker as today.
- No new dependency beyond the workspace packages.

## Review Focus

- **An unlocked script exports exactly as before** (byte-identical PDF text for the existing export tests) → Task 3's "unlocked unchanged" test.
- **A revised-pages PDF with no marks in the current set** says so instead of producing an empty file → Task 5 test `refuses an empty revised-pages export with a message`.
- **Commas, quotes, and line breaks in a location, a cast name, or a synopsis** come through the CSV intact → Task 6 test `quotes commas, quotes, and line breaks`.
- **A side whose scene starts mid-page and runs onto the next** includes both pages and crosses out only the other scenes' blocks → Task 7 test `spans pages and crosses out only the others`.
- **A stage play's breakdown and sides** use its `##` scenes and work without scene numbers → Task 6 and Task 7 stage-play tests.

---

### Task 1: Page 1 folds when all its text is cut (parked from Plan 1)

**Files:**
- Modify: `packages/production/src/anchors.ts` (`place()` / the page-1 pin from Ruling 27)
- Test: `packages/production/test/anchors.test.ts`, `packages/layout/test/locked.test.ts`

**Interfaces:**
- Produces: no signature change. `resolveAnchors` reports page 1 as a collision (page 1 kept at 0, page 2 dropped into it, so the label prints `1-2`) when page 1's resolved body start reaches page 2's.

- [ ] **Step 1: Write failing tests** — anchors: `folds page 2 into page 1 when page 1's text is all cut` (a script with a title page; delete every line of page 1's body; `dropped` contains '2'); layout: same scenario through `paginate` with `locked` → first body page label `'1-2'`, the next `'3'`.
- [ ] **Step 2: Run** `pnpm --filter @drafter/production test` and `pnpm --filter @drafter/layout test` — FAIL.
- [ ] **Step 3: Implement** in `place()`: after pinning page 1 at 0, if the next kept anchor's mapped line is at or before the first body line page 1 would start at, treat that next page as colliding with page 1.
- [ ] **Step 4: Run** both — PASS (all existing anchor/locked tests too).
- [ ] **Step 5: Commit** `fix(production): page 1 folds when all its text is cut`

### Task 2: `productionLayout`, one locked-layout pipeline

**Files:**
- Create: `packages/production/src/layout.ts`
- Modify: `packages/production/src/index.ts`; `apps/web/app/workers/compute.ts` (import `lockedPagesOf` from the package instead of its own copy)
- Test: `packages/production/test/layout.test.ts`; the existing `apps/web/test/compute-production.test.ts` must still pass

**Interfaces:**
- Consumes: `readProduction`, `decodeBaseline`, `scriptText`, `resolveAnchors`, `productionMarks` (package); `paginate`, `applyMarks` (`@drafter/layout`).
- Produces:
  ```ts
  export function lockedPagesOf(pages: readonly LockedPage[], baseline: string, current: string):
    { anchors: Anchor[]; folded: { into: string; label: string }[] };   // moved from compute.ts, same behaviour
  export type MarkChoice = 'open' | 'all' | 'none';
  export interface ProductionLayoutResult {
    layout: Layout;               // locked labels, marks applied per `marks`
    locked: boolean;
    open: ProductionSet | null;   // the open set (for headers)
    sets: readonly ProductionSet[];
  }
  export function productionLayout(source: string, template: Template,
    opts: { sceneNumbers: SceneNumbering; marks: MarkChoice }): Promise<ProductionLayoutResult>;
  ```
  `marks: 'open'` applies only the open set's spans/gaps; `'all'` applies every set's; `'none'` applies none. An unlocked or unreadable script returns `paginate(doc, template, { sceneNumbers })` unchanged with `locked: false`. Ruling 3 (texts without the block) holds.

- [ ] **Step 1: Write failing tests** — `an unlocked script lays out exactly as paginate does`; `a locked script gets labels and the open set's marks`; `marks: none applies no marks but keeps labels`; `marks: all keeps closed sets' marks`; `a damaged block lays out unlocked`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement**; move `lockedPagesOf` from `compute.ts` and re-export it; `compute.ts` imports it. **Step 4: Run** the package tests and `cd apps/web && pnpm exec vitest run test/compute-production.test.ts` — PASS.
- [ ] **Step 5: Commit** `refactor(production): one locked-layout pipeline for the screen and exports`

### Task 3: Labels and marks in the full PDF and every paged export

**Files:**
- Modify: `packages/render-pdf/src/render.ts` (right-margin asterisk for `line.mark` and `line.right?.mark`, in the body font, at the column 5 characters in from the right edge of the text width, the column `apps/web/app/compare/draw.ts` uses; an optional per-page `revisionHeader?: string` drawn right-aligned on the line under the page number)
- Modify: `apps/web/app/workers/export-compute.ts` (`ExportOptions.revisionMarks?: 'open' | 'none'`, default `'open'`; the script layout at line ~485 comes from `productionLayout(source, template, { sceneNumbers, marks: options.revisionMarks ?? 'open' })`; the PDF gets `revisionHeader` = `"<Set> Revision — <D Month YYYY>"` on every page when marks are on and a set is open)
- Modify: `apps/web/app/storage/export-options.ts` (label `Revision marks` with choices `The open revision` / `None`), `apps/web/app/components/ExportOptionsDialog.vue` (the choice, shown only when the script is locked)
- Test: `packages/render-pdf/test/marks.test.ts`, `apps/web/test/export-production.test.ts`

**Interfaces:**
- Consumes: Task 2's `productionLayout`.
- Produces: `renderPdf(layout, template, { fonts, onProgress, revisionHeader?: string, tint?: string })` (tint used by Task 5; ignore here); `ExportOptions.revisionMarks`.

- [ ] **Step 1: Write failing tests** — render-pdf: `draws an asterisk for each marked line at the margin column` (extract text with the helpers in `packages/render-pdf/test/helpers.ts`, as `render.test.ts` does); `draws the revision header on every page`; `an unmarked layout draws exactly as before` (byte-identical to a render without the new options). Export: `a locked script's PDF prints 12A and the open set's asterisks`; `Revision marks: None prints labels without asterisks or header`; `an unlocked script's PDF is unchanged`; the HTML and plain-text exports of a locked script carry the labels (`page.label` wherever they print page numbers).
- [ ] **Step 2: Run** `pnpm --filter @drafter/render-pdf test` and the web test — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS, plus `pnpm --filter @drafter/render-pdf test` in full and the existing export tests.
- [ ] **Step 5: Commit** `feat: locked labels and revision marks in every export`

### Task 4: Render-pdf additions for the new reports

**Files:**
- Modify: `packages/render-pdf/src/render.ts` (`tint?: string` — a `#rrggbb` drawn as a full-page rectangle at 12% opacity before the text; `crossOut?: Array<{ page: number; from: number; to: number }>` — for each, a single diagonal line from the top-left of the first body line `from` to the bottom-right of the last body line `to`, in black, 1 pt)
- Create: `packages/render-pdf/src/table.ts`, exported as `renderTablePdf(table: { title: string; date: string; columns: string[]; rows: string[][] }, opts: { fonts: FontSet; paper: 'letter' | 'a4' }): Promise<Uint8Array>` (landscape; header line `<title> — <date>`; column widths proportional to the longest cell, capped, text wrapped within cells; repeats the column header on each page)
- Test: `packages/render-pdf/test/tint.test.ts`, `test/cross.test.ts`, `test/table.test.ts`

**Interfaces:**
- Produces: `renderPdf(..., { tint, crossOut })`; `renderTablePdf(...)`.

- [ ] **Step 1: Write failing tests** — `tint draws a page rectangle in the color, under the text`; `rejects a tint that isn't #rrggbb` (ignored, no throw); `crossOut draws one line per range`; table: `landscape, title and date in the header, every cell's text present, the header repeated on page 2 of a 200-row table`; `wraps a long cell`.
- [ ] **Step 2–4:** run (FAIL), implement, run — PASS.
- [ ] **Step 5: Commit** `feat(render-pdf): page tint, crossed-out blocks, and a table`

### Task 5: The revised-pages PDF

**Files:**
- Create: `packages/production/src/revised.ts`
- Modify: `apps/web/app/workers/export-compute.ts` (kind `'revised-pdf'`), `apps/web/app/storage/export.ts` (`exportRevisedPages(choice)`), `apps/web/app/commands/data.ts` + `export-commands.ts` (command `export-revised-pages`, title `Export revised pages (PDF)…`, locked scripts only)
- Create: `apps/web/app/components/RevisedPagesDialog.vue`
- Test: `packages/production/test/revised.test.ts`, `apps/web/test/revised-pages.test.ts`

**Interfaces:**
- Consumes: Task 2 (`productionLayout` with `marks: 'open' | 'all'`), Task 3 (`revisionHeader`), Task 4 (`tint`).
- Produces: `revisedPages(layout: Layout, which: { kind: 'current' } | { kind: 'all' } | { kind: 'range'; from: string; to: string }): Layout` (a layout of only the chosen pages: `current`/`all` = pages with any applied mark; `range` = pages whose labels fall from `from` to `to` in page order, inclusive); the dialog's choices: Which pages (Current revision / All revisions / Page range from…to), Which marks print (This revision only / Every revision), Header text (default `"<Set> Revision — <date>"`, editable, kept in the block as `production.header`), Tint pages (off). Add `header?: string` to `Production` (types.ts), read defensively in `readProduction` (a string ≤ 200 characters, else ignored), and an action `setHeader(text: string, header: string | null): Promise<TextChange[]>` in `actions.ts`, run from the dialog through Plan 1's command path (one undo step, the document-unchanged check).

- [ ] **Step 1: Write failing tests** — `current keeps only pages with the open set's marks, in order, with their labels`; `range 12–13 keeps 12, 12A, 12B, 13-14`; `refuses an empty revised-pages export with a message` (`There are no Blue changes to print.`); web: the command is off unless locked; the dialog's header default.
- [ ] **Step 2–4:** run (FAIL), implement, run — PASS. Browser: `e2e/production-exports.spec.ts` `exports revised pages after a Blue edit` (the PDF downloads; its text holds the label and `Blue Revision — `).
- [ ] **Step 5: Commit** `feat: the revised-pages PDF`

### Task 6: The breakdown report

**Files:**
- Create: `packages/production/src/breakdown.ts`
- Modify: `apps/web/app/workers/export-compute.ts` (kinds `'breakdown-csv'`, `'breakdown-pdf'`), `apps/web/app/storage/export.ts`, `apps/web/app/commands/data.ts` + `export-commands.ts` (commands `export-breakdown-csv` `Export breakdown (CSV)`, `export-breakdown-pdf` `Export breakdown (PDF)`, Fountain scripts)
- Test: `packages/production/test/breakdown.test.ts`

**Interfaces:**
- Consumes: `castOf`, `placeOf` (`@drafter/cast`), `sceneIndex` / scene pages in eighths (`@drafter/outline`), Task 2's layout for page labels; Task 4's `renderTablePdf`. (Add `@drafter/cast` and `@drafter/outline` to `@drafter/production`'s dependencies.)
- Produces: `breakdownRows(doc: Doc, template: Template, layout: Layout): string[][]` (one row per scene in script order with the Global Constraints' columns; Pages as eighths `"1 3/8"`; Page = the starting page's label; Cast = speakers then characters named in action, in order of first appearance, comma-separated; OMITTED rows); `BREAKDOWN_COLUMNS`; `toCsv(rows: string[][]): string` (RFC 4180, `\r\n` line ends, UTF-8 without BOM).

- [ ] **Step 1: Write failing tests** — `one row per scene with every column` (samples/screenplay.fountain); `OMITTED is a row with only its number and OMITTED`; `quotes commas, quotes, and line breaks`; `a stage play's ## scenes are its rows, numbered by place`; `the PDF holds every row's text` (via the table renderer and text extraction).
- [ ] **Step 2–4:** run (FAIL), implement, run — PASS.
- [ ] **Step 5: Commit** `feat: the breakdown report, as CSV and PDF`

### Task 7: Sides

**Files:**
- Create: `packages/production/src/sides.ts`
- Modify: `apps/web/app/workers/export-compute.ts` (kind `'sides-pdf'`), `apps/web/app/storage/export.ts`, `apps/web/app/commands/data.ts` + `export-commands.ts` (`export-sides`, `Export sides (PDF)…`, Fountain scripts)
- Create: `apps/web/app/components/SidesDialog.vue`
- Test: `packages/production/test/sides.test.ts`, `apps/web/test/sides.test.ts`

**Interfaces:**
- Consumes: `castOf` presence (`@drafter/cast`), scene block ranges (`sceneBlocks` in `packages/cast/src/presence.ts`), Task 2's layout with `marks: 'open'`, Task 4's `crossOut`.
- Produces: `scenesFor(doc, template, characters: readonly string[]): number[]` (scene ordinals any of them speak in or are named in); `sides(layout: Layout, doc: Doc, scenes: readonly number[]): { layout: Layout; crossOut: Array<{ page: number; from: number; to: number }> }` (every page holding a ticked scene's lines, in order, with labels; crossOut ranges = each maximal run of body lines on those pages that belong to unticked scenes); header via `revisionHeader` = `SIDES — <NAMES in caps, joined with " & "> — Scenes <list> — <date>` (e.g. `SIDES — MARGARET — Scenes 4, 12, 12A — 12 November 2026`).

- [ ] **Step 1: Write failing tests** — `ticks the character's scenes`; `spans pages and crosses out only the others`; `a stage play's sides work by ## scene`; the dialog: choosing a character ticks its scenes, the list stays editable, Export is off with nothing ticked.
- [ ] **Step 2–4:** run (FAIL), implement, run — PASS. Browser: `exports sides for MARGARET` (the PDF text holds the header and her scenes' text).
- [ ] **Step 5: Commit** `feat: sides, one actor's pages`

### Task 8: Where the exports appear, and the docs

**Files:**
- Modify: `apps/web/app/components/ExportMenu.vue` (a Production group under the script exports: Revised pages (PDF)…, Breakdown (CSV), Breakdown (PDF), Sides (PDF)…; revised pages only when locked), `apps/web/app/components/AppToolbar.vue` folded Export submenu (same), `apps/web/app/components/ProductionPane.vue` (the Export section, spec §5), `apps/web/app/pages/docs/production.vue` (a section on each export), `apps/web/app/whats-new/entries.ts` (update the v0.27.0 entry's text to name the exports; leave `banner` for the release to decide), `CHANGELOG.md` [Unreleased] Added, `docs/FORMATS.md` (CSV breakdown and the PDFs), README features (Production row, if listed)
- Test: `apps/web/e2e/production-exports.spec.ts` (menu items present and gated), `e2e/docs.spec.ts` phrase check (`breakdown`, `sides`), desktop: `apps/desktop/e2e` File → Export lists the four (extend the existing menu test that lists exports)

- [ ] **Steps:** add the items and copy; run the web unit tests, `docs.spec.ts`, `production-exports.spec.ts` (Chromium, after a fresh build), and the desktop e2e menu test; commit `feat: the Production exports in the menus, the tab, and the help`.

### Task 9: The full gates

- [ ] **Steps:** `pnpm check`; every package's tests; `pnpm --filter @drafter/web typecheck`; `cd apps/web && pnpm exec vitest run`; the trap project; a fresh e2e build and the full Chromium suite (read the whole output for failed/flaky); `pnpm --filter @drafter/desktop e2e`. Fix anything red in its owning task's files; commit `test: Production exports pass every gate`.
