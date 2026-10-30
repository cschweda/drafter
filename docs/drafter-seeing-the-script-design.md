# Seeing the script — Design

**Status:** designed 2026-10-30, as Phase 2's Plan E, after v0.19.0 (Highland, Fade In, and Markdown imports). The plan is [`docs/plans/2026-10-30-seeing-the-script.md`](plans/2026-10-30-seeing-the-script.md). This design recommends shipping Plan E as **two releases** (Call 1): **v0.21.0, Scaffold and the Stats tab** (§3 to §5), then **v0.24.0, storylines, the map, and pacing** (§6 to §8). Plans F to H then become v0.25.0 to v0.27.0, with their letters unchanged.

**Release numbers (decided 2026-10-30, after this design):** v0.20.0 went to the formats release (`drafter convert`, footnotes in Markdown documents), so Part 1 is **v0.21.0**; **Export as HTML** (and EPUB) is v0.22.0 and **Novel**, a template choice for drafting novels in Markdown, v0.23.0; Part 2 is **v0.24.0**; and Plans F to H are **v0.25.0 to v0.27.0**, their letters unchanged. The numbers below are the current ones; the Calls and the controller's rulings keep the numbers they were made with.

**Asked for.** Phase 2 design §22, Plan E: storylines (§13) with the Timeline view and margin marks; the script map (§14); the pacing view (§15); the Stats tab replacing the window, with screen time, dialogue share, most often with, the character-by-scene grid, and Storylines (§16); and **Scaffold**. The maintainer, 2026-10-29: "How about adding an x-ray feature like amazons x-ray for movies. Characters, scene time per character, etc etc". They named it **Scaffold**, and then said "Yes please keep going this sounds really cool". Scaffold, as Phase 2 design §22 writes it down:

1. **A panel** beside the script that follows the cursor's scene. It shows who is in the scene (speaking or silent, by §16's rule), each one's words and share of the scene's time, the location and time of day, the scene's pages and minutes, anyone first seen here, and a link to each character's other scenes.
2. **A character page** with every scene they are in, their screen time in pages and in minutes at the script's rate, their dialogue share, their first and last appearance, their longest absence, the characters they share scenes with, the locations they visit, and every line they speak, each line a link to its place.
3. **A location page** with its scenes, the time spent there, and who appears there.

**The name (binding).** The feature is **Scaffold** everywhere: the tab, commands, help, the changelog, and code identifiers. "X-Ray" is another company's brand for its own feature. It never appears in the app, its help pages, the changelog, the README, or the palette's search words. The maintainer's message is quoted above, in this design, as history only.

**Clean room (binding).** The idea of a panel showing who is in a scene is common property. The look, the words, and the code are Drafter's own. Scaffold is designed from Drafter's own scene index, and not from any app's interface: no streaming service's, no screenwriting app's, and no script-breakdown tool's. No code, stylesheets, icons, or markup from any of them. The pacing guides' labels are Drafter's own plain words, and no guide uses a book's or a brand's name or terms (Phase 2 design §15). Every test script is original text written for Drafter.

Each choice open to the designer is marked **Call:**. All of them are listed in §16.

## 1. What exists to build on

- **The scene index** (`sceneIndex` in `@drafter/outline`, Phase 2 design §5.1) is recomputed on every parse. Each scene has `heading`, `span`, `sections`, `synopses`, `color`, `fields`, `storylines` (every Storyline note's labels, case-folded, once each), `marks`, `speakers` (names as first typed), `words`, `timing` (`spoken`, `actionLines`), `spokenBy` (words each speaker says; both sides of a dual pair in full), and `pages` (`page`, `line`, `eighths`, filled in once a matching layout arrives). It is counted in one pass by `TimingTally` (v0.17.0).
- **Running time** (v0.17.0): two rates per script on its project record, `minutesPerPage` and `wordsPerMinute` (`stats/timing.ts`, `useRates`). The labels are `shortTime`, `timeWords`, and `pageSeconds` in `stats/time-format.ts`, and `lengthLabel` in `outline/labels.ts`.
- **The Stats window** (`StatsDialog.vue`, v0.5.0). Its sections are Today, This script (with the rates), and Last 30 days. It has a character table (`characterTable`: speeches, scenes spoken in, dialogue words, counted in a second pass of its own) and the INT/EXT and DAY/NIGHT split (`headingSplit`). **The Counts panel** (`CountsPanel.vue`) is the status bar's popover, with the goal and the sprint, and a **Stats…** button that opens the window.
- **The Structure strip** (v0.15.0): `structureStrip`, `linesPerPage`, and `rulerMarks` in `@drafter/outline`; the strip's keys (`strip/keys.ts`), labels and hover card (`strip/labels.ts`), and `currentBlocks` (the cursor's scene).
- **The Outline and the Cards** (v0.10.0 and v0.12.0): `useOutline` (`index`, `idOf`, `apply`, `readOnly`), `sceneMenuItems`, and Scene details, whose Storylines field is plain text (`[[Storyline: A, B]]`).
- **`@drafter/notes`:** keyed notes, `normalizeLabel`, `SCENE_COLORS`, and the pattern for colors in the metadata block (`categoryColors`, `setCategoryColor` through `setMeta`).
- **Spellcheck** (v0.14.0): the dictionary is loaded in the spell worker (`workers/spell-compute.ts`), and a `Checker` has `correct(word)`. Spellcheck is on by default.
- **`createScriptView`'s `decorate` hook** (v0.18.0), which draws live marks on the Script pane's pages.
- **Panes and tabs:** `VIEW_TABS` (Cards, Notes) share the slot and More. `openBeside` places a tab in the pane that isn't showing Source.

## 2. Two releases

**Call 1: split Plan E into two releases.**

| Release | Name | Scope |
|---|---|---|
| **v0.21.0** | Seeing the script: Scaffold and the Stats tab | Who is in a scene (§3); the Stats tab replacing the window, with Characters (screen time, dialogue share, most often with) and the character-by-scene grid with its gaps (§4); Scaffold, with its scene panel, character pages, location pages, and the cast and places lists (§5). |
| **v0.24.0** | Seeing the script: storylines, the map, and pacing | Storylines (§6): tagging, names, colors, rename, chips, the Outline's Timeline, and the Script pane's margin marks; the script map, as the Structure strip's **Color by** (§7); the pacing view and its guides (§8); and the Stats tab's Storylines and Pacing sections. |

Reasons:

- **Size.** One release would be about sixteen tasks. Version history, the largest release so far, was eight. Each half is about eight, so each review can hold the whole release in view.
- **What the maintainer asked for first.** Scaffold is what they named and asked to keep going with. Scaffold needs the presence rule, the Stats tab, and the grid's data, and nothing from storylines or pacing.
- **A clean seam.** The two halves share only the Stats tab's shell, which v0.21.0 builds and v0.24.0 adds two sections to, and the scene index, which both read. Storylines, Timeline, the margin marks, the map, and pacing all build on the strip's geometry and on each other.
- Plans F to H move down, to v0.25.0, v0.26.0, and v0.27.0, with their letters unchanged (with the formats release, Export as HTML, and Novel ahead of them, §15). The docs tasks say so.

The plan covers both halves as **Part 1** and **Part 2**, each ending in its own docs task and release. If the controller rules for one release, Part 1's docs task is skipped and Part 2's covers both.

## 3. Who is in a scene (v0.21.0)

### 3.1 The cast

The **cast** is every name that has a cue in the script, in any scene or before the first, taken from the cue as the parser reads it, without extensions (`(V.O.)`, `(CONT'D)`) or the dual `^`. Names that differ only in capitals are one character, shown as first typed (as `characterTable` does now).

- **Call:** **only speaking characters are in the cast.** Someone who never has a cue (a silent GUARD introduced in capitals in the action) is not listed. Reason: capitals in action also mark sounds and props ("The phone RINGS"), so finding silent-only characters would guess. A way to name one, such as a `[[Cast: GUARD]]` note, is deferred.
- **Call:** **no aliases.** "TOM" and "YOUNG TOM" are two characters, as their cues say. Merging names is deferred.

### 3.2 The rule

A character is **in** a scene when either is true (Phase 2 design §16, Decided):

1. They **speak** in it: a cue of theirs is in the scene.
2. Their **name appears in its action** as a whole word or words, written either in capitals (`TOM`) or with only the first letter of each word capitalised (`Tom`), or as the cue itself spells it (`McCLANE`). A possessive (`TOM'S`, `Tom’s`) counts.

The exception: **a name that is also an ordinary word** ("Will", "Hope", "Grace", "The Driver") counts in the action **only in capitals**. A name is an ordinary word when **every word** of it, lowercased, is a dictionary word (§3.3).

Further details:

- **Only action counts:** a screenplay's action and a play's stage directions, the printed text of lines that aren't transparent. Dialogue, parentheticals, transitions, headings, notes, synopses, and the boneyard don't count. Reason: a name in someone's speech is talk about them, not presence.
- **Call:** **a name of several words matches only as the whole phrase**, the longest name first, so "ANN LEE" in the action is Ann Lee and not also a character called ANN. A first name alone doesn't count for a two-word cue. Cue names are what the script uses, and guessing short forms is aliasing (§3.1).
- **Call:** **a mention counts as presence.** "She looks at a photo of TOM" puts Tom in the scene. Drafter can't tell a mention from a presence, and the help page says so. Writers who introduce characters in capitals will rarely see the problem, and marking a mention as "not here" is deferred.
- A character is **silent** in a scene they are in without speaking.

### 3.3 Dictionary words

**Call:** **the spell worker answers which names are words.** The worker gets a new request, `words(names)`, which returns the names whose every word, lowercased, `Checker.correct` accepts in the script's spell language. The answers are kept for the visit, by name. Reasons: the dictionary already lives there, and one round trip for forty names costs nothing.

- **Call:** **with spellcheck off, the worker still loads the dictionary for this one question,** when a view that needs presence is shown. The files are already cached with the app, and the setting governs marks in the Source pane, not this rule.
- **Until the answer comes, or if the dictionary can't load, every name counts only in capitals.** That is the strict reading: it can miss a silent "Tom", but it never puts Will into every scene where someone "will". A name gets its looser reading as soon as the worker says it isn't a word.
- Names added to the script's or the writer's dictionary don't change this. "Will" is a word whatever the writer adds.

### 3.4 What the scene index adds

**Call:** **speeches are counted once, in the scene index,** and everything else reads them. The scene index gains:

| Field | What it is |
|---|---|
| `Scene.speeches` | One entry per cue in the scene, in order: `{ name, block, words }`. `name` is as `speakers` gives it, and `words` is what `TimingTally` gives that speech. |
| `SceneIndex.opening` | The same tally for the blocks before the first scene (a cold open's speeches): `{ speeches, spokenBy, timing }`. It is null when no speech is there. |

`spokenBy[name]` stays, and it equals the sum of that name's `speeches[].words`, which a property test checks. `TimingTally` records each speech as it closes, so this adds no second pass.

**Call:** **the Stats window's own `characterTable` pass retires.** The Characters table (§4.3) reads the scene index and the cast, so the Stats tab, Scaffold, and the grid can't disagree. Two numbers change, and the changelog says so:

- **Words** count dialogue **and lyrics**, as the running-time estimate does. Before, they counted dialogue only.
- **Scenes** count the scenes a character is **in**, speaking or silent. Before, only scenes they spoke in counted. A separate **Speaks in** column keeps the old figure.

### 3.5 Each character's figures

In `@drafter/cast`, from the scene index, the cast, and the dictionary answers:

| Figure | How |
|---|---|
| Scenes in | Scenes where the rule (§3.2) holds, in order, each marked speaking or silent. |
| Speeches, words | Their `speeches` across the scenes and the opening. |
| **Dialogue share** | Their words divided by every character's words, both sides of a dual pair in full, so the shares add up to 100%. **Call:** a share of words, not of time: words are what the script holds. |
| **Screen time** | The total length, in eighths of a page, of the scenes they are in. In minutes, that is `pageSeconds(eighths, minutesPerPage)` at the script's own page rate. It is null until the pages are ready. |
| First and last appearance | Their first and last scene, with page and scene number. |
| **Long absences** | **Call:** every gap of **20 pages or more** between two scenes they are in, measured from the end of one to the start of the next on the strip's page axis (`structureStrip`). Only gaps between appearances count, never before the first or after the last. The **longest absence** is the largest gap, whatever its length. Both need pages; until the layout is ready, the absences say "When the pages are ready". |
| **Most often with** | **Call:** the three characters they share the most scenes with, and how many, with ties going to the one with more speeches. The character page lists everyone they share a scene with. |
| Locations visited | The locations (§3.6) of their scenes, with a count of each. |

### 3.6 Locations and time of day

From each scene heading of a screenplay:

- **Inside or outside:** `headingSplit`'s rules (INT, EXT or EST, both, none). They move into `@drafter/cast` and `headingSplit` reads them from there.
- **Time of day:** **Call:** the last part after ` - ` (or an en dash) when it is one of a known list: DAY, NIGHT, MORNING, AFTERNOON, EVENING, DAWN, DUSK, SUNSET, SUNRISE, LATER, CONTINUOUS, SAME, MOMENTS LATER. It is shown as typed. `headingSplit` keeps its own day and night counts.
- **The location:** the heading's text without its prefix, its time part, and a locked number. Its key is upper-cased, with spaces collapsed and every dash read as `-`. **Call:** **INT. and EXT. of the same place are one location.** The location page gives the inside and outside split. **Call:** **each distinct place is its own location.** "HOUSE - KITCHEN" and "HOUSE" are two locations, sorted next to each other in the Places list. Grouping sub-locations is deferred.
- **Call:** **a stage play's scenes have no location** unless their heading is written in the INT./EXT. form. Scaffold says "This scene’s heading doesn’t name a place." A play's `## Scene 2` names no place.

### 3.7 Cost

**Call:** **the cast is computed on the main thread, only while a view needs it,** and remembered by the parse. The parse and the scene index are already on the main thread. Sending them to a worker would cost more than the work itself. The views that need it are the Stats tab, Scaffold, and later the Storylines section, and with none of them shown, nothing is computed. While one is shown, the cast is worked out again after typing pauses for 300 ms, in an idle callback. The panel shows the last result until then. Budgets are in §11, and a worker is the fallback if a measured budget is missed.

Matching names stays linear: each scene's action is split into words once, and a map from a name's first word (in each accepted spelling) to the names starting with it is checked at each word, longest name first.

## 4. The Stats tab (v0.21.0)

### 4.1 A tab, not a window

**Call (Phase 2 design §16, carried out):** **the Stats window becomes a Stats tab.** It is a view tab after Cards and Notes, in the slot and More. **Show stats** and the Counts panel's **Stats…** open it in the pane not showing Source (`openBeside`), and focus moves to its heading. `StatsDialog.vue` and `statsOpen` go. The Counts panel stays as it is.

- **Call:** **a Markdown document has the Stats tab too,** with Overview only (words, headings, and reading time, as now), since the window served documents. `viewTabs('markdown')` returns `[Stats]`.
- A short list of links at the top goes to each section: Overview, Characters, Character by scene, and in v0.24.0, Storylines and Pacing. Each section starts with a heading (`h2`).

### 4.2 Overview

Everything the window shows now, unchanged: Today, This script (with both rates and their fields), and Last 30 days. The INT/EXT and DAY/NIGHT split stays under This script.

### 4.3 Characters

The table, most speeches first (as now). **Call:** **not sortable in v1.** A sortable table needs its own keyboard model and announcements, and it is deferred.

| Column | Example |
|---|---|
| Character | TOM (a link to Scaffold's character page, §5.3) |
| Speeches | 212 |
| Scenes | 23 (in: speaking or silent) |
| Speaks in | 19 |
| Words | 4,210 |
| Dialogue share | 18% |
| Screen time | 46 2/8 pp · about 46 min |
| Most often with | MARGARET (14), SAM (9), ANN LEE (4) |

The screen time's minutes are at the script's page rate. A hidden header note says so, and the cell's accessible text is `timeWords`. Until the pages are ready, the column says "—", and the table's caption says "Screen time waits for the pages."

### 4.4 Character by scene

The grid (Phase 2 design §16):

- **Rows** are characters, in the Characters table's order. **Columns** are scenes, in order, each headed by its number and with its heading as the column header's description.
- **Each cell** holds the number of **speeches** the character has in that scene, as text, shaded by how many in four steps (1, 2–3, 4–6, 7+). A cell where the character is present but silent holds a dot, `·`, with the hidden text "silent". An empty cell is absent. **Call:** a cell counts speeches, the "lines" of §16, because a speech is what a reader counts as a line of dialogue. The shade only repeats the number, so color is never the only signal.
- **Long absences** (§3.5) are outlined on the empty cells they span, with a list under the grid: "TOM: absent from page 31 to page 72 (41 pages)." Each item goes to the scene he comes back in.
- **Keyboard:** the ARIA grid pattern. The grid is one Tab stop. Arrow keys move between cells, Home and End go along a row, Ctrl+Home and Ctrl+End go to the corners, and Page Up and Page Down move ten scenes. **Enter** puts the cursor at the character's first cue in that scene, or, for a silent cell, the first mention in the action. Row and column headers are real headers (`rowheader`, `columnheader`), so a cell reads "TOM, scene 12, 4 speeches". The context-menu key or Shift+F10 opens a menu with **Go to**, **Scaffold for this character**, and **Scaffold for this scene**.
- **Call:** **only the visible columns are drawn,** from the start. The grid sets `aria-rowcount`, `aria-colcount`, and each cell's `aria-colindex`, and draws the columns in view plus ten on each side. A 300-scene script with 60 characters is 18,000 cells, and the 200 ms budget (§11) has to hold for it too. Rows are all drawn: the cast is rarely over 60.
- The first column and the header row stay put while the grid scrolls in its own region.
- **Phone:** the same grid, scrolling sideways in its own region, with a **List** toggle (`aria-pressed`) above it that shows each character's scenes as text instead: "TOM: in 23 scenes. Speaks in 1, 2, 5 to 9, 14… Silent in 6, 31." **Call:** the List toggle is remembered on the device (`gridAsList`), and it is offered at every width, since some readers prefer the list anywhere.

## 5. Scaffold (v0.21.0)

### 5.1 Where it lives

**Call:** **Scaffold is a tab,** a view tab after Stats, that opens beside the Source (`openBeside`) as the Compare tab does. It is not a third column. Reasons: Drafter's layout is two panes, and a third column would squeeze the Source and the Script pane on a laptop. A tab already works on a phone and with the pane divider, and leaves focus mode alone. Writers who want Scaffold beside the script put it in the pane the Script pane was in. On a phone it is the one pane's tab.

**Call:** **Scaffold is one tab with four kinds of page:** the **scene** page (the default, §5.2), a **character** page (§5.3), a **location** page (§5.4), and the **cast and places** lists (§5.5). Moving between them keeps a **Back** list inside the tab. Its slim bar has **Back**, the page's name, and a menu with **This scene**, **Cast**, and **Places**. **Back** is a button, and Alt+Left does the same while focus is in the tab.

Not offered for a Markdown document, whose tab row has no Scaffold. Its command says "A Markdown document has no scenes."

### 5.2 The scene page

It follows the cursor's scene (`currentBlocks`) while **Follow the cursor** is on, which is the default.

- **Call:** **it updates when the cursor rests** (150 ms after the last cursor move or the cast's update). **It never moves focus and announces nothing** when it follows: the heading changes quietly. A screen-reader user reads it when they turn to it. Reason: a live region speaking on every scene change while typing would be noise.
- **Follow the cursor** is a toggle on the slim bar (`aria-pressed`). Off, the page stays on its scene. Opening a scene's Scaffold from the Outline, the Cards, the strip, or the grid turns it off and pins that scene. **Call:** **not remembered:** each visit starts following.
- Before the first scene, it says "The cursor is before the first scene." with links to the Cast and Places lists.

What it shows, top to bottom:

1. **The heading:** "Scene 12 · INT. KITCHEN - NIGHT" (`h2`), and a **Go to** button.
2. **The facts**, a description list:
   - **Where:** KITCHEN (a link to its location page) · Inside.
   - **When:** NIGHT.
   - **Length:** 1 3/8 pages · page 12 · about 1 min 25 s. **Call:** the minutes are at the script's page rate when the pages are ready. Before that, the estimate from the dialogue is shown, labelled "(from the dialogue)".
   - In v0.24.0, **Storylines**, as chips.
3. **In this scene (4)**, a table with one row per character present, speakers first in order of first speech, then the silent in order of first mention:

| Column | Example |
|---|---|
| Character | TOM (a link to his page) |
| Speeches | 4, or "Silent" |
| Words | 120 |
| Time speaking | about 50 s (55%) |
| | **First seen here** (a tag, when this is their first scene) |
| Other scenes | 22 more (a link to his page's Scenes list) |

**Call:** **"share of the scene's time" is time speaking**: their words at the script's words-a-minute rate, as a share of the scene's estimate from the dialogue (`estimateSeconds(scene.timing)`), capped at 100%. A silent character shows "Silent" and no share. Reason: that is the one time per character the script itself measures. Screen time belongs to the whole scene.

4. **First seen here:** the same characters as the tag, listed in one line, so a screen-reader user hears it without reading the table.

### 5.3 A character page

Its heading is "TOM" (`h2`), with a summary line: "In 23 of 61 scenes. First in scene 1 (page 1); last in scene 58 (page 104)." Then:

- **Figures**, a description list: Screen time (46 2/8 pages · about 46 min at 1 minute a page); Dialogue (212 speeches · 4,210 words · 18% of all dialogue); Longest absence (page 31 to page 72, 41 pages, with a link to the scene he returns in); Long absences (every one of 20 pages or more).
- **Shares scenes with:** a table of every character he shares a scene with, by count: Character (link), Scenes together.
- **Locations:** a table: Location (link), Scenes there.
- **Scenes:** a table: Scene (number), Heading (a Go to link), Page, Speaks or Silent, Words.
- **Lines:** every speech, grouped by scene under the scene's heading (`h3`). Each speech is its printed text, in Courier Prime, as a link that puts the cursor at the cue. **Call:** a list longer than 100 speeches shows the first 100 with "Show all 212 speeches", so a lead's page opens quickly.

### 5.4 A location page

Its heading is "KITCHEN" (`h2`), with a summary line: "7 scenes · 9 4/8 pages · about 9 min 30 s · inside 6, outside 1." Then:

- **Times of day:** NIGHT 4, DAY 3.
- **Scenes:** a table: Scene, Heading (Go to), Page, Length, Time of day.
- **Who appears here:** a table: Character (link), Scenes here, Speaks in.

### 5.5 Cast and Places

- **Cast:** every character, as the Characters table orders them: Character (link), Scenes, Screen time, Dialogue share.
- **Places:** every location, A to Z: Location (link), Scenes, Pages.

Both lists have a filter field, which folds case and accents.

### 5.6 Getting to Scaffold

- **Show Scaffold** (View): the palette, the desktop View menu, and the tab row's More.
- **Scaffold for this scene** in the scene menus (the Outline's and the Cards' `sceneMenuItems`, and the strip's block menu): it pins that scene.
- **Show the cast** and **Show the places** (View) open those lists.
- In the Stats tab, every character's name is a link to their page, and the grid's menu has **Scaffold for this character** and **Scaffold for this scene**.
- The palette also finds Scaffold by the search words "cast", "characters", "who is in this scene", and "locations" (`keywords`, from v0.18.0).

### 5.7 Links and keys

Every link in Scaffold either opens another Scaffold page (and pushes Back) or goes to the script (**Go to**, as the Outline's Enter does: the cursor goes there and the Source pane scrolls to it, while focus stays in Scaffold). **Call:** **links are real links and buttons,** read in order. There is no custom widget, so a screen reader's link and heading lists work as they do on a web page. The tables are real `<table>`s with captions and headers.

## 6. Storylines (v0.24.0)

### 6.1 Labels, names, and colors

A storyline is a label in `[[Storyline: …]]`, as Phase 2 design §13 decided, matched by `normalizeLabel`. The metadata block keeps each label's longer **name** and **color** (`storylines: { "A": { "name": "Margaret's job", "color": "teal" } }`, §5.5).

- **Call:** **colors are shown, not written,** until the writer picks one. A label with no color in the metadata block is shown in the next palette color, in order of first appearance, skipping gray and colors the writer has already given, and starting over when they run out. Nothing is written into the file until the writer chooses a name or a color. Reason: §13's "assigned from the palette when a label first appears" would otherwise mean Drafter editing the text unasked, which Phase 2 design §2 rules out.
- In `@drafter/notes`: `storylineInfo(doc, index)` (every label in use or named, its name, its color, and whether that color was chosen) and `setStorylineInfo(doc, label, { name?, color? })` (one `setMeta` change).

### 6.2 Tagging

- **Storylines…** in the scene menus (Outline, Cards, Timeline) opens a small dialog: a checklist of every storyline (label, name, and color chip), a **New storyline** field, and **Save**. **Call:** **saving writes one note in the header** (`[[Storyline: A, B]]`, §5.4's order) and removes any other Storyline notes in that scene, as one change. Reason: it is what Scene details writes, and two notes for one field is what `duplicate-field` warns of.
- Scene details' Storylines field keeps its text form and offers the labels in use as suggestions.

### 6.3 Rename, merge, and remove

From the Stats tab's Storylines section (§8.3), and a row menu in the Storylines dialog:

- **Rename…** rewrites the label in every Storyline note in the script, and moves its metadata entry, as one transaction (one undo): "Renamed storyline A to Job in 12 scenes." **Call:** **renaming to a label already in use is a merge.** It asks first ("B is already a storyline. Merge A into it?"), and each note's list loses its repeat.
- **Remove from every scene…** asks first and then takes the label out of every note, dropping a note that is left empty, and drops its metadata entry, in one undo.
- In a read-only tab, these are disabled with the reason, as everywhere else.
- **Call:** **the Beat Board block is left alone in v0.24.0.** It doesn't exist yet. Plan F's rename will cover cards.

### 6.4 Where storylines show

- **Outline rows and cards:** a chip for each label, with its color and its label as text. The chip's name is "storyline A, Margaret's job".
- **Scaffold's scene page:** the same chips (§5.2).
- **The Timeline** (§6.5), **the margin** (§6.6), and **the strip's Color by** (§7).

### 6.5 The Outline's Timeline

**Call:** **a second view of the Outline tab,** chosen with a **Tree | Timeline** group on its slim bar and remembered on the device (`outlineView`). Reason: §13 puts it "in the Outline", and its job (where each storyline runs) is the outline's.

- **Lanes:** one per storyline, in order of first appearance, and then **No storyline**. Each lane is the strip's scene row filtered to that storyline's scenes, on the same page axis, with the ruler above. **Call:** `storylineLanes(strip, index)` in `@drafter/outline`. A scene with two storylines is a block in both lanes. Without pages, the axis is printed words, as the strip's is.
- **Blocks** are tinted by the storyline's color, with their scene number where it fits. Hovering or focusing one shows the strip's card (heading, length, time, storylines, goal).
- **Keyboard:** one Tab stop, a grid with one row per lane. Left and Right move along a lane, Up and Down move to the next lane's block nearest in page, Home and End go along a lane, and Enter goes to the scene. The context-menu key or Shift+F10 opens **Go to**, **Storylines…**, and **Scaffold for this scene**. A block's name reads "Scene 12, INT. KITCHEN, storyline A, page 12, 1 3/8 pages" (§13).
- **Phone:** a list grouped by storyline (each a heading, then its scenes as rows), as §13 says.

### 6.6 Margin marks on the Script pane

A **Storylines** toggle on the Script pane's slim bar (`aria-pressed`), also in the palette and the desktop View menu. **Call:** **off by default (§13), and remembered on the device** (`storylineMarks`), as the strip is. Unlike Show changes, it is a way of reading, not a check.

- Each scene's lines on each page get a 3 px bar in the left margin per storyline, side by side. Past three, the third becomes "+2". The label is written beside the bar at the scene's first line on the page. They are drawn with `decorate` (v0.18.0) from the layout's block positions.
- **Hidden from screen readers** (`aria-hidden`), and **never printed or exported**. The Outline, the cards, and Scaffold carry the same facts as text. An e2e test checks that the PDF's bytes are the same with the marks on and off.

## 7. The script map (v0.24.0)

Phase 2 design §14 and strip design §10 left it open whether the map is still wanted beside the Structure strip.

**Call:** **the map is the strip's Color by, not a second column.** The strip gains a **Color by** menu on its menu button:

| Choice | Colors |
|---|---|
| **Scene color** (the default; what the strip does now) | The scene's `[[Color: …]]` |
| **Inside or outside** | Inside, outside, both, and neither, each its own fixed color |
| **Day or night** | Day, night, and other, each its own fixed color |
| **Storyline** | The storyline's color. A scene with several is striped, one stripe per storyline. |

It is remembered on the device (`stripColorBy`). A **legend** row under the strip names each color in use as text ("Night", "Storyline A"), so no color stands alone. Each block's name gains the value ("…, night").

Reasons:

- Both views show every scene sized by its length, go there on a click, outline the cursor's scene, and show a card on hover. The strip already does all of that, by keyboard, tested.
- A column beside the Source takes width from the one pane a writer types in, and §14 already kept it off phones and out of focus mode.
- §14's other promises come with the strip: off by default and remembered (the strip's setting), the cursor's scene outlined, and the hover card. That card gains storylines and the goal, as §14 asks.

**Show the script map** is not added as a command. Instead, **Show the Structure strip** gains the search words "script map" and "map", and **Color the strip by…** is a command (View). The Phase 2 design's §14 and §22 are changed to say so (§15).

## 8. Pacing and the Stats tab's last sections (v0.24.0)

### 8.1 The pacing view

In the Stats tab, a **Pacing** section (Phase 2 design §15):

- **Bars:** each scene's length, at its page, along the page axis with the strip's ruler (`rulerMarks`). Clicking a bar goes to the scene.
- **A line:** the share of each page's printed lines that are dialogue or lyrics, from the layout's line roles. **Call:** `pacingSeries(index, layout)` in `@drafter/outline`, as a share for each page (0 to 1), smoothed over three pages so one short page doesn't spike the line, with the raw values in the table.
- **Guides:** a **Guides** menu with None (the default), **Three acts**, **Five acts**, and **Fifteen beats**, and the line "A guide, not a rule." Each mark is a thin dashed line with its name and page. **Call:** **the chosen guide is written to the metadata block** (`guides`), in one undo, because the writer asked for it, and so the script opens the same (§15). It is disabled in a read-only tab, with the reason.
- **Call:** **Drafter's own fifteen marks,** placed at fixed shares of the script and named in plain words that come from no book or brand: Opening (0%), First hint (5%), The world (1–10%), The spark (10%), Doubt (10–20%), Commitment (20%), A second thread (22%), New ground (20–50%), Midpoint (50%), Pressure (50–75%), Low point (75%), Darkest moment (75–80%), The turn (80%), Final push (80–99%), Closing (99%). Three acts mark 25% and 75%; five acts mark each fifth. The controller is asked to confirm these labels (plan, Review Focus 5).
- **For a screen reader and the keyboard:** the chart is plain SVG and is hidden from the accessibility tree (`aria-hidden`). The same data is a table beside it (Scene, Page, Length, Time, Dialogue share), and keyboard focus reaches the table, where a row goes to its scene. A summary sits above it: "Longest scene: INT. HALL, 4 pages. Dialogue share is highest on pages 30 to 45." **Call:** the "highest" stretch is the 15-page window with the highest mean share, or the whole script when it is under 15 pages.
- **Phone:** the chart fits the width, and the table stays below.
- Without a layout, the section says "Pacing waits for the pages."

### 8.2 Colors in charts

The bars, the line, the guides, and the grid's shades use tokens with a light and a dark value each, `--chart-bar`, `--chart-line`, `--chart-guide`, and `--grid-shade-1` to `--grid-shade-4`. A unit test checks that each is at least 3:1 against the page (graphics), and that the grid's text is at least 4.5:1 on every shade, in both themes. The values are the implementer's own.

### 8.3 Storylines in Stats

A **Storylines** section: a table with Storyline (chip), Name, Scenes, Pages, and Share of the script (pages), and **Rename…**, **Color…**, **Name…**, and **Remove from every scene…** as row buttons (§6.3). The scenes with no storyline are a last row, "No storyline".

## 9. Commands and menus

| Command | Group | Where | Release |
|---|---|---|---|
| `show-stats` **Show stats** (changed: opens the tab) | View | palette, the Counts panel's Stats…, desktop View menu | v0.21.0 |
| `show-scaffold` **Show Scaffold** | View | palette, desktop View menu, More | v0.21.0 |
| `scaffold-cast` **Show the cast**, `scaffold-places` **Show the places** | View | palette | v0.21.0 |
| `scaffold-scene` **Scaffold for this scene** | Go | scene menus, the strip's block menu, the grid's menu, palette (the cursor's scene) | v0.21.0 |
| `scene-storylines` **Storylines…** | Edit | scene menus, the Timeline's menu, palette | v0.24.0 |
| `outline-timeline`, `outline-tree` | View | palette, the Outline's slim bar | v0.24.0 |
| `storyline-marks` **Show storylines in the margin** / **Hide…** | View | palette, the Script pane's slim bar, desktop View menu | v0.24.0 |
| `strip-color-by` **Color the strip by…** | View | palette, the strip's menu | v0.24.0 |

**Call:** **no new default keys,** as in v0.18.0. The grid and the Timeline have their own arrow keys, which the Keyboard shortcuts page lists under Other keys. Alt+Left in Scaffold is listed there too.

## 10. Markdown, read-only, and empty states

- **Markdown documents:** the Stats tab has Overview only. Scaffold, the grid, the Timeline, the margin marks, and Color by are not offered, and their commands say "A Markdown document has no scenes." (Phase 2 design §5.7).
- **Read-only:** everything in this design reads the script. The only edits are Storylines…, rename, merge, remove, colors and names, and the pacing guide (v0.24.0), which are `aria-disabled` with the reason shown and spoken (History's pattern).
- **No scenes:** "No scenes yet. Each scene heading you write shows here." (the strip's words). **No speeches:** Characters and the grid say "No one speaks yet. A character’s cue starts their row." **No storylines:** "No storylines yet. Add one from a scene’s menu: Storylines…".
- **A sample** works fully. It is read like any script.

## 11. Budgets

Chromium, on the maintainer's machine, for a 120-page script of about 150 scenes and 40 characters. Unit timing is by growth (`scaling`: n and 4n, growth under 8, copied from `packages/render-pdf/test/scaling.ts`), and e2e logs times and fails only past 10× the budget (DECISIONS 2026-10-29).

| Work | Budget |
|---|---|
| The scene index with `speeches` and `opening` | no more than 10% slower than v0.19.0's, measured by growth and logged |
| The cast and every figure of §3.5 (`castOf`), main thread | 15 ms |
| Scaffold's scene page after the cursor rests | 4 ms (lookups only) |
| The Stats tab, opened, with Characters and the grid drawn | 300 ms |
| The grid of 120 scenes by 30 characters, first paint | 200 ms (§16); 300 by 60 stays under it by drawing visible columns |
| Typing with the Stats tab or Scaffold shown | no long task (over 50 ms); the cast is worked out at most once per 300 ms pause |
| v0.24.0: `storylineLanes` | 10 ms |
| v0.24.0: `pacingSeries` | 20 ms |
| v0.24.0: margin marks, per page drawn | 2 ms |

## 12. Where the code goes

- **`@drafter/outline`:** `Scene.speeches`, `SceneIndex.opening` (v0.21.0); `storylineLanes`, `pacingSeries`, and `GUIDES` (v0.24.0).
- **Call:** **a new package, `@drafter/cast`** (v0.21.0), for who and where: `castOf(index, doc, isWord)`, `presence`, `placeOf` (location, inside or outside, time of day), `characterFigures`, `locationFigures`, `absences`, `sharedScenes`, `gridModel`. It is pure, depends on `@drafter/fountain`, `@drafter/outline`, and `@drafter/templates` only, and is tested with fixtures ("Will", "Hope", "ANN LEE", possessives) and the Outline's random-script arbitraries. Reasons: presence and the figures are the most rule-heavy code in the release and want Node tests, and the scene index stays the fast, always-on pass it is.
- **`@drafter/notes`:** `storylineInfo`, `setStorylineInfo`, `renameStoryline`, `removeStoryline`, and `setSceneStorylines` (v0.24.0).
- **`apps/web`:** `cast/` (the session: `useCast`, idle recomputation, the dictionary answers), `scaffold/` (pages, the Back list, labels), `stats/` (the tab's sections, the grid's keys and windowing), and in v0.24.0 `storylines/`, `timeline/`, `pacing/`, and the strip's Color by. The components are `StatsPane.vue`, `StatsSlim.vue`, `CharacterGrid.vue`, `ScaffoldPane.vue`, `ScaffoldSlim.vue`, `ScaffoldScene.vue`, `ScaffoldCharacter.vue`, `ScaffoldLocation.vue`, `ScaffoldLists.vue`, and in v0.24.0 `StorylinesDialog.vue`, `StorylineChip.vue`, `OutlineTimeline.vue`, and `PacingChart.vue`. The spell worker gets the `words` request.
- **No new third-party dependency.** The charts are plain SVG drawn by Drafter.

## 13. Accessibility

As the rest of Drafter (WCAG 2.2 AA):

- **Every chart has an equivalent table,** and keyboard focus reaches the table, not the SVG: the pacing view, and the Timeline's phone list. The grid is itself a table-shaped ARIA grid. The strip's Color by has its text legend.
- **Keyboard:** the grid and the Timeline are one Tab stop each, with arrow keys. Scaffold is links, buttons, and tables. Every action is a command. Nothing needs a pointer or a hover: the hover cards also show on focus.
- **Not color alone:** numbers in grid cells, labels on chips, legends, the "silent" dot with hidden text, and outlined absences listed in text.
- **Screen readers:** headings for every section and page; captions on tables; Scaffold's following is silent by design (§5.2), and its pages announce nothing until the writer acts. Rename and the other edits say what they did in the polite live region.
- **Both themes and phones:** every token has a dark value. On a phone, the grid scrolls in its own region and has List, the Timeline is a list, and Scaffold is one column. Touch targets are at least 24 px.
- **Call (the v0.18.0 ruling carried forward):** **axe runs on every new view now,** in both themes at both widths. In v0.21.0 that is the Stats tab (each section), the grid (and List), and Scaffold's four pages. In v0.24.0 it is the Timeline, the Storylines dialog, the margin marks on, the strip colored by each choice with its legend, and Pacing. Only the screen-reader listening pass waits for the final steps (§14).

## 14. Not in this release

**Deferred,** each a line in `docs/DEFERRED.md`: silent-only characters (a `[[Cast: …]]` note); aliases and merged names; marking a mention as not present; grouping sub-locations; sorting the Characters table; storyline rows in the strip; the Beat Board's storylines in rename (Plan F); a per-scene history link from Scaffold (History of this scene is in the scene menus already); and export of the Stats tab's tables.

**The maintainer's other wishes, already recorded for later and not in this release:**

- **Real Highland and Fade In file checks** (DEFERRED, "Imports and Markdown out"): they wait for the maintainer to send one `.highland` and one `.fadein` file.
- **NVDA and VoiceOver testing comes last,** after every phase (Phase 2 design §20; the maintainer runs voicecap on their own PC).

## 15. Version numbers

With the split (Call 1), Plan E is **v0.21.0** (Scaffold and the Stats tab) and **v0.24.0** (storylines, the map, and pacing). Plans F, G, and H become **v0.25.0, v0.26.0, and v0.27.0**, with their letters unchanged. Part 1's docs task makes the change in the Phase 2 design §22 (two headings for Plan E, F to H renumbered, and §14 and §22's done-when changed for the map, Call 38), §26, the architecture's §13, and the README's status line and roadmap. Part 2's docs task marks v0.24.0 built.

This section was written with Part 1 as v0.20.0 and Part 2 as v0.21.0. On 2026-10-30 the formats release took v0.20.0, and Export as HTML (v0.22.0) and Novel (v0.23.0) were put between the two parts, so the numbers above are the current ones; Part 1's docs task (Task 8) made the change everywhere.

Without the split, Plan E is v0.20.0 alone, Plans F to H stay v0.21.0 to v0.23.0, and one docs task covers all of it.

## 16. Calls

1. Two releases: v0.20.0 Scaffold and the Stats tab; v0.21.0 storylines, the map, and pacing; F to H become v0.22.0 to v0.24.0 (§2).
2. The cast is the speaking characters only (§3.1).
3. No aliases (§3.1).
4. A name of several words matches only as a whole phrase, longest first (§3.2).
5. A mention in the action counts as presence (§3.2).
6. The spell worker answers which names are words, with every word of a name tested (§3.3).
7. The dictionary loads for this question even with spellcheck off; until it answers, names count only in capitals (§3.3).
8. Speeches are counted once, in the scene index (`speeches`, `opening`) (§3.4).
9. `characterTable` retires: Words include lyrics, and Scenes counts silent scenes, with a Speaks in column (§3.4).
10. Dialogue share is a share of words, and shares add up to 100% (§3.5).
11. Long absences are 20 pages or more between appearances, on the strip's page axis (§3.5).
12. Most often with: the top three by shared scenes (§3.5).
13. A known list of times of day (§3.6).
14. INT. and EXT. of one place are one location (§3.6).
15. Each distinct place is its own location; no grouping (§3.6).
16. A stage play's scenes have no location unless written as INT./EXT. (§3.6).
17. The cast is computed on the main thread, only while a view needs it, after a 300 ms pause (§3.7).
18. The Stats window becomes a tab, also for Markdown documents (Overview only) (§4.1).
19. The Characters table is not sortable in v1 (§4.3).
20. A grid cell counts speeches; a dot for silent (§4.4).
21. The grid draws only the visible columns (§4.4).
22. The List toggle is remembered and offered at every width (§4.4).
23. Scaffold is a tab beside the Source, not a third column (§5.1).
24. One Scaffold tab with four kinds of page and a Back list (§5.1).
25. The scene page updates when the cursor rests, never moves focus, and announces nothing (§5.2).
26. Follow the cursor is on at every visit (§5.2).
27. Scene minutes at the page rate, or the dialogue estimate before pages (§5.2).
28. Share of the scene's time is time speaking, capped at 100% (§5.2).
29. A character's lines show 100 at a time (§5.3).
30. Scaffold is plain links, buttons, and tables (§5.7).
31. Storyline colors are shown, not written, until the writer picks one (§6.1).
32. Storylines… writes one header note and removes the others in that scene (§6.2).
33. Renaming to a label in use is a merge, after asking (§6.3).
34. Rename leaves the Beat Board block to Plan F (§6.3).
35. The Timeline is a second view of the Outline tab, remembered (§6.5).
36. `storylineLanes` in `@drafter/outline`, on the strip's axis (§6.5).
37. Margin marks are off by default and remembered (§6.6).
38. The script map is the strip's Color by, with a legend, not a column (§7).
39. `pacingSeries` smooths over three pages (§8.1).
40. The chosen guide is written to the metadata block (§8.1).
41. Drafter's own fifteen marks and labels (§8.1).
42. The "highest dialogue" stretch is a 15-page window (§8.1).
43. No new default keys (§9).
44. A new package, `@drafter/cast` (§12).
45. Axe on every new view now (§13).
