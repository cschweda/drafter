# Phase 2, Plan A: The Outline (v0.10.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Outline (v0.10.0): a tree of the script's sections and scenes with pages, lengths, synopses, and colors; scenes and sections moved by drag, by keys, by Move to…, and from the Source pane, each move one undo; Condense and Expand all; Export as treatment; Expand outline, including a new screenplay from a Markdown outline, with `stub-heading` in Problems.

**Architecture:** A new engine package, `@drafter/outline`, holds the scene index (a pure function of the parse, the template, and the layout when it matches) and every structural edit, each returned as `TextChange[]`. `@drafter/cm-fountain` gains a session-only scene identity (a state field mapping heading offsets to ids, moved with the text, and carried across Drafter's own moves by an annotation). `@drafter/lint` gains `stub-heading`. `apps/web` draws the Outline tab, the tab row's slot and More menu, the row menu, the Move to… dialog, the treatment dialog, and the commands; every edit goes through `applyTextChanges` as one transaction.

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Vitest 5 with fast-check, Playwright 1.64 with `@axe-core/playwright`. No new dependencies.

**Spec:** [`docs/drafter-phase2-design.md`](../drafter-phase2-design.md): §5 (the shared model), §6 (Outline, reordering, condense and expand), §22 Plan A, and §1 item 2 (the printed script never changes).

## Global Constraints

- Branch `phase2-a` (worktree `scratchpad/drafter-p2`), from `main` at v0.8.0 plus the design commit. The accessibility pass (v0.9.0, branch `a11y`) lands on `main` in parallel; when the controller says so, `git merge main` and resolve. Never edit `apps/web/e2e/a11y.spec.ts`; this plan's axe tests live in `apps/web/e2e/outline.spec.ts`.
- **Clean room:** no code, text, or fixtures from any screenwriting app or Fountain library. Treatment and stub wording are Drafter's own.
- **No new dependencies.** `@drafter/outline` depends on `@drafter/fountain` and `@drafter/templates` (and `@drafter/layout` for its types); `@drafter/lint`, `@drafter/layout`, and `@drafter/render-text` are dev dependencies for its tests.
- **The printed script never changes** (design §1 item 2): `packages/outline/test/invariant.test.ts` lays out random scripts with and without every Phase 2 note Plan A writes (`[[Color: …]]` header lines) and compares the printed text. Later plans add their notes and the Beat Board block to the same test.
- **Edits are text** (design §5.7): every view edit is `TextChange[]` from `@drafter/outline`, applied with `applyTextChanges` (one transaction, `isolateHistory('full')`, so one undo). `print(parse(text)) === text` still holds (the package never builds a tree it prints).
- **Accessibility:** every new view is usable by keyboard and screen reader: the Outline is an ARIA tree (`role="tree"`, `treeitem`, `group`, `aria-level`, `aria-setsize`, `aria-posinset`, `aria-expanded`), every drag has a keyboard equivalent, and every move or bulk change says what happened once in a polite live region. Each view is axe-clean in both themes, at desktop and phone width, in tests that run by default (not named "accessibility violations", which this branch's config still skips). No conformance claims anywhere.
- **Markdown documents** get no Outline tab and no outline commands except **New screenplay from this outline**, which only they get.
- **Read-only** (another tab has the script, or its file is being checked): the Outline shows everything; its edit controls are disabled (`aria-disabled`) with the reason.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs a task touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` (a new `## Phase 2, Plan A: the Outline` section); conventional commits with no AI co-author trailer and no session link.

## Review Focus

1. **A move never loses or duplicates text.** Covered by Task 2's property tests `a move keeps every scene's text`, `moving and moving back restores the source`, and `the preamble and the metadata block never move`.
2. **The printed pages never change from a color or a synopsis edit.** Covered by Task 3's `the layout is unchanged by colors` and the invariant test.
3. **Focus after a move** stays on the moved row, by every route (Alt+arrows, the row menu, Move to…, drag), and the live region says where it went. Covered by Task 8's e2e tests.
4. **One undo** reverses each move, synopsis edit, color, expand, and treatment-free bulk edit. Covered by Task 8's and Task 9's e2e tests.
5. **The tab row** keeps every tab reachable at phone width (the slot and More), and the existing module tests still find their tabs. Covered by Task 6.

---

### Task 1: The scene index (`@drafter/outline`)

**Files:**
- Create: `packages/outline/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}`, `packages/outline/src/{index.ts,types.ts,index-scenes.ts,keyed.ts}`, `packages/outline/test/{helpers.ts,scene-index.test.ts}`
- Modify: `vitest.shared.ts` (alias), `apps/web/nuxt.config.ts` (alias), `apps/web/package.json` (dependency), `README.md` (Packages table: `@drafter/outline` built in Plan A)

**Interfaces (Produces):**
```ts
export type SceneColor = 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'blue' | 'purple' | 'pink' | 'gray';
export const SCENE_COLORS: readonly SceneColor[];
export interface ScenePages { page: number; line: number; eighths: number }
export interface Scene {
  kind: 'scene';
  ordinal: number;                 // 1, 2, 3… in script order
  number: string | null;           // the locked #n#
  block: number;                   // the heading's block index
  heading: string;                 // a scene heading's text, or a play's ## title
  span: Span;                      // heading to the end of the scene's last block
  sections: number[];              // enclosing sections' block indexes, outermost first
  synopses: Array<{ text: string; block: number; span: Span }>;
  color: { value: string; span: Span } | null; // the first [[Color: …]] in the scene, lowercased
  speakers: string[];              // cue names, in order of first speech
  words: number;
  pages: ScenePages | null;        // null until a layout that matches the parse
}
export interface Section {
  kind: 'section'; block: number; depth: number; title: string;
  span: Span;          // the heading to the end of its last descendant
  introEnd: number;    // the end of the heading and the blocks before its first child
  parent: number | null;
  scenes: number;      // scenes inside, at any depth
  eighths: number | null;
}
export type OutlineItem = Scene | Section;
export type OutlineNode = { item: Section; children: OutlineNode[] } | { item: Scene };
export interface SceneIndex {
  preamble: Span | null; // the title page and blocks before the first scene or section
  items: OutlineItem[];  // every scene and section, in source order
  scenes: Scene[];
  sections: Section[];
  tree: OutlineNode[];
}
export function sceneIndex(doc: Doc, template: Template, layout?: Layout | null): SceneIndex;
/** Lenient reading of `[[Key: body]]` (design §5.3) for the keys Plan A uses; Plan B moves it to @drafter/notes. */
export function readKeyedNote(text: string): { key: string; body: string } | null;
```

- A scene starts where the template says (`resolveRole` → `scene_heading` or `scene_heading_play`): a heading in a screenplay, a `##` section in a play. It ends at the last block before the next scene start or section. Sections that aren't scenes nest by depth; a play's `##` closes open sections of depth 2 or more.
- The metadata block and a `/* beat board` boneyard just before it are never inside a span.
- Pages come from `layout.index` as the `scene-list` module counts them, only when `layout.index.length === doc.blocks.length`.

- [ ] **Step 1: Write the failing tests.** `scene-index.test.ts`: `lists a screenplay's scenes in order with headings, numbers, and spans`, `lists a stage play's ## scenes inside its acts`, `nests scenes under the innermost section`, `keeps the title page and an opening note in the preamble`, `leaves the metadata block out of the last scene`, `reads the first synopsis and every synopsis`, `reads [[Color: Blue]] in any case, anywhere in the scene`, `lists who speaks, once each, in order`, `places scenes on pages and counts eighths when the layout matches` (the scene-list module's figures for the sample), `has no pages when the layout is for other text`, `counts a section's scenes and length`.
- [ ] **Step 2: Run them.** → FAIL (no package).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(outline): the scene index`

---

### Task 2: Moving scenes and sections

**Files:**
- Create: `packages/outline/src/move.ts`, `packages/outline/test/move.test.ts`, `packages/outline/test/move.properties.test.ts`

**Interfaces (Produces):**
```ts
/** Where a move lands: just after a scene, just after a section's heading and intro (its start), or at the start of the script (after the preamble). */
export type MoveTarget = { after: number } | { start: true };
export interface Move {
  changes: TextChange[];                       // a delete and an insert, in old offsets
  moved: Array<{ from: number; to: number }>;  // every heading inside the moved text: old offset → new
  at: number;                                  // the moved heading's new offset
}
export function moveItem(doc: Doc, index: SceneIndex, block: number, target: MoveTarget): Move | null; // null: nowhere to go, or no change
export function upTarget(index: SceneIndex, block: number): MoveTarget | null;
export function downTarget(index: SceneIndex, block: number): MoveTarget | null;
export function targetAfterRow(index: SceneIndex, row: OutlineItem | null, open: boolean): MoveTarget; // a drop line below a row
```

- The moved text is the item's span (a section's whole subtree). It is cut with the gap before it (or, for the very first item with nothing before it, the gap after it) and arrives as one blank line plus the text after the target (design §6.3).
- Up: before the previous item in source order (a scene) or before the parent heading (crossing a section's edge goes to the end of the section before). Down: after the next scene, or after the next section's intro (the start of the section after). A section moves among its siblings, and past its parent's edge the same way.
- A section never lands inside itself; nothing lands in the preamble.

- [ ] **Step 1: Write the failing tests.** `move.test.ts`: `moves a scene down past the next one`, `moves a scene up to the end of the section before`, `moves a scene down to the start of the next section`, `moves a section with its scenes and deeper sections`, `moves the first scene of a script with no title page`, `moves a scene to the start of the script, after the title page`, `moves the last scene without touching the metadata block`, `carries the locked number and a closing transition`, `will not move a section into itself`, `has nowhere to go above the first scene or below the last`, `reports every moved heading's new offset`. `move.properties.test.ts` (random scripts of scenes, sections, a title page, and a metadata block): `a move keeps every scene's text`, `moving and moving back restores the source` (scenes one blank line apart), `the preamble and the metadata block never move`, `the result parses with the same number of scenes`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(outline): move scenes and sections as text`

---

### Task 3: Synopses and colors in the scene header

**Files:**
- Create: `packages/outline/src/header.ts`, `packages/outline/test/header.test.ts`, `packages/outline/test/invariant.test.ts`

**Interfaces (Produces):**
```ts
/** Replaces the first synopsis's text, or adds `= text` at the top of the header; empty text removes the line. */
export function setSynopsis(doc: Doc, scene: Scene, text: string): TextChange[];
/** Writes `[[Color: blue]]` in the header (after the synopses, before other field notes), replaces the scene's color note, or removes it and its line. */
export function setColor(doc: Doc, scene: Scene, color: SceneColor | null): TextChange[];
```

- The header is the synopsis and note blocks right after the heading with no blank line between them (design §5.4). A body can't hold `]]`, a blank line, `/*`, or `*/`: a synopsis is one line, and `]]` is written `] ]`.

- [ ] **Step 1: Write the failing tests.** `header.test.ts`: `edits the first synopsis in place`, `adds a synopsis under the heading`, `adds a synopsis above the header's notes`, `removes a synopsis when it is emptied`, `adds a color after the synopses`, `adds a color under a heading with nothing after it`, `changes a color written by hand in another case`, `removes a color and its line`, `a scene's color survives renaming its heading and moving it` (setColor, edit the heading, moveItem, sceneIndex reads the color back), `keeps one line break style (CRLF)`. `invariant.test.ts`: `the layout is unchanged by colors` and `the layout is unchanged by synopsis edits` (fast-check: random screenplays and plays, every scene colored, printed with `@drafter/render-text` before and after; equal).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(outline): write synopses and colors in a scene's header`

---

### Task 4: Treatment, Expand outline, and `stub-heading`

**Files:**
- Create: `packages/outline/src/{treatment.ts,expand.ts}`, `packages/outline/test/{treatment.test.ts,expand.test.ts}`, `packages/lint/src/rules/stub.ts`
- Modify: `packages/lint/src/run.ts`, `packages/lint/test/rules.test.ts`

**Interfaces (Produces):**
```ts
export const STUB_HEADING = 'INT. LOCATION - DAY';
export const STAGE_STUB = '## New scene';
/** A Markdown treatment: the title, section titles as headings, each scene's heading and synopses, and optionally its first paragraph of action. */
export function treatment(doc: Doc, index: SceneIndex, options?: { firstAction?: boolean }): string;
/** Turns each `=` line and `- ` list line in `range` that isn't in a scene into a stub; sections stay. */
export function expandOutline(doc: Doc, template: Template, range: Span): TextChange[];
/** A Markdown outline as a screenplay's body: headings become sections, list items stubs, paragraphs synopses. */
export function scriptFromMarkdown(markdown: string): { title: string | null; body: string };
```
- `stub-heading` (info): every scene heading still `INT. LOCATION - DAY`, and in a play every `## New scene`, with the message "This scene still has the stand-in heading …". Info items aren't counted as problems.

- [ ] **Step 1: Write the failing tests.** `treatment.test.ts`: `writes the title, sections, scenes, and synopses as Markdown`, `adds each scene's first action paragraph when asked`, `escapes Markdown in the writer's text`, `writes a play's acts and scenes`. `expand.test.ts`: `turns synopses outside scenes into stubs`, `turns a list into stubs`, `leaves synopses inside scenes alone`, `keeps sections`, `puts a blank line before a stub that follows a line directly`, `uses ## New scene in a play`, `makes a screenplay from a Markdown outline` (H1 title, headings to sections, items to stubs, paragraphs to synopses, code skipped), `never writes a note or boneyard opener from the writer's words`. `rules.test.ts`: `stub-heading lists every stand-in heading as info`, `stub-heading finds the stubs Expand writes`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(outline, lint): treatment export, expand outline, and stub-heading`

---

### Task 5: Scene identity (`@drafter/cm-fountain`)

**Files:**
- Create: `packages/cm-fountain/src/scene-ids.ts`, `packages/cm-fountain/test/scene-ids.test.ts`
- Modify: `packages/cm-fountain/src/index.ts`, `apps/web/app/editor/extensions.ts` (add `sceneIds` after `parsedDoc`), `apps/web/app/editor/apply-changes.ts` (annotations and a selection)

**Interfaces (Produces):**
```ts
/** Each scene heading's and section's start offset → its session id (design §5.2). */
export const sceneIds: StateField<ReadonlyMap<number, string>>;
/** On a transaction Drafter makes to move text: each heading's old offset → its new one, so its id goes with it. */
export const sceneMoved: AnnotationType<ReadonlyArray<{ from: number; to: number }>>;
// apps/web/app/editor/apply-changes.ts
export function applyTextChanges(view: EditorView, changes: readonly TextChange[], options?: { annotations?: readonly Annotation<unknown>[]; selection?: EditorSelection | { anchor: number; head?: number } }): boolean;
```

- [ ] **Step 1: Write the failing tests.** `scene-ids.test.ts`: `gives every heading and section an id`, `keeps ids while the writer types in and between scenes`, `gives a new heading a new id and drops a deleted one`, `keeps a renamed heading's id`, `carries a moved scene's id with an annotated move`, `gives a cut-and-pasted scene a new id`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(cm-fountain): session identity for scenes and sections`

---

### Task 6: The tab row: Outline, one slot, and More

**Files:**
- Modify: `apps/web/app/utils/panes.ts`, `apps/web/app/components/AppPane.vue`, `apps/web/app/pages/index.vue` (no Outline in a Markdown document), `apps/web/test/panes.test.ts`, `apps/web/e2e/tabs.spec.ts`, `apps/web/e2e/sample-modules.spec.ts` (choose a tab that may be under More)
- Create: `apps/web/app/composables/useTabSlot.ts`

**Interfaces (Produces):**
```ts
export type CoreTabId = 'source' | 'script' | 'problems' | 'outline';
/** The row: the core tabs, then one slot (the tab chosen from More last, or the pane's own), then More's list. */
export function tabRow(core: Tab[], others: Tab[], selected: TabId, last: TabId | null): { row: Tab[]; more: Tab[] };
```

- [ ] **Step 1: Write the failing tests.** `panes.test.ts`: `puts the four core tabs first`, `shows the last other tab chosen in the slot and the rest under More`, `shows the pane's own tab in the slot`, `has no More with one other tab`, `drops Outline for a Markdown document` (`dropTab`). `tabs.spec.ts`: `shows Outline in each pane's tab row`, `chooses a module tab from More, which then takes the slot` (two sample modules on), `More works from the keyboard and Escape returns focus`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `modules.spec.ts` and `sample-modules.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): an Outline tab, and More for the tabs that don't fit`

---

### Task 7: The Outline tab

**Files:**
- Create: `apps/web/app/outline/{use-outline.ts,tree.ts,notice.ts,labels.ts}`, `apps/web/app/components/{OutlinePane.vue,OutlineRow.vue,OutlineRowMenu.vue,OutlineAnnouncer.vue}`, `apps/web/test/{outline-tree.test.ts,outline-labels.test.ts}`, `apps/web/e2e/outline.spec.ts`
- Modify: `apps/web/app/components/AppPane.vue`, `apps/web/app/commands/{data.ts,builtin.ts}` (`show-outline`), `apps/web/app/pages/index.vue` (the announcer)

**Interfaces (Produces):**
```ts
// apps/web/app/outline/tree.ts: the ARIA tree's keys, as pure functions of the visible rows
export interface TreeRow { id: string; level: number; parent: string | null; expandable: boolean; open: boolean; label: string }
export function treeKey(rows: TreeRow[], focused: string, key: string): { focus?: string; toggle?: string } | null; // Up, Down, Left, Right, Home, End
export function typeAhead(rows: TreeRow[], focused: string, typed: string): string | null;
// apps/web/app/outline/labels.ts
export function lengthLabel(eighths: number): string; // `1 3/8 pp` style: "1/8 p", "1 p", "1 3/8 pp"
export function sceneRowLabel(scene: Scene): string;  // "Scene 12, INT. KITCHEN - NIGHT"
```

- Rows: number, heading, first synopsis, color chip with its name, `p. 12 · 1 3/8 pp`, who speaks; sections: title, scene count, total length. A filter field narrows by heading, synopsis, or character (and keeps the sections that hold a match).
- Enter or click goes to the row's heading in the Source pane. Each row has a menu (the **⋯** button, the context-menu key, Shift+F10): Go to, Move up, Move down, Move to…, Edit synopsis, Color… (scenes), and the same moves for a section.
- **Edit synopsis** in place: Enter saves, Escape cancels (and so does leaving the field). **Color…** lists the palette by name, and No color.
- Phone: one column; length and speakers under the heading.

- [ ] **Step 1: Write the failing tests.** `outline-tree.test.ts`: `moves down and up through visible rows`, `Right opens a closed section, then goes to its first child`, `Left closes an open section, then goes to the parent`, `Home and End`, `type-ahead finds the next row by its start`. `outline-labels.test.ts`: lengths and names. `outline.spec.ts`: `lists the sample's scenes with pages and lengths`, `lists a stage play's acts and scenes`, `works as a tree by keyboard` (the accessibility tree: tree, treeitems with levels and expanded states), `goes to a scene on Enter`, `filters by character`, `edits a synopsis in place and undoes it in one step`, `colors a scene from the menu, and the color is a name too`, `offers no edits in a read-only tab, and says why`, `is not offered for a Markdown document`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): the Outline tab`

---

### Task 8: Moving from the Outline and the Source

**Files:**
- Create: `apps/web/app/components/MoveToDialog.vue`, `apps/web/app/outline/move.ts` (runs a move, keeps focus, says it)
- Modify: `OutlinePane.vue`, `OutlineRow.vue`, `OutlineRowMenu.vue`, `apps/web/app/commands/{data.ts,builtin.ts}` (`move-scene-up`, `move-scene-down`), `apps/web/e2e/outline.spec.ts`

- Alt+Up and Alt+Down on a focused row; the row menu's Move up, Move down, Move to…; drag with a drop line (pointer only; never the only way); **Move scene up** and **Move scene down** for the scene holding the cursor. Each is one transaction annotated with `sceneMoved`, focus returns to the moved row (or the cursor stays in the moved scene), and the live region says "Moved INT. HALL to scene 4 of 32." (with ", in Act Two" when it lands in a section) once.
- **Move to…**: a dialog, "Put INT. HALL after:", listing the start of the script, every scene, and every section (not the moved section's own), with a filter.

- [ ] **Step 1: Write the failing tests.** `outline.spec.ts`: `moves a scene down with Alt+Down, keeps focus on it, and says where it went`, `moves a scene across a section's edge with Alt+Up`, `moves a section with its scenes`, `undoes a move in one step`, `moves a scene with Move to…`, `moves a scene from the row menu on a phone`, `moves a scene by dragging it` (desktop projects), `moves the scene holding the cursor with Move scene down`, `doesn't move a scene in a read-only tab`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): move scenes and sections from the Outline and the Source`

---

### Task 9: Condense, Expand, treatment, and Expand outline

**Files:**
- Create: `apps/web/app/components/TreatmentDialog.vue`, `apps/web/app/outline/treatment.ts`
- Modify: `apps/web/app/commands/{data.ts,builtin.ts}` (`condense`, `expand-all`, `export-treatment`, `expand-outline`, `screenplay-from-outline`), `apps/web/app/components/ExportMenu.vue` (Treatment), `apps/web/app/storage/export.ts` (a Markdown file of given text), `apps/web/e2e/outline.spec.ts`

- **Condense to outline** folds every scene and shows the Outline in the other pane (on a phone, the Outline); **Expand all** unfolds.
- **Export as treatment…** opens a small dialog: "Include each scene's first paragraph of action", then **Save file** (`<title> — treatment.md`) or **Open as a document** (a new Markdown document).
- **Expand outline** works on the selection, or the whole script with none; one undo. **New screenplay from this outline** (a Markdown document only) makes a new screenplay from the outline and opens it; Problems lists the stubs.

- [ ] **Step 1: Write the failing tests.** `outline.spec.ts`: `condenses to the outline and expands again`, `exports a treatment as a Markdown file`, `opens a treatment as a document`, `expands synopses into stubs in one undo, and Problems lists them`, `makes a screenplay from a Markdown outline`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): condense and expand, treatment export, and expand outline`

---

### Task 10: axe, the desktop menu, and the docs

**Files:**
- Modify: `apps/web/e2e/outline.spec.ts` (axe), `apps/web/test/desktop-menu.test.ts`, `apps/web/app/pages/docs/fountain.vue` (if the cheat sheet names the Outline), `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`, `packages/outline/README.md`

- [ ] **Step 1: Write the failing tests.** `outline.spec.ts`, for each theme, in every project (desktop and phone width): `passes axe on the Outline (dark|light)`, `passes axe with a row's menu and its colors open`, `passes axe with Move to… open`, `passes axe with the treatment dialog open`, `passes axe with the tabs' More open`. `desktop-menu.test.ts`: `puts the outline commands in the View and Edit menus`.
- [ ] **Step 2: Run them.** → FAIL where something is wrong.
- [ ] **Step 3: Fix what they find.**
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS.
- [ ] **Step 5: Commit.** `test(web): axe on every outline state; docs for Plan A`

---

### Task 11: Push

- [ ] Push `phase2-a` and watch CI. Don't merge or tag: the controller releases v0.10.0.
