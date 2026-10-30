# Version history — Design

**Status:** designed 2026-10-30, to ship as v0.18.0, after v0.17.0 (guided starters, export options, running time, and a Technical details page) and before the imports release (Highland, Fade In, and Markdown). The plan is [`docs/plans/2026-10-30-version-history.md`](plans/2026-10-30-version-history.md).

**Asked for (maintainer, 2026-10-29):** "version control for deleted scenes like this? … it's possible to go back to a version to find a specific scene -- or to see all the deleted scenes in a toggle-able command -- 'show all versions' -- where you can see the deletions and additions." Then "sort of like github diffs", and "i like the idea of how github displays diffs -- red for deletions, green for additions. Does something like this work?" It does, and four things were promised:

1. **Deleted scenes:** one list of every scene found in some snapshot but not in the script now, with the version it was last in, a preview, and **Put back**, which restores it at its old place, between its old neighbours, as one undo.
2. **Show changes:** a toggle on the Script pane that marks additions and deletions on the live pages against a chosen version (the last save by default, or a labelled snapshot). Off, the pages are clean.
3. **A GitHub-style diff view in Compare,** beside the script-page view: green additions with "+", red deletions with "−", the changed words highlighted within a changed line, unchanged stretches folded ("Show 40 unchanged lines"), and changes grouped under their scene heading, each group going to its scene; unified or side by side; never color alone, with a blue and orange choice for color-blind readers.
4. **History of this scene,** from the Outline, the Cards, the Structure strip, and the palette: every version of just that scene.

**Clean room (binding).** The idea of a diff shown as colored lines with + and − signs is common property; the look, words, and code here are Drafter's own. No code, stylesheets, icons, or markup from GitHub, Final Draft, or any diff viewer or library. The word diff is Myers on words, reusing `@drafter/compare`'s own `diffLines` (written from the published algorithm, DECISIONS 2026-10-29); the scene matching is written for this release from a description of shingling and bottom-k sketches, not from any library. Every test script is original text written for Drafter.

Each choice open to the designer is marked **Call:**, and all of them are listed in §15.

## 1. What exists to build on

Plan C (v0.13.0, Phase 2 design §11) built the history this release reads:

- **Snapshots** of the whole text in IndexedDB (`storage/snapshots.ts`): every 10 minutes of active writing, on every save and open, on Take snapshot (with a label), and before bulk operations; gzip through `CompressionStream`; thinned to every one for a day, one an hour for a week, one a day for 90 days, and every labelled one forever. A snapshot's text never changes after it is taken; only its label can.
- **The saved row,** `saved:<projectId>`, the text as last saved to its file (`getSavedText`), which Revert to Saved reads.
- **The History dialog** (`HistoryDialog.vue`): Restore, Compare with now, Compare with…, Label…, Save as a file, Delete.
- **`@drafter/compare`:** `diffLines` (linear-space Myers on interned lines), `changesOf` (changes with their lines on both sides and their span in the newer text), `markPages` (changes placed on the newer version's laid-out pages by span), `stepChange`.
- **The Compare tab** (`use-compare.ts`, `ComparePane.vue`, `CompareLines.vue`, `draw.ts`): the newer version as pages, asterisks in the right margin, "3 lines removed" buttons, a Changes list, N and Shift+N, a hidden "changed, " or "added, " for a screen reader.
- **The scene index** (`sceneIndex` in `@drafter/outline`): each scene's heading, span, and ordinal, a play's `##` scenes included; session scene ids from `cm-fountain`'s `sceneIds`.

## 2. How this relates to revision marks (Phase 4)

Revision marks are a production tool: a script locked at a draft, then each revision set in its color (blue, pink, yellow…), asterisks that **print**, locked pages and A-pages. None of that is built here. **Show changes** is a reading tool: what changed since a version the writer picks, on screen only. It never prints, never exports, never saves into the file, and never touches the layout. Phase 4 will build on the same pieces (a baseline version, `changesOf`, `markPages`, the marks drawn on live pages), and is where move detection and printed asterisks belong. **Call:** nothing here is named "revision", so the word stays free for Phase 4.

## 3. Deleted scenes

### 3.1 What counts as deleted

A **deleted scene** is a scene found in at least one snapshot that matches **no** scene in the script as it is now. The question asked is "is this scene's text gone from the script?", not "how many copies are there?".

- **Call:** **many to one.** A past scene counts as present if any scene now matches it. A scene copied and the copy later deleted is not a deleted scene; its text is still there.
- Only scenes. The title page and the text before the first scene are not listed (Compare shows changes to them). A section (`#`) is not a scene and is not listed; a play's `##` scenes are, since the scene index reads them as scenes.
- **Call:** **not for Markdown documents.** A Markdown document has no scenes; the command and the tab say "A Markdown document has no scenes." Compare's diff view (§5) serves Markdown fully.

### 3.2 Matching a scene across versions

Each scene version is reduced to a **scene print** (in `@drafter/history`, §11):

| Field | What it is |
|---|---|
| `hash` | A 53-bit non-cryptographic hash of the scene's source text, normalized: `\r\n` as `\n`, trailing spaces off each line, trailing blank lines dropped. Two prints with the same hash are the same version. |
| `headingKey` | The heading's text, upper-cased, whitespace collapsed, the locked number (`#12A#`) dropped, every dash (`-`, `–`, `—`) read as `-`, and trailing punctuation dropped. |
| `heading` | The heading as written, for display. |
| `shingles` | How many distinct three-word shingles the scene's **printed** words make (action, dialogue, character cues, parentheticals, transitions: not notes, boneyard, synopses, or the heading). |
| `sketch` | The 64 smallest 32-bit hashes of those shingles (all of them when there are fewer), sorted: a bottom-k sketch. |
| `words` | Printed words, as the scene index counts them. |
| `preview` | The first three printed lines of the scene, at most 240 characters, for the list. |

A scene with fewer than three printed words has one shingle, its words joined; a scene with none has an empty sketch.

- **Call:** **the 53-bit hash is written for Drafter** (two 32-bit multiply-and-xor lanes combined), not SHA-256. A cold scan (§3.4) hashes tens of thousands of scene versions, and `crypto.subtle.digest` is asynchronous and about a hundred times slower per call. A collision only makes two versions read as one; the test suite pins the hash's values.
- **Call:** **shingles of three printed words, a sketch of 64.** Three words are enough that two different scenes rarely share many shingles, and few enough that a light edit leaves most shingles alone. A bottom-k sketch of 64 estimates the Jaccard similarity of two scenes with an error around 0.06 at 0.5, in 256 bytes per scene, and is exact for scenes of up to 64 shingles (about a third of a page).

From two sketches, `similarity(a, b)` estimates **J**, the Jaccard similarity (shared shingles over all shingles), from the 64 smallest hashes of the two sketches merged; and **C**, the containment (shared shingles over the smaller scene's), as `J × (|A| + |B|) / ((1 + J) × min(|A|, |B|))`.

**Call:** **two scene versions are the same scene when:**

1. their `hash`es are equal; or
2. their `headingKey`s are equal and either both have no printed words or `C ≥ 0.25`; or
3. `J ≥ 0.5`, whatever their headings.

Reasons: rule 2 keeps a scene the writer has cut hard or rewritten under its own heading (a scene cut to a quarter of its length has C = 1); the containment threshold stops a different scene with the same common heading ("INT. CAR - NIGHT" five times) from passing for it. Rule 3 keeps a scene whose heading was renamed but whose text mostly stayed. The thresholds are constants in one place (`MATCH`), fixed by fixtures written for Drafter (a trimmed scene, a renamed heading, a rewrite under one heading, five car scenes with one deleted, a split scene, two merged scenes).

### 3.3 The list

The deleted versions of one scene across many snapshots are one entry. Walking the snapshots newest first, a deleted scene version joins the entry whose **newest** version or **most recently added** version it matches (by the rules above), else it starts a new entry. Each entry has:

- the scene's newest deleted version (its heading, preview, words), and the snapshot it is from: **"Last in Tuesday, 27 October, 10:42 (Saved)"**, the History dialog's words for the snapshot;
- how many versions held it: "In 6 versions, from 21 October";
- its neighbours in that snapshot, for Put back (§3.5).

**Call:** **newest deleted first,** by the time of the snapshot each was last in, so what was cut today is at the top. A **Filter** field matches headings and preview text (case and accents folded). Each row: the heading (a heading of its own, level 3, for heading navigation), the "Last in" line, the preview, and three buttons: **Show text** (the whole scene from that snapshot, as monospaced source, read-only, in a region under the row), **Put back**, and **History of this scene** (§6). A ⋯ menu adds **Compare that version with now** (Compare between that snapshot and now, opened at the scene's group, §5.4) and **Copy text**.

**Call:** **no Dismiss in v1.** Retention already ages unlabelled snapshots out after 90 days, the list is newest first and filterable, and a dismissed list is state that would need its own storage and an undo. Deferred.

### 3.4 Scanning, bounded

A script can have hundreds of snapshots (about 140 in a busy day, 168 hourly for a week, 90 daily, and every labelled one), each the whole script, compressed.

- **Call:** **in a worker of its own** (`workers/history.worker.ts`), made when Deleted scenes or Scene history opens and ended when both close, as Compare's layout worker is. The main thread never decompresses, parses, or matches a snapshot.
- **Call:** **lazily, newest first, and cached.** The worker lists the script's snapshots, and for each one, newest first, looks for its prints in the cache (§3.6); only on a miss does it read the row, gunzip it, parse it, take the scene index (with the template the snapshot's own text names), and make its prints, storing them. A scene version whose `hash` already has a print (the common case: most scenes don't change between snapshots) is not shingled again.
- **Results stream.** After each batch of snapshots (at most every 100 ms) the worker sends the list as it stands with its progress, so the list fills from the top while older snapshots are read: "Reading versions… 120 of 300". Matching against the script now is redone, from cached prints, when the text changes (1 second after typing stops, while the tab is open).
- **Cancellation.** Each request has a number; a newer one (the text changed, the script switched) stops the older at its next snapshot.

**Budgets** (Chromium, the maintainer's machine; timing tests by growth, with an e2e hang guard, as DECISIONS 2026-10-29 sets):

| Work | Budget |
|---|---|
| Prints of one snapshot of a 120-page script (about 150 scenes): read, gunzip, parse, index, print | 40 ms |
| First rows of the list on screen, cold cache | 1 s |
| A cold scan of 300 such snapshots | 10 s, with progress |
| A warm scan (every print cached) of 300 snapshots | 500 ms |
| Matching the cached prints against the script now, after typing | 50 ms |
| Main-thread work per streamed update | no long task (over 50 ms) |
| Snapshots read | at most 1,000, newest first; older ones are named in a note ("Only the newest 1,000 versions were read") |

Matching stays bounded because most comparisons are a map lookup: a scene version is checked first by `hash` against the prints now, then by `headingKey` against the scenes now with that key, and only a version neither finds is compared with every scene now, and each distinct version (by `hash`) only once per scan.

### 3.5 Put back

**Put back** inserts the entry's newest version, the scene's whole source from that snapshot (heading to the end of its last block, keyed notes included), into the script now, at its old place:

1. In the snapshot it was last in, take its previous scene P and its next scene N.
2. **Call:** if a section heading (`#`, or a play's act) stood between P and the scene in that snapshot, the scene opened a section: anchor on N, and put it **before** the scene now matching N. Otherwise anchor on P, and put it **after** the scene now matching P (at the end of P's span). So a scene that opened Act Two goes back after `# ACT TWO`, and one that closed Act One goes back before it.
3. If the anchor has no match now, try the other neighbour, then the next ones out (P's previous, N's next…), alternating, nearest first.
4. If no neighbour has a match, it goes at the end of the script.

The insertion keeps one blank line on each side. It is one transaction through the Outline's `apply` (one undo), refused with the Outline's reason in a read-only tab or with an unclosed `/*`. **Call:** **no snapshot is taken first**: it only adds text, and undo takes it out, as a scene move (Phase 2 design §11.1). It says "Put back INT. HALL - NIGHT after INT. KITCHEN - DAY. Undo takes it out." (or "before …", or "at the end"), moves the editor's cursor to the scene's heading (so the Script pane shows it), and keeps focus in the list, on the next row, so several can be put back in turn. The entry leaves the list at the next match.

A locked scene number in the put-back heading (`#12#`) is kept as written, even if another scene now has it: renumbering is the writer's (and Phase 4's locked pages'). Drafter has no lint for a repeated scene number yet; one is deferred.

### 3.6 The prints cache

**Call:** **a cache database of its own,** IndexedDB `drafter-cache` (Dexie, version 1), not a new table in `drafter`. Reasons: Plan C kept `drafter` at version 1 so no plan needs a migration (DECISIONS, Call 1), and a version bump would close the database in a tab still running the old code, which would stop that tab's recovery copy and saves until it reloads; the prints are derived data, rebuilt by a scan if lost. Prints on the snapshot rows themselves (no bump) were considered: about 25 KB per snapshot of a 120-page script, mostly repeating, against about 40 bytes per scene here, where each scene version's print is stored once.

| Table | Key | Holds |
|---|---|---|
| `prints` | `[projectId+hash]`, index `projectId` | One scene print per distinct scene version. |
| `snapshotScenes` | `id` (the snapshot's), index `projectId` | `{ id, projectId, version, scenes: { hash, ordinal, from, to, section }[] }`: the snapshot's scenes in order, with their span in its text and whether a section heading came just before. |

- `version` is `PRINT_VERSION`; a row of another version is read as a miss, so changing how prints are made rebuilds them.
- **Swept** at the end of every full scan: `snapshotScenes` rows whose snapshot is gone are deleted, then `prints` no remaining row names.
- **Removed with the script:** `removeProject` also deletes the script's rows from `drafter-cache` (after its own transaction, since they are separate databases; a failure there is retried at the next scan's sweep). The prints hold headings and preview text, so they must not outlive the script. The Privacy page says so.
- A browser where the cache can't open (private windows in some browsers) scans without it, every time, with the same results.

## 4. Show changes on the Script pane

### 4.1 The toggle

**Show changes** is a toggle on the Script pane's slim bar, after the page label: a button **Changes** with `aria-pressed`, and, while on, a menu button **since: Last save ▾** naming the baseline. Also the palette's **Show changes** (View; its title says "Hide changes" while on) and the desktop View menu. **Call:** **not remembered** between visits, and off on every load: pages should open clean, and Show changes is something the writer looks with, then turns off.

- **Call:** **the default baseline is the last save** (`getSavedText`), re-read after every save, so after saving the marks are gone. A script never saved to a file defaults to its oldest snapshot ("since: First version"). With neither, the toggle is off and says "Nothing to compare with yet: save, or take a snapshot."
- The baseline menu lists **Last save**, every labelled snapshot (by label, newest first), the version picked from History if one was, and **Another version…** (opens History). History's row menu gains **Show changes since this**, which turns the toggle on with that snapshot.
- A baseline snapshot deleted or thinned meanwhile falls back to Last save and says so once.
- **Call:** **Markdown documents:** the toggle is off with "A Markdown document’s changes are in Compare." The Preview has no source positions to mark (it drops them); Compare's diff view (§5) shows a Markdown document's changes.

### 4.2 Computing the marks

- **Call:** **in the layout worker,** after the layout, as a **second reply** with the same request number. The Script pane's request carries the baseline's id; the baseline's text is sent once per change of baseline and kept in the worker. The worker answers the layout first (so pages never wait on a diff) and then `markPages(layout, changesOf(baseline, source))`. A layout's marks are always of the text it was laid out from, so spans never drift.
- Budget: the diff and marks of a 120-page script against a baseline with 30% of its lines changed add under 30 ms to the worker per layout, measured by growth.

### 4.3 The marks

The same visual language as Compare's diff view (§5.3), at line level:

- An added or changed printed line: a tinted band behind it, a 3 px bar and a **+** in the left margin (hidden from a screen reader), and a hidden "added, " or "changed, " at its start.
- Removed lines: a thin red rule between lines with a button "− 3 lines removed" in the left margin; pressing it shows the removed lines under the rule, struck through, in the deletion tint.
- A change that prints nothing (a note, a synopsis): the rule and button, as Compare's "1 line changed that doesn’t print".

**Call:** **line level only on the pages.** Printed lines are not the source (emphasis marks are gone, cues are upper-cased, lines wrap), so word marks would need a second mapping; the words are in Compare's diff view.

**Getting around:** **Next change** and **Previous change** (palette and View menu) step through the Script pane's marks when Show changes is on and no comparison is open; **N** and **Shift+N** do the same while focus is in the Script pane, as in the Compare tab. Each puts focus on the mark and says "Page 12, INT. HALL: 2 lines changed".

The marks go on the pages the view has drawn, after each draw (`decorate`, §11): pages kept from the last draw are unmarked and marked again only when they had marks or have them now.

## 5. Compare's diff view

### 5.1 Two views

The Compare tab's slim bar gains a two-button group, **Changes | Pages**. **Call:** **Changes**, the Fountain-text diff, is the default, and the writer's last choice is remembered on the device (`compareView`). **Pages** is today's script-page view, restyled to the marks of §4.3 (the asterisk retires from the screen; Phase 4's printed revision marks bring it back). A Markdown document has only Changes (its line view, `CompareLines`, gives way to it); a script whose layout failed has Changes, and Pages says the layout failed.

In Changes, a second group, **Unified | Side by side**, remembered on the device (`diffLayout`). **Call:** side by side needs a Compare pane at least 720 px wide; narrower (a phone, a narrow pane), the group is hidden and the view is unified.

### 5.2 Grouped by scene

The diff is laid out as one sequence of rows in unified order (unchanged, removed, added), then cut into **groups** at every row that starts a scene: in the older text for a removed row, in the newer for the others. So:

- a scene that is in both versions is one group, headed by its heading;
- a scene only in the newer version is a group marked **New scene**;
- a scene only in the older one is a group marked **Deleted scene**, with a link **Find in Deleted scenes**;
- a heading that was edited (its removed and added heading rows paired in one change, §5.3) is one group, "INT. HALL → INT. HALLWAY";
- rows before the first scene are a group **Title page and opening**.

**Call:** for a Markdown document, groups start at headings of levels 1 to 3, found by a line scan that skips fenced code; deeper headings are ordinary lines.

Each group's header: its heading (an `h3`, so heading navigation moves group to group), its tag (New scene, Deleted scene, Renamed), its counts "+12 −3", a **Go to scene** button, and a collapse toggle. **Go to scene** puts the editor's cursor at that scene in the script **now**: by its offset when the newer side is now and the text hasn't changed since Compare opened, else the scene now matching it (§3.2), else it says "That scene isn’t in the script now." Groups with no changes are not shown; the top of the view says "12 scenes changed, 2 new, 1 deleted · 140 lines added, 62 removed", or "No changes: the two versions are the same."

**Call:** **Compare stays read-only** (Phase 2 design §11.2): no Put back or restore in it. A deleted scene's group links to Deleted scenes, where Put back is.

### 5.3 Rows, signs, and words

- Each row has the older line's number, the newer's (each hidden from a screen reader), a sign column (**+**, **−**, or blank, hidden from a screen reader), and the line's text, keeping its spaces (`white-space: pre-wrap`, Courier Prime). An added row has the addition tint, a removed row the deletion tint.
- **Words:** in a change that removed some lines and added others, removed line *i* is paired with added line *i*. **Call:** **positional pairing,** kept only when the two lines' word similarity (Dice over their words) is at least 0.4; an unpaired line gets no word marks. Most edits change a line in place, and positional pairing is predictable. A pair's changed words are drawn in a stronger tint, and **inserted words are underlined and deleted words struck through**, so which words changed is never told by color alone (WCAG 1.4.1).
- **Call:** **the word diff** (`diffWords` in `@drafter/compare`) splits a line into tokens (a run of letters, digits, `'` and `’`; a run of whitespace; any other single character), diffs them with `diffLines` on the tokens, and merges: an unchanged run of only whitespace, or of one or two characters, between two changes is folded into the change, so "the cat sat" → "a dog stood" reads as one change, not confetti. A line of over 2,000 tokens gets no word marks.
- **For a screen reader:** a row starts with a hidden "added, " or "removed, " (so the + and − are spoken as words, never as "plus" and "minus"), then the whole line. **Call:** the word highlights add no speech: both whole lines are read, so nothing is lost, and spoken word marks make a line hard to follow.

### 5.4 Folding

- **Call:** **three lines of context** around each change, as in a unified diff. Longer unchanged stretches inside a group fold into a button: "Show 40 unchanged lines". **Call:** a fold opens whole up to 200 lines; a longer one opens 200 at a time, its button counting what's left.
- A group with more than 400 changed lines starts collapsed, its header saying "Large change: 1,240 lines. Show".
- Opening Compare from Deleted scenes or Scene history scrolls to that scene's group and focuses its header.

### 5.5 Side by side

Two columns, **Before** and **After**, headed by the versions' labels ("10:42", "now (10:58)"). Unchanged rows stand side by side; in a change, removed lines go left and added lines right, paired positionally, with blank cells to fill. It is a `<table>` with column headers, so a screen reader reads each row's two cells with their column names; each cell keeps its hidden "removed, " or "added, ".

### 5.6 Getting around

The Changes list above the view and **N** / **Shift+N** reach every change in the Changes view too: a stop is a change (as now), focus goes to its first row, and its label is "INT. HALL: 2 lines changed" (no page in the text view; "Line 40: …" before the first scene or in a Markdown document without headings).

## 6. History of this scene

**History of this scene…** is in a scene's menu (the Outline's and the Cards', which share `sceneMenuItems`), in the Structure strip's new block menu (§6.2), in the palette (for the scene holding the cursor), and in Deleted scenes (for that entry).

### 6.1 The dialog

**Call:** **a dialog,** as History is (on a phone it fills the screen): the scene's versions in a listbox on the left, newest first, and on the right the diff of the selected version (§5's view, one group, unified or side by side by `diffLayout`). It opens on the newest version that differs from now.

- **Versions:** walking the snapshots newest first, the scene's version in each is the best match (highest J among the scenes that match by §3.2; on a tie, the same heading, then the nearest ordinal) to the version found in the next newer snapshot, else to the scene now. **Call:** **chaining** from version to version, so a scene renamed and rewritten bit by bit over weeks is still followed. A snapshot with no match is "Not in this version" and the walk goes on, matching against the last version found, so a scene cut and later put back keeps its history.
- **Call:** **one row per distinct version:** consecutive snapshots with the same `hash` are one row, "Unchanged in 14 versions, Monday 9:10 to Tuesday 10:42", dated by the newest. Each row says the time, the snapshot's reason or label, and its change in words against the next older version (History's `wordsChange`).
- **Compare with:** a two-button group above the diff, **Now** (default) and **Version before**.
- **Use this version** replaces the scene now with the selected version's text: one transaction through the Outline's `apply`, one undo. **Call:** it takes a snapshot first, with a new reason `before-scene-restore` ("Before restoring a scene"): unlike Put back it removes text. It says "INT. HALL is as it was on Tuesday at 10:42. Undo brings back what it replaced." Off, with the reason, in a read-only tab, and for a deleted scene (whose action is Put back).
- **Copy text** copies the selected version.
- Keys, as History's list: Up, Down, Home, End; Enter compares the version with now; U uses it; the context-menu key or Shift+F10 opens its menu.

### 6.2 The Structure strip's block menu

The strip had no menu. **Call:** the context-menu key, Shift+F10, or a right-click on a scene block opens a menu of **Go to** and **History of this scene…**; on a section block, only **Go to**. The strip stays one Tab stop.

## 7. Colors

**Call:** two palettes, a Settings select **Colors for changes**: **Red and green** (default) and **Blue and orange** (`diffColors`), for readers who can't tell red from green. Each has tokens for both themes:

| Token | What |
|---|---|
| `--diff-add-bg`, `--diff-del-bg` | A changed row's tint |
| `--diff-add-word`, `--diff-del-word` | A changed word's stronger tint |
| `--diff-add-sign`, `--diff-del-sign` | The sign, the bar, and the rule |
| `--diff-fold-bg` | A fold and a group header |

The values are Drafter's own, chosen for contrast: the text on every tint at least 4.5:1, the signs at least 4.5:1 against the tints (they are text), and the bar and rule at least 3:1 against the page. A unit test computes every pair in both themes and both palettes. Blue and orange put additions in blue and deletions in orange.

## 8. Commands and menus

| Command | Group | Where |
|---|---|---|
| `deleted-scenes` **Deleted scenes** | File | palette, app menu (after History…), desktop File menu, History's header |
| `show-changes` **Show changes** / **Hide changes** | View | palette, the Script pane's slim bar, desktop View menu |
| `scene-history` **History of this scene…** | Go | palette (the cursor's scene), scene menus, the strip's block menu |
| `compare-changes-view`, `compare-pages-view` | View | palette, while a comparison is open |

**Call:** **no new default keys.** N and Shift+N are the only keys, as in Compare; the rest are on the palette and menus, and the Keyboard shortcuts page lists the new list keys (Deleted scenes, Scene history) under Other keys. The palette also finds Deleted scenes by "show all versions" and "versions" (the maintainer's words): `CommandData` gains an optional `keywords: string[]`, which the palette's search reads beside the title.

## 9. Where Deleted scenes lives

**Call:** **a tab that exists only while open,** as Compare is: `DELETED_TAB` (`{ id: 'deleted', label: 'Deleted scenes' }`), placed by `revealTab` in the pane not showing Source, with **Close** on its slim bar. Reasons: Put back changes the script, and the writer wants to see the script beside the list as scenes come back, which a modal dialog would hide; a permanent tab would add to every script's row for something used now and then. Its slim bar says "12 deleted scenes" and, while scanning, "Reading versions… 120 of 300" (a `progress` element with its text). On a phone it is the one pane's tab.

## 10. Read-only and empty states

- A **read-only** tab (another tab edits, or the file is being checked) lists deleted scenes and scene versions and compares them; Put back and Use this version are `aria-disabled` with the reason shown and said (History's pattern, DECISIONS Call 25).
- A **sample** keeps no snapshots: Deleted scenes and Scene history say "Snapshots aren’t kept for a sample…" (the session's own words).
- **No deleted scenes:** "No deleted scenes. Every scene in your versions is still in the script." Older snapshots unreadable (no `DecompressionStream`, or damaged) are skipped and counted: "2 versions couldn’t be read."

## 11. Where the code goes

- **`@drafter/compare`** (stays parse-free): `diffWords`, `diffRows` (the unified rows with their line numbers), `foldRows` (context and folds), `groupRows` (cut at anchor lines given as data), `pairRows` (side by side). Pure, tested in Node.
- **Call:** **a new package, `@drafter/history`**, for what needs a parse: `scenePrints(text)` (parse, scene index, prints), `hash53`, `sketchOf`, `similarity`, `sameScene`, `deletedScenes`, `sceneVersions`, `putBackPlace`, `putBackChanges`, and `sceneAnchors` (the scene-heading lines for `groupRows`). It depends on `@drafter/fountain`, `@drafter/outline`, and `@drafter/templates` at runtime, and nothing else. Reasons: matching and placement are pure and want the Outline's random-script arbitraries for property tests; `@drafter/compare` stays a text diff that doesn't parse.
- **`@drafter/render-html`:** `createScriptView` gains an option `decorate(el, page)` called for each page it builds or keeps, and a method `redecorate()`, so the Script pane's marks go on as pages are drawn.
- **`apps/web`:** `history/` (the worker client, the cache, the Deleted scenes and Scene history sessions, labels), `workers/history.worker.ts` and `history-compute.ts`, `compare/` (the Changes view's model, the live marks), components `DiffView.vue`, `DiffGroup.vue`, `DeletedPane.vue`, `DeletedSlim.vue`, `SceneHistoryDialog.vue`, and the Settings, commands, menus, and help pages.
- **No new third-party dependency.** Dexie is already a dependency of `apps/web` and runs in a worker.

## 12. Accessibility

As the rest of Drafter (WCAG 2.2 AA):

- **Keyboard:** every list is one Tab stop with arrow keys (History's pattern); folds, group headers, Go to scene, and every button work by keyboard; N and Shift+N step through changes; nothing needs a pointer or a hover.
- **Not color alone:** + and − signs, underlined and struck-through words, the Deleted and New scene tags, and the hidden "added, ", "removed, ", "changed, " words.
- **Screen readers:** groups are headings; side by side is a table with column headers; a fold's button says how many lines it holds; scanning progress is a `progress` with a polite status at each quarter; Put back and Use this version announce what they did.
- **Both themes and phones:** every token has a dark value; on a phone, the diff is unified, the Deleted scenes tab and the Scene history dialog fill the screen, and touch targets are at least 24 px.
- **Call:** **the new colors' contrast is tested now** (§7's unit test), and **axe on the new views waits for the final accessibility steps,** as every Phase 2 plan's has (maintainer, 2026-10-28); the existing axe tests stay green. Listed in `docs/DEFERRED.md`.

## 13. Not in v1

Dismissing a deleted scene; Show changes on the Source pane (a gutter of + and −) and on the Markdown Preview; word marks on the pages; move detection (a moved scene still reads as deleted where it was and new where it is: Phase 4); printed marks and revision colors (Phase 4); comparing two scenes the writer picks by hand; a lint for a repeated locked scene number; a Deleted scenes view for Markdown sections; a fold that opens 20 lines at a time from either side; merging a deleted scene's lines into an existing scene. Each is a line in `docs/DEFERRED.md`.

## 14. Version numbers

This release is v0.18.0, as Phase 2 design §22 already says, and changes no plan's number: Plans E to H stay v0.19.0 to v0.22.0. The imports release (Highland, Fade In, and Markdown) comes next and will take v0.19.0, moving Plans E to H to v0.20.0 to v0.23.0, letters unchanged; its own design says so when it lands. §22 gets a heading **Version history — v0.18.0** after v0.17.0's (Task 8).

## 15. Calls

1. Nothing here is called "revision"; Show changes never prints or saves (§2).
2. Deleted means no scene now matches it: many to one (§3.1).
3. Deleted scenes and Scene history are not for Markdown documents (§3.1).
4. Scene versions are hashed with a 53-bit hash written for Drafter, not SHA-256 (§3.2).
5. Shingles of three printed words; a bottom-k sketch of 64 (§3.2).
6. Same scene: equal hash; or equal heading key and (both empty or C ≥ 0.25); or J ≥ 0.5 (§3.2).
7. Deleted scenes newest-deleted first, with a filter (§3.3).
8. No Dismiss in v1 (§3.3).
9. Scanning in a worker of its own, made and ended with the views (§3.4).
10. Lazily, newest first, cached per snapshot and per scene version; results stream; budgets of §3.4; at most 1,000 snapshots (§3.4).
11. Put back anchors after its old previous scene, or before its old next one when it opened a section; then the nearest matched neighbour; else the end (§3.5).
12. Put back takes no snapshot first; focus stays in the list (§3.5).
13. A cache database of its own, `drafter-cache`, not a version bump of `drafter`; removed with the script (§3.6).
14. Show changes is not remembered and starts off (§4.1).
15. Its baseline is the last save by default, else the oldest snapshot (§4.1).
16. Show changes is off for Markdown documents (§4.1).
17. Show changes' marks are computed in the layout worker, as a second reply after the layout (§4.2).
18. Line level only on the pages (§4.3).
19. Compare opens on Changes, remembered; Pages takes the same +/− marks and the asterisk retires from the screen (§5.1).
20. Side by side needs a 720 px pane, else unified (§5.1).
21. Markdown groups at headings 1 to 3 (§5.2).
22. Compare stays read-only (§5.2).
23. Changed lines paired by position when similar (Dice ≥ 0.4); inserted words underlined and deleted ones struck through (§5.3).
24. The word diff: tokens, `diffLines` on them, small unchanged runs folded in; none past 2,000 tokens (§5.3).
25. Word highlights add no speech (§5.3).
26. Three lines of context; folds open whole up to 200 lines (§5.4).
27. Scene history is a dialog (§6.1).
28. Scene versions chain from version to version and go on past a gap (§6.1).
29. One row per distinct version (§6.1).
30. Use this version takes a `before-scene-restore` snapshot first (§6.1).
31. The Structure strip gets a block menu (§6.2).
32. Two palettes, red and green or blue and orange (§7).
33. No new default keys (§8).
34. Deleted scenes is a tab that exists only while open (§9).
35. A new package, `@drafter/history` (§11).
36. Contrast tested now; axe on the new views with the final accessibility steps (§12).
