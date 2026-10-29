# Phase 2, Plan B: Cards and notes (v0.12.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Cards and notes (v0.12.0): a new engine package, `@drafter/notes`, that reads and writes keyed notes exactly; the Cards tab, where scenes are index cards that move by drag and by keyboard and edit their synopses; the Notes tab, listing every note and boneyard with groups, categories, people, and status, and resolve, reopen, edit, set category, and delete as single undos; Scene details, which writes a scene's goal, conflict, outcome, and shift (and its synopsis, color, and storylines) into its header; setups and payoffs, with Setup and Payoff on the element bar and their lint rules; and `duplicate-field`.

**Architecture:** `@drafter/notes` is the lowest structural layer: it depends only on `@drafter/fountain`, reads `[[Head: body]]` (design §5.3) into a typed head, a body, tags, and a status, lists every note and boneyard in a parse, and returns every note edit as `TextChange[]`. The text-shape helpers Plan A wrote in `@drafter/outline` (one-line bodies, taking a line out, the stray-`/*` gate, line breaks) and the scene palette move into it. `@drafter/outline` then depends on `@drafter/notes`: the scene index gains each scene's fields, storylines, and marks, and `setSceneDetails` writes a whole header in the design's order. `@drafter/lint` and `@drafter/cm-fountain` depend on `@drafter/notes` for the three new rules and the label completion. `apps/web` draws Cards, Notes, and Scene details; every edit goes through the Outline session's `apply` (`applyTextChanges`, one transaction, one undo).

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Vitest 5 with fast-check, Playwright 1.64. No new dependencies.

**Spec:** [`docs/drafter-phase2-design.md`](../drafter-phase2-design.md): §22 Plan B (scope and Done-when are binding); §5.3 (keyed notes), §5.4 (a scene's header), §5.5 (`categories` in the metadata block), §5.7 (rules every view follows), §5.8 (where the views live); §7 (Cards); §8 (Notes, categories, status); §9 (scene goals); §10 (setups and payoffs); §21 (packages, and `duplicate-field`); §1 item 2 (the printed script never changes). Plan A's decisions in `docs/DECISIONS.md` (`## Phase 2, Plan A: the Outline`) still hold.

## Global Constraints

- Branch `phase2-b` (worktree `scratchpad/drafter-b`), from `main` at v0.11.0 or later (`948272e`).
- **Clean room:** no code, text, or fixtures from any screenwriting app or Fountain library. "Like a corkboard" is the idea, not any app's design. Every label, message, and fixture is Drafter's own words.
- **No new dependencies.** `@drafter/notes` depends on `@drafter/fountain` only (dev: `@drafter/render-text`, `@drafter/layout` for its tests, as `@drafter/outline` has them). Workspace edges added: `@drafter/outline`, `@drafter/lint`, and `@drafter/cm-fountain` depend on `@drafter/notes`; `apps/web` adds it. Anything third-party needs a `docs/DEPENDENCIES.md` row first, and none is expected.
- **The printed script never changes** (design §1 item 2): `packages/outline/test/invariant.test.ts` gains Plan B's notes — every scene's full header from `setSceneDetails`, inline `[[Setup: …]]` and `[[Payoff: …]]` marks, category, person, and tagged notes, resolved and open — and the printed text with them equals the printed text without them.
- **Edits are text** (design §5.7): every view edit is `TextChange[]` from `@drafter/notes` or `@drafter/outline`, applied through `useOutline().apply` (`applyTextChanges`: one transaction, `isolateHistory('full')`, one undo). `print(parse(text)) === text` still holds. Nothing is rewritten that the writer didn't ask to change: Resolve, Reopen, and Set category touch only the tag text inside the note.
- **Writing is exact, reading is lenient** (design §5.3): Drafter writes `[[Key: body]]` in title case with one space, a body on one line (breaks as ` / `), `]]` as `] ]`, and `/*` / `*/` spaced; it reads any case and spacing.
- **Markdown documents** get no Cards, Notes, or Scene details, and no Setup or Payoff buttons (Call below).
- **Read-only** (another tab has the script, its file is being checked, or a `/*` is stray): Cards, Notes, and Scene details show everything; edit controls are disabled (`aria-disabled`) with the reason, as the Outline's are (`useOutline().readOnly`).
- **Keyboard:** every action is a command in the registry (`apps/web/app/commands/data.ts` + `builtin.ts`, so it is in the palette and on the Keyboard shortcuts page) or a key named on the shortcuts page; every drag has a keyboard equivalent driven by an e2e test. New views reuse the Outline's patterns: roving focus with one tab stop, `MenuButton` for every menu (the ⋯ button `tabindex="-1"`, opened by the context-menu key or Shift+F10), `<dialog>` dialogs shaped like `MoveToDialog.vue`, and the one polite live region (`sayOutline`, `OutlineAnnouncer.vue`).
- **Accessibility work waits for the final steps** (maintainer, 2026-10-28): no new axe tests and no accessibility task in this plan; the existing axe tests (`e2e/a11y.spec.ts`, `e2e/outline.spec.ts`) stay green. The Done-when item "axe passes on Cards, Notes, and Scene details, in both themes at both widths" is deferred to those final steps and listed in `docs/DEFERRED.md`.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` under a new `## Phase 2, Plan B: Cards and notes` section (each Call below gets a line when it lands); conventional commits with **no AI co-author trailer and no session link**.

## Review Focus

1. **A body the writer typed survives a round trip:** `]]`, `/*`, `*/`, a line break, `#3`, `#resolved` in the middle, a colon in the body, an accented or astral character. Task 1's property test `writing and reading any body gives it back` and the fixed cases beside it.
2. **Taking a note out never joins lines that print:** a note inside an action line, a note line between two-space lines, the last line of a header. Task 2's `deleting an inline note leaves the line printing as it did` and `refuses to delete where a two-space line would join its neighbours`.
3. **A URL, a time, or a sentence with a colon is not a head:** `[[see http://x]]`, `[[call at 10:30]]`, `[[Note to self: …]]` must not file the note under a person called "http". Task 1's `reads no head from a URL or a time`.
4. **Fields typed by hand, out of order, in another case, or twice** are read, edited in place, and not duplicated by Scene details; the second `Goal` is a Problems item. Task 3's `edits a hand-typed field where it is` and Task 4's `duplicate-field`.
5. **An action on a note that changed since the list was drawn** (the writer typed, or undid) changes nothing and says so, rather than writing at stale offsets. Task 8's `findEntry` tests and its e2e `a stale row's action changes nothing`.

---

### Task 1: Keyed notes (`@drafter/notes`)

**Files:**
- Create: `packages/notes/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}` (shaped like `packages/outline`), `packages/notes/src/{index.ts,keyed.ts,text.ts,colors.ts}`, `packages/notes/test/{keyed.test.ts,keyed.properties.test.ts,text.test.ts}`
- Move: `packages/outline/src/keyed.ts` → `packages/notes/src/keyed.ts` (`readKeyedNote`, `safeBody`, `safeLine`) and `text.ts` (`contentEnd`, `hasBlankLine`, `isPlainGap`, `hasStrayBoneyard`, `bodyEnd` from `scene-index.ts`; `lineBreakOf` from `move.ts`; `removeLine` and `isLineBreak` from `header.ts`); `SceneColor` and `SCENE_COLORS` from `packages/outline/src/types.ts` → `colors.ts`
- Modify: `packages/outline/{package.json,src/index.ts,src/scene-index.ts,src/move.ts,src/header.ts,src/expand.ts,src/types.ts,test/scene-index.test.ts}` (import from `@drafter/notes`; `index.ts` keeps re-exporting `hasStrayBoneyard`, `lineBreakOf`, `bodyEnd`, `SceneColor`, `SCENE_COLORS`, so `apps/web` builds unchanged), `vitest.shared.ts` and `apps/web/nuxt.config.ts` (alias), `apps/web/package.json` (dependency), `README.md` (Packages table: `@drafter/notes` built in Plan B)

**Interfaces (Produces):**
```ts
export type FieldKey = 'color' | 'storyline' | 'goal' | 'conflict' | 'outcome' | 'shift';
export type MarkKey = 'setup' | 'payoff';
/** A scene header's order (design §5.4). */
export const FIELD_ORDER: readonly FieldKey[]; // ['color','storyline','goal','conflict','outcome','shift']
export const STARTING_CATEGORIES: readonly string[]; // story, character, dialogue, pacing, format, continuity, question, todo
export type Head =
  | { kind: 'field'; key: FieldKey }
  | { kind: 'mark'; key: MarkKey }
  | { kind: 'card' }
  | { kind: 'category'; name: string }   // `TODO` → 'todo', `CUT?` → 'cut?'
  | { kind: 'person'; name: string; on: string | null; re: string | null }; // `Sam`, `Sam on “quote”`, `Sam re Ann`
export interface KeyedNote {
  head: Head | null;   // null: the writer's own note, uncategorized
  body: string;        // after the head's colon, trimmed; the whole text when there is no head
  tags: string[];      // `#word` category tags, lowercased, once each, in order; never `resolved`
  resolved: boolean;   // a `#resolved` anywhere in the body
}
/** `inner` is the text between `[[` and `]]`. */
export function readNote(inner: string): KeyedNote;
/** A category head's name first, then the tags. */
export function categoriesOf(note: KeyedNote): string[];
/** `[[Head: body]]` exactly (`[[body]]` with no head), the body through `safeBody`. */
export function writeNote(head: string | null, body: string): string;
/** `[[Goal: body]]`, the key in title case. */
export function fieldNote(key: FieldKey | MarkKey, body: string): string;
/** A setup or payoff label for matching: case folded, spaces collapsed and trimmed. */
export function normalizeLabel(label: string): string;
export function readKeyedNote(text: string): { key: string; body: string } | null; // as Plan A's, kept for its callers
export type SceneColor = /* as Plan A */; export const SCENE_COLORS: readonly SceneColor[];
// text.ts: exactly Plan A's signatures, now exported from here
export function removeLine(doc: Doc, index: number, line: number): TextChange | null;
```

- Head order (design §5.3): a field key, then `Setup`/`Payoff`, then `Card`, then all capitals (a category), then `Name re Name`, `Name on “quote”` (straight or curly quotes), then a name with a lowercase letter, up to 40 characters (a person). **Call:** a head is letters, spaces, and `' . - ? !` only, starting with a letter; and a category or person head needs whitespace or the note's end after its colon (a field key doesn't: `[[Color:blue]]` reads). So a URL (`http://…`) or a time (`10:30`) is never a head.
- A tag is `#` at a word's start, then a letter, then letters, digits, or hyphens.

- [ ] **Step 1: Write the failing tests.** `keyed.test.ts`: `reads each field key in any case and spacing`, `reads Setup and Payoff as marks`, `reads Card`, `reads an all-capitals head as a category` (`TODO` → `todo`, `CUT?` → `cut?`), `reads a name with a lowercase letter as a person`, `reads Name on “quote” and Name re Name`, `reads no head from a URL or a time`, `reads no head longer than 40 characters`, `a field key wins over a person of the same name`, `reads tags once each, lowercased, and #resolved as the status`, `does not read #3 as a tag`, `writes title case with one space`, `writes ]] as ] ], a line break as / , and spaces /* and */`. `keyed.properties.test.ts` (fast-check, bodies of any Unicode including `]]`, `[[`, `/*`, `*/`, `#`, `:`, newlines): `writing and reading any body gives it back` (`readNote(inner(writeNote(h, b))).body === safeBody(b)`, and the head comes back for every head kind), `reading never throws`. `text.test.ts`: the moved helpers' existing behaviour (copy the cases Plan A's `header.test.ts` and `scene-index.test.ts` hold for them).
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/notes test` → FAIL (no package).
- [ ] **Step 3: Implement,** and move the helpers; `@drafter/outline` imports them.
- [ ] **Step 4: Run them again,** plus `pnpm --filter @drafter/outline test` (unchanged results) and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat(notes): read and write keyed notes`

---

### Task 2: Every note in a script, and its edits

**Files:**
- Create: `packages/notes/src/{entries.ts,edit.ts,setups.ts,categories.ts}`, `packages/notes/test/{entries.test.ts,edit.test.ts,setups.test.ts,categories.test.ts}`

**Interfaces (Produces):**
```ts
export interface NoteEntry {
  kind: 'note' | 'boneyard';
  span: Span;               // the region, `[[` to `]]` or `/*` to `*/`
  text: string;             // a note's inner text, a boneyard's inside
  note: KeyedNote | null;   // null for a boneyard
  block: number;            // the block holding it
  alone: boolean;           // the only thing on its line
}
/** Every closed note and boneyard in source order; never the metadata block or the Beat Board block. */
export function noteEntries(doc: Doc): NoteEntry[];
/** The entry that is still `was` in a newer parse (same text, at its offset or the nearest one), or null. */
export function findEntry(entries: readonly NoteEntry[], was: Pick<NoteEntry, 'span' | 'text'>): NoteEntry | null;
/** Each note with the `Name re Name` replies under it: a reply nests under the nearest earlier note by the person it names. */
export function nestReplies(entries: readonly NoteEntry[]): Array<{ entry: NoteEntry; replies: NoteEntry[] }>;

export function setResolved(doc: Doc, entry: NoteEntry, resolved: boolean): TextChange[]; // appends ` #resolved` / removes every `#resolved` and the space before it
export function setTags(doc: Doc, entry: NoteEntry, tags: readonly string[]): TextChange[]; // adds missing `#tag`s at the body's end, removes dropped ones; the rest kept exactly
export function rewriteNote(doc: Doc, entry: NoteEntry, head: string | null, body: string): TextChange[]; // the whole note, written exactly
export function deleteEntry(doc: Doc, entry: NoteEntry): TextChange[]; // its line when alone (removeLine), else the note only; [] where that would join printing lines
export function resolveAll(doc: Doc, entries: readonly NoteEntry[]): TextChange[]; // open notes only; non-overlapping, in order
/** A new note at the end of the line holding `offset`, after one space; on a blank line, at the end of the line above; at the very start, on its own line before a blank line. */
export function insertNote(doc: Doc, offset: number, note: string): { changes: TextChange[]; cursor: number };

export interface SetupThread { label: string; setups: NoteEntry[]; payoffs: NoteEntry[]; unpaid: boolean; early: NoteEntry[] }
/** Labels matched by `normalizeLabel`; a setup is paid only by a later payoff; `early`: payoffs before every setup. Unpaid first, then by first offset. */
export function setupsAndPayoffs(entries: readonly NoteEntry[]): SetupThread[];
/** Labels in use, as first typed, for the element bar's completion. */
export function markLabels(doc: Doc): string[];

/** `categories` in the metadata block (design §5.5): `{ "continuity": "teal" }`. */
export function categoryColors(doc: Doc): Record<string, SceneColor>;
export function setCategoryColor(doc: Doc, name: string, color: SceneColor | null): TextChange[]; // through @drafter/fountain's setMeta
```

- Every edit returns `[]` when `hasStrayBoneyard(doc)`.
- **Call:** Resolve, Reopen, and Set category change only the tag text, in place; **Edit** rewrites the whole note in the exact form (that's what the writer asked for).
- **Call:** a new note (and Setup and Payoff, Task 7) goes at the end of the cursor's line, after one space, so it never adds a line that could join or split paragraphs.

- [ ] **Step 1: Write the failing tests.** `entries.test.ts`: `lists notes and boneyards in source order with their blocks`, `leaves out the metadata block and the Beat Board block`, `marks a note alone on its line`, `findEntry finds a note after text is typed above it`, `findEntry returns null for a note that changed`, `nests a reply under the person's earlier note`. `edit.test.ts`: `resolves and reopens in one change, touching only the tag`, `adds and removes a tag, keeping the rest exactly`, `rewrites a note in the exact form`, `deletes a note alone on its line, and the line`, `deleting an inline note leaves the line printing as it did`, `refuses to delete where a two-space line would join its neighbours`, `resolve all changes only open notes`, `inserts a note at the end of the cursor's line`, `inserts on a blank line at the end of the line above`, `keeps CRLF line breaks`, `changes nothing while a /* is stray`. `setups.test.ts`: `matches labels without regard to case or spacing`, `a setup may have several payoffs`, `a payoff before its setup is early, and the setup unpaid`, `lists unpaid labels first`. `categories.test.ts`: `reads category colors from the metadata block`, `sets and clears a color in one change`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(notes): list a script's notes, and edit them as text`

---

### Task 3: Scene fields and Scene details in `@drafter/outline`

**Files:**
- Modify: `packages/outline/src/{types.ts,scene-index.ts,header.ts,move.ts,index.ts}`, `packages/outline/test/{scene-index.test.ts,header.test.ts,move.test.ts,invariant.test.ts}`, `packages/outline/README.md`

**Interfaces (Produces):**
```ts
// types.ts: Scene gains (`color` stays as Plan A has it)
fields: Partial<Record<FieldKey, { body: string; span: Span }>>; // the first note of each key anywhere in the scene
storylines: string[];                                           // every Storyline note's comma-separated labels, once each, in order
marks: Array<{ key: MarkKey; label: string; span: Span }>;
// header.ts
/** undefined: unchanged; '' or null: cleared (the note and its line go). */
export interface SceneDetails {
  synopsis?: string; color?: SceneColor | null; storyline?: string;
  goal?: string; conflict?: string; outcome?: string; shift?: string;
}
/** One set of non-overlapping changes for the whole header, in the order synopses, Color, Storyline, Goal, Conflict, Outcome, Shift (design §5.4). */
export function setSceneDetails(doc: Doc, scene: Scene, details: SceneDetails): TextChange[];
// setColor(doc, scene, color) becomes setSceneDetails(doc, scene, { color }); its tests stay.
// move.ts
/** The target that puts an item just before the scene at `block`: after the item before it in source order, or the start. */
export function targetBefore(index: SceneIndex, block: number): MoveTarget | null;
```

- A field typed by hand anywhere in the scene is changed in place (notes stay where the writer put them, §5.3); a new field goes into the header after every field before it in `FIELD_ORDER` and before every field after it. A second note of the same key is left alone (`duplicate-field` lists it).
- **Call:** Scene details' Storyline is plain text written as `[[Storyline: A, B]]`; storyline names and colors in the metadata block wait for Plan E.

- [ ] **Step 1: Write the failing tests.** `scene-index.test.ts`: `reads every field in any case, anywhere in the scene`, `the first of two Goals wins`, `reads storylines from every Storyline note`, `lists setups and payoffs as marks`. `header.test.ts`: `writes all four goal fields in the header order`, `adds a field between the ones before and after it`, `clears a field and its line`, `edits a hand-typed field where it is`, `writes a synopsis and fields together under a bare heading`, `writes a play's ## scene header`, `changes nothing when nothing changed`. `move.test.ts`: `targetBefore puts a scene before the first scene of a section`. `invariant.test.ts`: `the layout is unchanged by scene details` and `the layout is unchanged by every kind of keyed note` (fast-check over `anyScript` and `fountainScript`: full headers, inline Setup and Payoff marks, category, person, tagged, and resolved notes; printed with `@drafter/render-text` before and after; equal).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(outline): scene fields, and Scene details written in the header`

---

### Task 4: `setup-without-payoff`, `payoff-without-setup`, and `duplicate-field`

**Files:**
- Create: `packages/lint/src/rules/{setups.ts,fields.ts}`
- Modify: `packages/lint/package.json` (`@drafter/notes`), `packages/lint/src/run.ts` (after `fdxNote`), `packages/lint/test/rules.test.ts`, `packages/outline/test/scene-index.test.ts` (`@drafter/lint` is already its dev dependency)

**Interfaces (Produces):**
```ts
export const setupWithoutPayoff: Rule; // 'setup-without-payoff', info, span: the setup note
export const payoffWithoutSetup: Rule; // 'payoff-without-setup', info, span: the payoff note
export const duplicateField: Rule;     // 'duplicate-field', info, span: the second (and later) note
```

- Messages (Drafter's words): "Nothing pays off the setup “the letter” later in the script." · "No setup for “the letter” comes before this payoff." and, when one comes after it, "This payoff comes before its setup “the letter”." · "This scene already has a Goal; Drafter reads the first one." All info, so none counts as a problem.
- **Call:** `duplicate-field` finds scenes itself (a scene start by `resolveRole`, as `stub-heading` does, to the next scene start or section), because lint doesn't depend on outline; the agreement test in `scene-index.test.ts` keeps the two in step, as Plan A did for stubs.

- [ ] **Step 1: Write the failing tests.** `rules.test.ts`: `setup-without-payoff lists a setup never paid off`, `setup-without-payoff is quiet once a later payoff matches in another case`, `payoff-without-setup lists a payoff with no setup`, `payoff-without-setup says when the setup comes after`, `duplicate-field lists a second Goal in a scene`, `duplicate-field allows several Storyline, Setup, and Payoff notes`, `duplicate-field treats each scene apart in a stage play`, `none of them counts as a problem`. `scene-index.test.ts`: `duplicate-field agrees with the scene index on which notes are second` (random scripts with repeated fields).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `pnpm --filter @drafter/cm-fountain test`. → PASS.
- [ ] **Step 5: Commit.** `feat(lint): setups and payoffs, and duplicate scene fields`

---

### Task 5: Scene details, and the shared scene menu

**Files:**
- Create: `apps/web/app/outline/scene-menu.ts` (the row menu's items, lifted out of `OutlinePane.vue`'s `menuItems`, for Outline rows and cards), `apps/web/app/outline/scene-details.ts` (`sceneDetailsFor`), `apps/web/app/components/SceneDetailsDialog.vue`, `apps/web/test/scene-details.test.ts`
- Modify: `apps/web/app/components/OutlinePane.vue` (uses `scene-menu.ts`; a scene row's description gains the goal's first line), `apps/web/app/outline/use-outline.ts` (`setDetails`), `apps/web/app/commands/{data.ts,builtin.ts}` (`scene-details`, for the cursor's scene via `sceneAtCursor`), `apps/web/app/pages/index.vue` (the dialog), `apps/web/e2e/outline.spec.ts`

**Interfaces (Produces):**
```ts
// apps/web/app/outline/scene-menu.ts
export interface SceneMenuHooks { go(id: string): void; edit(id: string): void; moveUp(id: string): void; moveDown(id: string): void; moveTo(id: string): void; focus(id: string): void }
export function sceneMenuItems(id: string, item: OutlineItem, hooks: SceneMenuHooks): DropdownMenuItem[][]; // Go to; moves; Edit synopsis, Color…, Scene details…
// apps/web/app/outline/scene-details.ts
export const sceneDetailsFor: Ref<string | null>; // the scene's id while the dialog is open
export function detailsDraft(scene: Scene): Required<SceneDetails>; // the form's starting values
export function changedDetails(scene: Scene, draft: Required<SceneDetails>): SceneDetails; // only what differs
export function goalLine(scene: Scene): string | null; // the goal's first line (up to the first ` / `)
// use-outline.ts: OutlineSession gains
setDetails(scene: Scene, details: SceneDetails): boolean; // one apply, and "Saved the details of INT. HALL." in the live region
```

- The dialog: Synopsis, Color (the palette by name, and No color), Storylines, Goal, Conflict, Outcome, Shift; **Save** writes only what changed, in one undo; **Cancel** and Escape change nothing. It finds its scene by id when it saves (Plan A's review I4).

- [ ] **Step 1: Write the failing tests.** `scene-details.test.ts`: `starts from the scene's fields`, `reports only the changed fields`, `an emptied field is cleared`, `the goal's first line stops at /`. `outline.spec.ts`: `writes the four fields from Scene details in the header order, in one undo`, `clears a field from Scene details`, `opens Scene details for the cursor's scene from the palette`, `shows a scene's goal in its row`, `offers Scene details disabled in a read-only tab, and says why`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus all of `outline.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): Scene details, and scene goals in the Outline`

---

### Task 6: The Cards tab, and Cards and Notes in the tab row

**Files:**
- Create: `apps/web/app/cards/{grid.ts,labels.ts}`, `apps/web/app/components/{CardsPane.vue,SceneCard.vue,CardsSlim.vue}`, `apps/web/test/{cards-grid.test.ts,cards-labels.test.ts}`, `apps/web/e2e/cards.spec.ts`
- Modify: `apps/web/app/utils/panes.ts`, `apps/web/app/components/AppPane.vue` (others = `viewTabs(kind)` then module tabs; the badge; `CardsSlim`), `apps/web/app/pages/index.vue` (a Markdown document drops `cards` and `notes`), `apps/web/app/settings/settings.ts` (`cardSize`), `apps/web/app/commands/{data.ts,builtin.ts}` (`show-cards`, `show-notes`), `apps/web/test/{panes.test.ts,settings.test.ts}`, `apps/web/e2e/tabs.spec.ts`

**Interfaces (Produces):**
```ts
// panes.ts
export interface Tab { id: TabId; label: string; badge?: string }
/** Cards and Notes (design §5.8): not core, so they share the slot and More with module tabs. None for Markdown. */
export const VIEW_TABS: ReadonlyArray<Tab>; // [{ id: 'cards', label: 'Cards' }, { id: 'notes', label: 'Notes' }]
export function viewTabs(kind: 'fountain' | 'markdown'): ReadonlyArray<Tab>;
// dropTab(tabs, tab) is called for 'outline', 'cards', and 'notes' when a document turns Markdown.
// settings.ts
cardSize: 'small' | 'medium' | 'large'; // default 'medium'
// cards/grid.ts: card positions as pure functions; `columns` is measured from the drawn cards
export function gridKey(count: number, columns: number, focused: number, key: string): number | null; // arrows by position, Home, End
// cards/labels.ts
export function cardName(scene: Scene): string; // "Scene 12, INT. KITCHEN - NIGHT, blue, 1 3/8 pages"
```

- **Call:** Cards and Notes are not core tabs: the row stays Source, Script, Problems, Outline, then the slot, then More, with Cards and Notes first in More, as §5.8's order lists them.
- Cards in script order under their sections' titles; a card shows the number, heading, synopses, a color stripe with the color's name, the goal's first line (`goalLine`), and the length (`lengthLabel`). Storyline labels wait for Plan E.
- **Call:** the cards are one `listbox` with a `group` per section (each option named by `cardName`, described by its synopsis), roving focus with one tab stop, and 2-D arrow keys — the Outline's tree pattern applied to a flowed grid; the design's "grid" is how it looks.
- Enter on a card edits its first synopsis in place (Enter saves; Escape and leaving cancel, as in the Outline). The card's ⋯ menu is `sceneMenuItems`.
- **Call:** three sizes, `cardSize`, chosen on the Cards slim bar (`CardsSlim.vue`) and kept as a setting. Phone: one column.

- [ ] **Step 1: Write the failing tests.** `panes.test.ts`: `puts Cards and Notes in the slot and More, before module tabs`, `has no Cards or Notes for a Markdown document`, `drops Cards and Notes from a pane when the document turns Markdown`. `cards-grid.test.ts`: `Right and Left step through the cards`, `Down and Up go a row by the column count`, `Down on the last row stays`, `Home and End`. `cards-labels.test.ts`: `names a card with number, heading, color, and length`. `settings.test.ts`: `cardSize defaults to medium`. `tabs.spec.ts`: `chooses Cards from More, which then takes the slot`. `cards.spec.ts`: `shows every scene as a card under its section`, `moves between cards with the arrow keys from one tab stop`, `edits a synopsis on Enter and undoes it in one step`, `changes the card size from the slim bar`, `is not offered for a Markdown document`, `offers no edits in a read-only tab, and says why`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `modules.spec.ts` and `sample-modules.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): the Cards tab`

---

### Task 7: Moving cards

**Files:**
- Modify: `apps/web/app/cards/grid.ts`, `apps/web/app/components/{CardsPane.vue,SceneCard.vue}`, `apps/web/test/cards-grid.test.ts`, `apps/web/e2e/cards.spec.ts`

**Interfaces (Consumes):** `runMove(block, target, options)` from `apps/web/app/outline/move.ts`; `upTarget`, `downTarget`, `targetBefore` from `@drafter/outline`; `MoveToDialog.vue`. **(Produces):**
```ts
/** Alt+Up: before the card one row up in the same column; Alt+Down: after the card one row down. Null at an edge. */
export function rowMoveTarget(index: SceneIndex, block: number, columns: number, direction: 'up' | 'down'): MoveTarget | null;
```

- Alt+Left and Alt+Right are `upTarget`/`downTarget` (one place earlier or later, crossing a section's edge as the Outline does). **Call:** Alt+Up and Alt+Down move by a row of the grid as drawn (the measured column count); on a phone (one column) they are one place.
- The menu's Move up, Move down, and Move to…; drag with a drop line before or after the card under the pointer (desktop, never the only way). Each move is one undo; focus stays on the moved card; the live region says `movedMessage` once.

- [ ] **Step 1: Write the failing tests.** `cards-grid.test.ts`: `rowMoveTarget goes before the card above`, `rowMoveTarget goes after the card below`, `rowMoveTarget is null on the top row going up`. `cards.spec.ts`: `moves a card later with Alt+Right, keeps focus on it, and says where it went`, `moves a card a row up with Alt+Up`, `undoes a card move in one step`, `moves a card with Move to…`, `moves a card from its menu on a phone`, `moves a card by dragging it` (desktop projects), `doesn't move a card in a read-only tab`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): move cards by drag and by keyboard`

---

### Task 8: The Notes tab

**Files:**
- Create: `apps/web/app/notes/{use-notes.ts,filter.ts,list-keys.ts}`, `apps/web/app/components/{NotesPane.vue,NoteRow.vue,NotesSlim.vue,NewNoteDialog.vue,NoteFiltersDialog.vue}`, `apps/web/test/{notes-filter.test.ts,notes-keys.test.ts}`, `apps/web/e2e/notes.spec.ts`
- Modify: `apps/web/app/components/AppPane.vue` (`NotesPane`, `NotesSlim`, the badge), `apps/web/app/commands/{data.ts,builtin.ts}` (`new-note`), `apps/web/app/pages/index.vue` (the New note dialog)

**Interfaces (Produces):**
```ts
// notes/filter.ts: pure
export type NoteGroup = 'all' | 'mine' | 'readers' | 'setups' | 'boneyard';
export interface NoteFilter { group: NoteGroup; category: string | null; person: string | null; status: 'open' | 'resolved' | 'all'; scene: number | null; text: string }
export interface NoteRowModel { entry: NoteEntry; replies: NoteEntry[]; scene: Scene | null; categories: string[]; person: string | null; line: number }
/** Never lists field or Card notes (design §8, Call). `mine`: no head or a category head; `readers`: person heads; `setups`: marks; `boneyard`: boneyards. */
export function notesShown(entries: readonly NoteEntry[], index: SceneIndex, filter: NoteFilter, lineOf: (offset: number) => number): NoteRowModel[];
export function openCount(entries: readonly NoteEntry[]): number; // open notes in My notes and Readers
export function categoriesInUse(entries: readonly NoteEntry[]): string[]; // in use, then STARTING_CATEGORIES not yet used
// notes/list-keys.ts
export function notesKey(count: number, focused: number, key: string): { focus?: number; action?: 'go' | 'edit' | 'resolve' | 'category' | 'delete' | 'menu' } | null;
// notes/use-notes.ts
export interface NotesSession {
  entries: ComputedRef<NoteEntry[]>;
  threads: ComputedRef<SetupThread[]>;
  /** Re-finds `was` in the current parse (findEntry) and applies `edit`; says "That note has changed since; the list is up to date now." when it is gone. */
  act(was: NoteEntry, edit: (doc: Doc, entry: NoteEntry) => TextChange[], said: string): boolean;
  add(text: string, category: string | null): boolean; // insertNote at the cursor, `[[text #category]]`
}
export function useNotes(): NotesSession;
```

- Filter chips for the groups; filters for category, person, status, and scene, and a text field. **Call:** on a phone the filters sit behind a **Filters** button that opens `NoteFiltersDialog.vue`, a `<dialog>` like Move to…
- A row: the text, category chips (colored, and named), the person, `Scene 4 · line 52`, and the status; replies indented under it (`nestReplies`). **Call:** a Reply action waits for Plan G (§18.3); Plan B reads and shows replies.
- **Call:** keys on a focused row (one tab stop, Up and Down): Enter goes to it in the Source; E edits in place (head and text; Enter saves, Escape cancels); R resolves or reopens; C sets the category; Delete deletes; the context-menu key or Shift+F10 opens the row's menu. The row's buttons are for a pointer (`tabindex="-1"`). The keys are listed on the shortcuts page.
- **Resolve all shown** asks first ("Resolve 7 notes?"), then `resolveAll` in one undo. Category colors: a category chip's menu has **Color…**, writing `setCategoryColor`.
- **Setups & payoffs** group: one row per label (`threads`), its setups and payoffs with their pages (`pageOf`), unpaid first, each line going to its place.
- The tab's badge: `openCount`, and the tab's name "Notes, 3 open".
- **New note** (the tab's button and the palette): a dialog with the text and an optional category; one undo. The element bar's Note button keeps wrapping the selection as it does.

- [ ] **Step 1: Write the failing tests.** `notes-filter.test.ts`: `All lists every note and boneyard but no fields or cards`, `My notes holds headless and category notes`, `Readers holds person notes`, `filters by category, person, status, scene, and text`, `counts open notes in My notes and Readers`, `lists categories in use, then the starting set`. `notes-keys.test.ts`: `Up and Down move`, `Enter goes, E edits, R resolves, C sets a category, Delete deletes`. `notes.spec.ts`: `lists the notes of a script with their scenes and lines`, `filters by group, category, person, and status`, `resolves and reopens a note, each in one undo`, `edits a note in place, in one undo`, `sets a category, in one undo`, `deletes a note, in one undo`, `resolves all shown after asking`, `adds a note at the cursor with a category`, `lists a setup with no payoff first in Setups & payoffs, and in Problems`, `shows the open count on the tab`, `a stale row's action changes nothing`, `works with the filters in a sheet on a phone`, `offers no edits in a read-only tab, and says why`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `problems.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): the Notes tab, with categories and status`

---

### Task 9: Setup and Payoff on the element bar

**Files:**
- Modify: `packages/cm-fountain/{package.json,src/complete.ts}`, `packages/cm-fountain/test/complete.test.ts`, `apps/web/app/editor/element-bar.ts` (`FOUNTAIN_MORE`), `apps/web/app/commands/{data.ts,builtin.ts}` (`mark-setup`, `mark-payoff`), `apps/web/test/element-bar.test.ts`, `apps/web/e2e/element-bar.spec.ts`

**Interfaces (Produces):**
- `FOUNTAIN_MORE` gains `{ label: 'Setup', mark: '[[Setup: ]]', command: 'mark-setup', tip }` and `{ label: 'Payoff', mark: '[[Payoff: ]]', command: 'mark-payoff', tip }`, after Note. Tips (Drafter's words): "Marks something planted here, to pay off later. Give the payoff the same label." / "Marks where a setup pays off. Use the setup's label."
- `mark-setup` / `mark-payoff`: `insertNote(doc, selection.main.head, '[[Setup: ]]')`, with the cursor put two characters before the returned `cursor` (before `]]`), through `withCompletion`, so the labels in use are offered at once. Fountain only, never read-only.
- `fountainCompletionSource` gains a target inside `[[Setup: …` and `[[Payoff: …` on the cursor's line, offering `markLabels(doc)`. **Call:** the labels are offered by the editor's existing completion, not a separate picker.

- [ ] **Step 1: Write the failing tests.** `complete.test.ts`: `offers the labels in use inside [[Payoff: ]]`, `offers nothing outside a mark`. `element-bar.test.ts`: `has Setup and Payoff in More, after Note`. `element-bar.spec.ts`: `Setup adds a mark at the end of the line with the cursor in its label`, `Payoff offers the setup's label`, `Setup and Payoff are one undo each`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web, cm-fountain): Setup and Payoff on the element bar`

---

### Task 10: The desktop menu, the docs, and release prep

**Files:**
- Modify: `apps/web/app/commands/desktop-menu.ts`, `apps/web/test/desktop-menu.test.ts`, `apps/web/app/pages/docs/fountain.vue` (keyed notes, Setup and Payoff, categories, `#resolved`), `apps/web/test/cheat-sheet.test.ts` (if the page's sections are tested there), `modules/notes/README.md` and `modules/scene-list/README.md` (point to the Notes and Cards tabs, design §4), `packages/notes/README.md`, `README.md` (status and roadmap), `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`

- [ ] **Step 1: Write the failing tests.** `desktop-menu.test.ts`: `puts Show Cards and Show Notes in View, and Scene details, New note, Setup, and Payoff in Edit`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement,** and write the docs: every Call below in DECISIONS (Plan B section); in DEFERRED, the axe tests for Cards, Notes, and Scene details (both themes, both widths), Reply (Plan G), the Notes tab in Markdown documents, and storyline labels on cards (Plan E).
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with the existing axe tests green.
- [ ] **Step 5: Commit.** `docs: Cards and notes (Plan B)`
- [ ] **Step 6: Push** `phase2-b` and watch CI. Don't merge or tag: the controller releases v0.12.0.

---

## Calls in this plan

For the maintainer to review; each gets a DECISIONS line when it lands.

1. **Package layering** (Task 1): `@drafter/notes` depends only on `@drafter/fountain`; `@drafter/outline`, `@drafter/lint`, and `@drafter/cm-fountain` depend on it. §21's "each package depends only on fountain, templates, layout" is read as a bar on third-party and upward edges; these are workspace edges downward.
2. **Shared helpers move down** (Task 1): one-line bodies, taking a line out, the stray-`/*` gate, line breaks, and the scene palette move from `@drafter/outline` to `@drafter/notes`; outline re-exports what it exported in v0.11.0.
3. **Writing a header stays in `@drafter/outline`** (Task 3, `setSceneDetails`), since it needs a `Scene`; `@drafter/notes` owns the note format and the field order. §21 lists "scene headers" under notes.
4. **What a head is** (Task 1): letters, spaces, and `' . - ? !`, starting with a letter; a category or person head needs whitespace or the end after its colon. A URL or a time is never a head.
5. **Resolve, Reopen, and Set category touch only the tags;** Edit rewrites the note exactly (Task 2).
6. **A new note, Setup, or Payoff goes at the end of the cursor's line,** after one space (Tasks 2, 8, 9).
7. **Reply waits for Plan G;** Plan B shows replies nested under the person's earlier note (Tasks 2, 8).
8. **No Notes tab for Markdown documents in Plan B,** though §5.7 says Notes work there: a Markdown document has no `[[…]]` parse to list. Recorded in DEFERRED for the maintainer.
9. **Cards and Notes are not core tabs:** they share the slot and More, first in More (Task 6).
10. **Cards are a listbox with a group per section** and 2-D arrow keys (Task 6); Alt+Up and Alt+Down move by a drawn row (Task 7).
11. **Card size** is a setting, `cardSize`, small/medium/large, default medium, on the Cards slim bar (Task 6).
12. **Scene details' Storyline is plain text** until Plan E brings storyline names and colors (Task 3).
13. **The Notes tab's keys:** Enter, E, R, C, Delete, and the menu keys on a focused row (Task 8).
14. **On a phone, the Notes filters are a dialog** like Move to… (Task 8).
15. **The open-notes badge counts My notes and Readers,** not setups, payoffs, or boneyard (Task 8).
16. **A stale note action changes nothing and says so** (`findEntry`, Tasks 2 and 8).
17. **`duplicate-field` finds scenes itself,** with a test in outline that it agrees with the scene index (Task 4).
18. **Setup labels are offered by the editor's completion** (Task 9).
19. **One live region for every structure view:** Cards and Notes speak through `sayOutline`.
