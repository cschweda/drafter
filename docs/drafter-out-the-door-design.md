# Getting a script out the door — Design

**Status:** designed 2026-10-29, to ship as v0.17.0, right after the Markdown PDF (v0.16.0). The plan is [`docs/plans/2026-10-29-out-the-door.md`](plans/2026-10-29-out-the-door.md). The imports release (Highland, Fade In, and Markdown, branch `imports-plan`) comes after this one.

**Asked for (maintainer, 2026-10-29), four things:**

1. **Guided starters.** A first screenplay, and a first stage play, whose own text teaches each element as you read it, then leaves you to write your own scene.
2. **Export options.** "Can there be an option for no scene numbers or no title page details on the export?"
3. **Running time.** A rate you can set per script, a second estimate from the dialogue, and the time of each act and scene in the Outline and the Structure strip.
4. **A Technical details page.** On a page of its own, not on the writing screen: how Drafter is put together and what it depends on, with diagrams.

**Clean room (binding).** Every word of the starters is Drafter's own, written from Fountain's syntax and Drafter's own behaviour. Nobody working on this looks at, quotes, or follows the structure of any other application's beginner template, sample, or tutorial. The timing rates are Drafter's own arithmetic, explained below; the export options are named in Drafter's own words. The Technical details page describes Drafter only.

Each choice open to the designer is marked **Call:**, and all of them are listed in §8.

## 1. Guided starters

### 1.1 What they are

Two new scripts the writer can start from: **Guided first screenplay** and **Guided first stage play**. Each is a short, complete script, two to four pages, whose notes (`[[…]]`, which never print) explain the element just above them: what it is for, how Fountain marks it, and which element-bar button writes it. Reading it top to bottom is a lesson; the Script pane beside it shows what each element looks like printed. Each ends with a **Your turn** part, where the writer replaces a placeholder scene with one of their own.

They are not the annotated samples (File → Open sample, and the first New of each kind), which tell one story with a few notes, and not Help's tiny sample scripts (v0.13.1), which show every element once in under a page. Those stay as they are. The starters are written in lesson order and talk to the writer directly.

- **Call:** the text talks to a newcomer in plain words ("This line is a scene heading. It says where we are and when."), names the element-bar button and its mark ("The Scene button, marked INT., writes one for you"), and points to the Fountain cheat sheet for the rest. The maintainer is learning Fountain, so the starters teach Fountain's marks themselves, not only the buttons: a writer who has read one should be able to type every element without the bar.

### 1.2 The screenplay starter, in order

1. **Title page:** `Title`, `Credit`, `Author`, `Draft date`, `Contact`, with "Your title here"-style values. Its note: these `Key: value` lines make the title page; a blank line ends it; Export options (§2) can leave all of it, or all but the title and author, off a PDF.
2. **How to read this:** a note saying what notes are, that the Script tab shows the printed page, where the element bar is, and that Help → Fountain cheat sheet has every mark.
3. **A section and a synopsis** (`# Act One`, `= …`): the Section and Synopsis buttons (under More), that they shape the Outline and the Structure strip, and that they never print.
4. **Scene heading** (`INT. … - DAY`): the Scene button, INT./EXT., the time of day, the blank lines around it.
5. **Action:** the Action button; any paragraph that isn't something else is action.
6. **Character and dialogue:** the Character and Dialogue buttons; a name in capitals, the speech straight under it; an extension such as `(V.O.)`.
7. **Parenthetical:** the Parenthetical button.
8. **The same character again after action:** Drafter adds `(CONT'D)` itself; don't type it.
9. **When Drafter guesses wrong:** a capitals line forced to action with `!`, and what `@` does for a name that isn't in capitals.
10. **Transition** (`CUT TO:`): the Transition button; one ending in `TO:` needs no mark, any other starts with `>`.
11. **A second scene** (`EXT. … - NIGHT`), with emphasis (`*italic*`, `**bold**`, `_underline_`) and the Italic, Bold, and Underline buttons.
12. **The boneyard** (`/* … */`): the Boneyard button; cut but kept.
13. **Your turn** (`# Your turn`): a heading with a deliberate problem (§1.4), a one-line placeholder action ("Write what we see here."), and `> THE END <` with the Centered button.

### 1.3 The stage-play starter, in order

1. **Title page** (`Credit: A play in one act by`), as above.
2. **How to read this**, as above, for a play: no INT. or EXT.; `#` is an act and `##` a scene, and in a play both print.
3. **The cast list:** `> CHARACTERS <` centered, then one action line per character in mixed case ("JUNE, a night nurse, forties."), so none reads as a cue; then `===`, so Act One starts a new page, with a note on the Page break button.
4. **Act and scene** (`# Act One`, `## Scene 1`): the Act and Scene buttons.
5. **Stage direction setting the stage:** the Stage direction button.
6. **An entrance and an exit** ("ARLO enters, soaked." … "She exits."): written as stage directions, with the names in capitals as plays often do, in sentences, so they stay directions.
7. **Character, dialogue, parenthetical** (`(to the audience)`), as in the screenplay.
8. **A second scene** (`## Scene 2`), ending on "Blackout."
9. **Your turn** (`## Scene 3`): a placeholder direction and line for the writer to replace.
10. The **metadata block** naming the stage-play template, with a note saying what it is and to leave it alone.

### 1.4 What is tested

- **Call:** **every element a note explains is really that element.** A unit test parses each starter and asserts the whole list of block kinds in order (written out in the test), so a note can't say "this is a parenthetical" over a line Drafter reads as dialogue; it also lays each out and checks the Script pane would print it (no layout diagnostics).
- **Call:** **every button a note names exists.** Every "the *X* button" in a starter is a button of the bar for that kind of script (`FOUNTAIN_BUTTONS` and `FOUNTAIN_MORE`, or `STAGE_BUTTONS` and its More), and every main button of that bar is named at least once.
- **Call:** **one deliberate Problem, in the screenplay only.** The Your-turn heading has no time of day (`INT. YOUR FIRST LOCATION`), so the Problems tab shows one warning (`heading-no-time`), and the note under it says so: what the Problems tab is, that F8 goes to the next problem, and how to fix this one. Reason: a newcomer meets the Problems tab on a mistake they're told about, not on their own first one. The test asserts exactly that one problem. The stage play has none (its template turns `heading-no-time` off, and a second deliberate problem teaches nothing new).
- Every Fountain mark the cheat sheet lists for the main elements is shown at least once in the screenplay starter (scene heading, action, `!`, character, `@`, dialogue, parenthetical, transition, `>`, centered, section, synopsis, note, boneyard, page break in the play, emphasis). Lyrics, dual dialogue, and setups and payoffs are left to the cheat sheet, which a closing note points to.

### 1.5 Where they open from

- **Call:** two commands, **New guided screenplay** and **New guided stage play** (`new-guided-screenplay`, `new-guided-stage-play`, File), each listed in three places: the app menu's New section after the three New items, Help → **Sample scripts** (labelled "Guided first screenplay" and "Guided first stage play", under the three tiny samples), and the palette. The desktop app's File menu and its Help → Sample Scripts list them too. No key: they are used once or twice.
- Opening one makes a new script of the writer's own with no file, unchanged until typed in (its text is its baseline), as Help's sample scripts do. The project is marked `starter` (unindexed, no new database version); like a sample script, it doesn't count as the writer having met that kind's annotated sample.
- **Call:** the cursor starts at the top, at the title page, since the lesson starts there (Help's screenplay sample starts at its first scene).
- The Fountain cheat sheet page gains one line at its top: "New to Fountain? File → New guided screenplay walks you through a first script."

## 2. Export options

### 2.1 What happens today

The US screenplay and stage-play templates both have `sceneNumbers.enabled: false`, and `paginate` numbers scenes only when `opts.sceneNumbers ?? template.sceneNumbers.enabled` is true, so **no PDF or text export prints scene numbers today, not even locked ones** (`#12#`). The app never passes `sceneNumbers`. The whole title page prints whenever it has a field `titlePage` places (Title, Credit, Author or Authors, Source, Contact, Draft date or Date; Copyright, Notes, and unknown keys never print). A Final Draft file carries every title-page field and every locked number.

### 2.2 The options

Two choices, each a set of three:

- **Scene numbers:** **None** (the default, as today), **As written** (only the numbers locked in the script with `#…#`), **Number every scene** (a locked number where there is one, else the scene's place in order, as `paginate`'s numbering already does).
- **Title page:** **Full** (the default, as today), **Title and author only**, **None** (the PDF starts on page 1).

- **Call:** **"Title and author only" keeps Title, Credit, Author or Authors, and Source;** it drops Contact, Draft date (and Date), and the rest. Reason: Credit is the "Written by" between the title and the name, so leaving it would print a name under nothing; Source ("Based on the novel by…") is a credit that has to go wherever the authors' names go. What goes is what identifies a draft and reaches the writer: contact details and dates, the two things a writer most often wants off a copy sent out. The key aliases are `titlePage`'s own (`SLOTS` in `packages/layout/src/title.ts`), so the option and the layout can never disagree on what "author" is.
- With **None**, or a title page left with nothing that prints, there is no title page; the body's page numbers don't change (the title page is page 0).

### 2.3 Which exports they change

- **Call:** **PDF and plain text take both options** (both are laid out by `paginate`, and text draws the scene numbers at the template's columns as the PDF does). **A Final Draft file takes the title page option and keeps its scene numbers as written,** whatever the choice. Reason: a `.fdx` is a working file another app opens, and Final Draft decides for itself whether to print scene numbers; dropping the locked numbers would lose them on the way back, and numbering every scene is Final Draft's own command. The title page, though, is content someone reads, so the option applies. The options dialog says so in one line.
- **Markdown documents** have neither: the Export options command is off for one, with the reason ("A Markdown document has no scene numbers or title page.").
- The **Script pane** always shows the script as written; the options are for export only. (A preview of an export with its options is deferred.)

### 2.4 Where they live

- **Call:** **per script, on the script's project record in this browser** (two unindexed fields, `exportOptions` and, for §3, `timing`; no new database version), **not in the metadata block and not in Settings.** Reasons: not Settings, because they differ between scripts (a contest draft without contact details, a shooting draft with numbers); not the metadata block, because a screenplay has none until something needs one, and writing a print preference into the file would mark the script changed, put it in Undo, and change the file the writer saves; the maintainer asked that the options never change the script. The cost is that they don't travel with the file to another browser or machine; moving them into the metadata block later, if the writer wants that, is a line in `docs/DEFERRED.md`.
- **Call:** **an Export options… dialog, opened from the end of the Export menu** (the toolbar's, the app menu's Export section, and the desktop app's File → Export submenu), and from the palette (`export-options`, File). The export commands themselves don't ask: Export as PDF still saves at once, with the options the script has. Reason: a dialog before every export is a click every time for a choice made once per script; and the save picker needs the click that started the export, which a dialog in between would spend. The dialog: two radio groups (**Scene numbers**, **Title page**), the Final Draft line, and a **Done** button; each choice is kept the moment it's made.
- **Call:** **the export's toast names any option that isn't the default:** "Exported The Call.pdf, with scene numbers as written and the title and author only." So a writer who set an option last month isn't surprised by the file.
- **Read-only tab:** the dialog shows the choices disabled, with "Another tab has this script open, so its export options can’t be changed here." Exporting works, with the stored options.

### 2.5 Under the hood

- `paginate`'s `sceneNumbers` option takes `'none' | 'written' | 'all'` as well as the boolean it takes now (`true` is `'all'`, `false` is `'none'`, so the CLI's `--scene-numbers` and `--no-scene-numbers` are unchanged). New CLI flags for "as written" and the title page are deferred.
- `titlePageFor(titlePage, mode)` in `@drafter/layout` returns the title page with only the fields the mode keeps, or null; the export worker applies it to the parsed script before laying it out or writing Final Draft XML. Nothing is changed in the parse the editor holds.

## 3. Running time

### 3.1 Today

Stats and the Counts panel say "Running time: About 98 min", at a page a minute (`countScript`'s `minutes`, the body's pages rounded). The Outline and the strip show each scene's and act's length in eighths of a page, but not its time.

### 3.2 A rate per script

- **Call:** **Minutes a page, per script, default 1, from 0.5 to 3 in steps of 0.1**, set in the Stats window beside the running time, kept on the project record (§2.4). The default is 1 for every template, a stage play included; the field's hint says plays often run longer than a minute a page, so the writer sets 1.2 or 1.5 if theirs does. Reason: the maintainer gave 1 as the default and 1.2 as an example for a play; a number Drafter guesses per template would be one more thing to explain.

### 3.3 An estimate from the dialogue

A second figure, labelled **"Estimate from the dialogue"** everywhere it appears, and explained in one line under it: "The words spoken, at 150 words a minute, plus 1.5 seconds for each line of action. A rough guide, not a timing."

- **Call:** **spoken words at a pace you can set per script, default 150 words a minute, from 100 to 220 in steps of 5,** beside the page rate in Stats. Reason: pace differs most between scripts (a fast comedy, a slow play), and it's the one number a director timing a read-through will want to match; it costs one more field in a place that already has one.
- Spoken words are dialogue and lyrics, the words that print (notes, boneyard, and parentheticals left out).
- **Call:** **action costs a fixed 1.5 seconds per printed line,** counted from the text at the width of the role the template gives action (`resolveRole`: 60 columns for a screenplay's action, 50 for a stage play's stage directions), not from the layout, and not per word. Reasons: what action takes on screen follows how much room it takes on the page, which is the reason a page a minute works at all, and writers break action into short lines to make it read fast or slow; counting words would make "He runs." the same as half a line of a long sentence. Counting lines from the text, rather than from the layout, needs no layout, so the estimate never lags while the layout catches up, and is the same lines `wrap` would make within a line or two. 1.5 seconds is 40 lines a minute: about a full page of action with its blank lines left out, so a page of solid action comes to about a minute, agreeing with a page a minute where that rule holds best. In a stage play, stage directions count the same way.
- Scene headings, cues, parentheticals, transitions, centered text, and the title page take no time.
- **Call:** **the rate for action is fixed in v1**, not a setting: a third number would ask the writer to know something nobody knows; it's a constant in one place (`ACTION_SECONDS_PER_LINE`) if it ever needs tuning.

### 3.4 Where the times show

- **Stats window:** **Running time** (at the page rate: "About 98 min, at 1 minute a page") and **Estimate from the dialogue** ("About 87 min"), with the two rate fields and the explaining line.
- **Counts panel:** the same two figures, with "Set the rates in Stats." The status bar is unchanged.
- **Outline:** each scene row's and section row's length gains its time at the page rate: `p. 12 · 1 3/8 p · 1 min 25 s`, and an act: `5 scenes · 12 pp · 12 min`. **Call:** the Outline rows show the page-rate time only (the dialogue estimate would make a row two numbers that disagree); each row's accessible name says it in words ("about 1 minute 25 seconds").
- **Structure strip card:** a scene's card line `page 12 · 1 3/8 pp · 1 min 25 s · blue`, and a further line "Estimate from the dialogue: 1 min 10 s"; a section's line `5 scenes · 12 pp · 12 min`, and its estimate line.
- **Call:** **short times read in minutes and seconds, rounded to 5 seconds under ten minutes, then to the minute** (`35 s`, `1 min 25 s`, `12 min`, `1 h 5 min`); an eighth of a page at a minute a page is `10 s`, never "under a minute". The script's total keeps today's "About 98 min" wording.
- Without a layout (the worker failed, or hasn't laid the script out yet), there is no page-rate time anywhere a page count is missing today; the dialogue estimate needs no layout and always shows.

### 3.5 Keeping it cheap

- **Call:** the counting is per block, in `@drafter/outline` (`blockTiming`), and runs inside the scene index's existing pass over each scene's blocks, adding `timing: { spoken, actionLines }` to each scene and section: no extra parse, no layout. The script's totals come from the same function over the whole parse in `countScript`, remembered by the parse as its words already are. Budget: the scene index of a 120-page script stays within its existing budget, and a key costs what it costs now (`count-budget.test.ts`).

## 4. The Technical details page

### 4.1 What and where

A help page, **Technical details** (`/docs/technical`, `help-technical`), prerendered like the other five, opened in a new tab as they are, and listed wherever they are: the Help pages' index, the app menu's Help, the palette, About Drafter's list, the desktop app's Help menu ("Technical Details"), and the README. Never on the writing screen.

- **Call:** **plain words first, details after.** Each part opens with a paragraph a curious non-programmer can follow ("When you type a letter, Drafter reads the script again, but only the part around the letter"), then the names and the specifics. The parts:
  1. **The short version:** a web app that runs entirely in your browser (or in its own window on the desktop), with no server and no account; the script never leaves your device.
  2. **How it's organised:** one repository of small packages (pnpm workspaces), each with one job, and the app on top; a diagram of which uses which.
  3. **From a keystroke to the page:** the editor (CodeMirror), the parse (`@drafter/fountain`, incremental), highlighting and Problems, the scene index, the layout in a worker, the Script pane's pages; a diagram.
  4. **Where your script is kept:** the browser's IndexedDB (Dexie), the recovery copy, saving to a file, snapshots; a diagram.
  5. **Exporting:** the export worker, PDF (pdf-lib with Courier Prime), plain text, Final Draft XML; the options of §2.
  6. **Working offline:** the service worker and the installed app (PWA).
  7. **The desktop app:** Electron, file access behind one interface, updates from GitHub Releases.
  8. **The clean-room rule:** no code, text, or assets from any screenwriting app; links to the README section.
  9. **How a release ships:** tests (Vitest, Playwright), the build, a tag, a GitHub Release, Netlify for the site; a diagram.
  10. **What it depends on** (§4.3).

### 4.2 Diagrams

- **Call:** **the diagrams are written once, as data, in `apps/web/app/about/tech.ts`, and drawn two ways: as plain HTML and CSS on the page, and as Mermaid in `docs/technical-details.md`, which GitHub draws itself.** A unit test generates the Mermaid from the data and fails if the committed Markdown differs (Vitest's file snapshot: `-u` rewrites it). No Mermaid on the page, and no new dependency. Reasons:
  - The Mermaid library is megabytes of script (with its layout engines), the app is offline-first (it would sit in the service worker's precache for every visitor) and has a strict hash-based CSP; Mermaid renders at runtime with inline styles. That's a large cost for five pictures.
  - Rendering Mermaid to SVG at build time needs `@mermaid-js/mermaid-cli`, which drives a headless Chromium through Puppeteer: a heavy development dependency and a browser download in CI. Its SVGs carry fixed colours and their own `<style>` blocks, which would need rewriting for the dark theme and hashing for the CSP, and their text is not a list a screen reader can follow.
  - Drafter's diagrams are simple: four are a chain of steps, one is layers of packages. As HTML they are an ordered list of boxes with arrows drawn in CSS, coloured by the theme's tokens, so they read in both themes with no work, print, and are already text: a screen reader reads the list, and each `<figure>` has a caption that sums it up in a sentence. The arrows are `aria-hidden`.
  - The Mermaid stays in the repository, as asked, for anyone reading the docs on GitHub, and can never drift from the page, since both come from one source.
- The package diagram is generated from the packages themselves: a test asserts that `tech.ts`'s list of each package's `uses` is exactly the `@drafter/*` runtime dependencies in its `package.json`, and the page draws each package on the row after the deepest one it uses.

### 4.3 Dependencies, without saying it twice

- **Call:** **the page lists every runtime third-party dependency by name with one plain line on what it does for Drafter, and links to `docs/DEPENDENCIES.md` for the reasons and to the Third-party licences page for licences.** It doesn't repeat either: DEPENDENCIES.md stays the record of why each one is allowed (and its existing test that every dependency has a row stays), and the licences page stays the legal text. The list is `DEPENDENCY_NOTES` in `tech.ts`; a unit test asserts that its names are exactly the `dependencies` (not development) of every `package.json` in `apps/` and `packages/` (no missing one, no stale one), so adding a package fails a test until the page says what it's for. Development tools get one short paragraph naming the main ones (TypeScript, Vitest, Playwright, Biome, tsdown, electron-builder), not a table. No versions on the page: they change every week and the licences page and the lockfile have them.

## 5. Keyboard, menus, and the palette

Every new action is a command in the registry, so it is in the palette, on the Keyboard shortcuts page, and in the desktop app's menus: New guided screenplay, New guided stage play (File; desktop File and Help → Sample Scripts), Export options… (File; desktop File → Export), and Technical details (Help). None has a key. The rates are fields in the Stats window, reached with Tab.

## 6. Accessibility

Accessibility work waits for the final steps (maintainer, 2026-10-28). The new dialog uses the existing dialog and radio-group patterns, the new page uses the docs layout, and the diagrams are lists. The existing axe tests stay green, and the new help page is added to the docs pages they already check; no new accessibility task.

## 7. Not in v1

A preview of an export with its options; export options and rates carried in the metadata block; CLI flags for scene numbers as written and the title page; a settable rate for action; a guided TV or Markdown starter; Mermaid drawn on the page. Each is a line in `docs/DEFERRED.md`.

### 7.1 The plan list shifts by one minor

This release takes v0.17.0. The Markdown PDF (v0.16.0) already moved Plans E to H to v0.17.0–v0.20.0, so they move once more:

| Plan | Before the Markdown PDF | After it | After this release |
|---|---|---|---|
| Markdown PDF | — | v0.16.0 | v0.16.0 |
| **Getting a script out the door** | — | — | **v0.17.0** |
| E — Seeing the script | v0.16.0 | v0.17.0 | v0.18.0 |
| F — The Beat Board | v0.17.0 | v0.18.0 | v0.19.0 |
| G — Reader notes | v0.18.0 | v0.19.0 | v0.20.0 |
| H — Reference | v0.19.0 | v0.20.0 | v0.21.0 |

The imports release comes next and will move them again by one. The letters stay.

**Since (2026-10-29):** version history was put ahead of the imports, as v0.18.0, and the imports take v0.19.0, so Plans E to H are v0.20.0 to v0.23.0 (Phase 2 design §22). This table is kept as it was decided. Plan E also takes Scaffold, the maintainer's cast-and-scene panel, built on this release's per-scene `timing` and `spokenBy`.

## 8. Calls

1. The starters talk to a newcomer, name each button and its mark, and teach Fountain's marks themselves (§1.1).
2. A test asserts every block's kind in order in each starter, and that each lays out cleanly (§1.4).
3. Every button a note names exists, and every main button is named (§1.4).
4. One deliberate Problem, `heading-no-time`, in the screenplay's Your turn, explained; none in the play (§1.4).
5. Two commands, New guided screenplay and New guided stage play, in the app menu's New section, Help → Sample scripts, the palette, and the desktop menus; no key (§1.5).
6. A starter opens at the top, as a new unchanged script of the writer's own, marked `starter` (§1.5).
7. "Title and author only" keeps Title, Credit, Author or Authors, and Source, by the layout's own key aliases (§2.2).
8. PDF and plain text take both options; a Final Draft file takes the title page option and keeps its numbers as written (§2.3).
9. The options and rates are per script, on the project record, not in Settings or the metadata block (§2.4).
10. An Export options… dialog at the end of the Export menu and in the palette; exports don't ask (§2.4).
11. The export toast names any option that isn't the default (§2.4).
12. Minutes a page per script, default 1 for every template, 0.5–3 (§3.2).
13. Spoken pace per script, default 150 words a minute, 100–220 (§3.3).
14. Action is 1.5 seconds a printed line, counted from the text at its role's width (§3.3).
15. The action rate is fixed in v1 (§3.3).
16. Outline rows show the page-rate time only; names say it in words (§3.4).
17. Short times in minutes and seconds, to 5 s under ten minutes (§3.4).
18. Timing is counted per block in `@drafter/outline`, inside the scene index's pass (§3.5).
19. Technical details: plain words first, details after, in ten parts (§4.1).
20. Diagrams as data in `tech.ts`, drawn as HTML and CSS on the page and generated as Mermaid in `docs/technical-details.md`, checked by a test; no Mermaid library (§4.2).
21. Dependencies listed by name with a plain line, tested against every `package.json`; reasons and licences linked, not repeated (§4.3).
22. This release is v0.17.0; Plans E–H move to v0.18.0–v0.21.0; imports come next (§7.1).
