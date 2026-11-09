# Production, Plan 1: locks and revisions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock a script's pages and scene numbers, open revision sets in color, and show each set's marks on screen, with everything kept in the `.fountain` file.

**Architecture:** A new framework-free package, `@drafter/production`, holds the model and every pure operation (the `production` block, the compressed baseline, fingerprints, A-numbers, marks, page anchors, and the actions as text changes). `@drafter/layout` learns page labels, locked anchors, and per-line marks; `@drafter/lint` gets three locked-number rules; `@drafter/render-html` draws labels and asterisks. The web app decodes the block on the main thread, sends the baseline to the layout worker the way Show changes sends its baseline, and adds the Production tab, its commands, Omit scene, and the status chip.

**Tech Stack:** TypeScript, Vitest, `@drafter/compare` (`changesOf`, `diffWords`), Web Crypto SHA-256 and `CompressionStream` (both in browsers and Node 22), Nuxt 4 / Vue for the UI, Playwright for browser tests.

**Spec:** `docs/drafter-production-design.md` (approved 2026-11-09). Plan 2 (the revised-pages PDF, the breakdown, sides) is separate.

## Global Constraints

- The file stays plain Fountain: scene numbers are `#12A#`, an omitted scene is `.OMITTED #12#`, everything else lives in the `/* drafter */` block under the key `production` (spec §4, §6.3).
- The block is written only by the writer's own actions (lock, start the next revision, write new scene numbers, omit a scene, unlock, clear marks), each one undo step; never in the background (spec §6.3).
- The open set's baseline is in the block as `production.baseline`: the baseline text, gzip-compressed, base64 (spec §6.3a, the maintainer's decision).
- A fingerprint is the first 7 hex characters of SHA-256 of the line trimmed of surrounding white space, then `:` and its 1-based occurrence among identical trimmed lines (spec §6.3).
- Revision names, in order: White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, then `Double ` + each of those (spec §6.1). The mark is always drawn in the text color; the swatch is never the only signal.
- Locking writes scene numbers starting at `firstScene` (default 1); after locking Drafter only adds A-numbers and `OMITTED`, never renumbers (spec §4, §7.1).
- A-numbers: between 5 and 6 → `5A`; between 5A and 6 → `5B`; between 5 and 5A → `5AA`; before the first → `A1`; after `5Z` → `5AA` (spec §7.1, §7.2).
- Page labels: overflow pages after 12 are `12A`, `12B`, … `12Z`, `12AA`; pages whose anchors all vanished fold into the page before as a range `13-14` (spec §7.2).
- Stage plays get page locks and revisions, but no locked scene numbers, A-scenes, Omit scene, or the number lint rules (spec §3).
- Production is for Fountain scripts only; Markdown documents and novels have no Production tab or commands (spec §3).
- Nothing leaves the device; no new network request (Privacy promise).
- Every block key is read defensively and capped: sets ≤ 64, pages ≤ 5,000, `numbers` ≤ 5,000, each set's `lines` and `gaps` ≤ 20,000, a decoded baseline ≤ 8 MiB; anything malformed is ignored, not thrown (spec §12, trap documents).

## Review Focus

- **A file opened in a fresh browser with no drafts** shows the same marks and page labels as on the computer that made them → Task 13's "fresh profile" test.
- **An anchor line edited or deleted** (the first line of a locked page) keeps the page's label in place, not on another page → Task 6 test `follows an edited anchor and a removed one`.
- **A whole locked page's text deleted** folds into a range label (`13-14`) and no later label moves → Task 7 test `folds pages whose anchors all vanished`.
- **A hostile or truncated `production` block** (bad base64, a gzip bomb, wrong types, a page map out of order) is ignored and the script still opens, unlocked → Task 1 and Task 2 trap tests, plus new trap documents in Task 13.
- **Switching Classic Mode on and off** while locked changes nothing in the file → Task 13's Classic test.

---

### Task 1: The `@drafter/production` package and the block

**Files:**
- Create: `packages/production/package.json` (copy `packages/compare/package.json`'s shape: name `@drafter/production`, version `0.26.2`, deps `@drafter/fountain`, `@drafter/compare`, `@drafter/templates` as `workspace:*`), `tsconfig.json`, `tsdown.config.ts`, `README.md` (as `packages/compare`'s)
- Create: `packages/production/src/types.ts`, `src/block.ts`, `src/sets.ts`, `src/index.ts`
- Test: `packages/production/test/block.test.ts`, `test/sets.test.ts`
- Modify: `pnpm-workspace.yaml` only if packages aren't globbed; `docs/DEVELOPMENT.md` packages list; README Packages table

**Interfaces:**
- Produces (types.ts):
  ```ts
  export interface ProductionSet { name: string; color: string; date: string; draft: string; lines?: string[]; gaps?: string[] }
  export interface LockedPage { label: string; line: number; printed: number } // block form: [label, line, printed]
  export interface Production {
    lockedAt: string;        // ISO date
    firstScene: number;
    numbers: string[];       // every scene number the lock has issued, in script order
    pages: LockedPage[];     // line: 0-based source line in the baseline text; printed: printed-line offset in it
    sets: ProductionSet[];   // the last is the open set; closed sets carry lines/gaps
    baseline: string;        // gzip + base64 of the open set's baseline text
  }
  ```
- Produces (block.ts): `readProduction(meta: DrafterMeta | null): Production | null` (defensive, capped, `null` for anything malformed); `productionMeta(meta: DrafterMeta | null, production: Production | null): DrafterMeta` (the meta to give `setMeta`; `null` removes the key); `CAPS` constant with the Global Constraints' limits.
- Produces (sets.ts): `REVISION_NAMES: readonly string[]` (the 18 names in order), `REVISION_COLORS: Record<string, string>` (swatch hex per base name), `nextSetName(sets: readonly ProductionSet[]): string`.

- [ ] **Step 1: Write failing tests** — `block.test.ts`: `reads a well-formed block` (round-trips the spec §6.3 example with `pages` as `[label, line, printed]` tuples); `ignores wrong types, out-of-cap arrays, and a missing baseline` (each returns `null`); `writes pages as tuples and drops the key on null`. `sets.test.ts`: `names follow the industry order` (`nextSetName([])` is `'Blue'`, after `Cherry` is `'Double White'`); `a renamed set still advances` (a set named `'Tan'` after `Blue` gives `'Pink'`, counting by position).
- [ ] **Step 2: Run** `pnpm --filter @drafter/production test` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** types, `readProduction`, `productionMeta`, `REVISION_NAMES`, `REVISION_COLORS`, `nextSetName`. Swatch colors must give ≥ 3:1 against both themes' page backgrounds (`#1e1f22` dark, `#ffffff` light); `sets.test.ts` asserts it with a WCAG relative-luminance contrast function written in the test.
- [ ] **Step 4: Run** the tests — Expected: PASS; `pnpm --filter @drafter/production typecheck` clean.
- [ ] **Step 5: Commit** `feat(production): the package, the block, and the revision names`

### Task 2: The baseline codec and fingerprints

**Files:**
- Create: `packages/production/src/baseline.ts`, `src/fingerprint.ts`
- Test: `packages/production/test/baseline.test.ts`, `test/fingerprint.test.ts`

**Interfaces:**
- Produces: `encodeBaseline(text: string): Promise<string>`; `decodeBaseline(encoded: string, maxBytes = 8 * 1024 * 1024): Promise<string | null>` (null on bad base64, bad gzip, or output past `maxBytes`, stopping the stream as soon as the cap is passed); `fingerprintLines(text: string): Promise<string[]>` (one per source line, `\r\n` and `\n` alike, as `splitLines` in `@drafter/compare` splits).

- [ ] **Step 1: Write failing tests** — `round-trips a script` (a 120-page fixture from `apps/web/e2e/long-script.ts`'s generator or `samples/screenplay.fountain` repeated); `encodes a 120-page script under 60 KB`; `refuses bad base64, bad gzip, and a bomb` (a gzip of 9 MiB of `a` decodes to `null`); fingerprints: `trims and counts repeats` (`'  Hello\nHello'` gives two entries with the same 7-hex prefix, the first SHA-256 hex characters of `Hello` computed in the test with `crypto.subtle`, ending `:1` and `:2`), `blank lines get fingerprints too`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** with `CompressionStream('gzip')`/`DecompressionStream('gzip')` and `btoa`/`atob` over bytes in chunks; fingerprints with `crypto.subtle.digest('SHA-256', …)`, hex, first 7.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(production): the baseline in the file, and line fingerprints`

### Task 3: A-numbers

**Files:**
- Create: `packages/production/src/numbers.ts`
- Test: `packages/production/test/numbers.test.ts`

**Interfaces:**
- Produces: `numberBetween(before: string | null, after: string | null): string` (the A-number for a scene between two numbered scenes); `provisionalNumbers(numbers: readonly (string | null)[]): string[]` (for the script's headings in order, written numbers kept, each run of `null`s filled left to right with `numberBetween(previous, next)` chained so a run of three after 5 gives `5A, 5B, 5C`).

- [ ] **Step 1: Write failing tests** with exactly these cases: `('5','6')→'5A'`, `('5A','6')→'5B'`, `('5','5A')→'5AA'`, `(null,'1')→'A1'`, `(null,'A1')→'AA1'`, `('5Z','6')→'5AA'`, `('5',null)→'5A'`; `provisionalNumbers(['4', null, null, '5'])` → `['4','4A','4B','5']`; `provisionalNumbers(['5','5A',null,'6'])` → `['5','5A','5B','6']`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** The suffix after a number is a letter sequence counted like spreadsheet columns (`A…Z, AA…`); between `x` and `xA` insert `x` + `AA` (a deeper level); before the first, prefix letters.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(production): A-numbers for scenes added after the lock`

### Task 4: Marks

**Files:**
- Create: `packages/production/src/marks.ts`
- Test: `packages/production/test/marks.test.ts`

**Interfaces:**
- Consumes: `changesOf`, `diffWords`, `splitLines` from `@drafter/compare`; `fingerprintLines` (Task 2); `ProductionSet` (Task 1).
- Produces:
  ```ts
  export interface MarkedSpan { from: number; to: number; set: string } // offsets in the current text
  export interface MarkedGap { at: number; set: string }               // offset of the line after a removal
  export function productionMarks(input: {
    current: string; baseline: string; open: string; closed: readonly ProductionSet[];
  }): Promise<{ spans: MarkedSpan[]; gaps: MarkedGap[] }>;
  export function closeSet(baseline: string, current: string, set: ProductionSet): Promise<ProductionSet>; // fills lines/gaps fingerprints
  ```
  Open-set spans are word-level: for a `changed` line paired by `diffWords`, only the added words' ranges; an `added` line is whole. Closed sets: every current line whose fingerprint is in a set's `lines` is marked with the newest such set; open-set marks win over closed ones on the same text.

- [ ] **Step 1: Write failing tests** — `marks only the changed words` (baseline `Margaret waits by the door.` → current `Margaret waits by the window.` gives one span covering `window.`); `marks an added line whole`; `marks a removal on the next line`; `a closed set's marks survive with no baseline draft` (`closeSet` then `productionMarks` with a new open baseline equal to current gives the closed set's spans); `the open set wins over a closed one`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(production): revision marks, word by word, from the baseline in the file`

### Task 5: Labels and marks in the layout

**Files:**
- Modify: `packages/layout/src/types.ts` (`Page.label: string`; `LayoutLine.mark?: { set: string }`), `packages/layout/src/paginate.ts` (`Pager.newPage` sets `label = String(number)`; `pageNumber.text` and `{n}` in header/footer use the label)
- Create: `packages/layout/src/marks.ts`
- Test: `packages/layout/test/labels.test.ts`, `test/marks.test.ts`

**Interfaces:**
- Produces: `Page.label` on every page (title page `''`); `applyMarks(layout: Layout, marks: { spans: { from: number; to: number; set: string }[]; gaps: { at: number; set: string }[] }): Layout` (a new layout: a printed line gets `mark` when its span meets a marked span, or when it is the first printed line at or after a gap's offset); export both from `packages/layout/src/index.ts`.

- [ ] **Step 1: Write failing tests** — `labels are the page numbers when unlocked` (every existing paginate fixture: `label === String(number)`); `applyMarks marks only the printed lines a span meets` (a wrapped 3-line action with a one-word change on its second printed line marks only that line); `a gap marks the next printed line`.
- [ ] **Step 2: Run** `pnpm --filter @drafter/layout test` — FAIL.
- [ ] **Step 3: Implement.** Existing layout tests must still pass unchanged apart from the new field.
- [ ] **Step 4: Run** the layout tests and `pnpm --filter @drafter/render-pdf test` (it reads `pageNumber.text`) — PASS.
- [ ] **Step 5: Commit** `feat(layout): page labels and printed revision marks`

### Task 6: Page anchors

**Files:**
- Create: `packages/production/src/anchors.ts`
- Test: `packages/production/test/anchors.test.ts`

**Interfaces:**
- Consumes: `changesOf`, `splitLines`; `LockedPage` (Task 1).
- Produces: `export interface Anchor { label: string; at: number; printed: number }` (`at`: offset of the anchor line's start in the current text); `resolveAnchors(pages: readonly LockedPage[], baseline: string, current: string): Anchor[]` (each baseline line index mapped through the diff: an unchanged or changed line to its current line, a removed line to the next surviving line; anchors that collide keep the first, and the collapsed ones are dropped, which Task 7 turns into a range); `rebaseAnchors(pages: readonly LockedPage[], oldBaseline: string, newBaseline: string): LockedPage[]` (for starting the next set).

- [ ] **Step 1: Write failing tests** — `maps unchanged anchors exactly`; `follows an edited anchor and a removed one`; `drops anchors whose whole page was removed` (two consecutive pages' lines removed → their anchors collapse onto the next survivor, only the first kept); `rebase keeps labels` (after edits, rebasing onto the edited text then resolving against it gives the same `at` values as resolving directly).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(production): page anchors that follow edits`

### Task 7: Locked pagination

**Files:**
- Modify: `packages/layout/src/types.ts` (`PaginateOptions.locked?: { anchors: { label: string; at: number; printed: number }[]; folded: { into: string; label: string }[] }`), `packages/layout/src/paginate.ts`
- Test: `packages/layout/test/locked.test.ts` (fixtures in `packages/layout/test/fixtures/locked/`)

**Interfaces:**
- Consumes: `Anchor[]` from Task 6 (plain data; layout does not import `@drafter/production`).
- Produces: `paginate(doc, template, { locked })` where each anchor forces a new page at the block holding offset `at` (after `printed` printed lines of it, splitting a speech with (MORE)/(CONT'D) as usual); text past the next anchor's start continues on pages labelled with A-suffixes of the anchor's label; a page whose label is listed in `folded` is printed as `into`'s range (`'13-14'`) — the caller (Task 10) computes `folded` from dropped anchors.

- [ ] **Step 1: Write failing tests** — `keeps every label when nothing changed`; `grows one page into 12A and 12B and leaves 13 where it was`; `a shrunk page ends short` (the next page still starts at its anchor); `folds pages whose anchors all vanished` (`13-14`, and 15 is still 15); `starts a locked page partway into a speech` (`printed: 2`).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** in the `Pager`/`Filler` (an anchor is a forced break with a label; A-labels come from the current anchor's label plus a counter, `A…Z, AA…`). **Step 4: Run** all layout tests — PASS.
- [ ] **Step 5: Commit** `feat(layout): locked pages, A-pages, and folded ranges`

### Task 8: The actions, as text changes

**Files:**
- Create: `packages/production/src/actions.ts`
- Test: `packages/production/test/actions.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4, 6; `setMeta`, `parse` from `@drafter/fountain`; `paginate` from `@drafter/layout` (to record the page map at lock).
- Produces (all `Promise<TextChange[]>`, applied by the caller as one undo step):
  `lock(text: string, template: Template, opts: { today: string; draftId: string; firstScene: number })` — writes scene numbers (screenplays only; headings that have one keep it), records `numbers`, `pages` from a fresh `paginate`, `sets: [White closed with no marks, Blue open]`, and the baseline (the text after numbering);
  `startNextSet(text: string, today: string, draftId: string)` — closes the open set (`closeSet`), opens `nextSetName`, re-bases pages, writes provisional A-numbers into headings (screenplays), replaces the baseline;
  `writeSceneNumbers(text: string)` — writes provisional A-numbers, adds them to `numbers`;
  `omitScene(text: string, sceneIndex: number)` — replaces the scene (heading through the line before the next heading) with `.OMITTED #n#` and returns the removed text for the caller to keep as a cut: `Promise<{ changes: TextChange[]; removed: string }>`;
  `clearMarks(text: string, today: string, draftId: string)` — keeps the lock and pages, sets `sets` to a fresh White closed + Blue open, new baseline;
  `unlock(text: string)` — removes the `production` key, nothing else.

- [ ] **Step 1: Write failing tests** — `lock numbers scenes from firstScene and keeps written numbers` (firstScene 101); `lock opens Blue against the locked text`; `a stage play is locked without scene numbers`; `startNextSet closes Blue with its marks and opens Pink`; `omitScene leaves .OMITTED #12# and returns the scene`; `unlock leaves written numbers and OMITTED headings`; `every action is one setMeta plus heading edits, never touching other text` (diff of before/after shows only headings and the block).
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(production): lock, revise, omit, and unlock as undoable text changes`

### Task 9: The locked-number lint rules

**Files:**
- Create: `packages/lint/src/rules/locked.ts`
- Modify: `packages/lint/src/run.ts` (add to `rules`), `packages/lint/package.json` (no new deps: the rules read `ctx.doc.meta?.production?.numbers` as plain data)
- Test: `packages/lint/test/locked.test.ts`

**Interfaces:**
- Produces three rules, active only when `doc.meta.production` has a `numbers` array and the template is a screenplay (`template.sceneNumbers.enabled`): `locked-numbers-out-of-order` (warning: a heading's number sorts before the previous heading's, comparing by the A-number order of Task 3); `repeated-scene-number` (warning: the same number twice); `locked-scene-gone` (warning on the heading after the gap: `Scene 12 is gone. A locked scene keeps its number as OMITTED.`, with fix `Put back as OMITTED` inserting `.OMITTED #12#` and a blank line before that heading).

- [ ] **Step 1: Write failing tests** for each rule, its message text exactly as above, the fix's inserted text, and `quiet when unlocked or in a stage play`.
- [ ] **Step 2: Run** `pnpm --filter @drafter/lint test` — FAIL. **Step 3: Implement** (copy the number-order comparison from Task 3's module into the rule file rather than depending on `@drafter/production`, keeping lint's dependencies as they are; a test asserts both orders agree on the Task 3 cases). **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(lint): locked scene numbers out of order, repeated, or gone`

### Task 10: The web app's production state and the worker

**Files:**
- Create: `apps/web/app/production/use-production.ts`
- Modify: `apps/web/app/workers/compute.ts` (request field `production?: { id: number; baseline?: string; anchors; folded; closed: ProductionSet[]; open: string }`, answered like Show changes' baseline: layout with `locked`, then marks via `productionMarks` + `applyMarks`), `apps/web/app/editor/layout.ts` (send it), `packages/render-html/src/page.ts` (draw `page.label`; an asterisk at the right margin, `STAR_COLUMN_FROM_RIGHT` as `apps/web/app/compare/draw.ts` uses, for each marked line, with an `aria-label` "changed in Blue")
- Test: `apps/web/test/use-production.test.ts`, `apps/web/test/compute-production.test.ts`, `packages/render-html/test/marks.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5, 6, 7.
- Produces: `useProduction(): { state: Readonly<Ref<ProductionState | null>>; locked: ComputedRef<boolean>; openSet: ComputedRef<ProductionSet | null> }` where `ProductionState = Production & { baselineText: string }`, decoded once per change of the block (async, cached by the block's string), `null` for unlocked or an unreadable block (and then the status bar says `Revision marks can't be shown: the block is damaged`).

- [ ] **Step 1: Write failing tests** — the worker: `answers a locked request with labels, then marks`; `a request without production is answered as before`; render-html: `draws 12A and an asterisk with its label`; `useProduction`: `decodes once per block`.
- [ ] **Step 2–4:** run, implement, run — PASS; the existing Show changes tests unchanged.
- [ ] **Step 5: Commit** `feat(web): locked pages and revision marks in the Script pane`

### Task 11: The Production tab, commands, chip, and Omit scene

**Files:**
- Create: `apps/web/app/components/ProductionPane.vue`, `apps/web/app/production/commands.ts`
- Modify: `apps/web/app/utils/panes.ts` (`'production'` in `ViewTabId`, `InspectorTabId`, and the script's `more` list after `'notes'`), `apps/web/app/components/AppPane.vue` (mount it), `apps/web/app/commands/data.ts` (commands: `production-lock`, `production-next-set`, `production-write-numbers`, `production-omit-scene`, `production-clear-marks`, `production-unlock`; group `'Edit'`; script only), `apps/web/app/components/AppStatusBar.vue` (chip `Blue rev.` opening the tab), the Outline's and Cards' scene menus (`Omit scene`, screenplays, locked only), `packages/cm-fountain` (provisional numbers drawn dimmer after unnumbered headings, as a widget, never in the text)
- Test: `apps/web/test/production-commands.test.ts`, `apps/web/e2e/production.spec.ts`

**Interfaces:**
- Consumes: Task 8's actions (each dispatched as one transaction with `isolateHistory`), Task 10's `useProduction`, Drafts' `freezeDraft(projectId, text, note)` for each baseline (`'Locked'`, `'End of the Blue revision'`), Cuts for Omit scene's removed text.
- Produces: the tab per spec §5 (state, lock/unlock, next set with earlier sets listed, Scene numbers start at), with no Export section until Plan 2; confirmations for Unlock… and Clear marks… worded as spec §6.4; Unlock… and Clear marks… take a snapshot first: `takeSnapshot(projectId, text, reason)` from `apps/web/app/storage/snapshots.ts`, with two new `SnapshotReason` values, `'before-unlock'` and `'before-clear-marks'`, labelled `Before unlocking` and `Before clearing marks` in `apps/web/app/snapshots/labels.ts`.

- [ ] **Step 1: Write failing tests** — unit: `commands are off for Markdown and novels, and number commands off for stage plays`; `Unlock asks first, and takes a snapshot before it changes anything`. Browser (`production.spec.ts`): `locks, numbers scenes, and opens Blue`; `an edit shows an asterisk and Blue rev. in the status bar`; `Start the next revision (Pink) keeps Blue's marks`; `Omit scene leaves OMITTED and one undo brings the scene back`; `a new scene shows 5A dimmed, and Write new scene numbers writes it`.
- [ ] **Step 2–4:** run, implement, run — PASS; axe on the tab in both themes (`a11y.spec.ts` pattern).
- [ ] **Step 5: Commit** `feat(web): the Production tab, its commands, and Omit scene`

### Task 12: Help, What's new, and the docs

**Files:**
- Create: `apps/web/app/pages/docs/production.vue` (each word taught with an example: lock, revision sets and colors, A-pages, A-scenes, OMITTED, what the long line at the end of the file is)
- Modify: `apps/web/app/commands/data.ts` (`HELP_PAGES` entry `help-production`, section `'writing'`), `apps/web/app/commands/help-menu.ts` (icon `i-lucide-clapperboard`), `apps/web/app/editor/cheat-sheet.ts` (scene numbers entry mentions A-numbers and OMITTED), `CHANGELOG.md` [Unreleased], `docs/DECISIONS.md` (the anchor-as-baseline-line decision, the lint rules), README features
- Test: `apps/web/e2e/docs.spec.ts` picks the page up from `HELP_PAGES` automatically; add the phrase check `'revision set', 'A-pages', 'OMITTED'`.

- [ ] **Steps:** add the page and entries; run `pnpm --filter @drafter/web exec vitest run test/help-menu.test.ts test/command-data.test.ts` and the docs spec; commit `docs: the Production help page`.

### Task 13: End-to-end checks and trap documents

**Files:**
- Create: `fixtures/trap/production/` (a block with bad base64, a gzip bomb, pages out of order, 100,000 marked lines, `numbers` of the wrong type), entries in `fixtures/trap/MANIFEST.md`
- Modify: `apps/web/e2e/production.spec.ts`

- [ ] **Step 1: Write failing tests** — `the same file in a fresh profile shows the same marks and labels` (export the `.fountain` text from one context, open it in a new context with empty storage, compare the asterisk lines and labels); `Classic Mode on and off changes nothing in the file`; each trap document opens unlocked with the script intact.
- [ ] **Step 2–4:** run, fix, run — PASS; then the full gates: `pnpm check`, every package's tests, `pnpm --filter @drafter/web typecheck`, the web unit tests, the Chromium browser suite.
- [ ] **Step 5: Commit** `test: Production across profiles, Classic Mode, and hostile blocks`
