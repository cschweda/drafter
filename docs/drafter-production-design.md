# Production: revisions, locked pages and scenes, breakdowns, and sides (v0.27.0)

**Status:** approved by the maintainer, 2026-11-09. Written by Claude on the maintainer's instruction ("skip the questions, write the design"), from the roadmap, the [Phase 2 design](drafter-phase2-design.md) (Production, §5.3, §5.5), the [technical design](drafter-technical-design.md) §8.6, the [version history design](drafter-version-history-design.md) §2, the [Classic Mode design](drafter-classic-mode-design.md), and the code as it stands at v0.26.2. Everything marked **Call (Claude)** is Claude's decision, not the maintainer's; the maintainer approves the document as a whole before a plan is written.

## 1. Why

Drafter is free, with no catch, and the maintainer wants it "for pros" (2026-10-31): a writer should be able to take a script from first draft into production without moving to Final Draft and its logins. Production is what a script needs once other people depend on its page and scene numbers: a crew schedules from them, actors learn from them, and every change after the script is locked has to be visible at a glance and must never renumber what is already scheduled.

Today Drafter can number scenes on export and show changes on screen, but nothing prints a revision mark, nothing keeps a page or scene number still while the text changes, and there is no breakdown or sides. This release adds those, in the industry's conventions, without giving up any of Drafter's promises: the file stays plain Fountain that every Fountain app opens, nothing leaves the device, and Classic Mode's rules hold.

## 2. Goals

1. **Revision sets in color.** Start a revision set (Blue, then Pink, then Yellow, …); every line changed since the set began gets a mark: an asterisk in the right margin, on screen and in print, and the page header says the set and its date.
2. **Locked pages.** Lock the script's pagination. After that, a page that grows spills into A-pages (12A, 12B) instead of pushing every later page along; a page that shrinks keeps its number and ends short; pages that vanish entirely are kept as a combined number (13-14).
3. **Locked scene numbers.** Lock the scene numbers. After that, a new scene between 5 and 6 is 5A (then 5B; between 5A and 6, 5B; before 1, A1), and a scene that goes is kept as `OMITTED` under its number.
4. **Scene numbers that start anywhere** (an episode's 101, a second unit's 500).
5. **A revised-pages PDF:** only the pages with marks from the current set, each with the set's name and date in its header and its locked page number, ready to slot into a printed script.
6. **A breakdown report:** each scene's number, INT or EXT, location, time of day, length in eighths of a page, page, and cast, as CSV for a spreadsheet or a scheduling app and as a printable PDF.
7. **Sides:** the pages an actor needs for a day: chosen scenes (by default, every scene a chosen character is in), on their locked pages, with the other scenes on those pages crossed out.
8. **It all travels in the file.** Another computer, another browser, or the desktop app opening the same `.fountain` shows the same marks, page numbers, and scene numbers, with no Drafter account and nothing beside the file.

## 3. Non-goals

- **Final Draft revision round-trip, for now.** Final Draft's `Revisions`, `RevisionID`, and `LockedPages` are not written or read in v0.27.0. The project's rule is to build `.fdx` structures only from real Final Draft files the maintainer supplies ([FDX test sources](FORMATS.md); the 2026-11 decision that an AI-generated `.fdx` template contradicted real files). Scene numbers already round-trip. When the maintainer supplies a real revised `.fdx`, its revisions are a follow-up ([§13](#13-follow-ups)).
- **Scheduling.** The breakdown is a report to take into a scheduling app, not a stripboard, a calendar, or a day-out-of-days.
- **Element-level breakdown tagging** (props, wardrobe, vehicles, extras marked in the text). The breakdown has what Drafter already knows: places, times, and the cast. Tagging is a later idea, not this release.
- **Multiple people revising at once.** Co-writing is Phase 5; this design assumes one writer holds the script.
- **Colored paper in the PDF by default.** Production offices print revisions on colored paper; the PDF says the color in the header. A tint is an option, off by default ([§8](#8-the-revised-pages-pdf)).
- **Novels and Markdown documents.** Production is for scripts: screenplays and stage plays.
- **Locked scene numbers for stage plays. Call (Claude), after the builder check:** a play's scenes are `##` sections and its template prints no scene numbers, and Fountain's `#12#` belongs on scene headings, so plays get revisions, locked pages, the revised-pages PDF, the breakdown, and sides, but not locked scene numbers, A-scenes, or Omit scene.

## 4. Anti-goals: what would make this a failure even if it works

- **A file other apps can't read, or that prints differently there.** Every piece of production state is either ordinary Fountain (scene numbers `#5A#`, the `OMITTED` heading) or inside the `/* drafter */` block that other apps skip. Opening the file in Highland, Beat, or a text editor shows a normal script.
- **Marks that only exist on this computer.** If the marks lived only in IndexedDB or in draft files beside the script, a writer who opens the script on a laptop sees a clean page and sends the wrong pages to set. Marks must be reproducible from the file alone ([§6.3](#63-what-the-file-keeps)).
- **Numbers that change under the crew.** Once locked, a scene number or page number printed earlier must never change because of an edit elsewhere. Drafter may only add A-numbers and OMITTED; renumbering is something the writer asks for, by unlocking.
- **Text Drafter writes without being asked.** Drafter never rewrites the script on its own while the writer types. It writes production text (scene numbers, `OMITTED`) only when the writer chooses a command, each as one undo step.
- **A pro feature behind a gate.** Nothing here is paid, limited, or nagging.
- **Breaking Classic Mode.** Classic Mode stays a way of typing over the same Fountain file: no production state is stored per mode, and switching modes never changes the file ([Classic Mode design](drafter-classic-mode-design.md) §3.1).

## 5. The words, and where they appear

**Call (Claude):** the UI uses the industry's words, each explained once where it first appears (the maintainer is learning Fountain; Drafter teaches as it goes): a *revision set* ("the Blue pages"), *lock pages*, *lock scene numbers*, *A-pages*, *A-scenes*, *OMITTED*, *revised pages*, *breakdown*, *sides*.

**Call (Claude): one Production panel.** Production gets a tab of its own in the Inspector (beside Outline, Cards, Stats, Scaffold), named **Production**, for screenplays and stage plays only. It shows, top to bottom:

- **The script's state:** "Not locked" or "Pages and scene numbers locked on 9 November 2026", and the current revision set with its color swatch, name, and date ("Blue revision, 12 November 2026, 14 pages marked").
- **Lock pages and scene numbers** (one button, see [§7](#7-locking)), or **Unlock…** once locked.
- **Start the next revision (Pink)** and, under it, a short list of earlier sets with their dates.
- **Scene numbers start at** (a number field, default 1).
- **Export:** Revised pages (PDF)…, Breakdown (CSV) and (PDF)…, Sides (PDF)….

Every action is also a command in the palette, and the exports are in the Export menu (for scripts). The status bar gains a short chip when a revision set is open ("Blue rev."), which opens the panel. The desktop app's File → Export gets the three exports.

## 6. Revision sets and their marks

### 6.1 The colors

The industry order (WGA convention), used as the default names:

White (the locked script itself), Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, then Double White, Double Blue, Double Pink, and so on.

**Call (Claude):** a set's name can be changed (some productions use Tan or Gray, or number their sets), and the next set's default is the next name in the list after the last one used. Each set has a swatch color for the screen; the swatches are chosen to pass WCAG contrast as a 3 px edge against both themes, and the mark itself is always drawn in the text color (an asterisk in a color alone would fail people who can't tell the colors apart).

### 6.2 How marks are found

A revision set is a **baseline** plus everything changed since it.

- **Each set's baseline is where the previous one ended. Call (Claude), after the builder check:** locking freezes the White draft; the Blue set compares against it, so every change made after locking is marked, whether or not the writer has pressed Start yet; **Start the next revision (Pink)** freezes a draft (`freezeDraft`, note "End of the Blue revision") that becomes Pink's baseline. While the script is locked, there is always an open set: locking opens Blue. Starting a set requires the script to be locked ([§7](#7-locking)).
- **While a set is open,** the marks are `changesOf(baseline text, current text)`, placed on pages by `markPages`, exactly as Show changes does today, but drawn as asterisks in the right margin (Compare's Pages view already draws `*` there, `draw.ts`), and printed.
- **A line already marked by an earlier set** that changes again takes the new set's mark. A line marked earlier and untouched keeps its earlier set (shown with that set's swatch on screen; in print see [§8](#8-the-revised-pages-pdf)).
- **Removed text** is marked on the line that follows the gap (the industry places the asterisk where text was taken out), as `markPages`' gap marks already locate it.
- **Moves** are not detected (a moved scene is removed in one place and added in another), as Compare does today; move detection stays in DEFERRED.

### 6.3 What the file keeps

The marks are derived from a baseline, but the baseline is a draft kept in this browser or beside the file. **Call (Claude): the block also keeps the marks themselves, so the file alone reproduces them.** For each set the block stores the set's facts and a fingerprint of each marked line:

```
/* drafter
{"v":1,"template":"us-screenplay",
 "production":{
   "lockedAt":"2026-11-09",
   "firstScene":1,
   "pages":[["1","3f2a9c1"],["2","8be0d47"],["12","04c19aa"],["12A","77e1b02"]],
   "sets":[
     {"name":"Blue","color":"#8fb4e8","date":"2026-11-12","draft":"<64-hex draft id>",
      "lines":["5d1e2a0:1","c03f9b7:1"],"gaps":["9aa01c3:1"]},
     {"name":"Pink","color":"#f2a7c4","date":"2026-11-19","draft":"<64-hex draft id>"}
   ],
   "baseline":"H4sIAAAAAAAA…"}}
*/
```

- A **fingerprint** is the first 7 hex characters of the SHA-256 of the line's text with surrounding white space trimmed, then `:` and its occurrence (the second identical line is `:2`). 7 characters is the length Drafter already uses for short ids (`SHORT_ID`).
- `lines` are the marked lines; `gaps` are the lines that carry a removal's mark.
- **When the block is written: Call (Claude), after the builder check:** only on the writer's own actions (lock, start the next revision, write new scene numbers, omit a scene, unlock, clear marks), each as one undo step. It is never written in the background: a background write would mark a file-backed script unsaved, set off the external-change check, and break the anti-goal that Drafter writes nothing it wasn't asked to (§4). So everything the open set's marks need is stored when the set starts ([§6.3a](#63a-the-open-sets-baseline-travels-in-the-file)), and the marks themselves are computed, never written back while the set is open.
- **On any computer,** the open set's marks come from the baseline in the block ([§6.3a](#63a-the-open-sets-baseline-travels-in-the-file)); closed sets' marks come from their fingerprints.
- **Edits made in another app** are marked like any other while their set is open, since the baseline is in the file. A closed set's mark on a line someone later edits in another app is lost (its fingerprint no longer matches); the help page says so.
- **Size:** closed sets' fingerprints add a few KB (400 marked lines, about 4 KB); the open set's baseline adds about 40–60 KB for 120 pages ([§6.3a](#63a-the-open-sets-baseline-travels-in-the-file)). All on one line, which other apps skip.

This sits under §8.6 of the technical design, which already reserves `"revision"` in the block; **Call (Claude):** the key is `production`, holding everything in this document, and `revision` is not used.

### 6.3a The open set's baseline travels in the file

**Decided by the maintainer (2026-11-09), on Claude's recommendation:** the block carries the open set's baseline text itself, compressed (gzip, then base64), as `production.baseline`. On a computer without the baseline draft, the open set's new edits are still marked, so a writer working on a laptop never sends unmarked pages to set (§4).

- **Why not fingerprints of each baseline line** (the other option, about 25 KB): marks would be per source line, so one changed word in a five-line action paragraph would asterisk all five printed lines, unlike Final Draft; and marking word-level only where the draft is present would make the same file print differently on two computers, which §4 rules out.
- **What it gives:** word-level marks everywhere (only the printed lines whose words changed get an asterisk, using `diffWords` within a changed source line), exact page anchors, and the same print on every computer.
- **What it costs:** one long line, about 40–60 KB for a 120-page script, at the end of the file. Other Fountain apps skip the block; a plain text editor or a git diff shows the line. The help page says what it is.
- **When it is written:** when a set starts (locking starts Blue), as part of that action's one undo step. It is replaced at the next set's start, and removed by Unlock or Clear marks.
- **Closed sets** keep only their marked lines' fingerprints (§6.3), a few KB, since nothing compares against them any more.
- **Reading it** is defensive and capped like every block key (trap documents, §12): a baseline that won't decompress, or decompresses past a size cap (**builder's call**, a multiple of the script's own length), is ignored, and Drafter says the marks can't be shown on this computer.

### 6.4 Ending sets, and starting over

- **Start the next revision** closes the open set (its marks are kept) and opens the next.
- **There is no "accept all"**: a production's marks are history. **Clear marks…** (with a confirmation saying what is lost) empties every set's marks and keeps the lock, for a new White draft; the drafts remain in Drafts.
- **Unlock…** (with a confirmation) removes the page and scene locks and every set. The text is untouched: written scene numbers stay as text, and `OMITTED` headings stay until the writer removes them. A snapshot is taken first.

## 7. Locking

**Call (Claude): one lock for pages and scene numbers together,** because productions lock both at once and two locks double the states a writer must understand. Locking freezes a draft ("Locked"), writes scene numbers, and records the page map.

### 7.1 Scene numbers

- **Locking writes the numbers into the text** as Fountain scene numbers (`INT. KITCHEN - NIGHT #12#`), one undo step, numbering from **Scene numbers start at**. A heading that already has a number keeps it. These are ordinary Fountain: Highland, Beat, and Final Draft import read them, and Drafter's Final Draft export already writes them.
- **After locking, a new scene heading without a number** is shown, on screen and in every export, with the A-number it will have (between 5 and 6: 5A; between 5A and 6: 5B; between 5 and 5A: 5AA; before the first: A1), drawn dimmer in the Source pane until written. **Call (Claude):** the number is written into the text when the writer starts the next revision set, locks again, or chooses **Write new scene numbers**, never as they type.
- **Omitting a scene:** the Outline's and Cards' scene menus, and the palette, get **Omit scene**. It replaces the scene with `OMITTED #12#` (a scene heading forced with `.`: `.OMITTED #12#`, the form Drafter's Final Draft import already produces), keeps the scene's text as a cut (Drafts and Cuts), and is one undo step.
- **A numbered scene deleted by hand** is caught by a lint rule, *A locked scene number is gone*, with the quick fix **Put back as OMITTED**. The text isn't changed until the writer chooses it.
- **Numbers out of order** (a moved scene keeps its number; a writer typed a duplicate): two lint rules, on only while locked: `locked-numbers-out-of-order` (named in the technical design's lint table but **not yet built**: new work) and a repeated-number rule (deferred in DEFERRED.md: new work).

### 7.2 Pages

- **Locking records the page map:** each page's label and where it starts in the locked text: the source line's fingerprint and, when a page starts partway into a paragraph or a speech, which printed line of it (`["12","04c19aa",2]`), in `production.pages` ([§6.3](#63-what-the-file-keeps)). Anchors resolve against the locked text through the same baseline as the marks ([§6.3a](#63a-the-open-sets-baseline-travels-in-the-file)), so an edited anchor line is followed, not lost, and the block needn't be rewritten.
- **Layout while locked: Call (Claude):** pagination runs as today, but each locked page starts at its anchor line. Text that no longer fits before the next anchor continues on A-pages (12A, 12B, …; after 12Z, 12AA). A page whose text shrank ends early; the gap is left blank, as printed scripts do. Pages whose anchors have all gone are folded into the page before them, and that page's number becomes a range (`13-14`).
- **An anchor line that was edited or removed:** the page starts where the diff against the locked text puts that line in the current text (an edited line maps to its new version; a removed line to the next surviving line). **Call (Claude).**
- **The layout's page model gains a label:** `Page.number` stays the integer (the page's place), and a new `Page.label` holds what is printed ("12A", "13-14"). The page number drawn on the page, the Script pane's header ("Page 12A of 118"), the structure strip, and every export read the label. Unlocked, the label is the number as text, so nothing changes for a script that isn't locked.
- **(MORE) and (CONT'D)** work as today, across A-pages too.

## 8. The revised-pages PDF

Export → **Revised pages (PDF)…**:

- **Which pages:** by default the pages with a mark from the current set; the dialog can choose the current set, all sets, or a page range.
- **Each page** is the locked page as it prints in the full PDF, with its label, the asterisks of the set(s) chosen, and the header **"Blue Revision — 12 November 2026"** at the top right (screenplay convention; under the page number), or a production's own header text (a field in the dialog, kept in the block).
- **Which asterisks print: Call (Claude):** by default only the current set's (the industry norm: each color's pages show what changed in that color); an option prints every set's.
- **A tint** of the set's color on the page background is an option, off by default, for productions that print on white paper.
- **The full PDF** (Export → PDF) of a locked script also uses the locked labels and A-numbers, prints the marks of the open set, and puts the current set's name and date in the header. **Call (Claude):** an Export option, **Revision marks: open set / none**, defaults to the open set.

The renderer needs: the right-margin asterisk, header text per page, and (for the tint) a page fill. `render-pdf` draws only black text and rules today; these are additions to it.

## 9. The breakdown report

Export → **Breakdown (CSV)…** and **Breakdown (PDF)…**, one row per scene, in script order:

| Column | From |
|---|---|
| Scene | the locked or A-number (or the scene's place if unnumbered) |
| INT/EXT | `placeOf().inside` (INT, EXT, INT/EXT) |
| Location | `placeOf().location` |
| Time | `placeOf().time` (DAY, NIGHT, or what the heading says) |
| Pages | length in eighths (`ScenePages.eighths`, "1 3/8") |
| Page | the page label it starts on |
| Cast | characters who speak, then characters named in action (`castOf` presence), in order of first appearance |
| Synopsis | the scene's synopsis, if it has one |

- **CSV:** UTF-8 with a header row, comma-separated, quoted per RFC 4180, so Excel, Numbers, Google Sheets, and scheduling apps that take CSV open it.
- **PDF:** the same table, landscape US Letter (A4 for A4 templates), with the script's title and the date in the header, using the fonts Drafter already embeds.
- `OMITTED` scenes appear as a row with "OMITTED" and no other fields, so the numbering has no holes.
- A stage play's "scene" is its `##` scene, as Drafter's scene index already counts it.

## 10. Sides

Export → **Sides (PDF)…**: a dialog with

- **Character(s):** choose one or more; their scenes are ticked.
- **Scenes:** the list, with ticks, editable (a day's shoot is often a few scenes, not all of a character's).
- **Result:** every page any ticked scene is on, in order, at its locked label, with the parts of those pages that belong to unticked scenes crossed out (a diagonal line through each such block, the industry's usual mark), and a header line "SIDES — MARGARET — Scenes 4, 12, 12A — 12 November 2026".
- **Call (Claude):** sides follow the script as it stands, with the open set's marks if any, since actors learn the current pages.

## 11. Where it touches the code

From the map of v0.26.2 (no code is written by this document):

- **`packages/fountain`:** the `production` block type; fingerprints (`hashText` exists in the web app; a small sync-free SHA-256 is not needed in the package if fingerprints are computed in the worker, **builder's call**).
- **`packages/layout`:** `Page.label`; `PaginateOptions.locked` (the page map and A-number rules); A-scene numbers in `numbersOf`; marks carried on lines (`LayoutLine` gains an optional mark field) so every renderer can draw them.
- **`packages/compare`:** reused as is (`changesOf`, `markPages`); a function that turns marks into fingerprints and back.
- **`packages/render-pdf`:** right-margin asterisk, per-page header text, optional page tint, crossed-out blocks for sides, and a table layout for the breakdown PDF (or a small separate renderer, **builder's call**).
- **`packages/cast`, `packages/outline`:** read only, for the breakdown and sides.
- **`packages/lint`:** the two locked-number rules switched on while locked; *A locked scene number is gone* with its quick fix.
- **`apps/web`:** the Production tab, its commands and palette entries, the status chip, the Export menu items and dialogs, the Source pane's dim provisional numbers, and the block's writing on pause. Drafts' `freezeDraft` for each baseline.
- **`apps/desktop`:** File → Export items only; everything else is the web app.
- **Docs:** a help page, *Production*, teaching each word with a picture; the Fountain cheat sheet's scene-number entry; What's new; the README's features and roadmap.

## 12. Testing

- **Unit:** A-number assignment (between, before, after, nested 5AA), page labels and folded ranges, fingerprint round-trip (same text gives same marks; duplicate lines; a mark lost when its line is edited elsewhere and found again by the diff), the block's size on a 120-page fixture, CSV escaping.
- **Layout fixtures:** a locked script edited to grow one page by two pages (12A, 12B), to shrink one, and to remove two whole pages (13-14); every later page keeps its label.
- **Browser:** lock, edit, start Blue, see asterisks on screen; reload and see them again; open the same file in a fresh profile with no drafts and see the same marks; Omit scene and its undo; the lint quick fix; each export's PDF checked by text extraction (labels, header, asterisk columns) as the existing PDF tests do.
- **Round-trip:** the exported `.fountain` opened as plain text is ordinary Fountain; Drafter's Final Draft export carries the scene numbers.
- **Accessibility:** the Production tab and dialogs pass axe in both themes; marks are announced ("changed in Blue") as Show changes' are; swatches are never the only signal.
- **Trap documents:** a hostile `production` block (wrong types, huge arrays, bad fingerprints, a page map out of order) is read defensively and capped, like `novel.manuscript`; new traps go in the corpus.

## 13. Follow-ups

- **Final Draft revisions and locked pages** in `.fdx` import and export, once the maintainer supplies a real revised Final Draft file.
- **Element tagging** for a fuller breakdown (props, wardrobe, extras).
- **Move detection**, so a moved scene is one mark instead of two.

## 14. How it is built

**Call (Claude), after the builder check:** one release, v0.27.0, from two plans: **Plan 1, locks and revisions** (the block, fingerprints, locked pages and labels, scene numbers and A-scenes, Omit scene and the lint rules, revision sets and marks on screen, the Production tab), then **Plan 2, the exports** (revised pages and the full PDF's marks, the breakdown, sides). Plan 1 can merge to `staging` on its own; the release waits for both.

## 15. Left to the builder

The plan's task order and sizes; where fingerprints are computed (package or worker); whether the breakdown PDF is a mode of `render-pdf` or its own small renderer; the exact swatch colors (within the contrast rule in §6.1); dialog layouts within the existing dialog and segmented-control components; the wording of each help paragraph, in the house style.
