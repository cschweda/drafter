# Drafts and Cuts — Design

**Status:** designed 2026-10-30; not built. Ships as **v0.23.0**, after Export as HTML and EPUB (v0.22.0) and before Novel (v0.24.0). For screenplays, stage plays, and Markdown documents (so novels too, when the Novel release lands).

**Asked for (maintainer, 2026-10-30), in their words:**
- "the ability to … delete a section but save it -- sort of like github (you can always see what was added or deleted). I don't want anything lost -- even chapters i delete -- since they may still be useful at a later point … I'd want this for all types -- play, screen, novel -- since I tend to delete things and then two weeks later want them back but in a different place -- or at least have the ability to read them again and copy-and-paste into another spot."
- "a cuts file that can be reestablished piecemeal."
- "I'd write everything as drafts -- i.e., draft 1, draft 2 ... draft 25 -- I'd like the ability to go back in time and see a draft. I may only use one thing from the first draft, but I don't want it disappeared. This is sort of like the github commits."
- "maybe each draft has its own sha … so it's possible to go back to a specific one via the sha/uuid … I would specifically indicate, okay, this is a new draft -- and then draft would increment by one. … I might write a first draft, send it out for review, get notes back, and then want to start a second draft."
- "drafts and cuts first" (before the Novel release).
- "i want the ability to load in a work-in-progress and say 'start new draft'. The idea here is that the new draft would be from notes and improvements and would be distinct from the previous draft. And I'd want a way to look at, say, draft 1, draft 2, draft 3 -- and see how things have changed over time. And have a 'draft' marker indicating that major shift: 'This builds on the previous -- but it's a new version.' … draft === version."

**What exists already (v0.18.0, `docs/drafter-version-history-design.md`):** snapshots of the whole text in IndexedDB (every 10 minutes of writing, on save and open, and on Take snapshot with a label), thinned to one a day for 90 days, labelled ones kept forever; Deleted scenes (scripts only) with Put back at the old place; GitHub-style Changes in Compare; History of this scene. This release builds on those pieces and closes the gaps the maintainer named: nothing deleted may age out, cuts must be usable anywhere (not only at the old place), Markdown documents need the same, and the work must live **with the writer's files**, not only in one browser.

**Clean room (binding).** Drafter's own design and wording. "Like GitHub commits" describes the idea (named versions with a content fingerprint); no code, format, or text from Git, GitHub, or any writing app's revision feature.

Each choice open to the designer is marked **Call:**; they are listed in §11.

## 1. Goals, non-goals, anti-goals

**Goals**
- A writer **starts a new draft** when they decide to; drafts are numbered 1, 2, 3 … and every one is kept forever, readable, comparable, and copyable from.
- Every draft has a **permanent ID** derived from its text, shown short (`a3f9c2e`) and usable to open it.
- **Anything cut is kept**: every scene (scripts) or chapter and section (Markdown) that leaves the text is saved in a permanent **Cuts** list, from which each piece can be read, copied, inserted anywhere, or put back where it was — one piece at a time.
- Drafts and cuts are **plain files beside the work**, so they are backed up wherever the writer's files are (Dropbox, Drive, OneDrive, a USB stick) and readable without Drafter.

**Non-goals**
- Branching, merging, or collaboration (no "two people's drafts"). Phase 4's revision colours and printed asterisks stay Phase 4.
- Tracking every keystroke: snapshots already do the fine-grained history; drafts are the writer's own milestones.

**Anti-goals (a failure even if it "works")**
- Anything the writer wrote disappears without them asking: a cut that ages out, a draft deleted by a stray click, a sidecar file overwritten.
- Drafts or cuts that exist only in one browser's storage when the writer believes they are saved.
- Clutter in Zen or on the page: nothing here shows while writing except a quiet draft label outside Zen.

## 2. Drafts

### 2.1 Starting a draft
- **Start new draft…** (File menu, palette, desktop File menu; no default key) freezes the text as it is now as **Draft N** and the writer carries on in **Draft N+1**. A script with no drafts yet is in Draft 1; starting the first new draft freezes Draft 1.
- **A work in progress works the same way.** Open any existing script or Markdown file — one written before this release, in another app, or imported from Final Draft, Highland, or Fade In — and choose Start new draft: what is there becomes **Draft 1**, and the writer carries on in **Draft 2**. Nothing has to be set up first.
- **The draft marker.** Starting a draft records a **marker**: "Draft 2 begins — builds on Draft 1 (a3f9c2e)", with the writer's note ("from Sam's notes"). The marker is what says *this is a new version*: it heads the draft in the Drafts list, and appears as a milestone wherever versions are listed (History's list of snapshots, Compare's version pickers), so the major shifts stand out from the automatic snapshots between them.
- A small dialog offers a **note** for the draft being frozen ("sent to Sam for notes"), optional, one line, editable later. Confirm with Enter; Escape cancels and nothing changes.
- **Call:** Drafter never starts a draft by itself. The number only goes up; it is never reused or renumbered.
- **Call:** freezing an unchanged text (the same ID as the last draft) asks "This text is the same as Draft N. Start Draft N+1 anyway?" — allowed (the writer may want a fresh number after notes), recorded as the same ID.

### 2.2 The ID
- **Call:** a draft's ID is the **SHA-256** of its exact text as UTF-8 (the text Save writes, line endings as stored), written in lowercase hex. The UI shows the first **7** characters; the full ID is stored and copied with "Copy full ID". Identical text always gives the same ID; any change gives another. It is the same hash every snapshot row already stores (`hash`, from `storage/hash.ts`'s `hashText`, Web Crypto), so a draft frozen from a snapshot's text has that snapshot's hash as its ID; no new hashing code.
- **Open by ID:** typing at least 4 hex characters of an ID in the palette lists the matching drafts ("Draft 2 · a3f9c2e · 12 Oct"); an ambiguous prefix lists all matches.

### 2.3 The Drafts list
**Drafts…** (File menu, palette, the status bar's draft label) opens a list, newest first: number, short ID, date and time, words (scripts also pages), note, and the current draft at the top marked "now". For each frozen draft:
- **Read** — opens it read-only beside the current text (the second pane), so any passage can be selected and copied across; its header says "Draft 2 · a3f9c2e · read-only".
- **Compare** — with now, or with another draft (a second picker), in Compare's Changes view (v0.18.0), GitHub-style.
- **Restore as a new draft** — **Call:** never overwrites: the current text is first frozen as a draft (note "before restoring Draft 3"), then Draft 3's text becomes the current text in a new number, noted "from Draft 3 (a3f9c2e)". One undo reverses it.
- **Copy full ID**, **Edit note**.
- **Call:** **no Delete for drafts** in this release. A draft is the writer's milestone; deleting it is the failure the anti-goals name. (Deleting a whole script's history stays where it is today, with its confirmation.)

### 2.4 Draft by draft: how the work changed over time

**Draft by draft…** (the Drafts list's header, the palette) steps through the drafts in order — Draft 1 → 2, 2 → 3, 3 → 4 … up to now — one change at a time:
- A **summary row for each step**: the marker and note, the date, and what changed in numbers — words and pages (scripts) or words (documents), scenes / chapters and sections added, cut, and changed, the share of the text that is new — so the whole history reads as a short timeline at a glance.
- **Open a step** to see it in Compare's Changes view (red/green, grouped by scene or section), with **Next step** / **Previous step** to walk the history, and the step's cuts listed beside it (from Cuts, §3).
- **Call:** steps are always between consecutive drafts; comparing any two (Draft 1 with Draft 5) stays in the Drafts list's Compare (§2.3).

### 2.5 Draft, or version?

**Call:** the interface says **Draft**, the writer's word: "Start new draft", "Draft 3", "Drafts". Help and the first Start-new-draft dialog say once what it means: "A draft is a version you name: Drafter keeps it exactly as it is, for good." Search finds the commands by "version" and "new version" too (palette keywords).

### 2.6 Where the draft shows
- Outside Zen, the status bar shows **Draft 8** quietly (a button that opens the Drafts list). Never in Zen, never on the pages, never in exports.
- **Call:** exports are unchanged. (A "draft line" on a title page is a writer's own text, already possible in Fountain's title page; Drafter adds nothing automatically.)

## 3. Cuts

### 3.1 What counts as a cut
- **Scripts:** a scene that was in the text and is no longer — the same matching Deleted scenes uses today (`@drafter/history`'s anchors and shingles), so a moved or lightly edited scene is not a cut.
- **Markdown documents:** a chapter (`#`) or section (`##`, `###`) that left the text, matched the same way by heading and content; and any **passage of 50 words or more** removed, so prose cut without a heading is kept too. **Call:** "removed" means a contiguous run of at least 50 words present in the comparison point (the last snapshot) and absent now, by a word-level diff of the two texts; a paragraph replaced by a different one counts when the removed side is 50+ words and shares under half its word pairs with what replaced it (so a light rewrite isn't a cut). Smaller deletions stay in snapshots only.
- **When:** **Call:** a cut is found whenever a snapshot is kept (every 10 minutes of active writing, on save and open, on Take snapshot, and before bulk operations — `keepSnapshot`'s moments), by comparing the snapshot's text with the comparison point (the previous kept text); never on every keystroke. A snapshot whose reason is a whole-text replacement (`before-restore`, `before-reload`, `opened`, `imported`, and a restored draft) moves the comparison point without looking for cuts. A cut is recorded once; if the same text comes back and is cut again later, it is one entry with both dates.
- Each cut records: its text, a title (the scene heading, chapter or section heading, or the first words of a passage), **the draft number it was cut while writing** ("cut while writing Draft 8"; the current draft has no ID until it is frozen, so a cut names the number, and the Cuts list adds that draft's short ID once it is frozen), when, and where it was (the neighbours, as Put back already uses).
- **Call:** a cut's own ID is the **SHA-256 of its text alone**, so the same text cut again (in this draft or a later one) is one entry with every date and draft it was cut in, and copies of the cuts file from two computers merge by that ID.
- **Call: nothing before this release is lost either.** On the first run of v0.23.0, Drafter scans each script's existing snapshots once (in the history worker, as Deleted scenes does today) and records every scene, chapter, or section found there but not in the text now as a cut, marked "cut before drafts" (draft number none). After that, cuts are recorded as they happen.
- **Call: a whole-text replacement makes no cuts.** Restore as a new draft, Restore from a snapshot (`snapshots/restore.ts`), Open, reload, an import, and New all reset the comparison point to the new text instead of comparing with the old: what left is already safe in the frozen draft or snapshot taken just before, and recording it would flood Cuts with a whole draft.

### 3.2 The Cuts list
**Cuts…** (File menu, palette, desktop File menu; and **Deleted scenes** becomes this list, with the old command name kept as a palette keyword) shows every cut, newest first, filterable by text, grouped by draft. For each:
- **Read** (a preview), **Copy**, **Insert at cursor** (as one undo, with a blank line around it; for a script, a scene goes in at the nearest scene boundary after the cursor, Call), **Put back** (at its old place between its old neighbours, as today).
- **Call:** putting a cut back **does not remove it** from Cuts — the list is a record, not a clipboard. It is marked "put back on 3 Nov".
- **Call:** **no Delete for cuts** in this release (as drafts, §2.3).

## 4. Plain files beside the work

The heart of "nothing lost": everything above is also kept as ordinary text files next to the script or novel.

- **Drafts:** a folder named after the work's file, `Boca drafts/`, holding one file per frozen draft: `Boca – Draft 01.fountain` (or `.md`), two-digit numbers (three past 99). **Call:** the draft's facts (`draft`, `id` = the full SHA-256, `frozen` = an ISO date, `note`) go in Drafter's existing metadata block — the trailing `/* drafter … */` boneyard that `@drafter/fountain` already reads and writes (`meta.ts`), which other Fountain apps treat as a boneyard and don't print — merged with any keys the script's block already has; for Markdown, the same JSON in a trailing `<!-- drafter … -->` comment. The **ID is the SHA-256 of the text exactly as it was in the editor when frozen** (the stored editor text: for a script opened from Final Draft, Highland, or Fade In, its Fountain text, and the draft file is `.fountain`). The file is that text, then exactly one blank line, then the block; verifying a draft file removes the block and that one separator and hashes what's left. A script that already ends with its own metadata block has the draft keys merged into it, and the ID is of the text with the block as it was before merging (the file records which).
- **Cuts:** one file beside the work, named after the work's whole file name so two works with the same stem never share one (`Boca.fountain.cuts.md`, `Boca.md.cuts.md`): a readable Markdown document with a short header, then each cut as `## <title>` with a line "Cut in Draft 12 (7b1e04d), 3 Nov 2026, from between "INT. KITCHEN" and "EXT. PORCH"" and its text in a fenced block (Fountain) or as-is (Markdown, its headings demoted one level so they don't collide). Newest at the top.
- **Never overwrite, never delete:** the drafts folder only gains files; an existing file with the same name is never replaced (a draft number is never reused). The cuts file is appended to by rewriting it whole to a temporary file and renaming over (as `drafter convert` writes), only after reading the current file and keeping every entry it has — so a cut added on another computer (through Dropbox) is never lost. Entries are keyed by the cut's ID (§3.1) so two computers' copies merge without duplicates.
- **The app's own storage stays the working copy.** IndexedDB still holds drafts and cuts (so the list works offline and in any browser); the files are written whenever there is somewhere to write them.

- **Call: the work is the project, not the file name.** Drafts and cuts belong to the script's project in Drafter's storage. The folder and file names come from the work's file name when they are first written, and the project remembers them. **Save As** to a new name or place writes the complete set again beside the new file (every draft file and the full cuts file), and leaves the old ones where they are, never deleting them. Renaming a file outside Drafter: the next open finds no folder of that name, starts writing a new one beside it with every draft and cut the project holds, and says so once.

### 4.1 Where files can be written
- **Desktop app:** always, beside the script's file. A script that has never been saved to a file has nowhere yet; its drafts and cuts are written when it is first saved.
- **Web, Chrome and Edge on a computer:** writing beside the file needs the folder, not just the file. **Call:** the first time a draft or cut needs writing, Drafter asks once for **access to the script's folder** ("Keep drafts and cuts next to Boca.fountain?") with the folder picker, checks that the picked folder holds the script's file (the handle's `resolve`/`isSameEntry`) and asks again if it doesn't, and remembers that folder's permission **per project**, as it remembers files'. Declined: they stay in the browser, and the Drafts and Cuts lists say so with a button to try again.
- **Other browsers and phones:** files can't be written beside the script. **Export drafts and cuts** downloads a `.zip` (the drafts folder and the cuts file, made with `@drafter/archive`'s zip writer from v0.22.0), and the lists say plainly that these live in this browser until exported.
- **Call:** never silent: the Drafts and Cuts lists always show where they are kept ("Saved beside Boca.fountain" / "In this browser only — Export").

### 4.2 Opening a work that has them
- Opening `Boca.fountain` (desktop, or web with folder access) reads `Boca drafts/` and `Boca.fountain.cuts.md` if they are there and merges them into the lists (by ID: nothing duplicated, nothing dropped). A draft file whose text no longer matches its ID is listed with a warning ("changed outside Drafter") and kept.
- Opening a draft file itself (`Boca – Draft 03.fountain`) opens it as a normal script, read-write — it is just a file — with a note bar: "This is Draft 3 of Boca. Open Boca instead?".

## 5. Retention

- **Call:** drafts and cuts are **never thinned**. Snapshot thinning (v0.18.0) is unchanged and still applies to ordinary snapshots; a snapshot that is a draft is a labelled snapshot and already kept forever. Cuts are their own records, not snapshots, so thinning can't touch them.
- Storage: a cut stores its own text (small); a draft stores the full text compressed, as snapshots do. A storage-full error says what happened and that the files beside the script (§4) are the safe copy.

## 6. Commands and places

| Command | Where |
|---|---|
| **Start new draft…** (keyword "new version") | File menu, palette, desktop File menu |
| **Drafts…** | File menu, palette, desktop File menu, the status bar's draft label |
| **Draft by draft…** (keywords "versions", "how it changed") | the Drafts list's header, palette |
| **Cuts…** (keyword "deleted scenes", "show all versions") | File menu, palette, desktop File menu; replaces **Deleted scenes** |
| **Open draft by ID** | the palette (typing hex), and the Drafts list's filter |
| **Export drafts and cuts** | the Drafts and Cuts lists' menus (all browsers), File menu where files can't be written |

No new default keys (as v0.18.0). Help: a "Drafts and cuts" page in the writer's words.

## 7. Accessibility

As the rest of the app: WCAG 2.2 AA, axe in both themes on every project, every action by keyboard, lists as real lists with named actions ("Read Draft 3", "Insert cut 'The ferry' at the cursor"), focus returned sensibly after each dialog, the read-only draft pane announced as read-only, and nothing conveyed by colour alone (Compare's existing rules).

## 8. Safety

- Draft and cut files are written only inside the folder of the work the writer opened (desktop) or the folder they granted (web); names come from the work's own file name, sanitised as `drafter convert` does (no separators, no `..`, length-limited).
- Text from draft and cut files read back in is the writer's own text but still untrusted input (it may have been edited elsewhere): read with the same size caps and UTF-8 checks as Open; the metadata fields parsed strictly (a number, 64 hex characters, an ISO date, a one-line note); the Cuts file parsed with a linear scan.
- Writing is atomic (temporary file, then rename) and never follows a symbolic link at the target, as `drafter convert` does. (The desktop's existing `writeAtomic` writes through a link; the new beside-the-script writing gets its own IPC that refuses links and is allowed only inside the folder of a script the writer already granted.)

## 9. Testing

- Unit: the ID (known vectors; same text → same ID; one character → different); draft numbering never reuses; restore freezes first; cut detection (scene moved ≠ cut; scene cut → one entry; section cut; 50-word passage cut; re-cut → one entry two dates); the cuts file round-trips and merges two copies without loss or duplicates; metadata parsing refuses bad fields; linear-time parsing on hostile input.
- e2e: start a draft with a note; the list shows it with its short ID; open by ID from the palette; Read beside, copy a line across; Compare two drafts; Restore as a new draft and undo; cut a scene, find it in Cuts, Insert at cursor elsewhere, Put back; on the desktop, the drafts folder and cuts file appear beside the script, and reopening merges them; on web Chromium with folder access granted (the existing file-picker stubs); in Firefox, the "In this browser only — Export" state and the zip export.
- Desktop e2e: files written atomically; a pre-existing draft file is never overwritten; a symlinked target isn't followed.

## 10. Not in this release

Deleting drafts or cuts; branching; per-draft revision colours or printed marks (Phase 4); a graphical timeline beyond Draft by draft's list (§2.4); syncing anything through a cloud API (the files beside the work, synced by the writer's own Dropbox/Drive/OneDrive, are the sync); drafts for the Workbook (it arrives later and can adopt this).

## 11. The calls

1. Drafter never starts a draft by itself; numbers only go up (§2.1).
2. Freezing unchanged text is allowed, with a question (§2.1).
3. ID = SHA-256 of the exact UTF-8 text; 7 characters shown; shared SHA-256 code (§2.2).
4. Restore never overwrites: freeze first, then a new number "from Draft N" (§2.3).
5. No Delete for drafts or cuts (§2.3, §3.2).
6. Exports unchanged by drafts (§2.4).
7. A Markdown passage of 50+ words removed in one change is a cut (§3.1).
8. Cuts found when the text settles, not per keystroke (§3.1).
9. Put back leaves the cut in the list, marked (§3.2).
10. A script cut inserted at the cursor goes in at the nearest scene boundary after it (§3.2).
11. Draft files: `<Work> drafts/<Work> – Draft NN.ext`, metadata at the end, the ID of the text without it (§4).
12. Cut entries keyed by ID so copies merge (§4).
13. Web Chromium asks once for the work's folder; declined → browser only, said plainly (§4.1).
14. Other browsers: Export drafts and cuts as a zip (§4.1).
15. Drafts and cuts are never thinned (§5).
16. Cuts replaces Deleted scenes; the old name stays a palette keyword (§3.2, §6).
17. A cut names the draft number it was cut while writing; its ID is the SHA-256 of its text alone (§3.1).
18. Existing snapshots are scanned once on first run, so cuts from before this release are kept, "cut before drafts" (§3.1).
19. A whole-text replacement (restore, open, import, New) resets the comparison point and makes no cuts (§3.1).
20. "Removed 50+ words": a contiguous run absent now by a word-level diff; a rewritten paragraph counts only if it shares under half its word pairs with its replacement (§3.1).
21. Draft facts live in Drafter's existing `/* drafter … */` metadata block (Markdown: a trailing comment); the ID is of the editor text; one fixed blank line before the block (§4).
22. The cuts file is named after the whole file name (`Boca.fountain.cuts.md`) (§4).
23. Drafts and cuts belong to the project; Save As writes the full set beside the new file and leaves the old (§4).
24. The web folder grant is checked to contain the script and remembered per project (§4.1).
25. Draft by draft steps between consecutive drafts only; any-two comparison stays in the Drafts list (§2.4).
26. The word is **Draft**; help explains it as a named version, and the palette also finds "version" (§2.5).
