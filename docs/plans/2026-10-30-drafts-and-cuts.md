# Drafts and Cuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Numbered drafts the writer starts, each with a SHA-256 ID, a Draft-by-draft history, and a permanent Cuts list — for screenplays, stage plays, and Markdown documents — kept in the browser and as plain files beside the work.

**Architecture:** Pure logic (cut detection, draft and cuts file formats, merging) goes in `@drafter/history`, which already matches scenes across versions; Markdown metadata comments go in `@drafter/markdown`. The app adds two Dexie tables (`drafts`, `cuts`), a drafts session and a cuts recorder hooked to `keepSnapshot`, three views (Drafts, Draft by draft, Cuts — Cuts replacing Deleted scenes), and a "beside the work" writer: a new desktop IPC that refuses links, a folder grant in Chromium, and a zip export elsewhere.

**Tech Stack:** TypeScript, Vue 3.5, Nuxt 4, Dexie (IndexedDB), Web Crypto (`hashText`), File System Access API (`showDirectoryPicker`), Electron IPC, Vitest + fast-check, Playwright.

**Spec:** `docs/drafter-drafts-and-cuts-design.md` (approved 2026-10-30; its 26 Calls bind).

**Starts from:** main after v0.22.0 (Export as HTML and EPUB) is merged: it needs that release's zip writer in `@drafter/archive` (`zipStored`) and `@drafter/markdown`. Ships as v0.23.0.

## Global Constraints

- Nothing the writer wrote disappears without them asking: drafts and cuts are never thinned and have **no Delete**; draft files are never overwritten; the cuts file is only ever grown (merge, then atomic replace).
- Draft ID = `hashText(text)` (SHA-256, lowercase hex) of the exact editor text; UI shows the first 7 characters; "Copy full ID" copies all 64.
- Draft numbers start at 1, only go up, are never reused or renumbered; Drafter never starts a draft by itself.
- A cut's ID = `hashText(cut text)`; the same text cut again is one entry with every date and draft number.
- A whole-text replacement (`before-restore`, `before-reload`, `opened`, `imported`, a restored draft, New) makes no cuts; it moves the comparison point.
- Markdown passage cut: a contiguous run of ≥ 50 words absent now (word-level diff against the comparison point); a replaced paragraph counts only if it shares under half its word pairs with its replacement.
- Draft facts in Fountain go in the existing `/* drafter … */` block via `setMeta` (keys `draft`, `id`, `frozen`, `note`); in Markdown, a trailing `<!-- drafter {json} -->`; the text, then exactly one blank line, then the block.
- Files: `<Work> drafts/<Work> – Draft NN.<ext>` (NN two digits, three past 99) and `<work file name>.cuts.md` (e.g. `Boca.fountain.cuts.md`), beside the work's file.
- The interface word is **Draft**; palette keywords add "version", "new version", "versions", "how it changed"; Cuts keeps "deleted scenes", "show all versions".
- Nothing shows in Zen; the status bar's draft label is outside Zen only.
- Writing beside the work never follows a symbolic link, only within the folder of a script the writer granted (desktop) or the folder they picked and Drafter verified holds the script (web).
- Clean room: Drafter's own design and wording; nothing from Git, GitHub, or any writing app's revision feature.
- Any regex on the writer's text is linear. Gates with `set -e`; never `(cmd; echo $?)`; build packages before typecheck; e2e never on port 4190; never kill processes you didn't start; no Co-Authored-By or AI trailer.

## Review Focus

1. **Two computers, one Dropbox folder:** a cuts file edited on two machines merges without losing or duplicating an entry, and a draft number frozen on both (Draft 4 here and Draft 4 there, different texts) never overwrites either file. → Task 3 (`mergeCutsFiles`, name clash), Task 7 (the writer).
2. **A draft or cuts file edited outside Drafter** (a writer tidies `Boca.fountain.cuts.md` in a text editor, or changes a draft file): nothing crashes, the edited draft is listed "changed outside Drafter", the cuts file's readable entries are kept. → Task 3, Task 7.
3. **Storage full while freezing a draft:** the freeze reports it, the current text is untouched, and the draft is not half-recorded. → Task 2.
4. **First run on a long history** (1,000 snapshots, 300 scenes): the backfill of old cuts runs in the history worker, once, without a long task, and is resumable if the tab closes. → Task 4.
5. **Restoring a draft while Cuts or Draft by draft is open:** the lists update; no cut is recorded for the replaced text; one undo reverses the restore. → Task 4, Task 5.

---

## File Structure

- `packages/history/src/cuts.ts` — `findCuts`: what left between two texts (scenes via `scenePrints`/`sameScene`/`coveredBy`; Markdown sections via `@drafter/compare`'s `markdownAnchors`; 50-word passages via `diffWords`).
- `packages/history/src/draft-file.ts` — `draftFile`, `readDraftFile`, `draftFileName`.
- `packages/history/src/cuts-file.ts` — `cutsFile`, `readCutsFile`, `mergeCuts`.
- `packages/markdown/src/meta.ts` — `readMarkdownMeta`, `setMarkdownMeta` for the trailing `<!-- drafter … -->`.
- `apps/web/app/storage/db.ts` — `version(2)`: tables `drafts`, `cuts`.
- `apps/web/app/drafts/{store.ts,use-drafts.ts,labels.ts,steps.ts}` — drafts storage, session, wording, Draft-by-draft steps.
- `apps/web/app/cuts/{store.ts,recorder.ts,backfill.ts,use-cuts.ts,insert.ts}` — cuts storage, recording on keep, first-run backfill, session, Insert at cursor / Put back.
- `apps/web/app/beside/{beside.ts,web.ts,desktop.ts,export.ts}` — writing drafts and cuts beside the work; zip export.
- Components: `StartDraftDialog.vue`, `DraftsPane.vue`, `DraftStepsPane.vue`, `CutsPane.vue` (replacing `DeletedPane.vue`), `DraftReader.vue` (read-only second pane).
- `apps/desktop/src/{beside.ts,channels.ts,files-ipc.ts}` — the `drafter:files:write-beside` and `read-beside` channels.

---

### Task 1: Draft and cut file formats, and Markdown metadata (pure)

**Files:**
- Create: `packages/history/src/draft-file.ts`, `packages/history/src/cuts-file.ts`, `packages/markdown/src/meta.ts`; tests `packages/history/test/draft-file.test.ts`, `packages/history/test/cuts-file.test.ts`, `packages/markdown/test/meta.test.ts`
- Modify: `packages/history/src/index.ts`, `packages/markdown/src/index.ts`, `packages/history/package.json` (depends on `@drafter/fountain`'s `setMeta` — check it already does)

**Interfaces — Produces:**
```ts
// @drafter/history
export interface DraftFacts { draft: number; id: string /*64 hex*/; frozen: string /*ISO*/; note: string; from?: { draft: number; id: string } }
export type WorkKind = 'fountain' | 'markdown';
export function draftFileName(work: string /*file stem*/, n: number, kind: WorkKind): string; // "Boca – Draft 01.fountain"
export function draftFile(text: string, facts: DraftFacts, kind: WorkKind): string;      // text + "\n\n" + block (merging an existing Fountain block)
export function readDraftFile(file: string, kind: WorkKind): { text: string; facts: DraftFacts } | { text: string; facts: null; problem: string };
export interface CutEntry { id: string; title: string; text: string; kind: WorkKind; cuts: { at: string /*ISO*/; draft: number | null }[]; where: { after: string | null; before: string | null }; putBack?: string /*ISO*/ }
export function cutsFile(work: string, entries: readonly CutEntry[]): string;   // newest first
export function readCutsFile(file: string): { entries: CutEntry[]; skipped: number };
export function mergeCuts(a: readonly CutEntry[], b: readonly CutEntry[]): CutEntry[]; // by id; union of cuts dates; earliest putBack kept
// @drafter/markdown
export function readMarkdownMeta(text: string): { body: string; meta: Record<string, unknown> | null };
export function setMarkdownMeta(text: string, meta: Record<string, unknown>): string;
```
The cuts file: a header line naming the work and saying what the file is, then per entry `## <title>`, a line `Cut while writing Draft 12, 3 Nov 2026 (and Draft 14, 9 Nov 2026) · from between "<after>" and "<before>" · id <first 12 hex>`, then the text — Fountain in a fence whose backtick run is longer than any run inside the text; Markdown as-is with its `#` headings demoted one level (and `######` kept). A trailing HTML comment per entry carries the exact JSON (`<!-- drafter-cut {…} -->`), so parsing never depends on the prose lines.

- [ ] **Step 1: Write the failing tests.**
  - `draft-file.test.ts`: `names drafts with two digits, three past 99` (`draftFileName('Boca',1,'fountain') === 'Boca – Draft 01.fountain'`, `…,100,… === 'Boca – Draft 100.fountain'`); `a Fountain draft file is the text, one blank line, the block` and `readDraftFile gives back the exact text and facts` (fast-check over texts, including ones ending in newlines, CRLF, and an existing `/* drafter */` block — the existing block's keys survive the round trip, and `text` is byte-identical); `the ID verifies: hashing readDraftFile's text gives facts.id` (with `hashText` from node:crypto in the test); `a Markdown draft round-trips through the trailing comment`; `a damaged block is a problem, not a throw` (`facts: null`, `problem` set; text kept); `a note with "*/" or "-->" can't end the block early`.
  - `cuts-file.test.ts`: `round-trips entries exactly` (fast-check: titles and texts with backticks, `#`, `-->`, `*/`, CRLF, Unicode); `is newest first`; `merge is a union by id with every cut date and no duplicates` (commutative and idempotent as properties); `an entry edited by hand loses only itself` (corrupt one JSON comment → `skipped: 1`, others kept); `reads in linear time` (n and 8n, best-of-3, < 20×) on 10,000 entries and on one 5 MB entry.
  - `meta.test.ts`: `reads and writes the trailing comment`; `ignores a drafter comment that isn't last`; `a body that contains "<!-- drafter" text in a code fence is not mistaken for the block`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/history test` and `pnpm --filter @drafter/markdown test` → FAIL.
- [ ] **Step 3: Implement** the functions above; JSON for facts and entries with `/` written as `\/` (as `setMeta` does) and `--` in strings written as `--` so neither block can be closed from inside.
- [ ] **Step 4: Run them.** → PASS; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(history): draft and cuts file formats, and a Markdown document's metadata comment`

### Task 2: Drafts in storage, and starting, restoring, and reading them

**Files:**
- Create: `apps/web/app/drafts/store.ts`, `apps/web/app/drafts/use-drafts.ts`, `apps/web/app/drafts/labels.ts`, `apps/web/app/components/StartDraftDialog.vue`, `apps/web/app/components/DraftsPane.vue`, `apps/web/app/components/DraftReader.vue`; tests `apps/web/test/drafts-store.test.ts`, `apps/web/test/use-drafts.test.ts`, `apps/web/e2e/drafts.spec.ts`
- Modify: `apps/web/app/storage/db.ts` (`version(2)`: `drafts: 'key, projectId, [projectId+n]'`, `cuts: 'key, projectId, id'` — keys `${projectId}:${n}` and `${projectId}:${id}`), `storage/projects.ts` (`removeProject` also deletes drafts and cuts, as it does snapshots), `commands/data.ts` + `builtin.ts` (`start-draft`, `drafts`, keywords), `components/AppStatusBar.vue` (the "Draft N" button, outside Zen only), `components/AppMenu.vue`, `apps/desktop/src/menu.ts` (`LAYOUT.File`: after `revert-to-saved`: `start-draft`, `drafts`, `cuts`), the palette (open by ID prefix)

**Interfaces — Produces:**
```ts
// drafts/store.ts
export interface DraftRow { key: string; projectId: string; n: number; id: string; frozenAt: number; note: string; words: number; from?: { n: number; id: string }; gz?: Uint8Array; source?: string; written?: string /* where its file was written, or undefined */ }
export async function freezeDraft(projectId: string, text: string, note: string, from?: { n: number; id: string }): Promise<{ result: 'frozen'; row: DraftRow } | { result: 'failed'; why: string }>;
export async function listDrafts(projectId: string): Promise<DraftRow[]>;   // newest first, without text
export async function draftText(projectId: string, n: number): Promise<string | null>;
export async function setDraftNote(projectId: string, n: number, note: string): Promise<void>;
export async function draftsByPrefix(prefix: string): Promise<{ projectId: string; row: DraftRow }[]>; // ≥ 4 hex
// drafts/use-drafts.ts
export interface DraftsSession { current: Ref<number> /* the draft being written: last n + 1, or 1 */; rows: Ref<DraftRow[]>; start(note: string): Promise<boolean>; restore(n: number): Promise<boolean>; read(n: number): Promise<void>; version: Ref<number> }
export function useDrafts(): DraftsSession;
```
- `start(note)` freezes the editor's text as Draft `current`, writing gzip as snapshots do, then `current` becomes `n + 1`. If the text's hash equals the last draft's, `StartDraftDialog` first asks "This text is the same as Draft N. Start Draft N+1 anyway?". A first-time dialog shows the one-line explanation: "A draft is a version you name: Drafter keeps it exactly as it is, for good."
- `restore(n)`: `useSnapshots().before('before-restore')`, freeze the current text as a draft noted "before restoring Draft n", then `replaceText(editor.view, text)` as one undo, and the new current draft's `from` is `{n, id}`; tells the cuts recorder this was a whole-text replacement (Task 4's `replaced()`).
- `read(n)` opens `DraftReader` in the pane beside the Source (as Compare opens), read-only, header "Draft n · <short id> · read-only", text selectable.
- `DraftsPane`: rows newest first (current "now" at top), each: number, short ID (monospace), date, words (and pages for scripts, from the layout of the draft's text in the layout worker — or words only if that costs too much; record the call), note, marker line "Draft n begins — builds on Draft n−1 (<short id>)"; actions Read, Compare with now / with another draft (`useCompare().open`), Restore as a new draft, Copy full ID, Edit note. No Delete.
- **Milestones elsewhere:** History's list of snapshots (`HistoryDialog.vue`) and Compare's version pickers list drafts too, as milestones ("Draft 3 · a3f9c2e — from Sam's notes"), visually set apart from automatic snapshots, so the major shifts stand out.

- [ ] **Step 1: Write the failing tests.** `drafts-store.test.ts` (fake-indexeddb, as `snapshots-store.test.ts` does): `freezes Draft 1 then 2, numbers only go up`; `the ID is hashText of the exact text`; `a storage-full error leaves no half row and says so` (stub `put` to throw QuotaExceeded → `failed`, `listDrafts` unchanged); `draftsByPrefix finds by 4+ hex and lists every match`; `drafts survive thinSnapshots` (run `thinSnapshots` far in the future; drafts untouched); `removeProject removes them`. `use-drafts.test.ts`: `start freezes the current text and moves to the next number`; `restore freezes first, replaces as one undo, and records from`; `restore then undo gives the old text back`; `the same text asks before a new number`. e2e `drafts.spec.ts`: `Start new draft with a note shows Draft 1 in the list and Draft 2 in the status bar`; `a work in progress opened from a file starts at Draft 1`; `the palette opens a draft by its short ID`; `Read shows the draft read-only beside the Source and a line can be copied across`; `Compare two drafts opens the Changes view`; `History and Compare's picker show drafts as milestones`; `Restore as a new draft, then undo`; `the status bar label is gone in Zen`; a11y `Drafts list and Start new draft have no accessibility violations` in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** the files above.
- [ ] **Step 4: Run them**, plus `snapshots.spec.ts`, `history.spec.ts`, `palette.spec.ts`, `a11y.spec.ts`, and `pnpm --filter @drafter/desktop e2e -- menu` (the File menu) → PASS.
- [ ] **Step 5: Commit.** `feat(web): numbered drafts, each with its ID: start, read, compare, and restore`

### Task 3: Finding what left (pure)

**Files:**
- Create: `packages/history/src/cuts.ts`, `packages/history/test/cuts.test.ts`, `packages/history/test/cuts.properties.test.ts`
- Modify: `packages/history/src/index.ts`, `packages/history/package.json` (`@drafter/compare` for `markdownAnchors`, `diffWords`, `lineSimilarity`; `@drafter/markdown` for word counting)

**Interfaces — Produces:**
```ts
export interface FoundCut { title: string; text: string; where: { after: string | null; before: string | null } }
export const CUT_MIN_WORDS = 50;
export function findCuts(before: string, after: string, kind: WorkKind): FoundCut[];
```
- Fountain: a scene in `before` with no match in `after` (`scenePrints` + `sameScene`/`coveredBy`, exactly as `deletedScenes` judges) is a cut; its title is the heading; `where` names the headings of its nearest neighbours in `before` that still exist in `after`.
- Markdown: a `#`–`###` section (by `markdownAnchors`) whose heading and content have no match in `after` (same heading key and ≥ 0.5 `lineSimilarity` of its body, or body similarity ≥ 0.75 under any heading) is a cut, title = heading; plus passages: word-level diff (`diffWords`, falling back to a line diff when it returns null) of the text outside matched sections, each contiguous removed run of ≥ `CUT_MIN_WORDS` words that isn't inside a section already cut, and — for a replaced run — only when the removed and inserted runs share under half their word pairs (Dice on word bigrams); title = the first 8 words + "…".
- Never reports text that moved (a section or scene elsewhere in `after`).

- [ ] **Step 1: Write the failing tests.** `cuts.test.ts`: `a scene deleted is one cut, titled by its heading`; `a scene moved is not a cut`; `a scene lightly edited is not a cut`; `a section cut from a Markdown document is one cut`; `a moved chapter is not a cut`; `a removed paragraph of 50 words is a cut, of 49 is not`; `a paragraph rewritten lightly is not a cut; replaced by something else, it is`; `where names the surviving neighbours`; `nothing is reported when nothing left`. `cuts.properties.test.ts`: `a text never cuts from itself`; `appending never cuts`; `every cut's text occurs in before`; `findCuts is linear enough` (n and 8n scenes, best-of-3, < 20×) and handles 300 scenes / 200,000 words under 1 s.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** `findCuts`.
- [ ] **Step 4: Run them.** → PASS.
- [ ] **Step 5: Commit.** `feat(history): find the scenes, sections, and passages that left a text`

### Task 4: Recording cuts, the first-run backfill, and the Cuts list

**Files:**
- Create: `apps/web/app/cuts/store.ts`, `cuts/recorder.ts`, `cuts/backfill.ts`, `cuts/use-cuts.ts`, `cuts/insert.ts`, `components/CutsPane.vue`; tests `apps/web/test/cuts-store.test.ts`, `apps/web/test/cuts-recorder.test.ts`, `apps/web/test/cuts-backfill.test.ts`, `apps/web/e2e/cuts.spec.ts`
- Modify: `apps/web/app/storage/snapshots.ts` (`keepSnapshot` calls the recorder after a take, with the reason), `workers/history-compute.ts` + `history/protocol.ts` (a `{kind: 'backfill', projectId, now}` request streaming `FoundCut`s from consecutive snapshot pairs, oldest first, resumable from a stored snapshot id), `commands/data.ts` + `builtin.ts` (`cuts` replaces `deleted-scenes`, keeping its keywords plus "cuts"; enabled for Markdown too), delete `components/DeletedPane.vue` and `history/deleted.ts` once their tests move to the Cuts equivalents (keep `history/put-back.ts`, used by Put back for scripts), help

**Interfaces — Produces:**
```ts
// cuts/store.ts
export interface CutRow extends CutEntry { key: string; projectId: string }
export async function recordCut(projectId: string, cut: FoundCut, draft: number | null, at: number): Promise<CutRow>; // merges by id
export async function listCuts(projectId: string): Promise<CutRow[]>; // newest first
export async function markPutBack(projectId: string, id: string, at: number): Promise<void>;
// cuts/recorder.ts
export function createCutRecorder(deps): { kept(projectId: string, text: string, reason: SnapshotReason): Promise<void>; replaced(projectId: string, text: string): void };
// cuts/use-cuts.ts
export interface CutsSession { rows: Ref<CutRow[]>; filter: Ref<string>; where: Ref<'beside' | 'browser'>; insertAtCursor(id: string): Promise<boolean>; putBack(id: string): Promise<boolean>; copy(id: string): Promise<void> }
export function useCuts(): CutsSession;
```
- The recorder keeps a comparison point per project (in memory, and the last kept text's snapshot id in `settings` so a reload resumes): on `kept` with a whole-text reason (`opened`, `imported`, `before-restore`, `before-reload`) or after `replaced()`, it only moves the point; otherwise it runs `findCuts(point, text, kind)` (in the history worker for texts over 200 KB) and records each with the current draft number.
- Backfill: once per project (flag in `settings`), in the history worker, walks the stored snapshots oldest → newest calling `findCuts` on each consecutive pair and on the newest vs now, recording each cut with `draft: null` ("cut before drafts"); progress stored after each pair so a closed tab resumes; no long task (the worker does the work; the main thread only writes rows in batches).
- Insert at cursor: one undo; blank lines around; for a script, at the start of the scene after the cursor (or the end of the body, before the metadata block, via `bodyEnd`); for Markdown, at the start of the paragraph after the cursor. Put back: scripts via the existing `putBack` machinery (snapshot slot → place); Markdown via `where` (after the surviving `after` heading, else before `before`, else the end). Both mark the entry "put back on <date>" and keep it.

- [ ] **Step 1: Write the failing tests.** `cuts-store.test.ts`: `the same text cut twice is one entry with both dates and drafts`; `cuts survive thinning and have no delete`. `cuts-recorder.test.ts`: `a scene deleted between two kept snapshots is recorded with the current draft`; `opening, importing, reloading, restoring a snapshot, and restoring a draft record nothing`; `a Markdown section cut is recorded`; `the comparison point survives a reload`. `cuts-backfill.test.ts`: `old snapshots' deleted scenes become cuts before drafts`; `it runs once and resumes after an interruption` (stop after pair 3, restart, no duplicates, finishes); `1,000 snapshots, 300 scenes: the main thread never blocks for 50 ms` (measure the write batches). e2e `cuts.spec.ts`: `cutting a scene shows it in Cuts after a snapshot`; `Insert at cursor puts it at the next scene boundary as one undo`; `Put back restores it between its old neighbours and keeps it listed`; `a Markdown chapter cut can be inserted elsewhere`; `Copy puts the text on the clipboard`; `restoring a draft adds no cuts`; `the palette's "deleted scenes" finds Cuts`; a11y `Cuts has no accessibility violations` both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them**, plus `deleted-scenes.spec.ts` (migrated to Cuts — rename it `cuts-scripts.spec.ts` and keep every assertion that still applies), `history-scan.spec.ts`, `scene-history.spec.ts`, `snapshots.spec.ts` → PASS.
- [ ] **Step 5: Commit.** `feat(web): Cuts: everything cut is kept, from before drafts too, and can be read, copied, inserted, or put back`

### Task 5: Draft by draft

**Files:**
- Create: `apps/web/app/drafts/steps.ts`, `components/DraftStepsPane.vue`; tests `apps/web/test/draft-steps.test.ts`, `apps/web/e2e/draft-steps.spec.ts`
- Modify: `components/DraftsPane.vue` (header link), `commands/data.ts` + `builtin.ts` (`draft-steps`, keywords "versions", "how it changed"), `compare/use-compare.ts` (an optional step context: `open(a, b, { step: { from: number; to: number } })` so Compare's bar shows Previous step / Next step)

**Interfaces — Produces:**
```ts
export interface DraftStep { from: DraftRow | null /* null for "before Draft 1" never; steps start at 1→2 */; to: DraftRow | 'now'; words: number /* delta */; pages: number | null; added: number; cut: number; changed: number; newShare: number /* 0..1 */ }
export function draftSteps(rows: readonly DraftRow[], texts: (n: number) => Promise<string>, kind: WorkKind, nowText: string): Promise<DraftStep[]>;
```
- Counts: scenes (scripts) or `#`–`###` sections (documents) matched across the two texts — added (in `to` only), cut (via `findCuts`), changed (matched but not identical); `newShare` = share of `to`'s words not in a matched unchanged unit; computed in the history worker, cached by the pair of IDs.
- The pane lists steps oldest first as a short timeline: marker ("Draft 3 begins — builds on Draft 2"), note, date, the numbers in words ("+1,240 words · 3 scenes added · 2 cut · 5 changed · 18% new"). Opening a step opens Compare for that pair with Previous/Next step, and lists that step's cuts (from Cuts, by draft number) beside it.

- [ ] **Step 1: Write the failing tests.** `draft-steps.test.ts`: `steps are consecutive drafts then the last to now`; `counts added, cut, and changed scenes`; `counts sections for a Markdown document`; `the share of new words`; `cached by the pair of IDs`. e2e `draft-steps.spec.ts`: `Draft by draft lists each step with its marker and numbers`; `opening a step shows its changes and Next step walks on`; `a step lists the cuts made while writing it`; a11y in both themes.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them**, plus `compare.spec.ts`, `compare-changes.spec.ts` → PASS.
- [ ] **Step 5: Commit.** `feat(web): Draft by draft: how the work changed, one draft at a time`

### Task 6: Writing beside the work — the desktop

**Files:**
- Create: `apps/desktop/src/beside.ts`, `apps/desktop/test/beside.test.ts`, `apps/desktop/e2e/beside.spec.ts`
- Modify: `apps/desktop/src/channels.ts` (`drafter:files:write-beside`, `drafter:files:read-beside`, `drafter:files:list-beside`), `apps/desktop/src/files-ipc.ts`, `apps/desktop/src/preload*.ts`, `apps/web/app/desktop.ts` (`DesktopFilesBridge` gains `writeBeside`, `readBeside`, `listBeside`)

**Interfaces — Produces (bridge):**
```ts
writeBeside(script: string /* the granted script's path */, rel: string /* "Boca drafts/Boca – Draft 01.fountain" | "Boca.fountain.cuts.md" */, data: Uint8Array, mode: 'create' | 'replace'): Promise<'written' | 'exists'>;
readBeside(script: string, rel: string): Promise<Uint8Array | null>;
listBeside(script: string, folder: string /* "Boca drafts" */): Promise<string[]>;
```
- Allowed only when `script` has a grant (`grants.allowed`); `rel` is one or two path segments, each passing the `drafter convert` name rules (no separators beyond the one folder, no `..`, no NUL, ≤ 255 bytes), resolved inside `dirname(script)`; the folder is made if missing (never through a link: `lstat` each component); `create` = temp file + `link()` (fails `exists`, never follows a link); `replace` = temp file + `rename` (never follows a link; refuses if the target is a directory); extensions limited to `.fountain`, `.md`, `.cuts.md`; reads capped as Open's.

- [ ] **Step 1: Write the failing tests.** `beside.test.ts`: `writes a draft file beside a granted script and makes the folder`; `create never overwrites` (`exists`); `replace swaps atomically`; `refuses an ungranted script`; `refuses .., separators, NUL, long names, other extensions`; `never follows a link at the file, the folder, or the parent`. e2e `beside.spec.ts`: `starting a draft writes "Boca drafts/Boca – Draft 01.fountain" beside the script and the file verifies`; `a cut writes Boca.fountain.cuts.md`; `a pre-existing draft file is never overwritten`; `a symlinked drafts folder is refused`; `reopening the script merges the files into the lists` (Task 7's merge).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them** and `pnpm --filter @drafter/desktop e2e` → PASS.
- [ ] **Step 5: Commit.** `feat(desktop): drafts and cuts written beside the script, never over a file and never through a link`

### Task 7: Writing beside the work — the app: when, where, merging, and exporting

**Files:**
- Create: `apps/web/app/beside/beside.ts`, `beside/web.ts`, `beside/desktop.ts`, `beside/export.ts`; tests `apps/web/test/beside.test.ts`, `apps/web/e2e/beside-web.spec.ts`
- Modify: `apps/web/e2e/fs-stub.ts` (stub `showDirectoryPicker` with an OPFS directory, as the file pickers are), `drafts/use-drafts.ts` and `cuts/use-cuts.ts` (write after each freeze/record; the `where` state), `storage/db.ts` (a `handles` row per project for the folder: `folder:<projectId>`), `components/DraftsPane.vue`, `CutsPane.vue` (the "Saved beside Boca.fountain" / "In this browser only — Export" line and buttons), `storage/open.ts` (after opening, merge drafts and cuts found beside the file)

**Interfaces — Produces:**
```ts
export interface Beside { where: 'beside' | 'browser'; writeDraft(row: DraftRow, text: string): Promise<boolean>; writeCuts(entries: readonly CutEntry[]): Promise<boolean>; readAll(): Promise<{ drafts: { name: string; file: string }[]; cuts: string | null }>; askForFolder(): Promise<boolean> }
export function besideFor(projectId: string): Promise<Beside>;
export async function exportDraftsAndCuts(projectId: string): Promise<Uint8Array>; // zipStored: "<Work> drafts/…", "<work>.cuts.md"
```
- Cuts file writing: read the current file, `mergeCuts(file entries, stored entries)`, write the result with `replace` (desktop) or `createWritable` (web), so another computer's entries are kept; also merge the file's entries into storage.
- Draft files: `create` only; a name that exists with a different ID (another computer's Draft 4) keeps both: the second is written as `Boca – Draft 04 (2).fountain` and listed as Draft 4 (from another computer) with its own ID — never overwritten.
- Web Chromium: `askForFolder()` runs `showDirectoryPicker`, checks the folder contains the script's file (`isSameEntry` over its entries), else explains and asks again; remembers it per project; the first freeze or cut that needs writing asks once ("Keep drafts and cuts next to Boca.fountain?"). Declined or other browsers: `where = 'browser'`, and the panes offer **Export drafts and cuts** (`files.download`).
- Opening a work merges what's beside it: draft files verified by ID (a mismatch is listed "changed outside Drafter", kept), cuts merged by ID.
- **Save As** to a new name or place writes the complete set again beside the new file (every draft file and the merged cuts file) and leaves the old ones; the project remembers the new names. A work whose file was renamed outside Drafter: on open, no folder of the new stem exists, so the full set is written beside it and the panes say so once.
- **Opening a draft file itself** (`Boca – Draft 03.fountain`, recognised by its block's `draft` and `id`) opens it as a normal script with a note bar: "This is Draft 3 of Boca. Open Boca instead?" (the button opens the work's file beside it if there is one).

- [ ] **Step 1: Write the failing tests.** `beside.test.ts` (fake handles): `a freeze writes its draft file once`; `the cuts file is merged with what is on disk before writing` (an entry only on disk survives); `another computer's Draft 4 is kept as "(2)"`; `an edited draft file is listed as changed outside Drafter`; `the export zip holds the drafts folder and the cuts file` (read back with `listZip`). e2e `beside-web.spec.ts` (chromium): `granting the script's folder writes drafts and cuts beside it`; `picking a folder without the script asks again`; `declining keeps them in the browser and says so`; (firefox) `Export drafts and cuts downloads a zip`; `Save As writes the full set beside the new file and leaves the old`; `opening a draft file shows the note bar and Open Boca instead works`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them**, plus `save.spec.ts`, `open.spec.ts`, `drafts.spec.ts`, `cuts.spec.ts` on all five projects, and the desktop e2e → PASS.
- [ ] **Step 5: Commit.** `feat(web): drafts and cuts beside the work, merged on open, and exported where they can't be written`

### Task 8: Docs, help, and the release gates

**Files:**
- Modify: `README.md` (What you can do today: drafts and cuts; status; roadmap; Formats mentions the drafts folder and cuts file), help pages (a "Drafts and cuts" page in the writer's words: what a draft is, starting one, Draft by draft, Cuts, where they're kept, two computers), `docs/DECISIONS.md` (every Call as it landed, with measured numbers), `docs/DEFERRED.md` (§10's list), `CHANGELOG.md` `[Unreleased]`, `docs/drafter-phase2-design.md` §22 (built), `docs/drafter-architecture.md`, `apps/web/app/about/tech.ts` + `docs/technical-details.md`, `packages/history/README.md`, `packages/markdown/README.md`, `docs/drafter-version-history-design.md` (a note that Cuts replaced Deleted scenes in v0.23.0)

- [ ] **Step 1: Write the docs** above; README stays concise.
- [ ] **Step 2: Full gates:** `set -e; pnpm install; pnpm -r --filter "./packages/*" build; pnpm check; pnpm -r typecheck; pnpm test` (re-run load-sensitive failures alone and record both), the web e2e on all five projects, `pnpm --filter @drafter/desktop e2e`.
- [ ] **Step 3: Commit.** `docs: Drafts and Cuts in the README, the help, and the decisions`
