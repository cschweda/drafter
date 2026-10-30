# The Structure strip (v0.15.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Structure strip (v0.15.0): a band across the top of the window, above both panes, with one row per section depth the script uses (`#`, `##`, `###`), a row of every scene, and a page ruler, each block placed and sized by its pages, a scene colored by its `[[Color: …]]`. Clicking a block, or Enter on it, goes there; the cursor's scene and its sections are marked, and the Script pane's top page is marked on the ruler. It is one Tab stop with roving arrow keys. It is turned on and off by one setting (`structureStrip`, off by default) from a toolbar button, a palette command on Mod+Alt+O, and a Settings switch.

**Architecture:** The geometry is a pure function in `@drafter/outline` (`packages/outline/src/strip.ts`: `structureStrip`, `linesPerPage`, `rulerMarks`) over the scene index the Outline already builds, so there is no extra parse or layout, and the package's random-script arbitraries property-test it. `apps/web/app/strip/` holds the session (`use-strip.ts`: the strip of `useOutline().index`, kept while the layout catches up, block → session id, the current blocks, going there), the names (`labels.ts`), the keys (`keys.ts`), and the Script pane's top page (`in-view.ts`). `StructureStrip.vue` draws it as DOM (percentage-positioned buttons keyed by id) inside the shell's `.top` block in `pages/index.vue`.

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Vitest 5 with fast-check, Playwright 1.64. No new dependencies.

**Spec:** [`docs/drafter-structure-strip-design.md`](../drafter-structure-strip-design.md) (all of it; its Calls are binding). Context: [`docs/drafter-phase2-design.md`](../drafter-phase2-design.md) §5.1 (the scene index), §5.7 (rules every view follows), §6.1 (the Outline's go-to), §13–§15 (Timeline, script map, pacing view, which reuse this geometry later), §22 (the plan list, which shifts by one minor). Plans A, FD, B, C, and D's decisions in `docs/DECISIONS.md` still hold.


> **Controller ruling (2026-10-29):** the strip's key is **Mod+Alt+O**, not Mod+. — Plan D (spellcheck, merged first) already gives Mod+. to Spelling suggestions. Before using it, the implementer checks Mod+Alt+O is free in the command registry and is not a default shortcut in Chrome, Edge, Firefox, Safari, or Electron on macOS, Windows, or Linux; if it is taken, pick another free key, record it in DECISIONS, and update this plan's Call.

## Global Constraints

- Branch `strip` (worktree `scratchpad/drafter-st`), from `main` at v0.14.0 (`c8bf4a9`), with this plan cherry-picked onto it — Plan D is already in, so no merge is needed before Task 1.
- **Clean room:** no code, text, layout, colors, row names, icons, or assets from any screenwriting app. The strip is drawn from Drafter's scene index in Drafter's own theme tokens (`--chrome-2`, `--line`, `--heading`, `--text`, `--page`) and its own swatches (`SWATCH`, `outline/labels.ts`); the rows are named by the Fountain marks. Every label and message is Drafter's own words, as the design gives them.
- **No new dependencies.** `@drafter/outline` already depends on `@drafter/layout` (types) and has `fast-check` through the workspace. No canvas or charting library.
- **The strip edits nothing.** No `TextChange`, no transaction except the cursor move that `editor.goto` makes. The printed pages, the `.fountain` file, undo, and the recovery copy are untouched.
- **No extra parse:** the strip reads `useOutline().index` and `useLayout()` only.
- **Budgets:** `structureStrip` of a 120-page script with 150 scenes and three section levels in under 2 ms (median of 20 runs after one warm-up); typing into a 120-page script with the strip on makes no long task (Chromium).
- **Keyboard:** the toggle is a command in the registry (`commands/data.ts` + `builtin.ts`), so it is in the palette, on the Keyboard shortcuts page, and in the desktop app's View menu. The strip reuses the roving-focus pattern of the Outline tree (`outline/tree.ts`) and announces through `sayOutline` (`outline/notice.ts`).
- **Markdown documents** never show the strip; its button and command are disabled with "A Markdown document has no scenes." **Focus mode** hides it. **Phones** (below 1024 px, `useWideScreen`) neither show it nor its toolbar button. **Read-only** tabs show it, and going to a block works.
- **Accessibility work waits for the final steps** (maintainer, 2026-10-28): no new axe tests and no accessibility task in this plan; the existing axe tests (`e2e/a11y.spec.ts` and the others) stay green (the strip is off by default, so they see no change). An axe check of the strip is deferred to those final steps and listed in `docs/DEFERRED.md`.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` under a new `## Structure strip (`@drafter/outline`, `apps/web`)` section (each Call gets a line when it lands); conventional commits with **no AI co-author trailer and no session link**; the README kept in sync (Task 5 does the status line, roadmap, and features).
- **e2e with the strip on:** a spec that needs it starts with the setting stored, by `test.use({ storageState })` built as `playwright.config.ts` builds its own, with `drafterDatabase([...sampleSeenRows, { key: 'structureStrip', value: true }])` (`e2e/seed.ts`). Tasks before 4 have no other way to turn it on.

## Review Focus

1. **Typing that adds or removes a block** (Enter at the end of a line, a paste): the scene index has no pages until the layout catches up; the strip must neither empty nor jump. Task 2's `nextView keeps the last paged strip while the new one has no pages` and e2e `keeps its blocks while typing adds a block`.
2. **Odd structures:** scenes before the first section, a section with no scenes, `#` then `###` with no `##`, a `####` section, a script of sections and no scenes. Task 1's fixtures and its property `no number is NaN or infinite, and every block lies on the axis`.
3. **The layout worker failed** (blocked workers, or a crash before the first layout): the strip sizes by words, hides the ruler, and goes to scenes as usual. Task 1's `sizes by words without pages` and Task 2's `takes a words strip when the layout has failed`.
4. **A block whose scene has gone** (the strip kept from before the layout caught up, and the scene was deleted): going there moves nothing and says so. Task 3's `go says so when the scene is gone`.
5. **The strip going away with focus in it** (the document turned to Markdown, focus mode, a narrowed window, Mod+Alt+O): focus goes to the editor, never to the page's body. Task 4's e2e `puts focus in the editor when the strip goes with focus in it`.

---

### Task 1: The strip's geometry (`@drafter/outline`)

**Files:**
- Create: `packages/outline/src/strip.ts`, `packages/outline/test/{strip.test.ts,strip.properties.test.ts,strip-budget.test.ts}`
- Modify: `packages/outline/src/index.ts` (exports), `packages/outline/README.md` (a Structure strip section)

**Interfaces (Consumes):** `SceneIndex`, `Scene`, `Section` (`types.ts`); `Layout` (`@drafter/layout`, types). **(Produces):**
```ts
export const STRIP_DEPTHS = 3;                      // sections deeper than ### are not drawn
export interface StripBlock {
  kind: 'section' | 'scene';
  block: number;          // the item's block index, which the app maps to its session id
  from: number;           // on the axis: pages from the top of page 1, or words when unit is 'words'
  to: number;             // ≥ from; a section with no scenes has to === from (a tick)
  label: string;          // "12 INT. KITCHEN - NIGHT" (locked number, else ordinal; "Untitled scene"), or the section's title ("Untitled section")
  color: string | null;   // a scene's color note value, lowercased; null for a section or no note
}
export interface StripRow { kind: 'section' | 'scenes'; depth: number | null; blocks: StripBlock[] } // depth 1–3 for sections, null for scenes
export interface Strip {
  unit: 'pages' | 'words';
  start: number;          // the first scene's from
  length: number;         // the last scene's to − start; > 0 whenever rows is non-empty
  rows: StripRow[];       // section rows by depth (only depths used), then scenes; [] when the index has no scenes
}
/** A body page's line count (the first page numbered above 0), or null without a layout. */
export function linesPerPage(layout: Layout | null | undefined): number | null;
/** The strip of `index`; by pages when `perPage` is given and every scene has pages, else by words. */
export function structureStrip(index: SceneIndex, perPage: number | null): Strip;
export interface RulerMark { page: number; at: number; numbered: boolean } // at: 0–1 along the axis
/** One mark per page on the axis when pages are at least 6 px apart (else only numbered ones); numbered at 1 and then the smallest of 1, 2, 5, 10, 20, 50 that keeps numbers ≥ 40 px apart. [] for words. */
export function rulerMarks(strip: Strip, widthPx: number): RulerMark[];
```

- A scene's `from` is `(page − 1) + (line − 1) / perPage`; its `to` is the next scene's `from`; the last scene's `to` is its `from + eighths / 8` (design §3.1, Call 4). By words, each scene is `max(1, words)` long, end to end from 0.
- A section's block runs from the `from` of the first scene whose `sections` includes its block to the `to` of the last; with none, it is a tick at the `from` of the next scene after the section's block, or at the axis' end.

- [ ] **Step 1: Write the failing tests.** `strip.test.ts` (fixtures written for Drafter, laid out with `paginate` and `screenplay`/`stagePlay` from `helpers.ts`): `gives a row per section depth the script uses, then the scenes` (`#` and `###` only → depths `[1, 3]`, then scenes), `draws no section deeper than ###`, `a stage play's acts are its one section row, and its ## lines are scenes` (`SAMPLE_STAGE_PLAY`), `places a scene at its page and line, ending where the next starts`, `the last scene ends at its start plus its eighths`, `a section spans its first scene's start to its last scene's end`, `a section with no scenes is a tick at the next scene's start`, `scenes before the first section are in the scenes row only`, `labels a scene by number and heading, and a section by title` (`#12A#` → `"12A INT. …"`; empty heading → `"3 Untitled scene"`), `carries a scene's color note, lowercased`, `sizes by words without pages` (`perPage` null, and a scene with `pages` null), `has no rows without scenes`, `linesPerPage reads a body page's lines and is null without a layout`, `rulerMarks numbers pages about 40 px apart and ticks every page when there is room` (a 120-page strip at 1200 px: numbered 1, 5, 10…; at 400 px: 1, 10, 20…; ticks at 1200 px but not at 400 px), `rulerMarks is empty by words`. `strip.properties.test.ts` (fast-check over `anyScript`, each with and without `paginate`): `scenes tile the axis: one block per scene, in order, each to > from, each starting at the last one's to`, `a section's block covers exactly its scenes' blocks`, `rows are only the depths used, at most three, in order, then scenes`, `no number is NaN or infinite, and every block lies on the axis` (`start ≤ from ≤ to ≤ start + length`). `strip-budget.test.ts`: `builds the strip of a 120-page script with 150 scenes and three section levels in under 2 ms` (3 `#` × 5 `##` × 10 `###`… generated: 3 acts, 15 sequences, 150 scenes of action and a speech, padded to over 120 pages; asserts the page count first).
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/outline test` → FAIL (no `strip.ts`).
- [ ] **Step 3: Implement** `strip.ts` and the exports.
- [ ] **Step 4: Run them again,** and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat(outline): the structure strip's geometry`

---

### Task 2: The strip on screen

**Files:**
- Create: `apps/web/app/strip/{use-strip.ts,labels.ts}`, `apps/web/app/components/StructureStrip.vue`, `apps/web/test/{strip-view.test.ts,strip-labels.test.ts}`, `apps/web/e2e/strip.spec.ts`
- Modify: `apps/web/app/settings/settings.ts` (`structureStrip: boolean`, default `false`), `apps/web/test/settings.test.ts`, `apps/web/app/pages/index.vue` (`<StructureStrip v-if="stripShown" />` last in `.top`; `stripShown` = the setting, `wide`, and `kind === 'fountain'`; `.top` is already gone in focus mode)

**Interfaces (Consumes):** `structureStrip`, `linesPerPage`, `rulerMarks`, `Strip`, `StripRow`, `StripBlock` (Task 1); `useOutline()` (`index`, `idOf`, `itemById`); `useLayout()` (`layout`, `failed`, `cursorBlock`); `useEditor().onChange` (null on a load); `sceneName`, `sectionName`, `lengthLabel`, `swatchOf`, `colorName` (`outline/labels.ts`). **(Produces):**
```ts
// strip/use-strip.ts
export interface StripView { strip: Strip; ids: ReadonlyMap<number, string> } // block → session id, taken with the strip
/** Pure: `next`, unless it is by words while `last` is by pages and the layout hasn't failed: then `last` (design §3.2, Call 6). */
export function nextView(last: StripView | null, next: StripView, layoutFailed: boolean): StripView;
/** Pure: the cursor's scene (the last starting at or before `cursorBlock`) and the sections it sits in; [] before the first scene. */
export function currentBlocks(index: SceneIndex, cursorBlock: number): number[];
export interface StripSession {
  view: Readonly<ShallowRef<StripView | null>>;   // null after a load until the next index
  current: Readonly<ComputedRef<ReadonlySet<string>>>; // the ids of currentBlocks, from the live index
  /** Goes to the item as the Outline does (`editor.goto(item.span.from)`); says GONE and returns false when it is gone. */
  go(id: string): boolean;
}
export function useStrip(): StripSession; // made on first use, kept for the visit, as useOutline is
// strip/labels.ts
export const LABEL_MIN_PX = 28;
export const NO_SCENES = 'No scenes yet. Each scene heading you write shows here.';
export const GONE = 'That scene isn’t in the script any more.';
export function rowMark(row: StripRow): string;   // '#', '##', '###', 'Scenes'
export function rowName(row: StripRow): string;   // 'Sections marked #', …, 'Scenes'
export function blockName(item: OutlineItem): string; // sceneName / sectionName, then ", goal: …" when the scene has one
export function cardLines(item: OutlineItem): string[]; // scene: ['Scene 12, INT. KITCHEN - NIGHT', 'page 12 · 1 3/8 pp · blue', 'Goal: …', '<first synopsis>'] (lines without data left out); section: ['Act One', '5 scenes · 12 pp']
export function blockFill(color: string | null): { tint: string; edge: string } | null; // from swatchOf; null for neutral
```

- The view: a `role="group"` named "Structure strip"; a left column of row marks (`aria-hidden`, since each row's group has its name); per row a `role="group"` named by `rowName` holding a `<button>` per block, `left`/`width` as percentages of `strip.length` from `strip.start`, labeled inside with `label` cut by CSS ellipsis, and no visible label when narrower than `LABEL_MIN_PX` (width from one `ResizeObserver` on the strip); the ruler (`aria-hidden`) from `rulerMarks`, hidden by words. A block's `aria-label` is `blockName`. With `rows` empty, the strip is the one `NO_SCENES` line.
- Colors (Call 8): `blockFill` gives `color-mix(in srgb, <swatch> 35%, var(--page))` as the tint and the swatch itself as a 3 px bottom edge; neutral is `--chrome-2`; section blocks alternate `--chrome-2` and `--chrome` along a row; every block has a 1 px `--line` border on its right.
- **Call:** the strip is 18 px a row plus 14 px of ruler, and no taller than five rows.
- `useStrip` builds the view in a `computed` over the index, `linesPerPage(layout)`, and the ids, folded through `nextView`; a load (`onChange(null)`) resets it to null.

- [ ] **Step 1: Write the failing tests.** `strip-view.test.ts` (pure, with indexes from `sceneIndex` over short fixtures): `nextView keeps the last paged strip while the new one has no pages`, `takes a words strip when the layout has failed`, `takes the new strip when there was none`, `currentBlocks gives the cursor's scene and its sections`, `none before the first scene`, `a blank line after a scene is still that scene`. `strip-labels.test.ts`: `marks and names each row`, `names a block as the Outline names its row, with the goal`, `the card gives page, length, color, goal, and synopsis, leaving out what's missing`, `the card for a section gives its scenes and length`, `no fill for no color or a word Drafter doesn't know`. `settings.test.ts`: `the structure strip is off by default, and a stored true is kept`. `strip.spec.ts` (strip on): `shows a row per section level, the scenes, and a ruler` (the sample screenplay), `colors a scene by its color note, and names the color`, `shows one line for a script with no scenes`, `keeps its blocks while typing adds a block` (a `MutationObserver` counts the scenes row's buttons while Enter is pressed 10 times fast; it never reaches 0), and, with the default storage state, `is not shown until it is turned on`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `shell.spec.ts` and `focus.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): draw the structure strip above the panes`

---

### Task 3: Going there, and where you are

**Files:**
- Create: `apps/web/app/strip/{keys.ts,in-view.ts}`, `apps/web/test/{strip-keys.test.ts,strip-go.test.ts}`
- Modify: `apps/web/app/components/StructureStrip.vue`, `apps/web/app/components/ScriptPane.vue` (publishes its top page on scroll), `apps/web/e2e/strip.spec.ts`

**Interfaces (Consumes):** `useStrip` (`view`, `current`, `go`), `cardLines`, `GONE` (Task 2); `pageOf`, `blockIndexAt` (`editor/pages.ts`); `SyncPane.offsetAtTop` (`editor/scroll-sync.ts`, the `syncPane` ScriptPane already makes); `sayOutline`. **(Produces):**
```ts
// strip/keys.ts: pure
export interface StripPlace { row: number; index: number }
/** Left/Right along a row (stopping at its ends), Up/Down to the block in the next row covering the focused block's middle (else the nearest by distance), Home/End within the row; null for any other key or no move. */
export function stripKey(strip: Strip, at: StripPlace, key: string): StripPlace | null;
// strip/in-view.ts
/** The page at the top of the Script pane while it shows (number, 0 the title page), else null. Set by ScriptPane once a frame at most while it scrolls. */
export const scriptTopPage: ShallowRef<number | null>;
```

- Going (Call 9): a click, or Enter or Space on a focused block, calls `go(id)`. Focus goes to the editor with `goto`, as the Outline's go does.
- Roving focus (Call 12): exactly one block has `tabindex="0"`: the last one focused in this visit if it is still there, else the first current scene's, else the first scene's; the rest `-1`. Arrow keys use `stripKey` and `preventDefault`.
- Current (Call 10): blocks in `current` get `aria-current="location"` and a 2 px `--heading` outline (a border in forced colors). The in-view marker is a small `--heading` triangle on the ruler at `scriptTopPage` (`aria-hidden`), drawn only while that is non-null and the strip is by pages.
- The card (Call 11): one `aria-hidden` element under the hovered or focused block (clamped to the strip's width), with `cardLines`, gone on pointer leave and blur, never covering the block.

- [ ] **Step 1: Write the failing tests.** `strip-keys.test.ts`: `Left and Right move along a row and stop at its ends`, `Up and Down go to the block covering the focused block's middle`, `Up and Down go to the nearest block when none covers it`, `Up from the top row and Down from the scenes row do nothing`, `Home and End go to the row's ends`, `other keys do nothing`. `strip-go.test.ts` (`use-outline`, `session`, and `notice` mocked as `count-budget.test.ts` mocks its neighbors): `go moves the cursor to the item's start`, `go says so when the scene is gone` (`sayOutline` called with `GONE`, `goto` not called, returns false). `strip.spec.ts`: `clicking a scene puts the cursor on its heading and the Script pane shows it`, `clicking a section goes to its line`, `is one Tab stop, and the arrows move along and between rows`, `Enter and Space go to the focused block`, `focus enters on the cursor's scene`, `marks the cursor's scene and its sections as the cursor moves`, `the in-view marker follows the Script pane as it scrolls`, `hovering and focusing show the card with the page, length, and goal`, `in a read-only tab, shows the strip and goes to a scene` (a second page in the same context, as `outline.spec.ts` opens one).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `script.spec.ts` and `scroll-sync.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): go to a scene from the structure strip, and see where you are`

---

### Task 4: Turning it on and off

**Files:**
- Modify: `apps/web/app/commands/{data.ts,builtin.ts}` (`toggle-structure-strip`), `apps/web/app/components/AppToolbar.vue` (the Structure button), `apps/web/app/components/SettingsDialog.vue` (the switch), `apps/web/app/components/StructureStrip.vue` (focus to the editor when it goes with focus in it), `apps/web/test/{command-data.test.ts,desktop-menu.test.ts}`, `apps/web/e2e/{strip.spec.ts,script.spec.ts,settings.spec.ts}`

**Interfaces (Consumes):** `useSettings().set('structureStrip', …)` (Task 2's key); `useFocusMode`, `useWideScreen`, `useEditor().kind`. **(Produces):**
```ts
// commands/data.ts, in View after the element bar's pair
{ id: 'toggle-structure-strip', title: 'Toggle the structure strip', group: 'View', icon: 'i-lucide-panel-top', keys: 'Mod-Alt-o', global: true }
// builtin.ts: enabled only for a Fountain document on a wide screen (WIDE_QUERY); run flips the setting
// labels.ts (Task 2's file) gains
export const NOT_FOR_MARKDOWN = 'A Markdown document has no scenes.';
```

- The toolbar (Call 14): a fifth action after Focus, `{ label: 'Structure', icon: 'i-lucide-panel-top', kind: 'structure' }`, a `<button>` with `aria-pressed` from the setting, running the command; its round is `#b7a6e6`. In a Markdown document it is `aria-disabled="true"` with `NOT_FOR_MARKDOWN` as its `title` and does nothing. Below 1024 px it is `display: none` (Call 16).
- Settings: a switch after Element bar, `{ key: 'structureStrip', label: 'Structure strip', why: 'Show your script’s sections and scenes as a band of blocks above the panes, each as wide as it is long. Click one to go there.' }`.
- **Call:** Mod+Alt+O is matched on the physical key (`event.code === 'KeyO'`, as `matchesKey` reads any letter pressed with Alt), so Option's character on a Mac doesn't matter; where the key can't be pressed, the button, palette, and Settings still work. A builder who finds Mod+Alt+O taken in a supported browser picks another unbound key and records it in DECISIONS.
- The desktop View menu lists the command by itself (`menuCommands` takes every View command); the test pins it.

- [ ] **Step 1: Write the failing tests.** `command-data.test.ts` stays as it is and must pass with the new key (no key twice). `desktop-menu.test.ts`: `puts Toggle the structure strip in View, with Mod+Alt+O`. `strip.spec.ts`: `the toolbar button, Mod+Alt+O, the palette, and Settings turn the same strip on and off, and it is remembered after a reload`, `the toolbar button is pressed while the strip shows`, `is not shown for a Markdown document, and the button and command say why`, `focus mode hides it, and it is back after`, `is not shown on a phone, and neither is its button` (320 × 640, as `phone.spec.ts`), `puts focus in the editor when the strip goes with focus in it` (Mod+Alt+O and a switch to Markdown, each with a block focused). `script.spec.ts`, in Chromium: `types into a 120-page script with the structure strip on without a long task` (the existing test's steps, with the setting stored). `settings.spec.ts`: `shows the defaults` lists the Structure strip switch, off.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `palette.spec.ts`, `keyboard.spec.ts`, `markdown.spec.ts`, `phone.spec.ts`, `icons.spec.ts`, and `a11y.spec.ts` (unchanged and green). → PASS.
- [ ] **Step 5: Commit.** `feat(web): turn the structure strip on from the toolbar, the palette, and Settings`

---

### Task 5: The docs and release prep

**Files:**
- Modify: `README.md`, `docs/drafter-phase2-design.md`, `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`, `packages/outline/README.md` (the Keyboard shortcuts page lists the new command by itself, from `data.ts`)

- [ ] **Step 1: README.** The status line names the Structure strip among what's built ("a **Structure strip**: your sections and scenes as a band of blocks above the panes, sized by length and colored, to click and go"); the roadmap's Phase 2 list gets a bullet for it (built in v0.15.0) beside the script map's, which says Plan E builds on it; the features table gets a **Structure strip** row (Phase 2, built).
- [ ] **Step 2: The Phase 2 design.** In §22, a section `### Structure strip — v0.15.0` between Plan D and Plan E, pointing to the strip's design doc, with **Status:** built (axe deferred); Plans E, F, G, and H become v0.16.0, v0.17.0, v0.18.0, and v0.19.0, with one sentence saying the strip took v0.15.0 and the letters stay. In §13 and §14, one sentence each: the Timeline's lanes and the script map reuse `structureStrip`'s geometry, and whether the map is still wanted beside the strip is Plan E's to decide (strip design §10). A line in §26 records the change.
- [ ] **Step 3: DECISIONS, DEFERRED, CHANGELOG.** Every Call of the strip's design (§12) and of this plan in the `## Structure strip` section, as each landed. DEFERRED gets a `## Structure strip` group: a zoom that scrolls, dragging to reorder, storyline rows and "color by" (Plan E), a phone version, and an axe check of the strip in both themes (final accessibility steps). CHANGELOG `[Unreleased]` has the feature under Added, in the writer's words.
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with the existing axe tests green.
- [ ] **Step 5: Commit.** `docs: the Structure strip`
- [ ] **Step 6: Push** `structure-strip` and watch CI. Don't merge or tag: the controller releases v0.15.0.

---

## Calls in this plan

The design's 22 Calls (its §12) are binding and get their DECISIONS lines as they land. This plan adds:

23. **Merge Plan D first** (Global Constraints): the branch takes `main` at v0.14.0 before Task 1, so the Settings and command edits sit on top of spellcheck's.
24. **e2e turns the strip on through the stored setting** (`drafterDatabase` with `structureStrip: true`) until Task 4's controls exist, and after it where a test isn't about the controls.
25. **Ruler spacing:** numbered at 1 and then every 1, 2, 5, 10, 20, or 50 pages, the smallest that keeps numbers 40 px apart; a tick a page from 6 px a page up (Task 1).
26. **Section blocks alternate two neutrals** (`--chrome-2`, `--chrome`); a color is a 35% tint over `--page` with a 3 px full-strength edge (Task 2).
27. **The strip is 18 px a row plus 14 px of ruler,** at most five rows (Task 2).
28. **Focus enters on the last block focused this visit, else the cursor's scene, else the first scene** (Task 3).
29. **The in-view marker is the Script pane's top page,** published by `ScriptPane.vue` at most once a frame; none while the Script pane isn't showing (Task 3).
30. **The toolbar's Structure button** is the fifth round action, `#b7a6e6`, `i-lucide-panel-top`, hidden below 1024 px (Task 4).
31. **Mod+Alt+O** is matched by the key it types off a Mac (the physical O key on a Mac, or on a layout whose letters aren't Latin); where it can't be pressed, the other three controls do the job (Task 4).
32. **When the strip goes with focus in it, focus goes to the editor** (Task 4).
