# Phase 2, Plan C: Snapshots and Compare (v0.13.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Snapshots and Compare (v0.13.0): a new engine package, `@drafter/compare`, with a hand-written Myers line diff and its mapping onto layout pages; snapshots of the whole text taken every 10 minutes of active writing, on every save, on **Take snapshot** (with an optional label), and before every bulk operation, never two alike in a row, thinned by the retention schedule, and stored gzip-compressed; a **History…** dialog to list, compare, restore, label, save, and delete them; and a **Compare** tab that draws the newer version as script pages with added, changed, and removed lines marked, a Changes list, and Next and Previous change.

**Architecture:** `@drafter/compare` is pure: `diffLines` (linear-space Myers on interned lines), `changesOf` (hunks as added, changed, or removed, with source spans), and `markPages` (each change placed on the newer text's layout lines by span). The snapshot store lives in `apps/web/app/storage/snapshots.ts` over the existing `snapshots` table (no new Dexie version), with gzip in `storage/gzip.ts` and retention as a pure function in `apps/web/app/snapshots/retention.ts`; `apps/web/app/snapshots/use-snapshots.ts` is the session that takes them (the schedule, saves, opens, `before(reason)` for bulk operations) and never blocks the editor. `apps/web` draws `HistoryDialog.vue` and `ComparePane.vue`; Restore goes through one whole-text replacement shared with Revert to Saved (one transaction, `isolateHistory('full')`, one undo).

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Dexie over IndexedDB (`fake-indexeddb` in tests), the browser's `CompressionStream`/`DecompressionStream`, Vitest 5 with fast-check, Playwright 1.64. No new dependencies.

**Spec:** [`docs/drafter-phase2-design.md`](../drafter-phase2-design.md): §22 Plan C (scope and Done-when are binding); §11.1 (snapshots), §11.2 (Compare), §5.7 (rules every view follows), §5.8 (where the views live: Compare is a tab that exists only while a comparison is open), §21 (`@drafter/compare`); [`docs/drafter-technical-design.md`](../drafter-technical-design.md) §8.4 (schedule, retention, gzip via `CompressionStream`, "a snapshot equal to the newest is not taken", the snapshot of the last save always kept, Myers on lines, snapshots before bulk operations and FDX import) and §8.2 (Revert to Saved reads the last save's snapshot). Plan A's, FD's, and B's decisions in `docs/DECISIONS.md` still hold.

## Global Constraints

- Branch `phase2-c` (worktree `scratchpad/drafter-c`), from `main` at v0.12.0 (`f4c4583`).
- **Clean room:** no code, text, or fixtures from any screenwriting app, Fountain library, or diff library. The Myers algorithm is written from its published description; every label, message, and fixture is Drafter's own words.
- **No new dependencies.** `@drafter/compare` depends on `@drafter/fountain` (types: `Span`) and `@drafter/layout` (types: `Layout`, `LayoutLine`) only (dev: `@drafter/templates` for its fixtures' layouts). `apps/web` adds it. **`CompressionStream` is a platform API, not a dependency:** Chromium (Playwright's browsers and Electron 45's renderer), Firefox, Safari 16.4+, and Node 22 (the unit tests: it is a global there, so the tests use the real one) all have it. Where it is missing, a snapshot is stored as plain text (Call 10); a test stubs it away with `vi.stubGlobal('CompressionStream', undefined)`. Anything third-party needs a `docs/DEPENDENCIES.md` row first, and none is expected.
- **No schema bump** (Call 1): the `snapshots` table (`'id, projectId, createdAt'`, version 1) already has what is queried; new fields are unindexed, so `db.ts` keeps `version(1)` and `e2e/seed.ts` (IndexedDB version 10) is unchanged. If an executor finds a new index is needed, it is `version(2)` with an `upgrade` that only adds, and `e2e/seed.ts` and `test/e2e-seed.test.ts` move with it.
- **A fake clock** for every schedule, thinning, and grouping test: the pure functions take `now`; the store tests use `vi.useFakeTimers({ toFake: ['Date'] })` as `projects.test.ts` does; e2e tests use `page.clock.install()` and `runFor`, as `save.spec.ts` does.
- **Snapshots are never duplicated:** a take whose text hashes to the newest history snapshot's `hash` adds nothing, and takes for one script run one at a time (a queue), so two at once can't both pass the check.
- **Restore is one undo and takes a snapshot first** (reason `before-restore`), as Revert to Saved does now: one transaction replacing only the part that differs, `isolateHistory('full')`, `appChange` (no writing time for it).
- **Nothing about snapshots changes the printed script or the `.fountain` file.** Snapshots live only in IndexedDB; Save writes the editor's text as before; Restore is an ordinary edit the writer then saves or not.
- **A snapshot never blocks typing or saving.** Every take is captured synchronously (the text as it is now) and written in the background; bulk operations run without waiting for it; a failed write (quota, IndexedDB down, a compression error) is caught, said once per visit in the status bar ("Couldn’t keep a snapshot: this browser’s storage is full. Your script is safe, and saving still works."), and never throws into the editor or the save.
- **Samples** keep no snapshots (§11.1); removing a script removes its snapshots (`removeProject` already deletes every row with its `projectId`; a test pins it for history rows).
- **Markdown documents** (Call 20): snapshots, History, and Restore work as for Fountain (they're text); Compare draws a marked list of the source's lines instead of pages, and its Changes list says "Line 40" instead of "Page 12, INT. HALL".
- **Read-only** (another tab has the script, or its file is being checked): the tab takes no snapshots (the editing tab does); History lists, compares, and saves snapshots as files; Restore, Label…, Delete, and Take snapshot are disabled (`aria-disabled`) with the reason, as `useOutline().readOnly` gives it. Compare is read-only everywhere (§11.2).
- **Keyboard:** every action is a command in the registry (`apps/web/app/commands/data.ts` + `builtin.ts`, so it is in the palette and on the Keyboard shortcuts page) or a key on the shortcuts page. New views reuse existing patterns: the History list is one listbox with one tab stop and keys on the focused row, row buttons for a pointer (`tabindex="-1"`), and a `MenuButton` row menu (the Notes tab's pattern); dialogs are `<dialog>` shaped like `MoveToDialog.vue`; announcements go through one polite live region, `sayOutline` (`outline/notice.ts`, `OutlineAnnouncer.vue`).
- **Accessibility work waits for the final steps** (maintainer, 2026-10-28): no new axe tests and no accessibility task in this plan; the existing axe tests (`e2e/a11y.spec.ts` and the others) stay green. The Done-when item "axe passes on History and Compare, in both themes at both widths" is deferred to those final steps and listed in `docs/DEFERRED.md`.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` under a new `## Phase 2, Plan C: Snapshots and Compare (`@drafter/compare`, `apps/web`)` section (each Call below gets a line when it lands); conventional commits with **no AI co-author trailer and no session link**.

## Review Focus

1. **Two takes at once** (a save landing on the 10-minute mark, or Fix all a moment after a save) leave one snapshot, not two alike. Task 3's `takes one snapshot when two takes of the same text race`.
2. **Storage full or IndexedDB gone:** typing and Save go on, the writer is told once, and the next take tries again. Task 3's `a failed write resolves 'failed' and never throws` and `thins and tries once more when storage is full`; Task 4's `says a failed snapshot once per visit` and the e2e `saves while snapshots can't be stored`.
3. **A row that can't be read** (bytes damaged, or a gzip row opened where `DecompressionStream` is missing) is listed as "Can’t be read" with only Delete, and never breaks the list. Task 3's `lists a row that can't be read` and Task 5's e2e `offers only Delete for a snapshot that can't be read`.
4. **A clock that jumps** (snapshots dated after `now`, or a writer back after 100 days) never loses the newest snapshot, a labeled one, or the last save's. Task 3's property `thinning keeps the newest, every labeled, and the last save's snapshot, and is idempotent`, with `createdAt` after `now` in its arbitraries.
5. **A whole script pasted over** (two unrelated 5,000-line texts) diffs without freezing the page, as one changed run. Task 1's `diffs two unrelated 5,000-line texts in under 2 seconds` and `an unrelated text is one changed run`.

---

### Task 1: The line diff (`@drafter/compare`)

**Files:**
- Create: `packages/compare/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}` (shaped like `packages/notes`), `packages/compare/src/{index.ts,lines.ts,myers.ts,changes.ts}`, `packages/compare/test/{myers.test.ts,myers.properties.test.ts,changes.test.ts,budget.test.ts}`
- Modify: `vitest.shared.ts` (`'compare'` in `packages`), `apps/web/nuxt.config.ts` (`compare` in the `@drafter/(…)` source alias), `apps/web/package.json` (`"@drafter/compare": "workspace:*"`), `README.md` (Packages table: `@drafter/compare` built in Plan C)

**Interfaces (Produces):**
```ts
// lines.ts
export interface SourceLines { lines: string[]; starts: number[] } // starts[i]: offset of line i; a final '' line after a trailing \n
export function splitLines(text: string): SourceLines;            // \n and \r\n both end a line; the break is not in the line
// myers.ts
export interface DiffRun { kind: 'same' | 'added' | 'removed'; old: [number, number]; new: [number, number] } // half-open line ranges
/** A shortest edit script between `a` and `b`, as runs in order; adjacent runs of one kind are merged. */
export function diffLines(a: readonly string[], b: readonly string[]): DiffRun[];
// changes.ts
export interface Change {
  kind: 'added' | 'changed' | 'removed'; // changed: a removed run next to an added run
  old: [number, number];                // lines of the older text ([k, k] when added)
  new: [number, number];                // lines of the newer text ([k, k] when removed: it goes before line k)
  span: Span;                           // the newer text's offsets of `new` (empty at line k's start when removed)
  removed: string[];                    // the older lines it took out, as they were
}
export function changesOf(older: string, newer: string): Change[];
```

- **Call:** linear-space Myers (the middle-snake divide and conquer), on lines interned to integers, after trimming the common prefix and suffix. Ties prefer a removal before an addition, so a changed line reads as removed-then-added and `changesOf` pairs them into one `changed`.
- **Call:** no move detection. A moved scene is removed where it was and added where it is, which is what a line diff gives and what revision marks (Phase 4) will mark.

- [ ] **Step 1: Write the failing tests.** `myers.test.ts`: `two equal texts are one same run`, `finds a line added, removed, and changed`, `an empty side is all added or all removed`, `prefers the removal before the addition`, `CRLF and LF lines compare equal` (`splitLines`). `myers.properties.test.ts` (fast-check, arrays over a 4-line alphabet so lines repeat): `applying the runs to a gives b`, `the same lines are a longest common subsequence` (their count equals a small DP's LCS length, inputs up to 40 lines), `diffing never throws`. `changes.test.ts`: `pairs a removed run and an added run into one changed`, `a removal sits before the line that follows it`, `spans are the newer text's offsets`, `a moved scene is one removed and one added change` (fixture: a three-scene script with scene 3 moved before scene 1), `an unrelated text is one changed run`. `budget.test.ts`: `diffs two unrelated 5,000-line texts in under 2 seconds`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/compare test` → FAIL (no package).
- [ ] **Step 3: Implement** the package and the workspace edges.
- [ ] **Step 4: Run them again,** and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat(compare): a line diff for Compare`

---

### Task 2: Changes on the pages (`@drafter/compare`)

**Files:**
- Create: `packages/compare/src/marks.ts`, `packages/compare/test/{marks.test.ts,fixtures.ts}`
- Modify: `packages/compare/src/index.ts`, `packages/compare/README.md`

**Interfaces (Consumes):** `Change`, `changesOf` (Task 1). **(Produces):**
```ts
export interface LineMark { page: number; span: Span; kind: 'added' | 'changed'; change: number }      // a printed line, by its span (a dual dialogue `right` line too)
export interface GapMark { page: number; before: Span | null; lines: string[]; kind: 'removed' | 'unprinted'; change: number } // sits before the line with span `before` (null: the page's end)
export interface ChangeStop { change: number; kind: Change['kind'] | 'unprinted'; page: number; block: number; lines: number }
export interface PageMarks { lines: LineMark[]; gaps: GapMark[]; stops: ChangeStop[] } // stops: one per change, in order
/** Places each change on `layout`, the newer text's: a printed line whose span meets a change's span is marked; a removal is a gap before the first line at or after its place. */
export function markPages(layout: Layout, changes: readonly Change[]): PageMarks;
/** The next or previous stop from `current` (null: before the first), wrapping; null when there are none. */
export function stepChange(stops: readonly ChangeStop[], current: number | null, direction: 1 | -1): number | null;
```

- **Call:** a change whose new lines print nothing (blank lines, a note, a boneyard, a synopsis, the metadata block) is an `unprinted` gap at its place, holding the new lines, so the Changes list and Next change still reach it ("1 line changed that doesn’t print").
- Marks never change the layout: `markPages` reads it only.

- [ ] **Step 1: Write the failing tests.** `marks.test.ts`, each over `paginate(parse(text), template)` for fixtures in `fixtures.ts` (Drafter's own short scripts, screenplay and stage play): `marks an added line and a changed line by span`, `marks every wrapped line of a changed block`, `marks the right side of dual dialogue`, `puts a removal before the line after it, on that line's page`, `puts a removal at the end of the last page`, `a changed note is an unprinted gap`, `a moved scene marks its lines added and leaves a removed gap where it was`, `marks a title-page change on page 0`, `one stop per change, in order`, `stepChange wraps both ways`, `stepChange is null with no stops`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(compare): map changes onto the pages`

---

### Task 3: The snapshot store and retention

**Files:**
- Create: `apps/web/app/storage/{gzip.ts,snapshots.ts}`, `apps/web/app/snapshots/retention.ts`, `apps/web/test/{gzip.test.ts,snapshots-store.test.ts,retention.test.ts}`
- Modify: `apps/web/app/storage/db.ts` (the `Snapshot` row's new optional fields; `version(1)` unchanged), `apps/web/test/projects.test.ts` (`removeProject` removes history rows too)

**Interfaces (Produces):**
```ts
// db.ts: Snapshot becomes
export interface Snapshot {
  id: string; projectId: string; createdAt: number;
  source?: string;          // the saved row (`saved:<projectId>`, as in Phase 1), and a history row stored uncompressed
  gz?: Uint8Array;          // the text, gzip-compressed
  label?: string;           // the writer's; the saved row's 'Saved' stays as it is
  reason?: SnapshotReason;  // every history row has one; the saved row has none
  detail?: string;          // a file's name, for 'opened' and 'imported'
  hash?: string;            // hashText of the text
  words?: number;           // wordsIn(text)
}
// snapshots.ts
export type SnapshotReason =
  | 'timed' | 'saved' | 'opened' | 'imported' | 'manual'
  | 'before-expand' | 'before-fix-all' | 'before-revert' | 'before-restore' | 'before-reload'; // 'before-merge' arrives with Plan G
export interface SnapshotInfo { id: string; createdAt: number; reason: SnapshotReason; label?: string; detail?: string; words: number; readable: boolean }
export type TakeResult = 'taken' | 'same' | 'failed';
/** Adds a history snapshot unless `text` hashes to the newest one's; one take per project at a time; never throws. Thins after a take. */
export function takeSnapshot(projectId: string, text: string, reason: SnapshotReason, extra?: { label?: string; detail?: string }): Promise<TakeResult>;
/** History rows only (never `saved:` rows), newest first; `readable` false when the row has neither `gz` nor `source`, or `gz` without DecompressionStream. */
export function listSnapshots(projectId: string): Promise<SnapshotInfo[]>;
/** The text, or null when it can't be read (gunzip fails). */
export function snapshotText(id: string): Promise<string | null>;
export function setSnapshotLabel(id: string, label: string | null): Promise<void>; // '' or null takes the label off
export function deleteSnapshot(id: string): Promise<void>;
/** Deletes what `thin` says, keeping the newest snapshot whose hash is the project's `savedHash`. */
export function thinSnapshots(projectId: string, now?: number): Promise<void>;
// gzip.ts
export function canCompress(): boolean;
export function gzip(text: string): Promise<Uint8Array>;
export function gunzip(bytes: Uint8Array): Promise<string>;
// snapshots/retention.ts: pure
export interface Kept { id: string; createdAt: number; labeled: boolean }
export const DAY_MS = 86_400_000;
/** The ids to delete. Keeps: every labeled; every one in `keep`; the newest; all within 24 hours of `now` (and any dated after it); then the last of each local hour to 7 days; the last of each local day to 90 days; then none. */
export function thin(rows: readonly Kept[], now: number, keep: ReadonlySet<string>): string[];
```

- Rows are kept as `Uint8Array` (structured-clone safe in IndexedDB and `fake-indexeddb`), not `Blob`.
- **Call (Call 2):** the `saved:<projectId>` row stays Phase 1's uncompressed record of the last save, which Revert to Saved and "unsaved changes" read; it is not listed in History and not thinned. Every save also takes a `saved` history snapshot (Task 4), and thinning always keeps the newest history snapshot whose `hash` is the project's `savedHash`, so the last save is always in History too (§11.1).
- **Call (Call 8):** the hour and day buckets keep their **last** snapshot (it holds the most work), by local time (`dateKey` in `stats/keys.ts` for days), and the newest snapshot is always kept, so a writer back after 90 days still has their last one.
- **Call (Call 24):** a write that fails with `QuotaExceededError` thins and tries once more; a second failure is `'failed'`.

- [ ] **Step 1: Write the failing tests.** `gzip.test.ts`: `gzip and gunzip give any text back` (fast-check, any Unicode), `gzip cuts a script to well under half` (a repeated sample, < 0.5 of its UTF-8 length), `canCompress is false without CompressionStream` (`vi.stubGlobal`). `retention.test.ts` (no clock but `now`): `keeps everything from the last 24 hours`, `keeps the last of each hour to 7 days`, `keeps the last of each day to 90 days`, `deletes unlabeled snapshots older than 90 days`, `keeps a labeled snapshot of any age`, `keeps the ids it is told to keep`, and the property `thinning keeps the newest, every labeled, and the last save's snapshot, and is idempotent` (fast-check: rows over 200 days either side of `now`, some after it; `thin` twice deletes nothing the second time; no two unlabeled kept in one hour bucket between 24 hours and 7 days). `snapshots-store.test.ts` (`fake-indexeddb/auto`, fake `Date`): `takes a snapshot, gzip-compressed, with its reason, hash, and words`, `takes nothing when the text equals the newest`, `takes one snapshot when two takes of the same text race`, `stores plain text where CompressionStream is missing, and reads it back`, `lists history rows newest first, never the saved row`, `lists a row that can't be read` (damaged `gz` → `readable: true` but `snapshotText` null; and a `gz` row with `DecompressionStream` stubbed away → `readable: false`), `labels, unlabels, and deletes`, `a failed write resolves 'failed' and never throws` (`db.snapshots.put` spied to reject), `thins and tries once more when storage is full`, `thinning keeps the snapshot of the last save` (a project whose `savedHash` matches an old row). `projects.test.ts`: `removing a script removes its history snapshots`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `revert.spec.ts` and `save.spec.ts` (the saved row is unchanged). → PASS.
- [ ] **Step 5: Commit.** `feat(web): a snapshot store with retention and gzip`

---

### Task 4: Taking snapshots: the schedule, saves, and the session

**Files:**
- Create: `apps/web/app/snapshots/{schedule.ts,use-snapshots.ts,labels.ts}`, `apps/web/test/{snapshot-schedule.test.ts,use-snapshots.test.ts,snapshot-labels.test.ts}`, `apps/web/e2e/snapshots.spec.ts`
- Modify: `apps/web/app/storage/script.ts` (after `saved` records a save, and after `openedFile` makes a project: the session's hooks), `apps/web/app/components/AppStatusBar.vue` (the failure line), `apps/web/app/pages/index.vue` (starts the session, as the writing store is started)

**Interfaces (Consumes):** `takeSnapshot`, `thinSnapshots` (Task 3); `createTimeTracker` (`stats/writing-time.ts`), `writersEdit` (`stats/writing.ts`); `useEditor().onState`/`onChange`, `useScript()`, `useGuard().readOnly`. **(Produces):**
```ts
// schedule.ts: pure
export const SNAPSHOT_EVERY_MS = 10 * 60_000;
export interface SnapshotSchedule {
  edit(at: number): void;     // a writer's edit, fed to its own createTimeTracker
  end(): void;                // the tab hid or the script changed
  due(): boolean;             // active writing since the last snapshot ≥ SNAPSHOT_EVERY_MS
  taken(): void;              // any snapshot was taken: the count starts again
}
export function createSnapshotSchedule(): SnapshotSchedule;
// use-snapshots.ts
export interface SnapshotSession {
  /** Takes one of the open script now ('manual', with an optional label); 'failed' when nothing is kept here (a sample, a read-only tab). */
  take(label?: string): Promise<TakeResult>;
  /** Captures the text now, synchronously, and keeps it in the background as `reason`; the caller doesn't wait. Nothing for a sample or a read-only tab. */
  before(reason: Extract<SnapshotReason, `before-${string}`>): void;
  /** Bumped after every take or change, so History can list again. */
  version: Readonly<Ref<number>>;
  /** Why snapshots aren't kept here, or null: a sample, a read-only tab. */
  notKept: Readonly<ComputedRef<string | null>>;
}
export function useSnapshots(): SnapshotSession;
/** The status bar's line after a failed write, once per visit; empty after a take works. */
export const snapshotProblem: Ref<string>;
// labels.ts
export function reasonLabel(info: Pick<SnapshotInfo, 'reason' | 'label' | 'detail'>): string; // label wins; "Saved", "Every 10 minutes", "Opened The Call.fountain", "Imported from The Call.fdx", "Taken by you", "Before expand", "Before Fix all", "Before Revert to Saved", "Before restoring a snapshot", "Before reloading the file"
export function wordsChange(words: number, older: number | null): string; // "+120 words", "−3 words", "No change in words", "1,204 words" (the oldest)
```

- Timed: every writer's edit (`writersEdit`) feeds the schedule; when `due()`, the open script's text is taken as `timed`. **Call (Call 7):** the 10 minutes are the writing-time tracker's active time (stretches end after a 2-minute gap, stats design §2), and the count starts again after any snapshot, so no timed one follows straight after a save.
- On every save to a file (`saved`, and `savedElsewhere` for a save that finished after a switch): `saved`. **Call (Call 3):** opening a file takes an `opened` snapshot (`detail`: its name), since that text is the saved text; History then starts at the file as opened.
- Nothing for a sample (`project.sample`), in a read-only tab, or before a project exists. Takes run through Task 3's queue, so a save on the 10-minute mark is one snapshot.

- [ ] **Step 1: Write the failing tests.** `snapshot-schedule.test.ts`: `is due after 10 minutes of writing`, `a pause longer than 2 minutes doesn't count`, `is not due after 10 minutes of the clock with no writing`, `starts again after a snapshot`. `use-snapshots.test.ts` (editor and script mocked as in `count-budget.test.ts`, `fake-indexeddb`, fake `Date`): `takes a timed snapshot after 10 minutes of edits`, `takes a saved snapshot on save, and an opened one on open`, `takes none for a sample or in a read-only tab`, `before captures the text as it is when called`, `says a failed snapshot once per visit`, `a failed snapshot never throws into the save`. `snapshot-labels.test.ts`: `names every reason`, `a label wins over the reason`, `words change with a sign, and the oldest shows its count`. `snapshots.spec.ts`: `takes a snapshot after 10 minutes of writing` (`page.clock`, typing in steps), `takes a snapshot on save, and none when nothing changed`, `keeps no snapshots for a sample`, `saves while snapshots can't be stored` (IndexedDB `put` on `snapshots` made to fail in the page; Save still writes, and the status bar says it once), `a saved file holds the script's text and nothing about its snapshots`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `save.spec.ts`, `open.spec.ts`, and `stats.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): take snapshots as the writer works and saves`

---

### Task 5: The History dialog, and Restore

**Files:**
- Create: `apps/web/app/snapshots/{history.ts,restore.ts}`, `apps/web/app/editor/replace-text.ts`, `apps/web/app/components/{HistoryDialog.vue,SnapshotLabelDialog.vue}`, `apps/web/test/{history-list.test.ts,replace-text.test.ts}`
- Modify: `apps/web/app/storage/save.ts` (`revertToSaved` uses `replaceText`), `apps/web/app/commands/{data.ts,builtin.ts}` (`history`, `take-snapshot`), `apps/web/app/components/AppMenu.vue` (History… after Revert to Saved), `apps/web/app/components/AppStatusBar.vue` (the save item becomes a button that opens History), `apps/web/app/pages/index.vue` (the dialogs), `apps/web/app/commands/shortcuts.ts` (History's keys under Other keys), `apps/web/e2e/snapshots.spec.ts`

**Interfaces (Consumes):** `listSnapshots`, `snapshotText`, `setSnapshotLabel`, `deleteSnapshot` (Task 3); `useSnapshots`, `reasonLabel`, `wordsChange` (Task 4); `encodeFile`, `fileNameFor` (`storage/text.ts`); `useFiles().pickToSave`/`write`/`download`. **(Produces):**
```ts
// editor/replace-text.ts
/** Replaces the editor's whole text with `target` as one change: only the part that differs, its own undo step, `appChange`. False when read-only. */
export function replaceText(view: EditorView, target: string, userEvent?: string): boolean;
// snapshots/history.ts: pure
export interface HistoryDay { key: string; title: string; rows: Array<SnapshotInfo & { said: string; words: string }> } // "Today", "Yesterday", "Tuesday, 27 October"
export function historyDays(rows: readonly SnapshotInfo[], now: number): HistoryDay[];
export function historyKey(count: number, focused: number, key: string): { focus?: number; action?: 'compare-now' | 'compare-with' | 'restore' | 'label' | 'save' | 'delete' | 'menu' } | null;
/** "The Call (snapshot 2026-10-29 1042).fountain"; `.md` for Markdown. */
export function snapshotFileName(title: string, at: number, kind: DocumentKind): string;
export const historyOpen: Ref<{ focusLabel: boolean } | null>;
// snapshots/restore.ts
/** Takes `before-restore`, then puts the snapshot's text in the editor with replaceText; says "Restored the snapshot from 10:42. Undo brings back what it replaced." False, changing nothing, when it can't be read or the tab is read-only (and says why). */
export function restoreSnapshot(id: string): Promise<boolean>;
```

- The dialog: a **Take snapshot** row at the top (an optional Label field and the button; `take-snapshot`, "Take snapshot…", opens History with the field focused, Call 13); then one listbox, groups by day, each row its time, `reasonLabel`, and `wordsChange` from the row below it. Row actions: **Compare with now**, **Compare with…** (both wired in Task 6; until then disabled), **Restore**, **Label…** (`SnapshotLabelDialog.vue`), **Save as a file**, **Delete** (asks "Delete the snapshot from 10:42?"). **Call (Call 12):** keys on the focused row: Enter compares with now, C compares with…, R restores, L labels, S saves, Delete and Backspace delete, the context-menu key or Shift+F10 opens the row's menu; the row's buttons are a pointer's (`tabindex="-1"`). On a phone the dialog fills the screen.
- Rows are acted on by id, read again when acted on; a row gone since (another tab, thinning) changes nothing and says so. The list reads again when `version` changes.
- **Call (Call 23):** Save as a file writes the snapshot's text with the script's line break and BOM (`encodeFile`) through `pickToSave`, else `download`, named by `snapshotFileName`; it never becomes the script's file.
- **Call (Call 14):** the status bar's "Saved 4 min ago" / "Unsaved changes" text becomes a button, named "History, Saved 4 min ago", opening History (§11.1's "the save item in the status bar").
- A row that can't be read shows "Can’t be read" and offers only Delete.

- [ ] **Step 1: Write the failing tests.** `history-list.test.ts`: `groups rows by local day, newest first`, `names today and yesterday`, `says each row's words change from the one before`, `Up and Down move, and each key names its action`, `names a snapshot's file by title and time`. `replace-text.test.ts` (an `EditorView` in jsdom, as `apply-changes.test.ts` does): `replaces only what differs`, `is one undo step`, `does nothing when read-only`. `snapshots.spec.ts`: `opens History from the app menu, the palette, and the status bar`, `takes a labeled snapshot from History`, `labels and unlabels a snapshot`, `deletes a snapshot after asking`, `restores a snapshot in one undo, after a snapshot of now`, `saves a snapshot as a file`, `offers only Delete for a snapshot that can't be read`, `lists snapshots in a read-only tab, and offers no Restore, and says why`, `fills the screen on a phone`. Plus `revert.spec.ts` unchanged and green.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `revert.spec.ts`, `app-menu.spec.ts`, `palette.spec.ts`, `keyboard.spec.ts`, `phone.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): History, with restore, labels, and saving a snapshot`

---

### Task 6: The Compare tab

**Files:**
- Create: `apps/web/app/compare/{use-compare.ts,labels.ts,draw.ts}`, `apps/web/app/components/{ComparePane.vue,CompareSlim.vue,CompareLines.vue}`, `apps/web/test/{compare-labels.test.ts,compare-tabs.test.ts}`, `apps/web/e2e/compare.spec.ts`
- Modify: `packages/render-html/src/index.ts` (export `buildPage` and `GOTO_EVENT` as now), `apps/web/app/utils/panes.ts` (`COMPARE_TAB`, `comparePane`), `apps/web/app/components/AppPane.vue` (Compare first among `others` while open; `ComparePane`, `CompareSlim`), `apps/web/app/components/HistoryDialog.vue` (Compare with now, Compare with…), `apps/web/app/commands/{data.ts,builtin.ts}` (`next-change`, `previous-change`, `close-compare`), `apps/web/app/commands/shortcuts.ts`, `apps/web/test/panes.test.ts`, `apps/web/e2e/tabs.spec.ts`

**Interfaces (Consumes):** `changesOf`, `markPages`, `stepChange`, `PageMarks` (Tasks 1–2); `snapshotText` (Task 3); `createLayoutClient` and `workers/layout.worker.ts`; `templateIdOf` (`editor/template.ts`); `sceneIndex` (`@drafter/outline`). **(Produces):**
```ts
// compare/use-compare.ts
export interface Version { label: string; at: number | null; text: string } // at null: "now"
export interface Comparison { older: Version; newer: Version; kind: DocumentKind; changes: Change[] }
export interface CompareSession {
  current: Readonly<ShallowRef<Comparison | null>>;
  /** Orders the two by time (now is newest), diffs them, and shows the tab. */
  open(a: Version, b: Version): void;
  /** Takes the editor's text as "now" again, when one side is now. */
  update(): void;
  close(): void;
  /** The change focused, for Next and Previous change. */
  at: Ref<number | null>;
}
export function useCompare(): CompareSession;
// compare/labels.ts
export function stopLabel(stop: ChangeStop, heading: string | null): string; // "Page 12, INT. HALL: 2 lines changed", "Page 3: 1 line added", "Page 5, INT. HALL: 3 lines removed", "… 1 line changed that doesn’t print"; Markdown: "Line 40: 2 lines changed"
export function gapName(gap: GapMark): string; // "3 lines removed", "1 line changed that doesn’t print"
// compare/draw.ts: decorates pages drawn by buildPage
export function markPage(el: HTMLElement, page: number, marks: PageMarks): void; // asterisk (aria-hidden) at the right margin and a hidden "changed, " / "added, " at the line's start; gap buttons
// utils/panes.ts
export const COMPARE_TAB: Tab; // { id: 'compare', label: 'Compare' }
/** The pane Compare opens in: the one not showing Source; the right one when neither does. */
export function comparePane(tabs: PaneTabs): PaneId;
```

- **Call (Call 16):** Compare is an "other" tab, put first in `others` only while a comparison is open, so opening it puts it in the slot of the pane `comparePane` picks; closing (**Close comparison** on its slim bar, `close-compare`, opening another script, or the document changing kind) takes it away with `dropTab`. On a phone it opens in the one pane.
- **Call (Call 17):** the newer version is laid out by a layout worker of Compare's own (`createLayoutClient`), made when a comparison opens and ended when it closes, so the Script pane's layout is untouched; the pages are drawn with `buildPage` and marked by `markPage`, matching `LayoutLine.span` to each line's `data-from`/`data-to`.
- **Call (Call 15):** "now" is the editor's text when Compare opened; the slim bar says "Comparing 10:42 with now (10:58)" and has **Update**.
- The Changes list above the pages (a list of buttons, one per stop, going to it and focusing its line or gap); on a phone it is a collapsed `<details>` at the top. A gap is a button named by `gapName` (`aria-expanded`); activating it shows the lines struck through (`<del>`). Pages keep their headings.
- **Call (Call 21):** Next change and Previous change are **N** and **Shift+N** while focus is in the Compare tab (it has no text input), and the palette commands `next-change` / `previous-change` from anywhere while Compare is open; each moves focus to the change and says its `stopLabel` once.
- **Call (Call 20):** for a Markdown document, or while the layout has failed, `CompareLines.vue` draws the newer text's source lines, marked the same way.
- History's **Compare with now** opens it for the row and now; **Compare with…** asks for the other side (a second list in the dialog: Now, then the other readable snapshots).

- [ ] **Step 1: Write the failing tests.** `compare-labels.test.ts`: `names a stop by page, scene, and count`, `names a stop with no scene by page`, `names an unprinted change`, `names a Markdown stop by line`, `names a gap`. `compare-tabs.test.ts` / `panes.test.ts`: `Compare opens in the pane not showing Source`, `in the right pane when neither shows Source`, `Compare takes the slot while open and is gone when closed`. `compare.spec.ts`: `compares a snapshot with now and marks added and changed lines with an asterisk`, `shows a removed-lines marker that reveals the struck-through lines`, `marks a moved scene as added where it is and removed where it was`, `Next change and Previous change reach every change, by N, Shift+N, and the palette`, `the Changes list goes to each change`, `the newer of two snapshots is the one drawn`, `Update compares with the text as it is now`, `closes when another script opens`, `compares a Markdown document as marked lines`, `the Changes list is collapsed on a phone`, `offers no edits: Compare is read-only`. `tabs.spec.ts`: `Compare is in no pane's row until a comparison opens`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `script.spec.ts`, `scroll-sync.spec.ts`, and `pnpm --filter @drafter/render-html test`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): the Compare tab`

---

### Task 7: Snapshots before bulk operations

**Files:**
- Modify: `apps/web/app/commands/builtin.ts` (`expand-outline`: `before('before-expand')` once `changes` is non-empty, before `applyTextChanges`), `apps/web/app/editor/problems.ts` (`fixAll`: `before('before-fix-all')` once `changes` is non-empty), `apps/web/app/storage/save.ts` (`revertToSaved`: `before('before-revert')` after `canRevert`), `apps/web/app/storage/script.ts` (`replaceWith`: `before('before-reload')` before its dispatch), `apps/web/app/storage/open.ts` (`importFinalDraft`: after `openImported` resolves true, `take` as `imported` with `detail: name`), `apps/web/app/snapshots/use-snapshots.ts` (an `afterImport(name)` hook if `take` can't carry the reason), `docs/DEFERRED.md` (the "A snapshot before Expand outline" line goes), `apps/web/e2e/{outline.spec.ts,problems.spec.ts,revert.spec.ts,changed.spec.ts,fdx.spec.ts}`

**Interfaces (Consumes):** `useSnapshots().before`, `takeSnapshot` (Tasks 3–4). No new exports beyond what Task 4 names.

- The before-snapshot holds the text exactly as it was before the operation, and the operation never waits for it (Global Constraints). A text equal to the newest snapshot takes none (§11.1), so a Fix all just after a save adds nothing.
- **Call (Call 4):** FDX import makes a new script, which has no "before"; the snapshot is of the imported text, right after the script is made ("Imported from The Call.fdx"), so the writer can always go back to what came in.
- **Call (Call 5):** reloading a changed file (`replaceWith`, from the changed-file bar and from Open over a script) is a bulk operation too: it replaces the whole text, and a reload loses the undo history the editor had.
- **Call (Call 6):** Start blank and Reset sample take none: a sample keeps no snapshots, and Start blank replaces only a sample's untouched text. A single scene or card move takes none (§11.1). A reader merge (Plan G) will call `before('before-merge')`.

- [ ] **Step 1: Write the failing tests.** `outline.spec.ts`: `takes a snapshot before Expand outline`. `problems.spec.ts`: `takes a snapshot before Fix all, and none when the text equals the newest`. `revert.spec.ts`: `takes a snapshot before Revert to Saved`. `changed.spec.ts`: `takes a snapshot before reloading a changed file`. `fdx.spec.ts`: `takes a snapshot of an imported script`. Each checks History's top row's reason and that Compare with now shows the operation's changes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(web): a snapshot before every bulk operation`

---

### Task 8: The desktop menu, the docs, and release prep

**Files:**
- Modify: `apps/web/app/commands/desktop-menu.ts`, `apps/web/test/desktop-menu.test.ts`, `packages/compare/README.md`, `README.md` (status and roadmap: snapshots and Compare built), `docs/drafter-technical-design.md` §8.4 (one sentence each for Calls 2, 3, 5, and 8, as design §26 does for earlier plans), `docs/drafter-phase2-design.md` §22 Plan C (**Status:** built, with the axe item waiting for the final steps), `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`

- [ ] **Step 1: Write the failing tests.** `desktop-menu.test.ts`: `puts History… and Take snapshot… in File, and Next change, Previous change, and Close comparison in View`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement,** and write the docs: every Call below in DECISIONS (Plan C section); in DEFERRED, the axe tests for History and Compare (both themes, both widths), side-by-side Compare (§2, when asked for), and move detection in Compare (Phase 4, with revision marks).
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with the existing axe tests green.
- [ ] **Step 5: Commit.** `docs: Snapshots and Compare (Plan C)`
- [ ] **Step 6: Push** `phase2-c` and watch CI. Don't merge or tag: the controller releases v0.13.0.

---

## Calls in this plan

For the maintainer to review; each gets a DECISIONS line when it lands. **Departs from the spec:** 3, 5, and 8 add to §11.1's list (flagged ◆); the rest choose where the spec is open.

1. **No Dexie version bump** (Task 3): new snapshot fields are unindexed; the existing `projectId` index is all History queries, and the e2e seed stays at version 10.
2. **The saved row stays Phase 1's** (Task 3): `saved:<id>`, uncompressed, read by Revert to Saved and "unsaved changes", not listed or thinned; each save also takes a "Saved" history snapshot, and thinning keeps the newest one matching `savedHash`, which is how "the snapshot of the last save is always kept" holds in History.
3. ◆ **Opening a file takes an "Opened" snapshot** (Task 4): the opened text is the saved text, so History starts there. §11.1 doesn't list it.
4. **FDX import's snapshot is of the imported text,** after the script is made (Task 7): a new script has no "before".
5. ◆ **Reloading a changed file takes a "Before reloading" snapshot** (Task 7): it replaces the whole text. §11.1 doesn't list it.
6. **No snapshot for Start blank, Reset sample, or a single move** (Task 7).
7. **The 10 minutes are active writing time** from the writing-time tracker, and the count starts again after any snapshot (Task 4).
8. ◆ **Thinning keeps the last of each hour and day, by local time, and always keeps the newest snapshot** (Task 3): the last holds the most work, and a writer back after 90 days keeps their last one. §11.1's "then none" would delete it.
9. **A bulk operation's snapshot is captured at once and kept in the background;** the operation never waits, and a failure is said (Tasks 4, 7).
10. **Plain text where `CompressionStream` is missing** (Task 3), so snapshots still work in an older browser.
11. **The change in words** is `wordsIn` of the whole text, against the next older snapshot (Task 4).
12. **History is one listbox grouped by day,** with keys Enter, C, R, L, S, Delete, and the menu keys, and row buttons for a pointer: the Notes tab's pattern for §11.1's "one tab stop and buttons in each row" (Task 5).
13. **Take snapshot lives at the top of History,** with its label field; the palette's Take snapshot… opens History there (Task 5).
14. **The status bar's save text is a button that opens History** (Task 5).
15. **"Now" in Compare is the text when it opened,** with Update, so the marks don't move while the writer reads (Task 6).
16. **Compare is an "other" tab, first while open,** taking the slot of the pane not showing Source (right when neither does), and closing on a script switch or a change of kind (Task 6).
17. **Compare lays out with a worker of its own** and draws with `@drafter/render-html`'s `buildPage`, now exported, marked by span (Task 6).
18. **No move detection:** a moved scene is removed there and added here (Task 1).
19. **A change that prints nothing gets a marker and a Changes row** ("1 line changed that doesn’t print"), so Next change reaches every change (Task 2).
20. **Markdown documents get snapshots, History, Restore, and Compare,** Compare as marked source lines (also used when the layout fails) (Task 6).
21. **Next and Previous change are N and Shift+N in the Compare tab,** and palette commands from anywhere while it is open; no global keys, so none clashes with F8 or the browser's (Task 6).
22. **Linear-space Myers on interned lines,** after trimming the common prefix and suffix; a removal before an addition on ties (Task 1).
23. **Save as a file** writes "Title (snapshot 2026-10-29 1042).fountain" (or `.md`) with the script's line break and BOM, never as the script's file (Task 5).
24. **Storage full:** thin and try once more, then say it once per visit (Tasks 3, 4).
25. **A read-only tab takes no snapshots;** its History lists, compares, and saves files, and Restore, Label, Delete, and Take snapshot say why they're off (Task 5).
26. **`@drafter/compare` depends on `@drafter/fountain` and `@drafter/layout`** for types only (Task 1), within §21.
