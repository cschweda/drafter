# drafter.dev — Phase 2 Design

*Structure: see the shape of a script and work on it, as an outline, as cards, as notes, and as a map, with every change made to the `.fountain` itself.*

Status: Draft · 2026-10-28 · Builds on the [architecture](drafter-architecture.md), the [technical design](drafter-technical-design.md), and the [Phase 1 design](drafter-phase1-design.md). The maintainer asked to go straight into Phase 2 and accepted the builder's recommendations in advance.

---

## 0. How to read this

This is the plan for Phase 2, written so a builder can plan each release without going back to the maintainer. Where an earlier document already settles something, this one points there, and those sections count as part of this one. Each plan (§22) gets its own plan document when it starts.

Each decision is marked by where it came from:

- **Decided:** the maintainer chose it, on the date given, or it is on the roadmap they approved.
- **Call:** a judgment made while writing this document, with its reason. §23 lists them all.
- **Builder:** left to whoever builds it, within the limits given.

Unmarked statements restate the earlier documents.

## 1. What Phase 2 is, and why

Phase 1 made Drafter a place to write. Phase 2 makes it a place to see and shape what's been written: where the scenes are, how long they run, whose story each one carries, what each scene is for, and what is still open.

The maintainer is new to Fountain and wants to start writing soon (Decided). So the order of work (§22) puts first what helps a writer draft and see structure: the outline and reordering, then cards and notes. Analysis views, the Beat Board, and reader notes follow.

The file stays the whole project (architecture §1). Everything Phase 2 adds lives in the `.fountain` as Fountain: synopses, sections, notes, boneyard, and the one metadata block. Another Fountain app opens the file, prints the same pages, and shows Drafter's additions as ordinary notes or not at all.

**Done when:**

1. Every Phase 2 roadmap item is built, except testing with NVDA and VoiceOver, which comes after all phases (§20). Writing statistics by day already shipped in v0.5.0.
2. Nothing Phase 2 adds changes the printed script: for any script, the layout with every Phase 2 note and the Beat Board block removed equals the layout with them. A property test checks it.
3. Every change made from a view is a text change to the source, applied as one transaction and undone in one step. `print(parse(text)) === text` still holds.
4. Every drag has a keyboard equivalent, and an end-to-end test drives each one by keyboard alone.
5. Every new view passes axe in both themes, at desktop and phone width, in the suite that runs on every build. The tests also assert the accessibility tree: roles, names, and what the live region says.
6. Adding a reader's notes to a draft never drops a note. A property test checks it.
7. Drafter still makes no network requests after it loads.

## 2. Goals, non-goals, and anti-goals

**Goals.** The Phase 2 roadmap, as the README lists it, shaped by this document:

- A shared model: a scene index with stable identity (§5.1–5.2), and one convention for data kept in notes (§5.3).
- The Outline tab, scene reordering by drag and by keyboard, and condense and expand (§6).
- Final Draft `.fdx` import and export (Plan FD in §22; technical design §6.3). Decided 2026-10-28: moved up from Phase 3.
- The Cards and Notes tabs, with note categories and status (§7, §8).
- Scene goals, setups and payoffs, and storylines (§9, §10, §13).
- Snapshots with a retention schedule, and Compare (§11).
- Spellcheck with nspell and a per-script dictionary (§12).
- The script map, the pacing view, the character-by-scene grid, and the Stats tab (§14–16).
- The Beat Board (§17), reader notes (§18), and the Reference tab (§19).

**Non-goals for Phase 2,** each with its later home:

- Testing with NVDA and VoiceOver: after every phase is built (§20). Decided.
- PDF with notes in the margin, the self-contained reader `.html`, French scenes and doubling for plays (Phase 3).
- Revision marks, story order against script order, accepting a co-writer's changes one by one, the character pass (Phase 4). Compare (§11) is built so revision marks can reuse it.
- A side-by-side Compare across both panes. Call: one marked view first, because it is simpler and reads in order for a screen reader; side by side can follow if asked for.
- Any AI help with structure. Architecture §10 keeps it optional and later.

**Anti-goals.** Phase 2 has failed, even if every feature works, if:

- A view keeps state the file doesn't. Session-only state (which rows are open, what's selected) is fine; anything the writer would miss after reopening the file must be in the file.
- Drafter writes syntax another Fountain tool would print or misread. Notes, synopses, sections, and boneyard only.
- Drafter edits the text when the writer didn't ask for an edit. No background rewriting, no "tidying".
- Something can only be done with a mouse, or only on a wide screen.
- A structure guide reads as a rule. Guides are suggestions, off by default.
- A reader's note is lost, or lands somewhere silently wrong.

## 3. Constraints

- **Clean room,** as in Phase 1 §3: no code, text, or fixtures from any screenwriting app or Fountain library. Behavior is described here in Drafter's own words. Where this document says "like a corkboard", it means the familiar idea, not any app's design.
- **No server.** Reader notes travel as files the writer and reader send each other however they like (§18).
- **Engine first.** Structure logic lives in packages with unit and property tests (§21); the app draws it.
- **New dependencies** get a `docs/DEPENDENCIES.md` row before they are added, with their licence (§21). Phase 2 expects only the spellchecker and its dictionaries.
- **Accessibility.** Built to WCAG 2.2 AA (technical design §13). From v0.9.0 the axe suite runs on every build, so every new view adds axe checks by default, in both themes and at both widths. Drafter claims no conformance (§20).
- **Process** as before: tests first, the changelog with every push, open choices recorded in `docs/DECISIONS.md`, and a minor release per plan with a tag and a GitHub Release.

## 4. What exists to build on

- **The parser** (`@drafter/fountain`) keeps every block's raw text, reparses in full on each change, and lists every note and boneyard in `doc.regions`. A line holding only notes is `transparent` and prints nothing. A synopsis line followed by a note line, with no blank line between, parses as a synopsis block and a note block.
- **The metadata block** (`setMeta`, technical design §8.6) holds the template today.
- **Folding** by scene and section exists, and a folded scene shows its heading and first synopsis (DECISIONS, 2026-10-25). **Fold all** and **Unfold all** are commands.
- **Scenes in either template:** `sceneStart(template)` in `apps/web/app/stats/script-stats.ts` says a scene is a scene heading in a screenplay and a `##` section in a stage play.
- **The Stats window** (v0.5.0, [stats design](drafter-stats-design.md)): today's words and time, pages, scenes, words, running time, a character table (scenes, speeches, words), the INT/EXT and DAY/NIGHT split, and the last 30 days.
- **The element bar** (v0.5.0) and the **Fountain cheat sheet** at `/docs/fountain/`.
- **Snapshots:** the `snapshots` table holds one row per script, the text last saved (Phase 1 §9.4).
- **Spellcheck:** the browser's own, on in the Source pane, with a setting (Phase 1 §5.3).
- **Panes and tabs:** two panes, each showing any tab, a tab in one pane at a time (`utils/panes.ts`); one pane at a time on a phone.
- **Sample modules** `scene-list`, `cast`, and `notes` show some of this as a module can. Call: they stay as examples for module authors, off by default, because they document the module API; their READMEs point to the core tabs that replace them.

## 5. The shared model

Several features read the same things: which scenes there are, what each scene carries, and Drafter's notes. They are defined once here and reused everywhere.

### 5.1 The scene index

`sceneIndex(doc, template, layout?)` in `@drafter/outline` (§21) returns the script's scenes in order. Call: a pure function of the parse (and the layout, when one is ready), recomputed after each parse, because the parse is already full and fast (technical design §2.7) and a derived index can never drift.

Each entry holds:

| Field | What it is |
|---|---|
| `id` | The session identity (§5.2). |
| `ordinal` | 1, 2, 3… in script order; `number` is the locked `#n#` number, if any. |
| `heading` | The block that starts the scene: a scene heading, or a `##` section in a play. |
| `span` | From the heading to the end of the scene's last block, as technical design §7 defines a scene range. The metadata and Beat Board blocks are never inside one. |
| `sections` | The sections the scene sits in, outermost first. |
| `synopses` | Its `=` lines. |
| `fields` | Its keyed notes (§5.3): color, storylines, goal, conflict, outcome, shift. |
| `marks` | Its setups, payoffs, and reader notes, with their offsets. |
| `speakers`, `present` | Who speaks; who is in it (§16). |
| `words`, `dialogueWords`, `actionWords` | Counted as the stats count them. |
| `pages` | From the layout: the page and line it starts on, and its length in eighths of a page, as the `scene-list` module counts them. Null until a layout is ready. |

Text before the first scene (the title page, an opening note, a cold open's action) is a **preamble** entry. It is listed, never moved, and nothing moves above it.

### 5.2 Scene identity

A scene needs an identity that survives typing, so the Outline keeps its selection and focus while the writer edits, and a moved scene stays selected after the move.

**Call:** identity is kept in the editor's session, not in the file.

- `@drafter/cm-fountain` holds a state field mapping each scene heading's start offset to an id. On every transaction it maps those offsets through the changes, the way CodeMirror maps any position. After the reparse, a heading at a mapped offset keeps its id; a new heading gets a new one.
- A move made by Drafter (§6.3) carries an annotation naming the moved scene, so its id goes with it rather than to the place it left.
- A scene cut and pasted by hand gets a new id. Nothing is lost: everything about a scene is inside its text (§5.3).
- Ids are not saved. Reopening a script gives fresh ids.

Reason: because every piece of per-scene data lives inside the scene's own text, the file never needs a scene id, and the open question in architecture §14 ("colors survive reordering but not renaming") goes away. Colors now survive renaming, reordering, and editing in another app.

### 5.3 Keyed notes

One convention carries every piece of Drafter's data that belongs to a place in the script. **Call,** with the reason that a note is the one Fountain element made for this: it never prints, every Fountain app keeps it, and most show it, so the data stays readable to people.

A **keyed note** is an ordinary note whose text starts with a head and a colon:

```
[[Goal: Margaret wants Tom to admit he lied.]]
[[Sam: I don't believe she'd stay. #character]]
[[TODO: check the dates in this scene]]
```

How Drafter reads `[[Head: body]]`:

| Head | Meaning |
|---|---|
| A **field key**: `Color`, `Storyline`, `Goal`, `Conflict`, `Outcome`, `Shift`, `Setup`, `Payoff` | Drafter data, matched without regard to case. |
| `Card` | A Beat Board card's place and links. Only inside the Beat Board block (§5.6). |
| A word in **all capitals**, such as `TODO`, `FIX`, `CUT?` | A category for the writer's own note (`todo`). Call: so a habit like `[[TODO: …]]` files itself instead of reading as a person called TODO. |
| A **name** with a lowercase letter, such as `Sam` or `Ann Lee`, up to 40 characters | A note from that person: a reader, or the writer replying (§18). |
| `Name on “quote”` | A person's note on the quoted words, not the whole line (§18.2). |
| `Name re Name` | A reply (§18.2). |
| No head | The writer's own note, uncategorized. |

In the body:

- `#word` (a `#` at the start of a word, then a letter, then letters, digits, or hyphens) is a **category tag**: `#continuity`, `#story`. A note may have several.
- `#resolved` marks a note, or a thread, as resolved. With no `#resolved` it is open.
- Everything else is text, kept exactly.

Rules:

- **Reading is lenient, writing is exact.** Drafter reads keys in any case and with extra spaces; it writes `[[Key: body]]` in title case with one space.
- **Field notes are single-valued** except `Storyline` (a comma-separated list), `Setup`, and `Payoff`. A second `Goal` in one scene is an info item in Problems; the first one wins.
- **A body can't hold `]]`.** Drafter writes `] ]` instead and says so where it matters (the Notes editor). A body can't hold a blank line either, since a note ends at one (architecture §14); Drafter writes line breaks in a body as ` / `.
- **Notes stay where the writer put them.** Drafter reads keyed notes anywhere in the scene, and only moves one when the writer asks.
- `@drafter/notes` (§21) reads and writes the convention as pure functions, with a property test that writing and reading any body gives it back.
- A field key wins over a person with the same name. A reader called "Goal" is improbable; the Reference tab says so.

### 5.4 A scene's header

When Drafter writes a scene's fields, it puts them in the scene's **header**: the lines after the heading's blank line, synopses first, then one note per field in a fixed order (Color, Storyline, Goal, Conflict, Outcome, Shift). Each sits on its own line, so a header reads like a filled-in card:

```
INT. KITCHEN - NIGHT

= Margaret waits for a call that won't come.
[[Color: blue]]
[[Storyline: A]]
[[Goal: Margaret wants Tom to admit he lied.]]
[[Conflict: Tom keeps making jokes.]]
[[Outcome: He won't. He leaves.]]
[[Shift: hope → dread]]

MARGARET sits at the table, not eating.
```

In a stage play the heading is the `## Scene` line. Clearing a field removes its note, and the line with it. Every line here is transparent, so the pages don't change (§1, item 2).

**Decided (2026-10-28): scene colors move into the header** as `[[Color: blue]]`, not the metadata block that technical design §7 and §8.6 planned (no color has been built yet). Reason: one rule (what belongs to a scene is in the scene) means a color travels with its scene through reorders, renames, and other apps. The cost is one visible note line in other apps, which tells their readers the color too. Colors are words from Drafter's palette (red, orange, yellow, green, teal, blue, purple, pink, gray), so the file reads plainly.

### 5.5 The metadata block

The `/* drafter … */` block keeps what belongs to the script as a whole and would mean nothing as a note. Phase 2 adds:

| Key | Holds |
|---|---|
| `dictionary` | The script's own words (§12), as technical design §8.6 planned. |
| `storylines` | Each storyline's label, its longer name, and its color: `{ "A": { "name": "Margaret's job", "color": "teal" } }`. |
| `categories` | Colors for note categories the writer has colored. |
| `readers` | A color for each person whose notes are in the script. |
| `review` | Set while a copy is out for notes (§18.1). |
| `guides` | The structure guide chosen for the pacing view, if any (§15). |

None of it is keyed by scene, so it never needs an identity. A missing entry gets a default; an entry with no use left is harmless and is removed the next time Drafter writes the block.

### 5.6 The Beat Board block

The Beat Board's cards (§17) live in one boneyard just before the metadata block, which other Fountain apps never show:

```
/* beat board
= Margaret finds the letter in Tom's coat. [[Card: 1, at 2 1, yellow, links 3]] [[Storyline: A]]
= Tom's sister calls out of nowhere. [[Card: 2, at 4 1]]
= The power goes out during dinner. [[Card: 3, at 2 3, links 1]] [[Storyline: B]]
*/
```

- A card is one line: a synopsis (`= text`) and its notes. Call: synopsis-shaped, so placing a card in the script moves its line in as a real synopsis with no translation.
- `[[Card: …]]` gives a number that's unique in the block, the card's cell on the board's grid (column, row), an optional color, and the cards it links to. A storyline is the ordinary `Storyline` note.
- Drafter parses the block's inside with the same keyed-note reader, since the parser treats a boneyard's inside as raw text. A card's text can't hold `*/`; Drafter writes `* /`.
- A card the writer edits by hand without its `Card` note gets the next free number and the next free cell.

### 5.7 Rules every new view follows

- **Edits are text.** A view asks `@drafter/outline` or `@drafter/notes` for `TextChange[]` and applies them as one transaction, so undo, the recovery copy, and "unsaved changes" behave as for typing.
- **Read-only.** In a read-only tab (Phase 1 §9.5) or while a file is being checked, a view shows everything and offers no edits; its edit controls are disabled with a reason, not hidden.
- **Keyboard.** Every action has a command in the registry (so it's in the palette and on the Keyboard shortcuts page), and every drag has a keyboard equivalent named in its section. Builder: the keys, avoiding the browser's and the system's.
- **Announcements.** A move, a merge, or a bulk change says what happened once in the polite live region ("Moved INT. HALL to scene 4 of 32"). Nothing counts down or repeats.
- **Color is never the only signal.** A color comes with a label: a letter, a word, or a name.
- **Phones.** One pane at a time, as now. Every view has a single-column form; a drag becomes a row's **Move** menu (Move up, Move down, Move to…).
- **Markdown documents** have no scenes. Outline, Cards, Beat Board, map, pacing, and grid are not offered there. Notes and spellcheck work. Call, because Markdown has no Fountain notes or scenes to read.
- **Samples** behave as in Phase 1: editable, with the edits kept in the browser.
- **The desktop app** gets every view, with the new commands in its native menus (`commands/desktop-menu.ts`).

### 5.8 Where the views live

Phase 2 brings the tabs to Source, Script, Problems, **Outline, Cards, Notes, Stats, Beat Board, Reference**, and a **Compare** tab that exists only while a comparison is open.

**Call:** each pane's tab row shows Source, Script, Problems, and Outline, then one slot for the last other tab chosen, then a **More** menu listing the rest. A tab chosen from More takes the slot. Reason: nine tabs don't fit a pane's width, and a row that scrolls hides tabs from sight. Builder: on a very wide pane, more tabs may stay in the row if they fit. On a phone, the single tab row has the same shape. **Show Outline**, **Show Cards**, and the rest are commands, and the tab order follows the list above.

## 6. Outline, reordering, condense and expand

### 6.1 The Outline tab

A tree of the script: sections, holding scenes, holding nothing further. Each scene row shows its number, heading, first synopsis, a color chip with its name, storyline labels (Plan E), its page and length (`p. 12 · 1 3/8 pp`), and who speaks. Section rows show the title, the number of scenes, and their total length. A filter field narrows the tree by heading, synopsis, or character.

- **Choosing** a row (Enter or click) goes to it in the Source pane, as **Go to scene** does.
- **Each row has a menu** (a **⋯** button, the context-menu key, or Shift+F10): Go to, Move up, Move down, Move to…, Edit synopsis, Color…, Scene details… (§9), and, for a section, Move section.
- **Edit synopsis** edits the first synopsis in place: Enter saves, Escape cancels. A scene with none gets `= text` added to its header (§5.4).
- **Keyboard:** Call: the ARIA tree pattern (Up and Down move, Right opens, Left closes or goes to the parent, Home and End, type-ahead), because a screen reader already knows how to read a tree. Builder: a treegrid instead, if the columns need to be read as cells.
- **Phone:** the same tree, one column; the length and characters move under the heading.

### 6.2 Moving scenes

A scene is moved by:

- **Drag** in the Outline or the Cards, with a drop line showing where it will land.
- **Alt+Up and Alt+Down** on a focused row: one place up or down. Crossing a section's edge moves the scene to the end of the section before, or the start of the section after.
- **Move to…:** a dialog listing every scene and section, with a filter: "Put INT. HALL after:".
- **Move scene up** and **Move scene down** commands in the Source pane, for the scene holding the cursor.
- **Move section,** which carries the section's scenes and deeper sections with it, by the same means.

Focus stays on the moved row, and the live region says where it went. On a phone, the row's Move menu does all of this.

### 6.3 What a move does to the text

`moveScene(doc, index, target)` returns two changes, delete and insert, composed into one transaction (technical design §7).

- The scene's text, heading to last block, moves whole, with everything in it: notes, setups, reader notes. That is why per-scene data lives in the scene.
- Call: the scene arrives with one blank line before it and one after, whatever surrounded it before. Reason: simple and readable. A property test checks that moving a scene and moving it back restores the source exactly whenever the scenes were separated by one blank line, which is how Drafter writes them.
- The preamble, the title page, the Beat Board block, and the metadata block never move.
- A locked scene number (`#12#`) moves with its heading and is not renumbered. The existing lint rule reports numbers out of order.
- A transition ending the scene moves with it. Builder: if that reads wrongly in practice, record the alternative in DECISIONS.

### 6.4 Condense

Condense is a view, not an edit (technical design §7). **Condense to outline** folds every scene to its heading and synopsis, as **Fold all** does, and shows the Outline tab in the other pane; **Expand all** unfolds. Call: two names for the existing fold commands, because "condense" and "expand" are the words a writer looks for.

**Export as treatment** (Export menu) writes a Markdown file: section titles as headings, then each scene's heading and synopses, and, as an option, each scene's first paragraph of action. It is also a new Markdown document in Drafter if the writer chooses **Open as a document**.

### 6.5 Expand

**Expand outline** turns an outline into scene stubs.

- **From a selection in the Source pane:** each `=` line, or `-` list line, not already in a scene becomes a stub; `#` lines stay sections.
- **From a Markdown document:** **New screenplay from this outline** makes a new script: Markdown headings become sections, and each list item a stub.
- A stub is a heading, a blank line, and the item as its synopsis. Call: the heading is `INT. LOCATION - DAY`, and a new lint rule, `stub-heading` (info), lists every stub still holding it, with a jump. Reason: a newcomer gets a valid heading to overwrite and a to-do list in Problems, which is plainer than guessing interior or exterior from the words (technical design §7's heuristic, which this replaces).
- One transaction, one undo, and a snapshot first (§11).

## 7. The Cards tab

Every scene as an index card, in script order, like a corkboard, grouped under their sections. A card shows the number, the heading, the synopses, the color (as a stripe and its name), the goal's first line (§9), storyline labels (Plan E), and the length.

- **Editing:** Enter on a card opens its synopsis for editing; the card's menu has the Outline row's actions.
- **Moving:** drag, or, on a focused card, Alt+Left and Alt+Right (earlier and later), Alt+Up and Alt+Down (a row up or down), and Move to….
- **Keyboard:** the cards are a grid with one tab stop; arrow keys move between cards by position, and Home and End go to the first and last. Each card's name reads "Scene 12, INT. KITCHEN - NIGHT, blue, 1 3/8 pages", and its synopsis is its description.
- **Size:** three card sizes (a setting on the tab's slim bar).
- **Phone:** one column, the same cards, with the Move menu.

## 8. The Notes tab, categories, and status

Every note and boneyard in the script, in one list, each linked to its place.

- **Groups,** chosen with filter chips: **All**, **My notes** (no head, or a category head), **Readers** (person heads, §18), **Setups & payoffs** (§10), **Boneyard** (every boneyard except the Beat Board and metadata blocks). Scene fields (§5.4) are not listed, since the Cards and Outline show them. Call: listing them would bury the writer's own notes under a dozen field lines per scene.
- **Filters:** by category, by person, by status (open, resolved, all), and by scene; a text filter.
- **A row** shows the note's text, its category chips (colored, and named), its person if it has one, its scene and line, and its status. Replies sit under their note, indented.
- **Actions:** Go to (Enter), Resolve or Reopen (adds or removes `#resolved`), Edit (in place; the head, tags, and text), Set category…, Reply (§18.3), Delete (one undo). **Resolve all shown** works on the filtered list, after asking.
- **New note** at the cursor, with an optional category, from the tab, the palette, and the element bar's existing Note button.
- **Categories** are the tags in use, plus a starting set offered in pickers: story, character, dialogue, pacing, format, continuity, question, todo. Their colors are in the metadata block (§5.5); a category has a name before it has a color.
- **Counts** on the tab: open notes, as a badge. Notes never count as problems.
- **Keyboard:** a list with one tab stop; Up and Down move, Enter goes, and the row's actions are buttons in the row and keys listed on the shortcuts page.
- **Phone:** the same list, with the filters in a sheet.

## 9. Scene goals

Optional fields for each scene: **Goal** (what someone wants), **Conflict** (what's in the way), **Outcome** (what happens), and **Shift** (how things turn, such as `hope → dread` or `+ → −`). They are keyed notes in the scene's header (§5.4).

- **Scene details…** (from an Outline row, a card, or the palette for the cursor's scene) opens a small form with the four fields, the synopsis, the color, and storylines. Saving writes the changed notes; an empty field removes its note.
- The goal shows on cards and in the Outline; all four show in the map's scene description (§14).
- Typed by hand as `[[Goal: …]]`, a field is read the same way, wherever it is in the scene.
- Call: no lint rule asks for goals. Reason: they are a tool, not homework, and a newcomer shouldn't see 40 problems for not using them.

## 10. Setups and payoffs

Mark a setup where something is planted and its payoff where it pays off, with the same label:

```
Tom hangs his coat on the hook. A letter sticks out of the pocket. [[Setup: the letter]]
...
Margaret unfolds the letter. [[Payoff: the letter]]
```

- Labels match without regard to case or surrounding space. A setup may have several payoffs.
- **The element bar's More menu** gains **Setup** and **Payoff**, which add the note at the end of the line with the cursor in the label, and offer the labels already used. Call: the bar is where Phase 1 teaches marks.
- **The Notes tab's Setups & payoffs group** lists each label with its setups and payoffs and their pages, and those never paid off first.
- **Lint:** `setup-without-payoff` and `payoff-without-setup` (info), with a jump. They don't count toward the problem total.
- A setup is "paid off" only by a payoff later in the script. Call: a payoff before its setup is reported as out of order, since reordering scenes can cause it.

## 11. Snapshots and Compare

### 11.1 Snapshots

Snapshots are copies of the whole text, kept in the browser's (or the desktop app's) storage. Like the recovery copy, they are a safety net, not part of the file. Call: technical design §8.4's schedule, adjusted:

- **Taken** every 10 minutes of active writing (the writing-time tracker's stretches, stats design §2), on every save to a file, on **Take snapshot** (with an optional label), and before a bulk operation: expand, a reader merge, **Fix all**, Revert to Saved, and restoring a snapshot. A single scene move is not a bulk operation; undo covers it, and the 10-minute snapshot covers a reload.
- **Not taken** when the text equals the newest snapshot.
- **Kept:** every labeled snapshot; every unlabeled one from the last 24 hours; then one an hour for 7 days; one a day for 90 days; then none. The snapshot of the last save is always kept (it is what Revert to Saved uses).
- **Stored** compressed with the browser's own `CompressionStream` (gzip). Call: no dependency, and it cuts a feature's history to about a quarter.
- Not kept for samples. Removed with the script.

**History…** (app menu, palette, and the save item in the status bar) opens a dialog listing snapshots by day: time, label or reason ("Saved", "Every 10 minutes", "Before expand"), and the change in words. For a snapshot: **Compare with now**, **Compare with…**, **Restore** (one undoable change, after a snapshot of now), **Label…**, **Save as a file**, and **Delete** (asks first). The dialog is a list with one tab stop and buttons in each row; on a phone it fills the screen.

### 11.2 Compare

**Compare** renders the newer of two versions as script pages, with what changed marked. It opens in the Compare tab, in the pane that isn't showing Source.

- A line diff of the two sources (Myers, on lines), mapped to the pages through each layout line's source range. Call: hand-written in `@drafter/compare`, since the algorithm is small and a dependency would add more than it saves.
- **Marks:** a changed or added line gets an asterisk in the right margin, the convention for revised lines. Where lines were removed, a thin rule and "3 lines removed" sit between lines; activating it shows the removed text, struck through.
- **Getting around:** **Next change** and **Previous change** (keys from the builder), and a **Changes** list above the pages, one row per change ("Page 12, INT. HALL: 2 lines changed"), each going to it.
- **For a screen reader:** each changed line carries visually hidden text ("changed", "added") at its start; the removed-lines marker is a button named for what it holds. The pages keep their headings, so heading navigation still works.
- **Phone:** the same view; the Changes list is collapsed at the top.
- Compare is read-only. **Restore this version** is offered from History, not here.

## 12. Spellcheck

nspell replaces the browser's spellcheck in the Source pane, as architecture §9 and technical design §10 designed. The existing spellcheck setting turns it on and off.

- **Dictionaries:** US English, bundled, and British English, chosen in Settings. Call: two dictionaries from the same source and licence cover most writers who'll find Drafter now; other languages wait for Phase 4's dictionary packs.
- **Loaded** in its own worker, lazily, after the editor is ready, and cached by the service worker with the rest of the app. Builder: the dictionary packages read their files through Node's file system, so import the `.aff` and `.dic` files as assets and fetch them in the worker.
- **Never flagged:** character names, every word of a scene heading's location, transitions, the words in the script's dictionary and the writer's own, all-capital words of three letters or fewer, words with digits, and addresses. Notes and boneyard are skipped by default (a setting).
- **The script's dictionary** is `dictionary` in the metadata block, so it travels with the file. **My dictionary** is in the browser's settings and applies to every script.
- **Marks:** a dotted underline, in a color that meets 3:1 against both themes, with `aria-invalid="spelling"` on the marked word.
- **Fixing:** right-click, or **Spelling suggestions** at the cursor (a key from the builder), opens a menu: up to five suggestions, **Add to this script's dictionary**, **Add to my dictionary**, **Ignore here**. **Next misspelling** and **Previous misspelling** move the cursor and say the word and the first suggestion in the live region.
- **On a phone,** when the cursor is on a flagged word, the element bar shows a **Spelling** button that opens the same menu. Call: the bar is already where a phone writer looks for help.
- **Check spelling** lists every flagged word in Problems under **Spelling**, outside the problem count.
- Markdown documents are checked too, skipping code.
- Spelling marks are their own decorations, not lint diagnostics. Call: so the gutter and the problem count aren't flooded.

## 13. Storylines

Tag a scene with the plots it carries: `[[Storyline: A]]`, or `A, B`, or names (`[[Storyline: Margaret's job]]`). A label is whatever the writer types; the metadata block gives each a longer name and a color (§5.5). Colors are assigned from the palette when a label first appears.

- **Tagging:** Scene details… (§9), the Outline and card menus (**Storylines…**, a checklist of labels with **New storyline…**), or by hand.
- **Renaming** a storyline (in Stats → Storylines, or the Storylines dialog) rewrites every note that uses it, as one change.
- **Shown:**
  - on Outline rows and cards, as labeled chips;
  - in the Outline's **Timeline** view: one lane per storyline along the page timeline, each scene a block placed at its page and sized by its length, a scene with two storylines in both lanes. The lanes are drawn with the same component as the script map (§14), and reuse the Structure strip's geometry (`structureStrip` in `@drafter/outline`: a lane is a strip row filtered to one storyline's scenes, on the same page axis);
  - in the Script pane's margin, as a thin colored bar with the label beside each scene, turned on from the pane's slim bar. Call: off by default, so the pages stay clean. The margin marks are hidden from screen readers and never printed; the Outline says the same thing in text;
  - on the Beat Board, as the cards' storyline chips, with **Arrange by storyline** (§17).
- **Timeline keyboard:** the blocks are a grid with one tab stop, one row per lane; Left and Right move along a lane, Up and Down between lanes, and Enter goes to the scene. A block's name reads "Scene 12, INT. KITCHEN, storyline A, page 12, 1 3/8 pages". On a phone, Timeline is a list grouped by storyline.

## 14. The script map

A slim column beside the Source pane: every scene as a block, top to bottom, its height in proportion to its length, so the whole script fits the height of the screen.

- **Colored by** INT/EXT, day or night, storyline, or scene color, chosen from the map's menu. A legend names each color, and each block has its label letter where it fits.
- **The cursor's scene** is outlined, and the map scrolls nothing (it's all on screen).
- **Clicking** a block goes to the scene. Hovering or focusing shows its heading, length, storylines, and goal.
- **Keyboard:** one tab stop; Up and Down move between blocks, Enter goes, and each block is named as in the Timeline. **Show the script map** and **Hide the script map** are commands.
- Call: off by default, turned on from the Source pane's slim bar or the View menu, and remembered. Reason: Phase 1 keeps the writing screen calm, and a newcomer turns it on when they want it.
- **Phone:** not shown; the Outline's Timeline does the job there.
- Not shown in focus mode.
- **Since v0.15.0** the Structure strip ([its design](drafter-structure-strip-design.md)) shows every scene sized by length above the panes; the map reuses `structureStrip`'s geometry, and whether it is still wanted beside the strip, or becomes the strip with a "color by" choice and storyline rows, is Plan E's to decide (strip design §10).
- **Since v0.21.0** (decided with Plan E's design, Call 38): there is no separate map. It becomes the Structure strip's **Color by** (INT/EXT, day or night, storyline, or scene color), built in Plan E's second part (v0.26.0); see the [seeing-the-script design §7](drafter-seeing-the-script-design.md#7-the-script-map-v0260).

## 15. The pacing view

In the Stats tab (§16): the script along its pages, as a chart.

- **Bars:** each scene's length, placed at its page.
- **A line:** the share of dialogue against action on each page, from the layout.
- **Guides,** off by default, chosen from a menu: **Three acts** (marks at a quarter and three quarters), **Five acts** (at fifths), and **Fifteen beats** (a common fifteen-point layout, with Drafter's own plain labels). Each mark is a thin dashed line with its name and its page, and the menu says "A guide, not a rule." Call: no guide uses a book's or brand's name or wording, for the clean room and to avoid trademarks. The chosen guide is in the metadata block, so it opens the same.
- Clicking a bar goes to the scene.
- **For a screen reader and the keyboard:** the chart is drawn with plain SVG and is hidden from the accessibility tree; the same data is a table beside it (scene, page, length, dialogue share), which is what keyboard focus reaches, and a row goes to its scene. A short text summary sits above: "Longest scene: INT. HALL, 4 pages. Dialogue share is highest on pages 30 to 45."
- **Phone:** the chart fits the width; the table stays below.

## 16. The Stats tab and the character grid

The Stats window from v0.5.0 becomes a tab. Call: one place for numbers, readable beside the source; **Show stats** and the status bar's **Stats…** open the tab, and the window goes. Its sections:

- **Overview:** everything the window shows now (today, the script, the last 30 days).
- **Characters:** the existing table, plus each character's **screen time** (the total length of the scenes they're in, in pages and eighths), **dialogue share** (their share of all words spoken), and **most often with** (the two or three characters they share the most scenes with, and how many).
- **Character by scene:** the grid (below).
- **Pacing:** §15.
- **Storylines** (Plan E): each storyline's scenes, pages, and share of the script, with Rename and Color.

A heading starts each section, and a short list of links at the top of the tab goes to each one.

**Who is in a scene.** Call: a character is in a scene if they speak in it, or their name appears in its action as a whole word, in capitals or with only its first letter capitalized; a name whose lowercase form is a dictionary word ("Hope", "Will") counts only in capitals. Reason: speaking alone misses silent presence, and plain matching would put Will in every scene where someone "will". This uses the spell dictionary (§12), which is one reason spellcheck ships before Stats.

**The grid.** Characters down the side, in order of speeches; scenes across, in order. Each cell is shaded by how many lines the character speaks in that scene, with a dot for present-but-silent, and holds that number as text. A long gap (a character absent for 20 pages or more, then back) is outlined, and a line under the grid lists those gaps: "TOM: absent from page 31 to page 72."

- **Keyboard:** the ARIA grid pattern: one tab stop, arrow keys move between cells, Home and End along a row, Enter goes to the character's first cue in that scene. Row and column headers are real headers, so a screen reader reads "TOM, scene 12, 4 lines".
- **Phone:** the first column stays fixed and the grid scrolls sideways in its own region; a **List** toggle shows each character's scenes as text instead.
- A grid of 120 scenes and 30 characters must open in under 200 ms on a mid-range laptop. Builder: draw only what's visible if it doesn't.

**Running time (since v0.17.0).** The Stats window already gives the running time at each script's own **minutes a page** and an **estimate from the dialogue** at its own **spoken words a minute** (the [out-the-door design](drafter-out-the-door-design.md) §3), both rates kept per script on its project record. The tab keeps both figures and both rate fields as they are, and screen time can be given in minutes at the script's page rate as well as in pages. The scene index's `timing` and `spokenBy` (each scene's words spoken, by speaker) are what dialogue share and Scaffold's per-character figures read, so nothing is counted twice.

**Since v0.21.0 (built in Plan E's first part).** The scene index lists each scene's **`speeches`** (who, the cue's block, and the words, a dual pair's sides in full and lyrics counted), with an **`opening`** for what's said before the first scene or section and each section's own stretch, so every speech has one owner and is counted once. The Stats window's own **`characterTable`** pass is retired: the tab's Characters table, the grid, and Scaffold all read one `Cast` from `@drafter/cast`. Two figures change meaning, as the changelog says: Words now count lyrics, and Scenes count every scene a character is in, speaking or silent, with the new **Speaks in** column keeping the old figure. Details are in the [seeing-the-script design](drafter-seeing-the-script-design.md) §3 and §4.

## 17. The Beat Board

A free board of idea cards, like a corkboard, for ideas that aren't scenes yet. The cards live in the Beat Board block (§5.6).

- **The board** is a grid of cells the cards snap to. Call: a grid rather than free placement, so the keyboard can move a card one step at a time, a position is two small numbers in the file, and the board reads in rows.
- **A card** shows its text, color, and storyline chips. **New card** (a button, the palette, or N on the board) adds one in the next free cell and opens it for typing.
- **Moving:** drag, or Alt+arrow keys on a focused card, one cell at a time. Arrow keys alone move focus between cards by position.
- **Links:** **Link to…** picks another card from a list; links are drawn as lines between cards (hidden from screen readers) and listed on each card ("Links to: The power goes out"). **Remove link** is in the same menu.
- **Arrange by storyline** puts each storyline's cards in its own row, keeping their order. One undo.
- **Place in the script…** asks where: **As a new scene after…** (a stub heading as in §6.5, with the card's line as its synopsis and its storyline as a header note) or **As a synopsis of…** an existing scene. The card leaves the board, its links go with a notice, and the change is one undo.
- **Read as a list:** a toggle shows the cards as a list in reading order (row by row), with every action in each row's menu. Call: on a phone the list is the default and the board is optional.
- **Keyboard and screen reader:** the board is a grid with one tab stop; each card's name gives its text, its cell ("row 1, column 2"), color, and storylines.
- The board is empty until the first card, and the block is written only then.

## 18. Reader notes

A reader reads the script at drafter.dev, comments on it, and sends the comments back in the `.fountain` itself, with no account and no server.

### 18.1 Sending a script out

**Send for notes…** (File menu) asks for the writer's name (remembered in settings) and saves a copy named "The Call — for notes.fountain", with `review` in the metadata block: the writer's name and the date. The writer sends the file however they like. Call: the copy is the whole script, so the reader sees what the writer sees.

### 18.2 Reader mode

**drafter.dev/read** opens a page that asks for a file. Call: an address the writer can send with the file. A file with `review` in its metadata block opens in reader mode wherever it's opened, with **Edit instead** for the writer.

In reader mode:

- The Script pane fills the window, with a margin column of comments; the Source pane is available, read-only, from the tab row.
- **Comment:** select words, or put the cursor on a line (in the Script pane by clicking; in the read-only Source pane with the keyboard), then **Comment** (a button that appears by the selection, the palette, or a key). A small form asks for the comment and a category (the starting set, §8); the reader's name is asked once and remembered.
- A comment on a whole line is written at the end of that line: `[[Sam: I don't believe she'd stay. #character]]`. A comment on some words is written right after them, with the words quoted: `[[Sam on “the letter”: Where did this come from? #story]]`. Call: the quote makes the comment readable in any app, and gives the merge something exact to find. Quotes over 60 characters are shortened with an ellipsis.
- **Replies** go right after the note they answer: `[[Chris re Sam: It's in his coat in scene 3.]]`. A run of adjacent person notes is a thread.
- The reader can edit or delete only their own notes. The script's text can't be edited in reader mode.
- **Send back:** **Save my notes** saves "The Call — notes from Sam.fountain" (download, or Save As where the browser can).
- **Phone:** a long press on a line offers **Comment**; selections are line-level.
- **Keyboard and screen reader:** the margin is a complementary region named "Comments", a list in script order; each comment says its line ("On page 12: Where did this come from?") and has Go to, Reply, Edit, and Delete. A new comment is announced once.

### 18.3 Adding a reader's notes to the draft

**Add notes from a reader's file…** reads every person note in the reader's file that isn't already in the draft, and finds each one's place in the current draft, even after more writing:

1. **The anchor** of each note: its line's text (without notes), its quote if it has one, the lines before and after, and its scene heading.
2. **Matching,** in order: the same line in a scene with the same heading; the same line anywhere, if it's there once; the closest similar line in the same scene, above a threshold (Builder: tuned on fixtures); the start of the scene with the same heading; otherwise **not placed**.
3. **A preview** says what will happen: "14 notes from Sam: 10 in place, 3 close matches, 1 not placed." Close matches and the unplaced are listed with their text and where they'll go.
4. **Applying** takes a snapshot, then inserts every note as one change. A note not placed goes into a paragraph of notes at the end of the script (before the Beat Board and metadata blocks), with the scene it came from added: `[[Sam: … (was in INT. HALL - DAY) #story]]`. **No note is ever dropped.** Call: the end of the script, because a note there prints nothing and is always found by the Notes tab.
5. **Running it twice** adds nothing the second time: a note whose person, text, and place already match is skipped.

Notes typed by hand as `[[Name: comment]]` are reader notes too, and merge the same way. The writer replies from the Notes tab or the margin (in the Script pane, a **Notes in margin** toggle shows the same comment column outside reader mode), resolves with `#resolved`, filters by person and category, and sends the file back with **Send for notes…** again.

Reader colors are in the metadata block (§5.5), assigned on first sight.

## 19. The Reference tab

Fountain and Drafter, built in, offline.

- **Fountain:** every element, its mark, its rule in a sentence, and an example: the cheat sheet's content. Call: one source for both, so the `/docs/fountain/` page and the tab can't disagree.
- **Drafter's conventions:** keyed notes (§5.3) with every key, scene headers, the Beat Board block, the metadata block, setups and payoffs, reader notes, and how a stage play is written in Fountain (architecture §7).
- **This template:** the active template's rules, generated from its JSON: paper, margins in inches, and each element's indent, width, capitals, and spacing.
- **Keyboard shortcuts:** generated from the command registry, as the shortcuts page is.
- A search field filters every section. Each topic is also in the palette as "Reference: Character", opening the tab at it.
- Headings for every topic, so the tab is navigable by headings. On a phone, the same page.

Call: the Reference tab comes last, because the cheat sheet already serves the newcomer today, and coming last lets it document every convention Phase 2 adds.

## 20. Screen-reader testing comes last

**Decided:** testing with NVDA and VoiceOver is the very last step, after every phase is built. The maintainer will run the voicecap passes on a Windows PC. Phase 2 therefore ends without it, which changes the README, architecture §12 and §13, and technical design §13 (§26).

Until then, every view is built for screen readers and checked automatically: axe, keyboard-only end-to-end tests, and assertions on the accessibility tree. Drafter claims no conformance with any standard.

## 21. Packages and dependencies

| Piece | What it holds | Plan |
|---|---|---|
| `@drafter/outline` | The scene index (§5.1); move, synopsis, fields, color, and storyline edits; condense, expand, and treatment export | A |
| `@drafter/fdx` | Final Draft XML: export, import to Fountain text, and a strict XML reader (technical design §6.3) | FD |
| `@drafter/notes` | Keyed notes (§5.3), scene headers (§5.4), setups and payoffs, the Beat Board block (§5.6), anchors and the reader merge (§18.3) | B |
| `@drafter/compare` | The line diff and its mapping to pages (§11.2) | C |
| `@drafter/spell` | The nspell wrapper, the words never flagged, and the two dictionaries (§12) | D |
| `@drafter/lint` | New rules: `stub-heading`, `setup-without-payoff`, `payoff-without-setup`, `duplicate-field`, and the Spelling group | A, B, D |
| `@drafter/cm-fountain` | Scene identity (§5.2), spelling decorations, and the map's cursor tracking | A, D, E |
| `apps/web` | Every view | all |

Each package depends only on `@drafter/fountain`, `@drafter/templates`, and `@drafter/layout` as needed, plus, for `@drafter/spell`, the dependencies below.

**New dependencies,** each needing a `docs/DEPENDENCIES.md` row and an entry in the third-party notices before it's added:

| Package | Licence | Why |
|---|---|---|
| `nspell` | MIT | Hunspell-compatible spellchecking in JavaScript. A general-purpose spellchecker, not a screenwriting tool. |
| `dictionary-en` | The package's own licence plus the permissive terms of the SCOWL word list it is built from; the builder records the exact licence the package declares | The US English word list. |
| `dictionary-en-gb` | As `dictionary-en` | The British English word list. |

Builder: confirm each licence from the package's own files at the version added. A dictionary under the GPL or LGPL is never bundled (architecture §9).

## 22. The plans

Each plan is a shippable minor release with its own plan document, tag, GitHub Release, and changelog section. Versions follow v0.9.0, the accessibility pass. Call: if the Mac app ships between two plans, it takes the next minor and the plans after it move up one.

**Decided (2026-10-28): Final Draft files come right after Plan A,** as Plan FD (v0.11.0), moved up from Phase 3; the plans after it each take the next minor. Plan FD keeps its own name so the letters the rest of this document uses for B to H stay as they are.

**Decided (2026-10-29): after Plan D, the Structure strip (v0.15.0: the outline as a band above the script, turned on and off), then PDF export for Markdown documents, then Highland, Fade In, and Markdown imports come next,** each its own minor. The strip took v0.15.0, so the headings below gave Plans E to H as v0.16.0 to v0.19.0 and their letters stayed; the Markdown PDF and import releases will move them down again, by one minor each, when they land. Their scope is unchanged. (Superseded by the next decision, which gives the versions as they now stand.)

**Decided (2026-10-29, with the Markdown PDF): the Markdown PDF took v0.16.0, and two releases come next, ahead of Plan E:** v0.17.0 (guided first-script starters, export options, a better running time, and a Technical details page) and v0.18.0 (version history, with GitHub-style diffs). So the headings below give Plans E to H as v0.19.0 to v0.22.0, their letters unchanged; the imports release (Highland, Fade In, and Markdown) will move them down once more, by one minor, when it lands. Their scope is unchanged.

**Decided (2026-10-29, with getting a script out the door): that release took v0.17.0, version history (with GitHub-style diffs) is v0.18.0, and the imports release (Highland, Fade In, and Markdown) takes v0.19.0, ahead of Plan E,** so the headings below give Plans E to H as v0.20.0 to v0.23.0, their letters unchanged. Plan E also takes **Scaffold**, the maintainer's cast-and-scene panel (named 2026-10-29); the other plans' scope is unchanged.

The order is otherwise the suggested one with two changes, both Calls: **setups and payoffs move into Plan B**, because they are keyed notes listed in the Notes tab B builds, and **snapshots come before spellcheck**, because the browser's spellcheck already works while history does not exist, and Plans A and B make large structural edits that a writer drafting for the first time should be able to go back on.

### Plan A — v0.10.0: The outline

**Scope:** `@drafter/outline` and the scene index; scene identity in `cm-fountain`; the tab row's More menu (§5.8); the Outline tab (§6.1) with synopsis editing and scene color (§5.4); moving scenes and sections by drag, keys, Move to…, and Source commands (§6.2–6.3); Condense and Expand all; Export as treatment; Expand outline, including New screenplay from a Markdown outline, and `stub-heading`.

**Done when:**

- The Outline lists the scenes of both templates with pages and lengths, and its tree works by keyboard.
- Every way of moving a scene or section works, keeps focus on the moved row, and announces it; one undo puts it back.
- Property tests: a move keeps every scene's text; moving and moving back restores the source; the preamble and the metadata block never move; the layout is unchanged by colors.
- A scene's color survives renaming its heading and moving it.
- Expand turns a Markdown outline into stubs, and Problems lists them.
- axe passes on the Outline, its menus, and Move to…, in both themes at both widths.

### Plan FD — v0.11.0: Final Draft files

**Status:** built (2026-10-28). Not yet tested against real Final Draft files; see `docs/DEFERRED.md`.

**Scope:** a new `packages/fdx` (`@drafter/fdx`), as technical design §6.3 describes it: **Export as Final Draft (.fdx)** from the Export menu and the palette, and **import** that turns an `.fdx` (opened, or dropped) into Fountain text, which is then parsed like any other script. Nothing is dropped silently: a paragraph type or element Drafter doesn't map comes in as action with a `[[fdx: Type]]` note. The XML is read with a strict parser written for the package (no DOM in a worker, no dependency unless one gets a `docs/DEPENDENCIES.md` row first) that refuses malformed input with a message rather than guessing. Built from `.fdx` files the writer owns, read as XML (the clean-room rule).

**Done when:**

- Export → import → export is stable on the supported fields (elements, title page, scene numbers, dual dialogue, emphasis, notes, synopses), by property test over random scripts.
- Import never drops content silently: every unmapped element is a note, by fixture.
- Malformed XML is refused with a plain message, and nothing is opened.
- An `.fdx` opens from Open, a drop, and (on the desktop) the system, and Export writes one; axe passes on anything new on screen.

### Plan B — v0.12.0: Cards and notes

**Status:** built (2026-10-29), except that axe on Cards, Notes, and Scene details waits for the final accessibility steps, and the Notes tab for Markdown documents is not built; see `docs/DEFERRED.md`.

**Scope:** `@drafter/notes`; the Cards tab (§7); the Notes tab with categories and status (§8); Scene details and scene goals (§9); setups and payoffs, with the element bar's buttons and the lint rules (§10); `duplicate-field`.

**Done when:**

- Keyed notes read and write back exactly, by property test, and a script full of them prints the same pages as without them.
- Cards move by drag and by keyboard, and edit synopses.
- The Notes tab filters by group, category, person, and status; resolve, reopen, edit, and delete are single undos.
- Scene details writes and clears the four fields in the header order.
- A setup with no payoff is listed in Notes and Problems.
- axe passes on Cards, Notes, and Scene details, in both themes at both widths.

### Plan C — v0.13.0: Snapshots and Compare

**Status:** built (2026-10-29), except that axe on History and Compare, in both themes at both widths, waits for the final accessibility steps; see `docs/DEFERRED.md`.

**Scope:** the snapshot schedule, retention, and compression (§11.1); the History dialog; `@drafter/compare`; the Compare tab (§11.2); snapshots before bulk operations.

**Done when:**

- Snapshots are taken and thinned on schedule, tested with a fake clock, and never duplicated.
- Restore is one undo and takes a snapshot first.
- Compare marks added, changed, and removed lines correctly on fixtures, including a moved scene, and Next change and the Changes list reach every change.
- axe passes on History and Compare, in both themes at both widths.

### Plan D — v0.14.0: Spellcheck

**Status:** built (2026-10-29), except that axe with misspellings on screen and the menu open waits for the final accessibility steps; see `docs/DEFERRED.md`. Downloadable dictionary packs are not built (Phase 4).

**Scope:** `@drafter/spell`, the worker, the two dictionaries (§12), the menus and commands, the script's and the writer's dictionaries, the phone's Spelling button, and the Spelling group in Problems. The browser's spellcheck is turned off.

**Done when:**

- Names, locations, and the dictionaries' words are never flagged, by fixture.
- Add to this script's dictionary writes the metadata block in one undo, and the word is unflagged at once.
- Typing in a 120-page script never waits on the checker.
- The dependencies have their DEPENDENCIES.md rows and notices.
- axe passes with misspellings on screen and the menu open.

### Structure strip — v0.15.0

**Status:** built (2026-10-29), except that an axe check of the strip in both themes waits for the final accessibility steps; see `docs/DEFERRED.md`.

**Design:** [the Structure strip design](drafter-structure-strip-design.md), with its own plan in `docs/plans/2026-10-29-structure-strip.md`. A band above both panes, off by default: a row for each section depth from 1 to 3 the script uses, a row of every scene, and a page ruler, each block sized by its pages and tinted by its scene color; clicking a block, or Enter on it, goes there as the Outline does. Its geometry (`structureStrip`, `linesPerPage`, `rulerMarks` in `@drafter/outline`) is what Plan E's Timeline, script map, and pacing view build on.

The strip took v0.15.0, so Plans E to H each moved down one minor; their letters stay.

### Markdown PDF — v0.16.0

**Status:** built (2026-10-29), except that the PDF is untagged and has no bookmarks: tagged PDF and PDF/UA, for scripts and documents, and bookmarks from the headings wait for the final accessibility steps; see `docs/DEFERRED.md`.

**Design:** [the Markdown PDF design](drafter-markdown-pdf-design.md), with its own plan in `docs/plans/2026-10-29-markdown-pdf.md`. **Export as PDF** for a Markdown document: headings, paragraphs, emphasis, lists, quotes, code, rules, and clickable `http`, `https`, and `mailto` links on numbered US Letter or A4 pages (a **Paper for Markdown PDFs** setting), in Inter Tight with Courier Prime for code, laid out by `@drafter/render-pdf`'s `src/document/` and drawn in the export worker, offline. A long export of any kind shows a progress bar and a percentage in its toast.

The Markdown PDF took v0.16.0, and v0.17.0 and v0.18.0 were put ahead of Plan E, so Plans E to H each moved down three minors at that point, and one more when the imports took v0.19.0; their letters stay, and they are now v0.20.0 to v0.23.0.

### Getting a script out the door — v0.17.0

**Status:** built (2026-10-29). Accessibility work beyond the existing axe checks waits for the final steps, as for the releases before it.

**Design:** [the out-the-door design](drafter-out-the-door-design.md), with its own plan in `docs/plans/2026-10-29-out-the-door.md`. Four things the maintainer asked for: a **guided first screenplay and first stage play** whose notes teach each element, its element-bar button, and its Fountain mark; **Export options** for scene numbers (none, as written, or every scene) and the title page (full, title and author only, or none), kept per script; **running time** at a rate set per script, an **estimate from the dialogue**, and each scene's and act's time in the Outline and the Structure strip, counted in the scene index's own pass; and a **Technical details** help page with diagrams, generated as Mermaid into `docs/technical-details.md`. No new dependency.

This release took v0.17.0, and version history (v0.18.0) and the imports (v0.19.0) come before Plan E, so Plans E to H are v0.20.0 to v0.23.0; their letters stay.

### Version history — v0.18.0

**Status:** built (2026-10-30). Axe checks the four new views in both themes on every project (the controller overruled the design's Call 36, which had put them off); the screen-reader listening pass waits for the final steps, as for the releases before it. See `docs/DEFERRED.md`.

**Design:** [the version-history design](drafter-version-history-design.md), with its own plan in `docs/plans/2026-10-30-version-history.md`. Four things the maintainer asked for: **Deleted scenes**, a tab listing every scene in a snapshot that no scene of the script now matches, with **Put back** to its old place in one undo; **Show changes**, the Script pane's pages marked against the last save or a chosen snapshot, never printed or exported; a **Changes** view in Compare (§11.2), a GitHub-style diff of the Fountain text grouped by scene, with + and −, the changed words marked, folds, and side by side, in red and green or blue and orange (the Pages view keeps v0.13.0's asterisks, the controller's ruling on the design's Call 19); and **History of this scene**, every version of one scene, with **Use this version**. Scenes are matched across versions by a new package, `@drafter/history`, in a worker of its own, with its notes in a second database, `drafter-cache`. No new dependency.

This release is v0.18.0 and changes no plan's number: Plans E to H stay v0.20.0 to v0.23.0, where v0.17.0 put them, and the imports release (Highland, Fade In, and Markdown), next, takes v0.19.0. (The version-history design's §14 gave Plans E to H as v0.19.0 to v0.22.0, moved by the imports to v0.20.0 to v0.23.0; v0.17.0 had already made that move.)

### Imports and Markdown out — v0.19.0

**Status:** built (2026-10-30). Axe checks the changed Export options dialog and the help page in both themes on every project; there is no new view. The screen-reader listening pass waits for the final steps, as for the releases before it. See `docs/DEFERRED.md`.

**Plan:** [`docs/plans/2026-10-29-imports-highland-fadein-markdown.md`](plans/2026-10-29-imports-highland-fadein-markdown.md), with its Calls in `docs/DECISIONS.md`. What the maintainer asked for: **Highland and Fade In files** open as new, unsaved scripts, moved up from Phase 3 (Celtx stays there), read by a new package, `@drafter/archive` (its own strict, read-only zip reader), and Open Screenplay Format read by `@drafter/fdx` through the Final Draft importer, so nothing is dropped silently; **Open as screenplay**, for a screenplay typed in a Markdown file; **Export as Markdown** for a whole script, honouring the scene-number and title-page options, with a third option, Notes in Markdown; and Open **refusing files that aren't scripts** (a Word document, an RTF file, a PDF, and the like), saying what each is and what to do. Both imports were built from the formats' public descriptions and synthetic fixtures; checking them against real files waits for the maintainer to send one of each. No new dependency.

This release is v0.19.0 and changes no plan's number: Plans E to H stay v0.20.0 to v0.23.0, where v0.17.0 put them.

**Decided (2026-10-30, with the formats release): v0.20.0 is the formats release** (`drafter convert`, footnotes in Markdown documents, the tour's Fountain-first wording, and the README's Formats section), ahead of Plan E. Plan E ships in two parts, v0.21.0 (Scaffold, the Stats tab, and the character grid) and v0.23.0 (storylines, the Timeline, the map, and pacing), with **Export as HTML** ([its design](drafter-html-export-design.md)) as v0.22.0 between them. Plans F to H move to v0.24.0 to v0.26.0, their letters unchanged. Plan F, the Beat Board, is expected to become the **Workbook** the maintainer asked for (a story bible and scene cards beside the script), with its own design.

**Decided (2026-10-30, with Plan E's first part; the controller's ruling on the seeing-the-script design's Call 1, renumbered after the formats release): Plan E ships in two parts, with Drafts and Cuts and Novel between them** (the maintainer's order). **v0.21.0** is Plan E part 1 (Scaffold, the Stats tab, and the character grid); **v0.22.0** is Export as HTML, and EPUB, for reading a draft on an e-reader ([its design](drafter-html-export-design.md)); **v0.23.0** is **Drafts and Cuts**, numbered drafts with content-hash IDs and a permanent Cuts file beside each script or novel, for every kind, to be designed; **v0.24.0** is **Novel**, a choice beside Screenplay and Stage play for drafting a novel in Markdown (chapters, sections, focus, and counts, and a manuscript PDF or `.docx` later in that release), to be designed; **v0.25.0** is Plan E part 2 (storylines, the strip's Color by, and pacing); and Plans F to H move to **v0.26.0 to v0.28.0**, their letters unchanged, F still expected to become the Workbook. The script map is the strip's **Color by** (Call 38), not a column of its own.

**Decided (2026-10-30, with HTML and EPUB; the maintainer's order): a fresh look comes before Drafts and Cuts, and Plan F becomes the Workbook.** **v0.22.0** is Export as HTML and EPUB; **v0.23.0** is **a fresh look** ([its design](drafter-fresh-look-design.md)): calm and paper-first, two bars instead of five, the editor always on the left with an Inspector on the right, paper pages, one button and dialog system, a tab bar along the foot of a phone, and six bug fixes, so the releases after it are built in the new look; **v0.24.0** is **Drafts and Cuts** ([its design](drafter-drafts-and-cuts-design.md)); **v0.25.0** is **Novel**; **v0.26.0** is Plan E part 2; **v0.27.0** is Plan F, now **the Workbook**: a story bible and scene cards beside the script (the Beat Board's cards among them), a landing spot for pasted notes, a Dropbox, Google Drive, or OneDrive folder watched for notes dropped into it, and voice notes recorded and transcribed on the device, with a live sound bar while recording, to be designed; **v0.28.0** is **the `.drafter` project package**; and Plans G and H move to **v0.29.0 and v0.30.0**, their letters unchanged.

**The `.drafter` project package (v0.28.0), optional:** one file holding a whole project for sharing or archiving: a documented, open zip (as a `.highland` file is) with the `.fountain` file, its drafts folder, its Cuts file, its workbook, and its voice notes' audio. File → **Export project…** writes one and **Open project…** reads one. It is never the default: writing and Save stay a plain `.fountain` file, and every file inside the package is plain text or audio, readable without Drafter. To be designed after the Workbook, whose files it carries.

### Plan E, part 1 — v0.21.0: Scaffold and the Stats tab

**Status:** built (2026-10-30). Axe checks every new view (each Stats section, the grid and its List, Scaffold's scene, character, and location pages, and the Cast and Places) in both themes at both widths on every project (Call 45, the v0.18.0 ruling carried forward); the screen-reader listening pass waits for the final steps. See `docs/DEFERRED.md`.

**Design:** [the seeing-the-script design](drafter-seeing-the-script-design.md), with its plan in [`docs/plans/2026-10-30-seeing-the-script.md`](plans/2026-10-30-seeing-the-script.md) and its Calls in `docs/DECISIONS.md`. **Scope:** who is in each scene (§16's rule, with the spell dictionary), in a new package, `@drafter/cast`; the Stats tab replacing the window (§16), with screen time, dialogue share, most often with, and the character grid with its long absences; and **Scaffold** (below), with its scene page, character and location pages, and the Cast and Places.

**Scaffold** (named by the maintainer, 2026-10-29): who is in the script, and where, at a glance, in Drafter's own design and words.

- **The panel**, beside the script, follows the cursor's scene: its characters (speaking or silent, by §16's rule for who is in a scene), each one's words and share of the scene's time, the location and time of day, the scene's pages and estimated minutes, anyone first seen here, and a link to each character's other scenes.
- **A character page:** every scene they are in, their screen time in pages and in minutes at the script's rate, their dialogue share, their first and last appearance, their longest absence, the characters they share scenes with, the locations they visit, and every line they speak, each a link to its place.
- **A location page:** its scenes, the time spent there, and who appears there.
- Built on the Stats tab's character data and grid (§16) and on v0.17.0's per-scene `timing` and `spokenBy` in the scene index, so it counts nothing again. Every figure is text a screen reader reads, and every view works by keyboard.

**Done when:**

- Presence and screen time match fixtures, including "Will" and "Hope".
- The grid meets its time budget, and it and its List work fully by keyboard.
- Scaffold's figures match the Stats tab's and the scene index's on fixtures, and its panel and its character and location pages work fully by keyboard.
- axe passes on every Stats section, the grid, and Scaffold, in both themes at both widths.

### Plan E, part 2 — v0.26.0: Storylines, the map, and pacing

**Scope:** storylines (§13) with the Timeline view and the margin marks; the script map (§14), as the Structure strip's **Color by** (Call 38); the pacing view and its guides (§15), Drafter's own and generic (the controller overruled a fifteen-mark guide); and the Stats tab's Storylines and Pacing sections (§16).

**Done when:**

- Storylines can be tagged, renamed (one undo across every note), colored, and seen in the Outline, cards, Timeline, margin, and the strip's Color by.
- The strip's Color by, the Timeline, and the pacing table work fully by keyboard, and each chart has its table.
- axe passes on the Storylines and Pacing sections, the Timeline, the margin marks, and the strip's Color by, in both themes at both widths.

### Plan F — v0.27.0: The Workbook (was the Beat Board)

**Status:** to be designed (decided 2026-10-30, above): the story bible and scene cards, the pasted-notes landing spot, the watched notes folder, and on-device voice notes. Its design replaces the Beat Board scope below, which it takes in.

**Scope:** the Beat Board block (§5.6) and the Beat Board tab (§17): cards, the grid, moving, links, Arrange by storyline, Place in the script, and the list view.

**Done when:**

- Every board action works by keyboard and from the list view, and on a phone.
- The block reads and writes back exactly, and hand-edited cards keep working.
- Placing a card makes a scene or a synopsis in one undo.
- axe passes on the board and the list, in both themes at both widths.

### Plan G — v0.29.0: Reader notes

**Scope:** Send for notes (§18.1); reader mode and `/read` (§18.2); the comment margin, also in the writer's Script pane; replies; the merge with its preview (§18.3).

**Done when:**

- A reader can open a file, comment on lines and words, reply, and save, on a desktop and on a phone, by keyboard.
- Merging into an edited draft places notes on fixtures as expected, and property tests show no note is dropped and a second merge adds nothing.
- The round trip (send, comment, merge, reply, send back) works end to end in a test.
- axe passes on reader mode, the margin, and the merge preview.

### Plan H — v0.30.0: Reference

**Scope:** the Reference tab (§19), the cheat sheet made from the same source, the template's rules, and Reference topics in the palette.

**Done when:**

- Every Fountain element and every Phase 2 convention has a topic, and the cheat sheet page and the tab show the same text.
- The template section matches the template's JSON for both built-ins.
- Search and the palette reach every topic.
- axe passes on the tab, and its headings are in order.
- The README, architecture, and technical design say Phase 2 is done.

## 23. Calls to check

| § | Call | Reason, in a line |
|---|---|---|
| 2 | One marked Compare view, not side by side | Simpler, and reads in order for a screen reader. |
| 4 | Sample modules stay as examples | They document the module API. |
| 5.1 | The scene index is derived on every parse | The parse is full and fast, and derived data can't drift. |
| 5.2 | Scene identity lives in the session, not the file | Per-scene data is inside the scene, so the file needs no ids. |
| 5.3 | One keyed-note convention for all placed data | Notes never print, and every Fountain app keeps them. |
| 5.3 | An all-capitals head is a category | `[[TODO: …]]` files itself. |
| 5.4 | Scene colors are header notes, not metadata (decided 2026-10-28) | They survive renames, reorders, and other apps. |
| 5.6 | Beat Board cards are synopsis lines in a boneyard | Placing a card needs no translation; other apps never show the board. |
| 5.7 | No scene views for Markdown documents | Markdown has no scenes or notes. |
| 5.8 | Four fixed tabs, one slot, then More | Nine tabs don't fit a pane. |
| 6.1 | The Outline is an ARIA tree | Screen readers know how to read one. |
| 6.3 | A moved scene gets one blank line each side | Simple, readable, and reversible. |
| 6.4 | Condense and Expand all are names for folding | The words a writer looks for. |
| 6.5 | Stubs get `INT. LOCATION - DAY` and a lint item | A valid heading to overwrite, and a to-do list. |
| 8 | Scene fields aren't listed in Notes | They would bury the writer's own notes. |
| 9 | No lint rule asks for goals | Goals are a tool, not homework. |
| 10 | Setup and Payoff on the element bar | The bar is where Drafter teaches marks. |
| 10 | A payoff before its setup is reported | Reordering can cause it. |
| 11.1 | No snapshot per single move; gzip storage | Undo covers a move; compression needs no dependency. |
| 11.2 | A hand-written line diff | Small algorithm, no dependency. |
| 12 | US and British English only | Same source and licence; more languages in Phase 4. |
| 12 | Spelling marks aren't lint diagnostics | Keeps the gutter and the problem count clean. |
| 12 | A Spelling button on the phone's element bar | Where a phone writer already looks. |
| 13 | Storyline margin marks off by default | The pages stay clean. |
| 14 | The script map off by default | The writing screen stays calm. |
| 15 | Guides with Drafter's own labels | Clean room, and no trademarks. |
| 16 | The Stats window becomes a tab | One place for numbers, beside the source. |
| 16 | Presence by speech or name in action | Catches silent characters without false matches. |
| 17 | The board is a snapping grid; list view first on a phone | Keyboard moves, small positions, readable rows. |
| 18.1 | The copy sent out is the whole script | The reader sees what the writer sees. |
| 18.2 | `drafter.dev/read`, and quoted selections | An address to send; an exact anchor for the merge. |
| 18.3 | Unplaced notes go to the end of the script | They print nothing and are always found. |
| 19 | The Reference and the cheat sheet share one source | They can't disagree. |
| 22 | Setups and payoffs in B; snapshots before spellcheck | B builds the Notes tab; browser spellcheck already works and history doesn't. |
| 22 | A Mac release between plans takes the next minor | Versions follow shipping order. |

## 24. Open questions

None. The one this section held, scene colors as visible notes (§5.4), was decided on 2026-10-28: a color is a `[[Color: blue]]` line in the scene's header. It survives renames, reordering, and other apps; notes never print; and it keeps the one-convention rule (§5.3). The cost, a visible note line in other apps, is accepted.

## 25. Left to the builder

- Component structure, and where each view's state lives.
- Keys for new commands, within §5.7.
- The wording of every label, dialog, and announcement, in plain language.
- The match threshold for close matches (§18.3), tuned on fixtures and recorded in DECISIONS.
- The exact palette values, meeting contrast in both themes.
- How the tests are organized, within technical design §15, with axe on every new view's main states in both themes at both widths.

## 26. Changes to the earlier documents

Made with Plan A (2026-10-28):

- **README** (Roadmap): move "Testing with NVDA and VoiceOver" out of Phase 2 to a final step after Phase 5; mark "Writing statistics by day" as shipped in v0.5.0; change Phase 1's "Testing with NVDA and VoiceOver follows in Phase 2" and the same date under "What makes it different" to say it comes last; link this design under Design documents.
- **Architecture §5.1 and §5.3:** scene colors live in scene headers as keyed notes; the metadata block keeps script-wide data. **§12 and §13:** NVDA and VoiceOver come last. **§14:** the scene-identity question is closed by §5.2.
- **Technical design §7:** colors and stubs as in §5.4 and §6.5; the scene index and identity as in §5.1–5.2. **§8.4:** the snapshot schedule as in §11.1. **§8.6:** the metadata block's Phase 2 keys. **§13:** NVDA and VoiceOver come last.
- **README and architecture §13 (Final Draft, decided 2026-10-28):** `.fdx` import and export is listed under Phase 2 (Plan FD, v0.11.0), not Phase 3, and `@drafter/fdx` is a Phase 2 package.
- **Phase 1 design §14:** the Beat Board's positions, colors, and links live in the Beat Board block, not the metadata block, and storylines are header notes with their colors in the metadata block.

Made with the Structure strip (2026-10-29):

- **This design, §13, §14, and §22:** the Structure strip ships as v0.15.0 between Plans D and E, with [its own design](drafter-structure-strip-design.md); Plans E to H become v0.16.0 to v0.19.0, their letters unchanged; the Timeline's lanes and the script map reuse its geometry, and Plan E decides whether the map is still wanted beside it. **README:** the strip is in the status line, the Phase 2 roadmap, and the views table, and `@drafter/outline` lists its geometry.

Made with the Markdown PDF (2026-10-29):

- **This design, §22:** the Markdown PDF ships as v0.16.0 after the Structure strip, with [its own design](drafter-markdown-pdf-design.md); v0.17.0 (guided starters, export options, running time, and a Technical details page) and v0.18.0 (version history) come next, so Plans E to H become v0.19.0 to v0.22.0, their letters unchanged, and the imports release will move them once more. **README and architecture §13:** the Markdown PDF is in the status line, What you can do today, the Phase 2 roadmap (built in v0.16.0), the Packages and Stack tables, and Design documents; the "Next" lines name v0.17.0, version history, and the imports.

Made with getting a script out the door (2026-10-29):

- **This design, §16 and §22:** v0.17.0 is listed as built, after the Markdown PDF, with [its own design](drafter-out-the-door-design.md); version history is v0.18.0 and the imports v0.19.0, so Plans E to H become v0.20.0 to v0.23.0, their letters unchanged. Plan E takes Scaffold, the maintainer's cast-and-scene panel with a page for each character and location, built on §16 and v0.17.0's per-scene timing; §16 notes that the per-script rates and the estimate from the dialogue carry into the Stats tab. **Architecture §13 and the README:** the same order, v0.17.0 among what's built, and Scaffold in Phase 2's list. **Architecture §10 and technical design §7:** Expand from outline is no longer called scaffolding, so the word names only the new feature.

Made with version history (2026-10-30):

- **This design, §22:** version history is listed as built, as v0.18.0 after v0.17.0, with [its own design](drafter-version-history-design.md); the imports release takes v0.19.0 and Plans E to H stay v0.20.0 to v0.23.0. Compare (§11.2) gains a Changes view beside Pages, which keeps its asterisks. **Architecture §13 and the README:** version history among what's built (the status line, What you can do today, the Phase 2 roadmap, the Packages table with `@drafter/history`, and Design documents), and "Next" names the imports (v0.19.0), then Plans E to H (v0.20.0 to v0.23.0, Plan E with Scaffold). **Technical details** (the help page and `docs/technical-details.md`): `@drafter/history` and the history worker. **Privacy:** the `drafter-cache` database.

Made with the imports and Markdown out (2026-10-30):

- **This design, §22:** the imports release is listed as built, as v0.19.0 after version history, with its own plan; Plans E to H stay v0.20.0 to v0.23.0. **Architecture §13 and the README:** Highland and Fade In import, Open as screenplay, and Export as Markdown among what's built (the status line, What you can do today, the Phase 2 roadmap, and the Packages table with `@drafter/archive`), and "Next" names Plan E, "Seeing the script", with Scaffold (v0.20.0), then Plans F to H. **Phase 1 design:** its Phase 3 line keeps Celtx only. **Technical design §6.3 and §14:** OSF read through the Final Draft tree, and the zip rules. **Clean room:** the public descriptions of the `.highland` and `.fadein` packages and the published OSF specification join the permitted sources. **Technical details:** `@drafter/archive`, and Markdown among the exports.

Made with Plan E, part 1 (2026-10-30):

- **This design, §14, §16, and §22:** §14 notes that the map becomes the Structure strip's Color by (Call 38); §16 notes the scene index's `speeches` and `opening` and the retired `characterTable`; §22 splits Plan E into part 1 (v0.21.0, built) and part 2 (v0.25.0), with the done-when divided between them, and a "Decided" paragraph puts Export as HTML (v0.22.0), **Drafts and Cuts** (v0.23.0), and **Novel** (v0.24.0) between the parts and Plans F to H at v0.26.0 to v0.28.0. **Architecture §13 and the README:** Scaffold, the Stats tab, and the character grid among what's built (the status line, What you can do today, the Phase 2 roadmap, the Packages table with `@drafter/cast`, and Design documents), and "Next" names Export as HTML, Drafts and Cuts, Novel, Plan E part 2, then Plans F to H. **Technical details:** `@drafter/cast`. **The seeing-the-script design and plan:** renumbered the same way, with a note saying so.
