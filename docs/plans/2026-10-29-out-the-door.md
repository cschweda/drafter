# Getting a script out the door (v0.17.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.17.0: a **Guided first screenplay** and a **Guided first stage play** whose notes teach each element; **Export options** per script (scene numbers None / As written / Number every scene; title page Full / Title and author only / None) for PDF, plain text, and (title page only) Final Draft; **running time** at a rate set per script, plus an **estimate from the dialogue**, shown for the script, each act, and each scene in Stats, the Outline, and the Structure strip's card; and a **Technical details** help page with its diagrams drawn from one source.

**Architecture:** The starters are two `.fountain` files beside Help's sample scripts, opened by two commands the way those are. The export options are two pure engine changes (`paginate`'s `sceneNumbers` gains `'none' | 'written' | 'all'`; `titlePageFor` in `@drafter/layout`), applied in the export worker from options stored on the project record and set in an Export options dialog. Timing is counted per block in `@drafter/outline` (`blockTiming`) inside the scene index's existing pass and in `countScript`, and formatted in `apps/web/app/stats/timing.ts`. The Technical details page renders `apps/web/app/about/tech.ts`, whose diagrams are also generated as Mermaid into `docs/technical-details.md` and checked by a file snapshot.

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Dexie 4, Vitest 5 with fast-check, Playwright 1.64. No new dependencies.

**Spec:** [`docs/drafter-out-the-door-design.md`](../drafter-out-the-door-design.md) (all of it; its 22 Calls are binding). Context: the Structure strip design (`docs/drafter-structure-strip-design.md`, the card this extends), the stats design (`docs/drafter-stats-design.md`), the element bar design (`docs/drafter-element-bar-design.md`), the Phase 2 design §22 (the plan list), and the Markdown PDF plan (`docs/plans/2026-10-29-markdown-pdf.md`, which changes `ExportRequest` first).

## Global Constraints

- Branch `writer-starters`, from `main` at v0.15.0. **Before Task 1, merge `main` at v0.16.0** (the Markdown PDF): it changes `export-compute.ts`, `export.ts`, `ExportMenu.vue`, `AppMenu.vue`, `settings.ts`, and the Phase 2 design's plan list, all of which this plan edits. Run `pnpm install` after the merge. If v0.16.0 isn't on `main` yet, Tasks 1 and 4–6 can go first; Tasks 2 and 3 wait.
- **Clean room:** no one working on this looks at any other application's beginner template, sample, or tutorial. Every word of the starters, the dialog, the timing lines, and the Technical details page is Drafter's own. No code, text, or assets from any screenwriting app.
- **No new dependencies,** runtime or development. No Mermaid, no mermaid-cli, no charting library (design §4.2). `docs/DEPENDENCIES.md` is unchanged.
- **The script is never changed** by an export option or a rate: no `TextChange`, no metadata block written. Both live on the `Project` record as unindexed optional fields (`exportOptions`, `timing`), so no new Dexie version.
- **No extra parse or layout while typing.** Timing rides the scene index's pass and `countScript`'s parse-keyed cache.
- **Keyboard:** every new action is a command in `commands/data.ts` + `builtin.ts` (palette, Keyboard shortcuts page, desktop menus). No new keys.
- **Markdown documents:** Export options is disabled with "A Markdown document has no scene numbers or title page."; Stats keeps its Markdown reading time; the starters are Fountain only.
- **Read-only tabs:** options and rates show disabled, with "Another tab has this script open, so its export options can’t be changed here." (and "…its rates…" for Stats); exporting and reading the times work.
- **Accessibility work waits for the final steps** (maintainer, 2026-10-28): no accessibility task; the existing axe tests stay green, and `/docs/technical/` is added to `a11y.spec.ts`'s list of docs pages (one line, the pattern already there).
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]` in the writer's words; choices in `docs/DECISIONS.md` under a new `## Getting a script out the door (v0.17.0)` section (each Call gets a line when it lands); conventional commits with **no AI co-author trailer and no session link**; the README kept in sync (Task 7 does the status line, roadmap, and features).

## Review Focus

1. **A title page with only the keys "title and author" drops** (just `Contact:` and `Draft date:`), or with an alias (`Authors:`, `Date:`) or odd case (`AUTHOR:`): "Title and author only" prints no title page at all and the body's page numbers don't move; `Authors` is kept, `Date` dropped. Task 2's `titlePageFor keeps Title, Credit, Author, Authors, and Source by the layout's own aliases` and `a title page left with nothing that prints is no title page, and page 1 is still page 1`.
2. **Locked and unlocked scenes mixed** (`#12A#` on the second of three scenes, none on the others) under each scene-number mode: As written prints only `12A`; Number every scene prints `1, 12A, 3`; None prints none. Task 2's `As written numbers only locked scenes` and `Number every scene keeps locked numbers and counts the rest`.
3. **A rate typed badly** (empty, `0`, `-1`, `1,2`, `abc`, `10`): the field says what's allowed and keeps the last good rate; nothing stored is ever NaN or out of range, and a stored value out of range (from a future version) reads as the default. Task 4's `reads a missing or out-of-range timing as the defaults` and e2e `a rate out of range is refused and the last good one kept`.
4. **A scene of only action, only dialogue, or neither** (a heading alone), and **dialogue written with forced marks** (`@McCLANE`, a `~` lyric): times are never NaN, a heading alone takes 0 s, and a forced name's speech counts as spoken. Task 4's `blockTiming` fixtures and the property `timing is finite, non-negative, and sums over scenes to at most the script's`.
5. **The export started from a stale tab or while switching scripts:** the options used are the exported script's, read with its text in `run` (as the name and template already are), never the previous script's. Task 3's e2e `exports each script with its own options after switching`.

---

### Task 1: The guided starters

**Files:**
- Create: `apps/web/app/editor/sample-scripts/guided-screenplay.fountain`, `apps/web/app/editor/sample-scripts/guided-stage-play.fountain`, `apps/web/app/editor/starters.ts`, `apps/web/test/starters.test.ts`
- Modify: `apps/web/app/commands/{data.ts,builtin.ts}`, `apps/web/app/components/AppMenu.vue` (New section; Help → Sample scripts), `apps/web/app/storage/{projects.ts,first-samples.ts}` (`starter`), `apps/desktop/src/menu.ts` (File's New group; Help → Sample Scripts), `apps/web/app/pages/docs/{fountain.vue,index.vue}` (one line each), `apps/web/test/{desktop-menu.test.ts,first-samples.test.ts,command-data.test.ts}`, `apps/web/e2e/help-menu.spec.ts`

**Interfaces (Consumes):** `script.addScript(text, { kind, baseline, … })`, `script.open`, `editor.goto` (as `sample-script-*` uses them); `FOUNTAIN_BUTTONS`, `FOUNTAIN_MORE`, `STAGE_BUTTONS`, `barFor` (`editor/element-bar.ts`). **(Produces):**
```ts
// editor/starters.ts
export type StarterKind = 'screenplay' | 'stage-play';
export interface Starter { kind: StarterKind; command: string; title: string; menuLabel: string; text: string }
// command 'new-guided-screenplay' | 'new-guided-stage-play'; title 'New guided screenplay' | 'New guided stage play';
// menuLabel 'Guided first screenplay' | 'Guided first stage play'
export const STARTERS: readonly Starter[];
/** Every "the X button" a starter's notes name, in order (X as written). */
export function buttonsNamed(text: string): string[];
// storage/projects.ts: Project gains (unindexed) `starter?: StarterKind`
```
The command data entries need no text: `data.ts` takes ids and titles from a text-free list (`STARTER_KINDS` in `starters.ts`'s own data half, or inline), as `sample-kinds.ts` does for samples, so the prerendered Keyboard shortcuts page doesn't carry the scripts.

- [ ] **Step 1: Write the starters' text** to design §1.2 and §1.3, in Drafter's own words. Notes are paragraphs of their own (`[[…]]` blocks), one after each example. Each names its button as "the *Label* button" with the label exactly as the bar shows it, and its mark in words ("the Scene button, marked INT."). The screenplay's Your turn heading is `INT. YOUR FIRST LOCATION` (no time of day, deliberately).
- [ ] **Step 2: Write the failing tests.** `starters.test.ts`: `reads every block as its note says` (each starter: `parse(text).blocks.map(b => b.kind)` equals the full list written out in the test, and `templateIdOf` is `us-screenplay` / `stage-play-standard`), `lays out with no diagnostics` (`paginate` with the built-in template), `the screenplay has exactly one Problem, heading-no-time, on its Your turn heading` (`lint` with severity not `info`; the span's line is `INT. YOUR FIRST LOCATION`), `the stage play has no Problems`, `names only buttons the bar has, and every main button` (`buttonsNamed` ⊆ labels of `barFor(structure)`'s buttons and more; every label in `buttons` appears), `the screenplay shows each main mark` (regexes: a line starting `!`, a line starting `@`, `^>.*<$`, `^#`, `^=`, `/*`, `*…*`, `**…**`, `_…_`, a transition ending `TO:`), `the stage play has a cast list before Act One that reads as action, then a page break` (blocks before the first section: `centered`, then only `action`, then `page_break`), `its entrances and exits are stage directions` (`ARLO enters` and `exits.` lines are in `action` blocks), `the title page has a title and an author` (both). `desktop-menu.test.ts`: `lists New guided screenplay and New guided stage play in File, after New stage play, and in Help → Sample Scripts`. `first-samples.test.ts`: `a starter doesn't count as meeting that kind's sample`. `help-menu.spec.ts`: `Help → Sample scripts → Guided first screenplay opens it at the top, unchanged, as a new script` (title in the Scripts menu, cursor at 0, no changed dot), `New guided stage play from the app menu opens the play with the stage-play template`, `the Problems tab shows the one problem the screenplay starter explains`.
- [ ] **Step 3: Run them.** `pnpm --filter web test -- starters desktop-menu first-samples` → FAIL (no `starters.ts`).
- [ ] **Step 4: Implement** `starters.ts`, the commands (`enabled: canStart`; run as `sample-script-*` does, with `starter: kind` instead of `sampleScript`, and `editor.goto(0)`), the menus (app menu New section: after the `new-*` items; Help → Sample scripts: after the three samples, labelled `menuLabel`), the desktop picks, `metSample` (`!p.sampleScript && !p.starter && …`), and the two docs lines (cheat sheet: "New to Fountain? File → New guided screenplay walks you through a first script."; Help index: Sample scripts mentions the guided ones).
- [ ] **Step 5: Run them again,** plus `palette.spec.ts`, `docs.spec.ts`, `first-samples.spec.ts`. → PASS.
- [ ] **Step 6: Commit.** `feat(web): guided first screenplay and stage play`

---

### Task 2: Scene numbers and the title page in the engine

**Files:**
- Modify: `packages/layout/src/{types.ts,paginate.ts,title.ts,index.ts}`, `packages/layout/test/{layout.test.ts,title.test.ts}` (or the existing file that tests the title page), `packages/layout/README.md`, `apps/web/app/workers/export-compute.ts`, `apps/web/test/export-compute.test.ts`

**Interfaces (Consumes):** `paginate`, `PaginateOptions`, `titlePage`'s `SLOTS`; the v0.16.0 `ExportRequest` union. **(Produces):**
```ts
// @drafter/layout
export type SceneNumbering = 'none' | 'written' | 'all';
export interface PaginateOptions { sceneNumbers?: boolean | SceneNumbering } // true = 'all', false = 'none', absent = the template's
export type TitlePageMode = 'full' | 'title-author' | 'none';
/** The title page with only the fields `mode` keeps (by SLOTS: title, credit, author/authors, source), or null for 'none'. 'full' returns it as is. Never mutates. */
export function titlePageFor(tp: TitlePage | null, mode: TitlePageMode): TitlePage | null;
// apps/web/app/workers/export-compute.ts
export interface ExportOptions { sceneNumbers: SceneNumbering; titlePage: TitlePageMode }
export const DEFAULT_EXPORT_OPTIONS: ExportOptions; // { sceneNumbers: 'none', titlePage: 'full' }
// the Fountain request kinds ('pdf' | 'txt' | 'fdx') gain `options?: ExportOptions` (absent = the defaults)
```
- In the worker: `const doc = { ...parse(source), titlePage: titlePageFor(parsed.titlePage, o.titlePage) }`; PDF and text `paginate(doc, template, { sceneNumbers: o.sceneNumbers })`; `.fdx` `toFdx(doc, template)` (numbers as written, design Call 8).

- [ ] **Step 1: Write the failing tests.** `layout.test.ts`: `As written numbers only locked scenes` (three scenes, the second `#12A#`: `sceneNumbersLeft` texts `['12A']`), `Number every scene keeps locked numbers and counts the rest` (`['1', '12A', '3']`), `none prints no numbers, even locked ones`, `true and false still mean every scene and none` (the CLI's flags). `title.test.ts`: `titlePageFor keeps Title, Credit, Author, Authors, and Source by the layout's own aliases` (keys `TITLE`, `credit`, `Authors`, `Source`, `Contact`, `Date`, `Draft date`, `Notes` → the first four kept, in order), `'none' is null and 'full' is the same object`, `a title page left with nothing that prints is no title page, and page 1 is still page 1` (only `Contact` and `Draft date`, mode `title-author`: `paginate` has no page 0, first page number 1), `does not change the title page it is given`. `export-compute.test.ts`: `a PDF with no title page has one page fewer` (pdfjs page count), `plain text with scene numbers as written prints the locked number at the template's columns`, `a Final Draft file with title and author only has no Contact paragraph`, `a Final Draft file keeps its locked numbers whatever the scene-number option`, `a request with no options exports as before` (byte-equal to today's output for the sample screenplay).
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/layout test` and `pnpm --filter web test -- export-compute` → FAIL.
- [ ] **Step 3: Implement** the option in `Items.build` (a mode in place of the boolean: `'written'` sets a number only when `block.sem.number`), `titlePageFor` (filters `fields` by `SLOTS[key.trim().toLowerCase()]` in `{title, credit, author, source}`; keeps `span` and `raw`), the exports, and the worker. README: a line on each.
- [ ] **Step 4: Run them again,** plus `pnpm --filter @drafter/cli test` (the flags) and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat(layout): scene numbers as written, and a title page of title and author only`

---

### Task 3: Export options in the app

**Files:**
- Create: `apps/web/app/storage/export-options.ts`, `apps/web/app/components/ExportOptionsDialog.vue`, `apps/web/test/export-options.test.ts`
- Modify: `apps/web/app/storage/{projects.ts,export.ts}`, `apps/web/app/commands/{data.ts,builtin.ts}` (`export-options`), `apps/web/app/components/{ExportMenu.vue,AppMenu.vue}`, `apps/web/app/pages/index.vue` (mount the dialog as the others are), `apps/web/app/pages/docs/saving.vue` (a paragraph on Export options, if it describes exports; else `fountain.vue`'s title page entry), `apps/web/test/{desktop-menu.test.ts,export.test.ts}`, `apps/web/e2e/export.spec.ts`, `apps/desktop/e2e/files.spec.ts` (one export with an option)

**Interfaces (Consumes):** `ExportOptions`, `DEFAULT_EXPORT_OPTIONS` (Task 2); `updateProject`, `useScript().project`, `useGuard().readOnly`. **(Produces):**
```ts
// storage/export-options.ts
/** The project's options, any missing or unknown value read as its default. */
export function exportOptionsOf(project: Pick<Project, 'exportOptions'> | null | undefined): ExportOptions;
/** "with scene numbers as written and the title and author only", or '' for the defaults (design Call 11). */
export function optionsPhrase(options: ExportOptions): string;
export const EXPORT_OPTION_LABELS: {
  sceneNumbers: Record<SceneNumbering, string>; // 'None', 'As written', 'Number every scene'
  titlePage: Record<TitlePageMode, string>;      // 'Full', 'Title and author only', 'None'
};
export const FDX_NOTE = 'A Final Draft file gets the title page you choose, and always keeps the scene numbers written in the script: Final Draft decides whether to print them.';
export const OPTIONS_NOT_FOR_MARKDOWN = 'A Markdown document has no scene numbers or title page.';
export const OPTIONS_READ_ONLY = 'Another tab has this script open, so its export options can’t be changed here.';
/** Keeps one option on the open script's project (no-op in a read-only tab). */
export function setExportOption<K extends keyof ExportOptions>(key: K, value: ExportOptions[K]): Promise<void>;
export const exportOptionsOpen: Ref<boolean>;
// projects.ts: Project gains (unindexed) `exportOptions?: Partial<ExportOptions>`
// data.ts: { id: 'export-options', title: 'Export options…', group: 'File' }
```
- `run` in `export.ts` reads `exportOptionsOf(script.project.value)` with the source and template (same tick), passes it in the request, and appends `optionsPhrase` to "Exported …" when non-empty: "Exported The Call.pdf, with scene numbers as written and the title and author only."
- The dialog (Nuxt UI modal, as `TreatmentDialog.vue`): title "Export options", two `fieldset`s with radio groups **Scene numbers** and **Title page**, `FDX_NOTE` under them, **Done**. Each change calls `setExportOption` at once. In a read-only tab both groups are disabled and `OPTIONS_READ_ONLY` is shown.
- The Export menu (toolbar and app menu) ends with a separator and **Export options…**; the desktop app picks it into File → Export by the existing `prefix('export-')` (its label stays "Export options…", since the strip regex only removes "Export as ").

- [ ] **Step 1: Write the failing tests.** `export-options.test.ts`: `reads missing or unknown options as the defaults` (`undefined`, `{}`, `{ sceneNumbers: 'roman' }`), `optionsPhrase is empty for the defaults and names each other choice` (all 8 non-default combinations, exact strings), `setExportOption keeps the choice on the open project and does nothing read-only` (Dexie on fake-indexeddb, as `projects.test.ts`). `desktop-menu.test.ts`: `puts Export options… in File → Export, last`. `export.test.ts`: `sends the open script's options with its text`. `export.spec.ts`: `Export options… is at the end of the Export menu and in the palette`, `choosing No title page exports a PDF without one, and the toast says so` (pdfjs page 1 text has no title), `the options are remembered per script, after a reload`, `exports each script with its own options after switching` (two scripts, different options, switch and export each), `is disabled for a Markdown document, with the reason`, `in a read-only tab the choices are disabled and say why, and exporting works`, `the script is unchanged by choosing options` (no changed dot; Undo has nothing).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `app-menu.spec.ts`, `palette.spec.ts`, `fdx.spec.ts`, `pnpm --filter @drafter/desktop e2e`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): export options per script, for scene numbers and the title page`

---

### Task 4: Timing in the engine, and the rates in Stats

**Files:**
- Create: `packages/outline/src/timing.ts`, `packages/outline/test/{timing.test.ts,timing.properties.test.ts}`, `apps/web/app/stats/timing.ts`, `apps/web/test/timing.test.ts`
- Modify: `packages/outline/src/{types.ts,scene-index.ts,index.ts}`, `packages/outline/README.md`, `packages/outline/test/scene-index.test.ts`, `apps/web/app/stats/count.ts`, `apps/web/app/storage/projects.ts` (`timing`), `apps/web/app/components/{StatsDialog.vue,CountsPanel.vue}`, `apps/web/test/{count.test.ts,count-budget.test.ts}`, `apps/web/e2e/{stats.spec.ts,counts.spec.ts}`

**Interfaces (Consumes):** `resolveRole` and `template.roles` (`@drafter/templates`), the scene index's per-scene block loop; `countScript`. **(Produces):**
```ts
// @drafter/outline timing.ts
export interface Timing { spoken: number; actionLines: number } // spoken words; printed lines of action / stage direction
export const ACTION_SECONDS_PER_LINE = 1.5;  // design Call 14; fixed (Call 15)
export const DEFAULT_WORDS_PER_MINUTE = 150;
/** What one block adds: dialogue and lyric words are spoken (inline notes left out); an action block's lines, each source line ceil(columns / width) at its resolved role's width, at least 1; everything else 0. */
export function blockTiming(block: Block, template: Template): Timing; // the width is that of resolveRole(template, block, null) (no built-in template has an `afterRole` rule; a template that did would time its action at the unconditioned role's width, which is fine for an estimate)
export function addTiming(a: Timing, b: Timing): Timing;
/** Seconds: spoken / wpm × 60 + actionLines × ACTION_SECONDS_PER_LINE. */
export function estimateSeconds(t: Timing, wordsPerMinute: number): number;
// types.ts: Scene gains `timing: Timing`; Section gains `timing: Timing` (the sum of its scenes)
// apps/web stats/timing.ts
export interface Rates { minutesPerPage: number; wordsPerMinute: number }
export const DEFAULT_RATES: Rates;               // { minutesPerPage: 1, wordsPerMinute: 150 }
export const RATE_LIMITS: { minutesPerPage: { min: 0.5; max: 3; step: 0.1 }; wordsPerMinute: { min: 100; max: 220; step: 5 } };
export function ratesOf(project: Pick<Project, 'timing'> | null | undefined): Rates; // out of range or not finite → default, per field
/** A typed rate, or the message the field shows: 'Enter a number from 0.5 to 3.' / 'Enter a whole number from 100 to 220, in steps of 5.' */
export function parseRate(key: keyof Rates, text: string): number | { problem: string };
export function setRate(key: keyof Rates, value: number): Promise<void>; // no-op read-only
export function pageSeconds(eighths: number, minutesPerPage: number): number; // eighths / 8 × 60 × rate
/** '10 s', '1 min 25 s', '12 min', '1 h 5 min': to 5 s under 10 min, then to the minute (Call 17). */
export function shortTime(seconds: number): string;
/** The same in words, for accessible names: 'about 1 minute 25 seconds'. */
export function timeWords(seconds: number): string;
export const ESTIMATE_LABEL = 'Estimate from the dialogue';
export function estimateNote(rates: Rates): string; // 'The words spoken, at 150 words a minute, plus 1.5 seconds for each line of action. A rough guide, not a timing.'
// count.ts: Counts drops `minutes` and gains `timing: Timing`; countScript(doc, layout, template)
```
- `countScript` sums `blockTiming` over every block of the parse (the preamble included), remembered per `Doc` as `wordsOfDoc` is. The running time is `runningTime(Math.round(pages × minutesPerPage))`; the estimate `runningTime(Math.round(estimateSeconds(timing, wpm) / 60))`.
- Stats (`StatsDialog.vue`), the script's part: **Running time** "About 98 min, at 1 minute a page" and **Estimate from the dialogue** "About 87 min", then two labelled number inputs, **Minutes a page** (hint: "Plays often run longer than a minute a page.") and **Spoken words a minute**, validated on change with `parseRate` (problem shown with `aria-invalid` and `aria-describedby`, as CountsPanel's sprint minutes do), then `estimateNote`. Disabled read-only, with the reason. CountsPanel: the two figures and "Set the rates in Stats." in its note.

- [ ] **Step 1: Write the failing tests.** `timing.test.ts` (outline): `dialogue and lyrics are spoken words`, `parentheticals, cues, headings, transitions, centered text, notes, and the boneyard take no time`, `an action line counts its wrapped lines at the role's width` (61 columns of action → 2 lines in a screenplay; 51 of stage direction → 2 in a play), `a forced name's speech is spoken` (`@McCLANE`), `a heading alone is no time`, `estimateSeconds adds speech at the pace and 1.5 s a line`. `scene-index.test.ts`: `each scene's timing sums its blocks, and each section's its scenes`. `timing.properties.test.ts` (over `anyScript`): `timing is finite, non-negative, and sums over scenes to at most the script's`. App `timing.test.ts`: `reads a missing or out-of-range timing as the defaults`, `parseRate accepts the range and refuses the rest` (`''`, `'0'`, `'-1'`, `'1,2'`, `'abc'`, `'10'`, `'0.55'` for minutes; `'152'` for words), `shortTime rounds to 5 s under ten minutes and to the minute after` (7.5 → `'10 s'`, 85 → `'1 min 25 s'`, 601 → `'10 min'`, 3900 → `'1 h 5 min'`), `timeWords says the same in words`. `count.test.ts`: `counts the whole script's timing, the preamble included`. `count-budget.test.ts`: the existing budgets still hold with timing counted. `stats.spec.ts`: `shows the running time at the script's rate and the estimate from the dialogue`, `a rate set in Stats is kept for that script only, after a reload`, `a rate out of range is refused and the last good one kept`, `in a read-only tab the rates are disabled and say why`. `counts.spec.ts`: `shows both times`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `pnpm --filter @drafter/outline test` (the strip's budget and properties too) and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat: running time at a rate per script, and an estimate from the dialogue`

---

### Task 5: Times in the Outline and the Structure strip

**Files:**
- Modify: `apps/web/app/outline/labels.ts` (`sceneName`, `sectionName` take rates), `apps/web/app/components/OutlinePane.vue` (row meta, around its `lengthLabel` lines), `apps/web/app/strip/labels.ts` (`cardLines`, `blockName`), `apps/web/app/components/StructureStrip.vue` (passes rates), `apps/web/test/{outline-labels.test.ts,strip-labels.test.ts}`, `apps/web/e2e/{outline.spec.ts,strip.spec.ts}`

**Interfaces (Consumes):** `Scene.timing`, `Section.timing`, `estimateSeconds` (Task 4, `@drafter/outline`); `ratesOf`, `pageSeconds`, `shortTime`, `timeWords`, `ESTIMATE_LABEL` (Task 4, `stats/timing.ts`). **(Produces):**
```ts
// outline/labels.ts
/** A row's time at the page rate: '1 min 25 s', or '' without pages. */
export function rowTime(eighths: number | null, rates: Rates): string;
export function sceneName(scene: Scene, rates?: Rates): string;   // …, 'page 12, 1 3/8 pages, about 1 minute 25 seconds'
export function sectionName(section: Section, rates?: Rates): string;
// strip/labels.ts
export function cardLines(item: OutlineItem, rates?: Rates): string[];
// scene:   [..., 'page 12 · 1 3/8 pp · 1 min 25 s · blue', 'Estimate from the dialogue: 1 min 10 s', 'Goal: …', synopsis]
// section: ['Act One', '5 scenes · 12 pp · 12 min', 'Estimate from the dialogue: 10 min']
```
`rates` defaults to `DEFAULT_RATES`, so callers that don't pass it (Cards, Go to scene) read as before plus the time.

- [ ] **Step 1: Write the failing tests.** `outline-labels.test.ts`: `a scene's name says its time in words, at the script's rate` (1 3/8 pp at 1.2 → "about 1 minute 40 seconds"), `no time without pages`, `a section's name says its time`. `strip-labels.test.ts`: `the card gives the time and the estimate from the dialogue`, `a section's card gives its time and estimate`, `the estimate shows without pages` (a scene with `pages` null still gets the estimate line). `outline.spec.ts`: `each row shows its time, and an act's is its scenes' total`, `the times follow the rate set in Stats`. `strip.spec.ts`: `the card shows a scene's time and its estimate from the dialogue`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.** The Outline row meta becomes `p. 12 · 1 3/8 p · 1 min 25 s`; a section's `5 scenes · 12 pp · 12 min`. Both views read the open script's rates through one computed (`ratesOf(useScript().project.value)`).
- [ ] **Step 4: Run them again,** plus `cards.spec.ts` and `palette.spec.ts` (Go to scene names). → PASS.
- [ ] **Step 5: Commit.** `feat(web): each scene's and act's running time in the Outline and the Structure strip`

---

### Task 6: The Technical details page

**Files:**
- Create: `apps/web/app/about/tech.ts`, `apps/web/app/about/mermaid.ts`, `apps/web/app/pages/docs/technical.vue`, `apps/web/app/components/TechDiagram.vue`, `apps/web/test/tech.test.ts`, `docs/technical-details.md` (written by the test's file snapshot)
- Modify: `apps/web/app/commands/data.ts` (`HELP_PAGES` gains `{ id: 'help-technical', path: '/docs/technical', title: 'Technical details' }`, last), `apps/web/app/pages/docs/index.vue` (its `about` line; "Five short pages" → "Six"), `apps/web/app/components/AppMenu.vue` (`HELP_ICONS`: `i-lucide-cpu`), `apps/desktop/src/menu.ts` (Help pick and `LABELS`: "Technical Details"), `apps/web/test/desktop-menu.test.ts`, `apps/web/e2e/{docs.spec.ts,help-menu.spec.ts,a11y.spec.ts,offline.spec.ts}` (the page is precached and opens offline, if `offline.spec.ts` lists docs pages), `README.md` (a link under Design documents / Help)

**Interfaces (Consumes):** `HELP_PAGES`, `useDocsHead`, the `docs` layout; `ABOUT_LINKS` (the repository URL for links to `docs/DEPENDENCIES.md` and the README's clean-room section). **(Produces):**
```ts
// about/tech.ts (plain data; no imports from the app's runtime)
export type Inline = string; // `code` in backticks becomes <code>; nothing else is markup
export type TechBlock =
  | { kind: 'p'; text: Inline }
  | { kind: 'list'; items: Inline[] }
  | { kind: 'diagram'; diagram: Diagram };
export interface TechSection { id: string; title: string; plain: TechBlock[]; details: TechBlock[] } // design §4.1's ten parts
export type Diagram =
  | { id: string; kind: 'flow'; caption: string; steps: { label: string; detail: string }[] }  // a chain, top to bottom
  | { id: string; kind: 'packages'; caption: string };                                         // drawn from PACKAGES
export interface PackageNote { name: string; does: string; uses: string[] } // uses: its @drafter/* runtime deps
export const PACKAGES: readonly PackageNote[];   // every packages/* and apps/web, apps/desktop
export const DEPENDENCY_NOTES: Readonly<Record<string, string>>; // third-party runtime dependency → one plain line
export const TECH_SECTIONS: readonly TechSection[];
// about/mermaid.ts
/** A flow as `flowchart TD` with one node per step, chained; packages as `flowchart BT` with an edge per use. Labels quoted, `"` escaped. */
export function toMermaid(diagram: Diagram, packages: readonly PackageNote[]): string;
/** Each package's row: 0 for one that uses none, else one more than the deepest it uses. */
export function packageRows(packages: readonly PackageNote[]): PackageNote[][];
/** The whole page as GitHub Markdown, each diagram as a ```mermaid block. */
export function technicalMarkdown(sections: readonly TechSection[], packages: readonly PackageNote[], notes: Readonly<Record<string, string>>): string;
```
- `TechDiagram.vue` draws a flow as `<figure>` → `<figcaption>` (the caption) and an `<ol>` of boxes (label, then detail in `--text-muted`), with a CSS arrow between boxes (`aria-hidden`), boxes in `--chrome` with a `--line` border; packages as one `<ol>` of rows (top row the app), each a `<ul>` of boxes naming the package, and each box's `title`-free text "uses …" in a visually hidden span. Tokens only, so both themes work; it prints.
- The page: the docs lead paragraph, a contents list of the ten parts, then each part's `plain` then `details`, then **What it depends on** from `DEPENDENCY_NOTES` (a definition list), the development-tools paragraph, and links to DEPENDENCIES.md on GitHub and to the Third-party licences page. Every fact on it is checked against the code while writing; anything not verifiable from the repository is left out.

- [ ] **Step 1: Write the failing tests.** `tech.test.ts`: `PACKAGES lists every package, and each uses exactly its @drafter/* runtime dependencies` (reads every `package.json` in `apps/` and `packages/`, as `apps/desktop/test/dependencies.test.ts` does), `DEPENDENCY_NOTES names exactly the third-party runtime dependencies of every package.json` (missing and stale both fail, listed by name), `packageRows puts each package below everything it uses`, `toMermaid writes a chain for a flow and an edge per use for the packages` (small fixtures, exact text), `escapes quotes in labels`, `every diagram has a caption and every flow at least two steps`, `docs/technical-details.md is the page as Markdown` (`expect(technicalMarkdown(...)).toMatchFileSnapshot('../../../docs/technical-details.md')`). `desktop-menu.test.ts`: `puts Technical Details in Help, after Third-party Licences`. `docs.spec.ts`: `the Technical details page has its parts, its diagrams as lists, and every dependency`, `reads without JavaScript` (as the others are checked), `has no script or style from another origin` (the CSP is unchanged). `help-menu.spec.ts`: `Help → Technical details opens the page in a new tab`, and About Drafter lists it. `a11y.spec.ts`: add `/docs/technical/` to its docs list.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Write `tech.ts`** (design §4.1, plain words first), `mermaid.ts`, `TechDiagram.vue`, the page, and the menu entries; then run `pnpm --filter web test -- tech -u` once to write `docs/technical-details.md`, and check each diagram's Mermaid by eye in a GitHub preview of the pushed branch (no Mermaid tool is installed for this).
- [ ] **Step 4: Run them again,** plus `icons.spec.ts`, `security.spec.ts`, `check-build.test.ts` (the prerendered page is in the build). → PASS.
- [ ] **Step 5: Commit.** `feat(web): a Technical details help page, with its diagrams also as Mermaid`

---

### Task 7: The docs and release prep

**Files:**
- Modify: `README.md`, `docs/drafter-phase2-design.md`, `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`, `docs/drafter-stats-design.md` (one line: running time now has a rate and an estimate), `packages/layout/README.md`, `packages/outline/README.md` (checked, from Tasks 2 and 4)

- [ ] **Step 1: README.** The status line names the guided starters, export options, and the running time per scene among what's built; the roadmap's Phase 2 list gets a bullet "Getting a script out the door (built in v0.17.0): guided first screenplay and stage play, export options for scene numbers and the title page, running time by your own rate and from the dialogue, per act and scene" and its "Next:" says the Highland, Fade In, and Markdown imports; the features table gets rows for **Guided starters**, **Export options**, and **Running time estimates** (built), and the Stats row mentions the rate; Help lists **Technical details**; Design documents gets a line for this design.
- [ ] **Step 2: The Phase 2 design.** In §22, a section `### Getting a script out the door — v0.17.0` after the Markdown PDF's, pointing to this design, with **Status:** built; Plans E, F, G, and H become v0.18.0, v0.19.0, v0.20.0, and v0.21.0, with one sentence in the "Decided (2026-10-29)" paragraph: this release took v0.17.0, the imports release comes next and will move them once more, and the letters stay. §16's Stats tab notes the per-script rates and the estimate carry into it. A line in §26 records the change.
- [ ] **Step 3: DECISIONS, DEFERRED, CHANGELOG.** Every Call of the design (§8) and of this plan's list below in the `## Getting a script out the door (v0.17.0)` section, as each landed. DEFERRED gets a `## Getting a script out the door` group: a preview of an export with its options; export options and rates in the metadata block; CLI flags for scene numbers as written and the title page; a settable rate for action; guided starters for other templates and Markdown; Mermaid drawn on the page. CHANGELOG `[Unreleased]`, under Added, in the writer's words: the two guided starters (and where to find them), Export options (what each does, per script, that a Final Draft file keeps its numbers), the running-time rate and estimate, the times in the Outline and the strip, and the Technical details page.
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with the existing axe tests green.
- [ ] **Step 5: Commit.** `docs: getting a script out the door`
- [ ] **Step 6: Push** `writer-starters` and watch CI. Don't merge or tag: the controller releases v0.17.0.

---

## Calls in this plan

The design's 22 Calls (its §8) are binding and get their DECISIONS lines as they land. This plan adds:

23. **Merge `main` at v0.16.0 before Task 1** (Global Constraints): the export request, the Export menu, and the plan list are the Markdown PDF's first.
24. **The starters' command data comes from a text-free list,** so the prerendered Keyboard shortcuts page doesn't carry the scripts (Task 1).
25. **A starter's project is marked `starter`,** and `metSample` ignores it as it ignores Help's sample scripts (Task 1).
26. **`paginate`'s boolean stays,** `true` = every scene and `false` = none, so the CLI is unchanged (Task 2).
27. **The options travel in the export request,** read in `run` with the text and template, so a switch mid-export can't mix two scripts (Task 3).
28. **The Export menu ends with a separator and Export options…;** the desktop app lists it last in File → Export, labelled as is (Task 3).
29. **`Counts.minutes` goes;** every view computes the running time from pages and the script's rate (Task 4).
30. **A rate out of range is refused in the field, and one stored out of range reads as the default** (Task 4).
31. **Labels take the rates as an optional last argument, defaulting to 1 minute a page and 150 words a minute** (Task 5).
32. **`docs/technical-details.md` is a Vitest file snapshot of the page,** rewritten with `-u` and failing when stale (Task 6).
33. **The Technical details page is the last help page,** with `i-lucide-cpu` in the app menu and "Technical Details" in the desktop Help menu (Task 6).
