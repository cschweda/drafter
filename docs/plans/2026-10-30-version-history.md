# Version history (v0.18.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship version history (v0.18.0): a **Deleted scenes** tab listing every scene in some snapshot but not in the script now, with **Put back** at its old place (one undo); **Show changes** on the Script pane against the last save or a chosen snapshot; a GitHub-style **Changes** view in Compare (+/− rows, word highlights, folds, groups by scene, unified or side by side, red and green or blue and orange); and **History of this scene** from the Outline, Cards, the Structure strip, and the palette.

**Architecture:** `@drafter/compare` gains a parse-free row model (`diffWords`, `diffRows`, `foldRows`, `groupRows`, `pairRows`). A new pure package, `@drafter/history`, turns a text into scene prints (hash, heading key, bottom-k sketch of three-word shingles) and answers which scenes are deleted, a scene's versions, and where Put back goes. In `apps/web`, a history worker reads snapshots newest first, lazily, caching prints in a separate IndexedDB database (`drafter-cache`); the layout worker adds Show changes' marks as a second reply; `createScriptView` gains a `decorate` hook for live marks.

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Dexie 4 (main thread and worker), Vitest with fast-check, Playwright 1.64. No new third-party dependency.

**Spec:** [`docs/drafter-version-history-design.md`](../drafter-version-history-design.md) (all of it; its 36 Calls are binding). Context: Phase 2 design §5.1–5.2 (scene index, scene ids), §11 (snapshots and Compare), §22 (plan list); `docs/DECISIONS.md` § Plan C (Myers, marks by span, Compare's tab and worker, History's list pattern, no Dexie bump) and 2026-10-29 (growth-based timing tests); `packages/compare/README.md`.

## Global Constraints

- Branch `version-history` (worktree `scratchpad/drafter-vh`), from `main` at v0.16.0 (`9d09198`). **v0.17.0 is on another branch:** merge `main` into this branch once v0.17.0 has merged, before Task 8 at the latest (README, CHANGELOG, Settings, commands, and §22 of the Phase 2 design will conflict), then `pnpm install`.
- **Clean room:** no code, markup, stylesheets, icons, or words from GitHub, Final Draft, any diff viewer, or any diff, MinHash, or hashing library. Myers is `@drafter/compare`'s own `diffLines`; the hash and the sketch are written from their textbook descriptions. Every test script and fixture is original text written for Drafter; generated scripts use invented words.
- **No new third-party dependency.** `@drafter/history` depends on `@drafter/fountain`, `@drafter/outline`, `@drafter/templates` (workspace) only; it gets a `docs/DEPENDENCIES.md` row (workspace package, no third-party code) in Task 2 before it is added to `apps/web`.
- **The `drafter` database stays at version 1.** Prints live in `drafter-cache` (Call 13). The snapshot rows are never written by this release.
- **Show changes never prints, exports, or saves,** and never changes a layout. Nothing is named "revision".
- **Copy (exact):** "Deleted scenes"; "Last in {when} ({reason or label})"; "In {n} versions, from {date}"; "Reading versions… {i} of {n}"; "No deleted scenes. Every scene in your versions is still in the script."; "{n} versions couldn’t be read."; "Only the newest 1,000 versions were read."; "Put back {heading} after {heading}. Undo takes it out." (or "before {heading}", or "at the end of the script"); "A Markdown document has no scenes."; "A Markdown document’s changes are in Compare."; "Nothing to compare with yet: save, or take a snapshot."; "Show {n} unchanged lines"; "Large change: {n} lines. Show"; "No changes: the two versions are the same."; "That scene isn’t in the script now."; "{heading} is as it was on {when}. Undo brings back what it replaced."; "Before restoring a scene"; Settings **Colors for changes**: **Red and green**, **Blue and orange**.
- **Budgets** (design §3.4, §4.2): prints of one 120-page snapshot ≤ 40 ms; cold scan of 300 ≤ 10 s with first rows ≤ 1 s; warm scan ≤ 500 ms; matching now ≤ 50 ms; Show changes adds ≤ 30 ms per layout; no main-thread long task. Unit timing is by growth (`scaling`, n and 4n, growth under 8, copied as `packages/render-pdf/test/scaling.ts` was); e2e logs times and fails only past 10× the budget (hang guard).
- **Accessibility:** the WCAG 2.2 AA approach of the rest: keyboard for everything, hidden "added, " / "removed, " / "changed, " words, signs hidden from screen readers, not color alone, both themes, phones. The token contrast test is in Task 4; **axe on the new views waits for the final accessibility steps** (Call 36), and the existing axe tests stay green.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]` in the writer's words; choices in `docs/DECISIONS.md` under a new `## Version history (`@drafter/compare`, `@drafter/history`, `apps/web`)` section (each Call a line when it lands); conventional commits with **no AI co-author trailer and no session link**; the README kept in sync (Task 8 does the status line, roadmap, packages, and features).

## Review Focus

1. **The same heading many times** (five "INT. CAR - NIGHT" scenes, one deleted; or a scene split into two under one heading): the deleted one is listed and the others aren't; a split scene isn't listed. Task 2's fixtures `lists the one car scene deleted of five` and `a split scene is not deleted`.
2. **Put back when the neighbours changed too** (P deleted as well, N renamed, the scene first or last in the script, a section heading between): it lands next to the nearest surviving neighbour on the right side of the section, or at the end, and never inside another scene. Task 2's property `put back inserts at a scene boundary and adds exactly the scene's text` and fixtures `opens Act Two after # ACT TWO`, `falls back to the next neighbour out`.
3. **Snapshots that can't be read or are huge** (a damaged `gz`, a browser without `DecompressionStream`, a 300-page script, 1,000+ snapshots, a snapshot deleted mid-scan, the script switched mid-scan): the scan skips and counts, caps, cancels, and never shows another script's scenes. Task 3's `skips an unreadable snapshot and counts it`, `a newer request stops the older`, `never answers for another project`.
4. **Show changes while typing fast and while the baseline changes** (save during typing; the baseline snapshot deleted): marks always match the pages drawn (never offset by a keystroke) and fall back to Last save with one notice. Task 5's `marks come with the layout's own seq` and e2e `typing keeps the marks on the right lines`.
5. **Pathological diffs** (two unrelated 5,000-line scripts; a 20,000-character line; a script turned to all-caps; CRLF against LF): the Changes view draws its summary and first groups within budget, collapses large groups, skips word marks on giant lines, and treats `\r\n` as `\n`. Task 1's `diffWords skips lines past 2,000 tokens`, `CRLF and LF read the same`, and Task 4's e2e `a whole rewrite draws collapsed groups quickly`.

---

### Task 1: Rows, words, folds, and groups (`@drafter/compare`)

**Files:**
- Create: `packages/compare/src/{words.ts,rows.ts}`, `packages/compare/test/{words.test.ts,words.properties.test.ts,rows.test.ts,rows.properties.test.ts,rows-scaling.test.ts,scaling.ts}`
- Modify: `packages/compare/src/index.ts`, `packages/compare/README.md` (a "Rows for a diff view" section)

**Interfaces (Produces):**
```ts
// words.ts
export interface WordPart { text: string; kind: 'same' | 'added' | 'removed' }
/** Call 24: tokens (letters/digits/'’ runs, whitespace runs, other single chars), diffLines on them,
 *  unchanged runs of only whitespace or ≤ 2 chars between two changes folded in. Null past 2,000 tokens a side. */
export function diffWords(older: string, newer: string): { removed: WordPart[]; added: WordPart[] } | null;
/** Dice over the two lines' word tokens, 0–1. */
export function lineSimilarity(a: string, b: string): number;
export const PAIR_MIN = 0.4; export const MAX_TOKENS = 2000;
// rows.ts
export interface DiffRow { kind: 'same' | 'added' | 'removed'; old: number | null; new: number | null; text: string; change: number | null; pair: number | null } // line numbers 0-based; pair: index of the paired row (Call 23)
export function diffRows(older: string, newer: string): { rows: DiffRow[]; changes: Change[] };
export type Piece = { kind: 'rows'; from: number; to: number } | { kind: 'fold'; from: number; to: number };
export const CONTEXT = 3; export const FOLD_STEP = 200; export const LARGE_GROUP = 400;
export function foldRows(rows: readonly DiffRow[], from: number, to: number): Piece[];
export interface Anchor { line: number; title: string }
export interface RowGroup { from: number; to: number; title: string; tag: 'same' | 'new' | 'deleted' | 'renamed' | 'opening'; renamedFrom: string | null; added: number; removed: number; changes: number[] }
export function groupRows(rows: readonly DiffRow[], oldAnchors: readonly Anchor[], newAnchors: readonly Anchor[]): RowGroup[];
export interface SplitRow { left: number | null; right: number | null } // indices into rows
export function pairRows(rows: readonly DiffRow[], from: number, to: number): SplitRow[];
/** Lines starting a Markdown heading of level 1–3, skipping fenced code (Call 21). */
export function markdownAnchors(text: string): Anchor[];
```

- `diffRows` builds on `changesOf`: same rows from the runs, a change's removed rows then its added rows; `change` is the change's index; pairing by position within a `changed` change when `lineSimilarity ≥ PAIR_MIN`.
- `groupRows` cuts at a row whose line (old for removed, new otherwise) is an anchor of its side; a removed anchor row paired with an added anchor row is one `renamed` group; rows before the first anchor are `opening`. Groups with no changes are kept in the result (the view hides them) so ranges tile `rows`.

- [ ] **Step 1: Write the failing tests.** `words.test.ts`: `marks a changed word in a line`, `folds a single space between two changes into one change` ("the cat sat" → "a dog stood": one removed part, one added part, around nothing), `keeps punctuation as its own token`, `reads ’ and ' inside a word as part of it`, `returns null past 2,000 tokens a side`, `lineSimilarity is 1 for equal lines and 0 for disjoint`. `words.properties.test.ts`: `joining same+removed gives the older line and same+added the newer`. `rows.test.ts`: `numbers rows on both sides`, `pairs a changed line with its replacement when similar`, `leaves dissimilar lines unpaired`, `CRLF and LF read the same`, `folds unchanged stretches longer than 2 × CONTEXT`, `a fold over 200 lines opens 200 at a time` (as pieces), `groups by scene heading anchors`, `a scene only in the older text is a deleted group`, `a renamed heading is one renamed group`, `rows before the first anchor are the opening group`, `markdownAnchors skips headings inside fenced code and takes levels 1–3 only`, `pairRows aligns removed left and added right with blanks`. `rows.properties.test.ts` (random line edits): `groups tile the rows in order`, `every change is in exactly one group`, `pieces tile a range and no fold is shorter than 2 × CONTEXT + 1`. `rows-scaling.test.ts`: `diffRows and groupRows grow linearly` (near-identical scripts, n and 4n).
- [ ] **Step 2: Copy `packages/fdx/test/scaling.ts`** to `packages/compare/test/scaling.ts` with a first line naming its origin.
- [ ] **Step 3: Run them.** `pnpm --filter @drafter/compare test` → FAIL.
- [ ] **Step 4: Implement** `words.ts` and `rows.ts`; export them.
- [ ] **Step 5: Run them again,** and `pnpm -r typecheck`. → PASS.
- [ ] **Step 6: Commit.** `feat(compare): diff rows with word changes, folds, and groups`

---

### Task 2: Scene prints, deleted scenes, versions, and Put back (`@drafter/history`)

**Files:**
- Create: `packages/history/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}`, `packages/history/src/{index.ts,hash.ts,print.ts,match.ts,deleted.ts,versions.ts,put-back.ts,anchors.ts}`, `packages/history/test/{hash.test.ts,print.test.ts,match.test.ts,deleted.test.ts,versions.test.ts,put-back.test.ts,put-back.properties.test.ts,scaling.test.ts,scaling.ts,scripts.ts}`
- Modify: `docs/DEPENDENCIES.md` (first: a row for `@drafter/history`), `pnpm-workspace` nothing (packages/* already), root `tsconfig` references if the repo lists packages

**Interfaces (Consumes):** `parse` (`@drafter/fountain`), `sceneIndex`, `Scene` (`@drafter/outline`), `builtins`, `Template` (`@drafter/templates`), `Anchor` (Task 1). **(Produces):**
```ts
export function hash53(text: string): string; // 14 hex digits
export const SKETCH_K = 64; export const PRINT_VERSION = 1;
export const MATCH = { containment: 0.25, jaccard: 0.5 } as const;
export interface ScenePrint { hash: string; headingKey: string; heading: string; shingles: number; sketch: Uint32Array; words: number; preview: string }
export interface SceneSlot { hash: string; ordinal: number; from: number; to: number; section: boolean } // section: a section heading came right before it
export interface SnapshotScenes { slots: SceneSlot[]; prints: ScenePrint[] } // prints of this text's distinct versions
/** Parses `text` with the template it names (else the screenplay), and prints each scene. */
export function scenePrints(text: string, known?: (hash: string) => boolean): SnapshotScenes; // skips shingling for hashes `known` has
export function headingKey(heading: string): string;
export function similarity(a: ScenePrint, b: ScenePrint): { jaccard: number; containment: number };
export function sameScene(a: ScenePrint, b: ScenePrint): boolean; // Call 6
export interface PastSnapshot { id: string; at: number; slots: readonly SceneSlot[] }
export interface DeletedScene { key: string; newest: { snapshot: string; at: number; slot: SceneSlot; print: ScenePrint }; versions: number; oldestAt: number }
/** Newest first by `newest.at` (Call 7). `snapshots` newest first; `prints` by hash. */
export function deletedScenes(snapshots: readonly PastSnapshot[], prints: ReadonlyMap<string, ScenePrint>, now: readonly ScenePrint[]): DeletedScene[];
export interface SceneVersion { hash: string; snapshots: string[]; newestAt: number; oldestAt: number; slot: SceneSlot } // consecutive equal hashes merged (Call 29)
export type VersionRow = SceneVersion | { gap: true; snapshots: string[] };
export function sceneVersions(start: ScenePrint, snapshots: readonly PastSnapshot[], prints: ReadonlyMap<string, ScenePrint>): VersionRow[]; // Call 28
export type Place = { at: number; side: 'after' | 'before'; anchor: string } | { at: number; side: 'end'; anchor: null };
export function putBackPlace(snapshot: readonly SceneSlot[], index: number, prints: ReadonlyMap<string, ScenePrint>, nowScenes: readonly { print: ScenePrint; from: number; to: number }[], nowLength: number): Place; // Call 11
export function putBackChanges(nowText: string, place: Place, sceneText: string): TextChange[]; // one blank line each side
export function sceneAnchors(text: string): Anchor[]; // scene-heading lines, for groupRows
```

- Shingles over printed words of the scene's blocks (not notes, boneyard, synopses, sections, or the heading), lowercased, with the scene index's word pattern; each shingle hashed to 32 bits with the same lanes as `hash53`; keep the `SKETCH_K` smallest distinct values, sorted.
- `similarity`: merge the two sketches' values, take the `SKETCH_K` smallest of the union, J = how many of those are in both / how many were taken; C per design §3.2. Exact when both sets fit in the sketch.
- `deletedScenes`: resolve each distinct hash once: in `now` by hash, else by `headingKey` group, else against all of `now`; group deleted versions per design §3.3.

- [ ] **Step 1: Update `docs/DEPENDENCIES.md`,** scaffold the package as `@drafter/compare` is (same scripts, `version` matching the others), `pnpm install`.
- [ ] **Step 2: Write the failing tests.** `scripts.ts` holds original fixture scripts (a 12-scene screenplay with an act structure, its variants, a 6-scene stage play). `hash.test.ts`: `hash53 is stable` (pinned values), `differs for one changed character`. `print.test.ts`: `prints every scene of a screenplay and a stage play`, `headingKey drops the locked number, folds dashes and case`, `notes and synopses don't change the sketch`, `a scene under 3 words has one shingle`, `known hashes are not shingled again` (counting stub), `slots mark a scene that follows a section heading`. `match.test.ts`: `equal text is the same scene`, `a scene cut to a quarter under its heading is the same`, `a renamed heading with the text kept is the same`, `a rewrite under a new heading is not`, `similarity is exact for small scenes and within 0.15 of the truth for large ones` (property over random word sets). `deleted.test.ts`: `lists a scene removed since a snapshot`, `lists the one car scene deleted of five`, `a split scene is not deleted`, `two merged scenes are not deleted`, `a moved scene is not deleted`, `one entry across many versions, dated by the newest`, `newest deleted first`. `versions.test.ts`: `follows a scene renamed and rewritten bit by bit`, `merges consecutive equal versions`, `a snapshot without the scene is a gap and the walk goes on`. `put-back.test.ts`: `goes after its old previous scene`, `opens Act Two after # ACT TWO`, `closes Act One before # ACT TWO`, `falls back to the next neighbour out`, `goes at the end when no neighbour is left`, `keeps one blank line each side`. `put-back.properties.test.ts` (Outline's arbitraries, copied into `test/`): `put back inserts at a scene boundary and adds exactly the scene's text`, `after put back the scene is no longer deleted`. `scaling.test.ts`: `scenePrints grows linearly`, `deletedScenes grows linearly in snapshots` (300 vs 1,200 near-identical snapshots of 150 scenes from cached prints) and `matching 150 scenes now against cached prints of 300 snapshots finishes` (logs time; the 50 ms budget is checked in Task 3's e2e).
- [ ] **Step 3: Run them.** `pnpm --filter @drafter/history test` → FAIL.
- [ ] **Step 4: Implement** the modules in the order hash, print, match, deleted, versions, put-back, anchors.
- [ ] **Step 5: Run them again,** `pnpm -r typecheck`, `pnpm check`. → PASS.
- [ ] **Step 6: Commit.** `feat(history): scene prints, deleted scenes, scene versions, and put back`

---

### Task 3: The history worker and the prints cache (`apps/web`)

**Files:**
- Create: `apps/web/app/history/{cache.ts,client.ts,protocol.ts}`, `apps/web/app/workers/{history.worker.ts,history-compute.ts}`, tests `apps/web/test/history-cache.test.ts`, `apps/web/test/history-compute.test.ts`, e2e `apps/web/e2e/history-scan.spec.ts`
- Modify: `apps/web/package.json` (`@drafter/history`), `apps/web/app/storage/projects.ts` (`removeProject` clears the cache after its transaction), `apps/web/app/pages/docs/privacy.vue` (the cache holds scene headings and previews; removed with the script)

**Interfaces (Consumes):** Task 2. **(Produces):**
```ts
// protocol.ts
export type HistoryRequest =
  | { seq: number; kind: 'deleted'; projectId: string; now: string }
  | { seq: number; kind: 'versions'; projectId: string; now: string; scene: { from: number; to: number } | { snapshot: string; slot: number } }
  | { seq: number; kind: 'cancel' };
export type HistoryReply =
  | { seq: number; kind: 'progress'; read: number; total: number; unreadable: number; capped: boolean }
  | { seq: number; kind: 'deleted'; scenes: DeletedScene[]; done: boolean }
  | { seq: number; kind: 'versions'; rows: VersionRow[]; done: boolean }
  | { seq: number; kind: 'error'; message: string };
export const MAX_SNAPSHOTS = 1000; export const STREAM_MS = 100;
// cache.ts (Dexie 'drafter-cache', version 1: prints '[projectId+hash], projectId'; snapshotScenes 'id, projectId')
export function cacheDb(): CacheDb | null; // null when it can't open: scan without it
export async function clearProjectCache(projectId: string): Promise<void>;
export async function sweep(projectId: string, liveIds: ReadonlySet<string>): Promise<void>;
// client.ts: made on first use by a view, ended when the last view closes
export interface HistoryClient { request(r: Omit<HistoryRequest, 'seq'>, on: (reply: HistoryReply) => void): number; release(): void }
export function useHistoryClient(): HistoryClient;
/** The text of one snapshot's scene, for Show text, Put back, and Use this version (main thread, one gunzip). */
export async function sceneText(snapshotId: string, slot: Pick<SceneSlot, 'from' | 'to'>): Promise<string | null>;
```

- `history-compute.ts` is the worker's logic, behind two small interfaces (`SnapshotSource`: list and read rows; `PrintStore`: the cache), tested in Node with `fake-indexeddb` (already a development dependency of `apps/web`).
- The scan: list rows (`projectId` index, history rows only, newest first, capped), for each: cache hit by `snapshotScenes.id` with `PRINT_VERSION`, else read, gunzip (`storage/gzip.ts` works in a worker), `scenePrints(text, known)`, store; post progress and results at most every `STREAM_MS`; check for a newer `seq` between snapshots. End of a full scan: `sweep`.

- [ ] **Step 1: Write the failing tests.** `history-cache.test.ts`: `stores and reads prints once per scene version`, `a row of another PRINT_VERSION is a miss`, `sweep drops rows of gone snapshots and prints nothing names`, `clearProjectCache leaves other scripts alone`, `removeProject clears the script's cache`. `history-compute.test.ts`: `lists deleted scenes newest first as it reads`, `reads each snapshot once, then from the cache`, `skips an unreadable snapshot and counts it`, `stops at 1,000 snapshots and says so`, `a newer request stops the older`, `never answers for another project`, `streams no more often than every 100 ms` (fake clock), `versions follow a scene by its span now or by a snapshot slot`, `scans without a cache when it can't open, with the same results`. e2e `history-scan.spec.ts` (seeded with `e2e/bulk-snapshot.ts`): `a cold scan of 300 snapshots of a 120-page script lists its first rows quickly and finishes` (logs both times; fails past 10 s and 100 s), `a warm scan is fast` (logs; fails past 5 s), `typing during a scan makes no long task` (PerformanceObserver `longtask`).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** `protocol.ts`, `cache.ts`, `history-compute.ts`, `history.worker.ts`, `client.ts`, the `removeProject` change, and the Privacy page sentence.
- [ ] **Step 4: Run them again,** with `pnpm --filter @drafter/web e2e history-scan`. → PASS. Record the measured times in DECISIONS.
- [ ] **Step 5: Commit.** `feat(web): a history worker that reads snapshots lazily and caches scene prints`

---

### Task 4: Compare's Changes view

**Files:**
- Create: `apps/web/app/compare/{rows.ts,colors.ts}`, `apps/web/app/components/{DiffView.vue,DiffGroup.vue,DiffRow.vue}`, tests `apps/web/test/compare-rows.test.ts`, `apps/web/test/diff-colors.test.ts`, e2e `apps/web/e2e/compare-changes.spec.ts`
- Modify: `apps/web/app/compare/use-compare.ts` (view, stops in the Changes view, `openAt(sceneKey)`), `ComparePane.vue`, `CompareSlim.vue` (the two groups), `compare/draw.ts` (+/− marks; asterisk off screen), `compare/labels.ts` (text-view labels), `settings/settings.ts` + `SettingsDialog.vue` (`diffColors`, `compareView`, `diffLayout`), `assets/css` theme tokens, `commands/data.ts` + `builtin.ts` (`compare-changes-view`, `compare-pages-view`), `e2e/compare.spec.ts` (asterisk → sign)

**Interfaces (Consumes):** Task 1; `sceneAnchors`, `scenePrints`, `sameScene` (Task 2). **(Produces):**
```ts
// compare/rows.ts
export interface DiffModel { rows: DiffRow[]; groups: RowGroup[]; summary: { scenes: number; added: number; deleted: number; linesAdded: number; linesRemoved: number } }
export function diffModel(older: string, newer: string, kind: DocumentKind): DiffModel;
export function goToScene(group: RowGroup, comparison: Comparison): { offset: number } | { gone: true }; // design §5.2
// settings: diffColors: 'red-green' | 'blue-orange' ('red-green'); compareView: 'changes' | 'pages' ('changes'); diffLayout: 'unified' | 'split' ('unified')
// compare/colors.ts
export const DIFF_TOKENS: Record<'red-green' | 'blue-orange', Record<'light' | 'dark', Record<string, string>>>;
export function contrast(fg: string, bg: string): number;
export const SPLIT_MIN_PX = 720;
```

- `DiffView.vue` draws the summary, the visible groups (`DiffGroup`), each group's pieces (`foldRows`), rows (`DiffRow`, unified) or a `<table>` (split, `pairRows`), word parts from `diffWords` computed when a pair is drawn. Rows render only for open groups; a group over `LARGE_GROUP` changed lines starts closed. Each row: numbers and sign `aria-hidden`, a `drafter-sr-only` "added, " / "removed, ", `data-change` on a change's first row, `tabindex="-1"`. Inserted words `<span class="diff-word-add">` (underlined), deleted `<span class="diff-word-del">` (struck through).
- The theme tokens are set on `:root` from `DIFF_TOKENS` by `data-diff-colors`; values are the implementer's, Drafter's own, passing the test below.

- [ ] **Step 1: Write the failing tests.** `diff-colors.test.ts`: `text on every tint is at least 4.5:1`, `signs on their tints are at least 4.5:1`, `bars and rules on the page are at least 3:1` (both palettes, both themes). `compare-rows.test.ts`: `groups a screenplay by scene`, `a stage play groups at ## scenes`, `a Markdown document groups at headings 1–3`, `summary counts changed, new, and deleted scenes`, `goToScene uses the offset when now is unchanged`, `goToScene finds the matching scene after edits`, `goToScene says gone for a deleted scene`. e2e `compare-changes.spec.ts`: `opens on Changes with + and − rows`, `marks changed words, underlined and struck through`, `Show 40 unchanged lines opens the fold`, `a group header goes to its scene`, `side by side shows Before and After columns, and is hidden on a phone`, `N and Shift+N step through changes in the Changes view`, `the choice of view and layout is remembered`, `Blue and orange recolors the view`, `a whole rewrite draws collapsed groups quickly` (two unrelated 5,000-line scripts; logs; fails past 5 s), `Pages shows + and − instead of asterisks`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.** Settings first (with `isValid` cases), then tokens, model, components, slim bar, commands, and the Pages restyle.
- [ ] **Step 4: Run them again,** plus `compare.spec.ts`, `settings.spec.ts`, `a11y.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): a Changes view in Compare, grouped by scene, with word changes and folds`

---

### Task 5: Show changes on the Script pane

**Files:**
- Create: `apps/web/app/compare/{live.ts,baseline.ts}`, `apps/web/app/components/ChangesToggle.vue`, tests `packages/render-html/test/decorate.test.ts`, `apps/web/test/baseline.test.ts`, `apps/web/test/layout-marks.test.ts`, e2e `apps/web/e2e/show-changes.spec.ts`
- Modify: `packages/render-html/src/view.ts` (`decorate`, `redecorate`), `apps/web/app/editor/layout-client.ts` + `workers/compute.ts` (baseline and the marks reply), `editor/layout.ts` (`marks`), `components/ScriptPane.vue`, `components/AppPane.vue` (the toggle in the Script slim bar), `HistoryDialog.vue` (row menu: Show changes since this), `commands/data.ts` + `builtin.ts` (`show-changes`; `next-change`/`previous-change` fall through to the Script pane), `pages/docs/shortcuts.vue`

**Interfaces (Consumes):** `markPages`, `changesOf`, `stepChange`; `markPage` (restyled in Task 4). **(Produces):**
```ts
// render-html
export interface ScriptViewOptions { /* … */ decorate?: (el: HTMLElement, page: Page) => void }
export interface ScriptView { /* … */ redecorate(): void }
// layout-client.ts
export type LayoutRequest = { seq: number; source: string; template: Template; baseline?: { id: number; text?: string } };
export type LayoutReply = { seq: number; layout: Layout } | { seq: number; marks: PageMarks } | { seq: number; error: string };
// compare/baseline.ts
export type Baseline = { kind: 'saved' } | { kind: 'first' } | { kind: 'snapshot'; id: string; label: string };
export interface ShowChanges { on: Ref<boolean>; baseline: Ref<Baseline>; why: ComputedRef<string | null>; choices: ComputedRef<{ baseline: Baseline; label: string }[]>; toggle(): void; since(b: Baseline): void; step(direction: 1 | -1): void }
export function useShowChanges(): ShowChanges;
// compare/live.ts
export function markLive(view: ScriptView, marks: PageMarks | null): void; // unmark pages that had marks, mark pages that have them
```

- The layout client sends the baseline's text only when its id changed; the worker keeps one. The marks reply follows its layout; `useLayout` keeps `marks` only when its seq equals `shownSeq`.

- [ ] **Step 1: Write the failing tests.** `decorate.test.ts` (in the DOM environment `view.test.ts` uses): `decorate runs for each drawn and each kept page`, `redecorate runs it again on every page`. `layout-marks.test.ts`: `answers the layout, then marks with the same seq`, `sends the baseline text once per id`, `no baseline, no marks reply`. `baseline.test.ts`: `defaults to the last save`, `falls back to the first version without a save`, `is off with a reason with neither`, `a deleted baseline falls back to Last save and says so once`, `is off for Markdown with its reason`, `is not remembered`. e2e `show-changes.spec.ts`: `marks an added line with + and a hidden "added, "`, `a removed-lines button shows the lines struck through`, `saving clears the marks`, `since a labelled snapshot from the menu`, `Show changes since this from History`, `typing keeps the marks on the right lines`, `N steps through marks in the Script pane`, `off leaves the pages clean and the PDF unchanged` (export bytes equal with it on and off), `typing in a 120-page script with it on makes no long task`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** render-html first, then the worker reply, `useLayout`, `baseline.ts`, `live.ts`, the toggle, the menus and commands.
- [ ] **Step 4: Run them again,** plus `script.spec.ts`, `history.spec.ts`, `compare.spec.ts`, `scroll-sync.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): Show changes on the Script pane, since the last save or a chosen version`

---

### Task 6: The Deleted scenes tab and Put back

**Files:**
- Create: `apps/web/app/history/{deleted.ts,labels.ts,put-back.ts}`, `apps/web/app/components/{DeletedPane.vue,DeletedSlim.vue}`, tests `apps/web/test/deleted-labels.test.ts`, `apps/web/test/put-back-app.test.ts`, e2e `apps/web/e2e/deleted-scenes.spec.ts`
- Modify: `utils/panes.ts` (`DELETED_TAB`, open and drop like Compare's), `components/AppPane.vue`, `HistoryDialog.vue` (a Deleted scenes button in its header), `commands/data.ts` (`deleted-scenes`; `keywords?: string[]` on `CommandData`) + `builtin.ts` + `palette.ts` (search reads keywords), `components/AppMenu.vue`, `commands/desktop-menu.ts` if it lists by hand, `pages/docs/shortcuts.vue` (the list's keys), `components/DiffGroup.vue` (a Deleted scene group's **Find in Deleted scenes** link opens the tab at that entry)

**Interfaces (Consumes):** Task 3's client and `sceneText`; Task 2's `putBackPlace`, `putBackChanges`; `useOutline().apply`, `readOnly`. **(Produces):**
```ts
export interface DeletedSession { open(): void; close(refocus?: boolean): void; rows: Readonly<ShallowRef<DeletedScene[]>>; progress: Readonly<Ref<{ read: number; total: number; unreadable: number; capped: boolean } | null>>; filter: Ref<string>; shown: ComputedRef<DeletedScene[]> }
export function useDeleted(): DeletedSession;
export function putBack(entry: DeletedScene): Promise<boolean>; // design §3.5; says what it did
export function lastInLabel(entry: DeletedScene, info: SnapshotInfo | undefined, now: number): string; // "Last in Tuesday, 27 October, 10:42 (Saved)"
```

- The list follows History's listbox pattern (one Tab stop; Up/Down/Home/End; Enter Show text; P Put back; H History of this scene; context-menu key or Shift+F10 the row menu). Filter folds case and accents. The tab's current text is re-sent to the worker 1 s after typing stops.

- [ ] **Step 1: Write the failing tests.** `deleted-labels.test.ts`: `last in says the day, time, and reason or label`, `in n versions from a date`, `the filter folds case and accents`. `put-back-app.test.ts`: `put back is one undo`, `refused with the Outline's reason in a read-only tab`, `says after, before, or at the end`, `moves the cursor to the scene and keeps focus in the list`. e2e `deleted-scenes.spec.ts`: `lists a scene deleted since a snapshot, with its preview`, `Put back puts it between its old neighbours and Undo takes it out`, `the entry leaves the list after Put back`, `Show text shows the whole scene`, `Compare that version with now opens Compare at the scene`, `the palette finds it by "show all versions"`, `a Markdown document says it has no scenes`, `a sample says snapshots aren't kept`, `keys work in the list`, `on a phone it is the pane's tab`, `Close puts focus on the tab that replaces it`, `Find in Deleted scenes from a Compare group focuses the entry`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `tabs.spec.ts`, `palette.spec.ts`, `history.spec.ts`, `phone.spec.ts`, `panel-keys.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): a Deleted scenes tab, with Put back`

---

### Task 7: History of this scene

**Files:**
- Create: `apps/web/app/history/scene-history.ts`, `apps/web/app/components/SceneHistoryDialog.vue`, tests `apps/web/test/scene-history.test.ts`, e2e `apps/web/e2e/scene-history.spec.ts`
- Modify: `outline/scene-menu.ts` (History of this scene…), `components/StructureStrip.vue` + `strip/keys.ts` (the block menu, Call 31), `storage/snapshots.ts` + `snapshots/labels.ts` (`before-scene-restore`, "Before restoring a scene"), `snapshots/use-snapshots.ts` (the `before` type admits it), `commands/data.ts` + `builtin.ts` (`scene-history`, Go), `DeletedPane.vue` (H and its button), `pages/docs/shortcuts.vue`

**Interfaces (Consumes):** Task 3's `versions` request and `sceneText`; Task 4's `DiffView` (one group, `diffLayout`). **(Produces):**
```ts
export const sceneHistoryOpen: Ref<{ from: number; to: number; heading: string } | { snapshot: string; slot: number; heading: string } | null>;
export function useThisVersion(version: SceneVersion): Promise<boolean>; // before-scene-restore, then one apply; design §6.1
export function versionKey(count: number, focused: number, key: string): { focus?: number; action?: 'compare' | 'use' | 'menu' } | null;
```

- [ ] **Step 1: Write the failing tests.** `scene-history.test.ts`: `versionKey moves and acts as History's`, `use this version takes a snapshot first and is one undo`, `refused for a deleted scene and in a read-only tab`. e2e `scene-history.spec.ts`: `opens from the Outline's menu, the Cards' menu, the strip's block menu, and the palette`, `lists one row per distinct version, newest first`, `follows a scene through a renamed heading`, `compares a version with now and with the version before`, `Use this version restores the scene and Undo brings it back`, `History lists Before restoring a scene`, `the strip's menu opens with Shift+F10 and the context-menu key`, `fills the screen on a phone`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `outline.spec.ts`, `cards.spec.ts`, `strip.spec.ts`, `snapshots.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): History of this scene, from the Outline, Cards, the strip, and the palette`

---

### Task 8: The docs and release prep

**Files:**
- Modify: `README.md`, `docs/drafter-phase2-design.md` (§22 and §26), `docs/drafter-architecture.md` (§13's version history line becomes v0.18.0), `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`, `pages/docs/saving.vue` (History, Deleted scenes, Show changes), `packages/compare/README.md`, `packages/history/README.md`

- [ ] **Step 1: Merge `main`** if v0.17.0 has landed and isn't merged yet; `pnpm install`; resolve the README, CHANGELOG, Settings, commands, and §22 conflicts keeping both releases.
- [ ] **Step 2: README** (stay near 5,000 words): the status line names version history among what's built and "Next" names the imports release; the Phase 2 roadmap row adds "version history with deleted scenes, Show changes, and GitHub-style diffs (v0.18.0)"; the Packages table gets `@drafter/history`; the features list a line for Deleted scenes and Put back, Show changes, the Changes view, and History of this scene; Design documents links this design.
- [ ] **Step 3: The Phase 2 design.** §22: a heading `### Version history — v0.18.0` after v0.17.0's (or after the Markdown PDF's, if v0.17.0 hasn't added one), **Status:** built, axe deferred, pointing to this design and plan; one sentence that Plans E to H stay v0.19.0 to v0.22.0 and that the imports release, next, takes v0.19.0 and moves them to v0.20.0 to v0.23.0. §26 records the change.
- [ ] **Step 4: DECISIONS, DEFERRED, CHANGELOG.** Every Call (design §15) and this plan's in the Version history section, as each landed. DEFERRED gets a `## Version history` group with design §13's list and axe on Deleted scenes, Scene history, the Changes view, and Show changes. CHANGELOG `[Unreleased]` has the features under Added, in the writer's words, and the Compare restyle under Changed.
- [ ] **Step 5: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e` (the File and View menus list the new commands). → PASS.
- [ ] **Step 6: Commit.** `docs: version history`
- [ ] **Step 7: Push** `version-history` and watch CI. Don't merge or tag: the controller releases v0.18.0.

---

## Calls in this plan

The design's 36 Calls (its §15) are binding. This plan adds:

37. **Eight tasks, packages first** (Tasks 1–2 pure, then the worker, then each view), so each view's task starts on tested models.
38. **Merge v0.17.0 before Task 8 at the latest** (Global Constraints), since both releases edit the same docs, Settings, and commands.
39. **`keywords` on `CommandData`,** read by the palette's search, for "show all versions" (Task 6).
40. **The worker's logic sits behind `SnapshotSource` and `PrintStore`,** tested with `fake-indexeddb`, which `apps/web` already has; no new dependency (Task 3).
41. **Theme token values are the implementer's,** bound by the contrast test, not chosen in the plan (Task 4).
42. **Timing in e2e fails only past 10× the budget;** the measured times go in DECISIONS (Tasks 3–5).

## Controller rulings (2026-10-30)

- **Call 19 (Compare's Pages view):** keep the asterisk. The Pages view keeps v0.13.0's asterisk in the margin and "N lines removed" markers, because an asterisk is the production convention for a revised line and is what Phase 4's printed revision marks will use. The + and − with red and green (or blue and orange) belong to the new Changes view and to Show changes. Each view therefore keeps one visual language of its own, and nothing that shipped changes.
- **Call 13 (cache database):** accepted. The prints cache goes in a separate `drafter-cache` database, so `drafter` needs no version bump. It is removed with the script.
- **Call 36 (axe):** overruled. Axe checks run by default for every new view since v0.9.0, so the Changes view, Show changes, the Deleted scenes tab and Scene history each get axe checks in both themes in this release, as the rest of the app does. The screen-reader listening pass still waits for the final steps.
- **Calls 14 and 34:** accepted. Show changes starts off on each visit, and Deleted scenes is a tab that exists only while it is open.
- **Merge order (Call 38):** start this plan after v0.17.0 is merged and released, and merge `main` into `version-history` before Task 1. That replaces "before Task 8", so the conflicts are settled once, before any code.
- **Thresholds (Call 6):** accepted as starting values. Task 2's fixtures must include renamed headings, a split scene, two scenes merged into one, a scene moved, and a near-duplicate scene, and the thresholds are tuned against them.
