# Story map — Design

**Status:** designed 2026-11-01; built and released in **v0.24.1**. [DECISIONS](DECISIONS.md) (Story map) records each Call as it landed. For screenplays and stage plays; Markdown documents later (§9). A static mockup of the in-progress and finished states was reviewed alongside this document (local, not committed; described in words here so the document stands alone).

**Asked for (maintainer, 2026-11-01), in their words:**
- "a 'visual view' of the entire script, characters, acts -- sort of like an infograph view that can only be downloaded as an html page but that can be shown to someone with all the relevant info in a really visual, really pleasing way. Dark mode only, modern, sleek."
- "this kind of visual could be sent to someone so they can get a tease of the story -- with dialog snippets here and there -- and a tease of the characters. It's more of a visual tease (but useful) than an outline. Sort of an advertisement for the in-progress script."
- "no it's a chart of everything that's been written thus far -- including acts and structure. The idea is that it's visual and pretty -- and might be useful for people that immediately prefer the visual instead of a script or a stageplay."
- "it might be something you can send to non-writers who want to see what you're working on. I get asked that question a lot -- 'What are you doing? What are you writing?' This might provide something of a visual answer for a specific script or playscript."
- "very infographic-ish -- big fonts, clear visuals, everything for someone who wants to see it but not actually spend time reading (especially on a phone)."
- "like a work-in-progress teaser (or a finished script teaser). Again -- the audience here is non-writers, non-film or non-stage people -- it's normal people who you want to show your work to and that they can immediately intuit the story (and any gaps)."

**The look.** The maintainer shared a page of their own as the reference for the feel. This design takes its **design language only** — palette, type, layout, and rhythm — and none of its text, names, or story. Every sample in this document, the mockup, and the tests is original (§13).

**Clean room (binding).** The page is Drafter's own: layout, chart forms, and wording are chosen here, not traced from another app, a pitch-deck template, or a script-analysis site. No code, stylesheets, or fixtures from any of them. Charts are hand-built SVG; no chart library.

Each choice open to the designer is marked **Call:**; they are listed in §14.

## 1. What it is

A **Story map** is one self-contained HTML file that answers "what are you writing?" in pictures. A writer sends it by text or email to a friend, a parent, a colleague, a producer; the reader opens it on a phone and, in a few seconds of scrolling, sees the title, the idea in one line, how far along it is, the shape of the story, the people in it, and every scene in order with a line or two from the page.

- **Who reads it:** people who don't read scripts. Nothing on the page uses screenwriting words (§5).
- **Who sends it:** the writer, mid-draft or finished. It is a working view for collaborators too: the shape, the pace, the places, the setups and payoffs, and the gaps are all there.
- **What it is not:** a reading copy (that is Export → HTML), a pitch deck, or a dashboard. There are no settings in the page, no switches, and no script.

**Call: the name is "Story map".** It says what the reader gets (the whole story, laid out) in words a non-writer understands, and a writer can say it when sending it: "here's a story map of what I'm working on". The page itself greets the reader with **"What I'm writing"** under the writer's name, which carries the warmth. Considered and set aside: *Script at a glance* (reads as statistics), *Visual script* (sounds like a storyboard), *Script poster* (suggests one screen, and the page scrolls), *Teaser* and *One-sheet* (suggest a selection, and this shows everything written so far).

### 1.1 Where it is

**Export → Story map…** in the toolbar's Export menu, the app menu's Export submenu, the palette (`export-story-map`, keywords "visual", "teaser", "share", "what I'm writing"), and the desktop app's File → Export menu. Scripts only in this release (screenplay and stage play). It opens the **Make a story map** dialog (§7), then saves or downloads **one `.html` file**, named `<title> – story map.html` (the title, else the file's name), with the same picker, progress bar, and toast as the other exports. **Call:** it only ever produces HTML; there is no PDF or image version.

## 2. The page, top to bottom

Phone first: the layouts below are described at 390 px wide, then how they open out at 1440 px. One column on a phone; the same order on a wide screen, with charts set side by side.

1. **The greeting.** The writer's initials in a coral disc, their name, and "What I'm writing" beneath. Then the title, **huge**, in Anton capitals (on a phone it fills the width, one word to a line; on a wide screen one line). Then a status line in Courier Prime capitals: a pill **"A screenplay in progress"** (coral) or **"A finished screenplay"** (aqua), "Draft 03", "updated 1 Nov 2026". Then the **logline** in large type (one sentence) and the **explainer line** in small grey type: "A picture of my script: its shape, its people, and every scene in order. Just scroll." (editable and hideable, §7).
2. **The progress meter** (in progress only, §6): "About 82% written", "98 of 120 planned pages", a thick coral bar on a dashed track, and one plain sentence ("Acts 1 and 2 are written. Act 3 is under way: 2 scenes planned and the ending still to come.").
3. **The facts grid.** Big Anton numbers with small Courier labels, 1 px lines between cells: **98** pages so far · **1 hr 38 min** to watch, about · **47** scenes · **12** characters · **15** places. (Two rows on a phone, the running time spanning two cells; one row on a wide screen.)
4. **The sticky nav**, in Courier capitals, scrolling sideways on a phone: Shape · Characters · Act 1 · Act 2 · Act 3 · Places · Threads. Plain `#` links; no script.
5. **The shape.**
   - **The act band:** one block per act, as wide as its share of the pages, in three steps of warm colour (coral, a deeper coral, ember), each with its huge number, its title, and its pages. In progress, the unfinished act's block is striped.
   - **Every scene, start to finish:** a full-width strip on the page axis, two lanes — **Outside** on top, **Inside** below — each scene a block as wide as it is long, coloured **sand for day, aqua for night, ember for dawn or dusk**. A page ruler beneath. Gaps are drawn as dashed outlines (§6).
   - **Two donuts:** "75% indoors" (white and grey) and "50% at night" (sand, aqua, ember), each with its big percentage beneath.
   - **How long each scene runs:** one bar per scene, in order, its height the scene's length, in the act's colour; one plain caption ("Longest: scene 47, 6 min. Most run 1–3 min.").
6. **Characters.**
   - **The screen-time ranking:** every character, name in Anton, a thick bar in their colour, minutes at the end. On a wide screen it sits beside the "who shares scenes" chart.
   - **Character cards** for the leading characters (§4.3): a coloured top rule, an initial chip, the first name huge in their colour and the surname in white, the age and a hook of about eight words, a **presence strip** (their scenes on the page axis: filled where they speak, outlined where they are on screen silent), three big numbers (minutes on screen, scenes, share of the talking), and their **signature line** in Courier Prime. On a phone the cards are a sideways-swiping row (CSS scroll snap, no script) with "Swipe for more" beneath; on a wide screen, a 4 × 2 grid.
   - **The rest of the cast** as one short list: chip, name, hook.
   - **Who shares scenes:** a half-matrix of the leading characters, each square shaded by how many scenes the pair share, the number inside; "Brighter squares: more scenes together."
7. **The acts, one after another**, in the reference's rhythm: a 6 px coloured top rule, the act's number **huge** in its colour, "Act one" in Courier, the act's title in Anton, its one-line mood (§3.3), and "17 scenes · 28 pages". Then **every scene as a row**:
   - the scene's number, big and dim, on the left;
   - the **place** in Anton, in plain words ("Halvorsen House, Radio Room");
   - a small **sun, moon, or horizon icon** and the time in words ("Night"), then "Inside" or "Outside", then "2 min";
   - **one line of what happens** (§3.2), at most two lines on a phone, clamped;
   - **character chips:** a coloured disc with an initial for each leading character, a grey ringed disc for the others, each with the name for screen readers and as a tooltip.
   - Every few scenes, a **pull quote**: a short line of dialogue in Courier Prime, large, on a dark panel with a coloured left rule, and the speaker's name with their colour dot (§3.1).
   - On a wide screen a row is three columns: place and time on the left, what happens in the middle, chips on the right; quotes are indented under the row.
   - Gaps appear in their place as dashed rows (§6).
8. **Places:** every place as a tag, **sized by the time spent there** in five steps (the biggest filled coral), with its minutes; "The bigger the name, the more of the story happens there."
9. **Threads** (setups and payoffs, §3.4): arcs over the page axis from where something is set up to where it pays off, each with a numbered marker; an unpaid setup is a dashed coral arc that ends in the air. A numbered list beneath: "The scorched logbook — scene 6 → 47", "The thin ice — scene 32 → not yet paid off".
10. **The close:** a coral rule, then "More soon" (in progress) or "The end" (finished) in giant Anton; "Written by" and, if the writer chose, "Say hello" with a `mailto:` link (§7); a last line in small Courier: "Signal Hill · Draft 03 · a3f9c2e" and "Made with Drafter".

**Call: the page is all of the script so far.** Every act and every scene written, in order, with nothing hidden. There is no spoiler setting in this release (§14).

## 3. Where every piece comes from

Nothing is typed twice. The export worker computes one **story-map model** from what Drafter already builds for the Script tab, Stats, Scaffold, and the Structure strip:

| On the page | Computed by |
|---|---|
| Title, writer, contact | the title page (`doc.titlePage` from `@drafter/fountain`'s `parse`): `Title`, `Author`/`Authors`, `Contact` |
| Logline | a `Logline:` title-page key (§3.5) |
| Draft number and ID | Drafts and Cuts' draft facts (`draft`, `id` in the `/* drafter … */` metadata block, `@drafter/fountain`'s `meta.ts`); see Call in §3.6 |
| Pages | `@drafter/layout`'s `paginate` with the script's template and export options |
| Running time | `apps/web/app/stats/count.ts`'s `countScript` and `runningTime`, with the script's rates (`stats/timing.ts`'s `ratesOf`) |
| Acts, scenes, their order, synopses, lengths | `@drafter/outline`'s `sceneIndex(doc, template, layout)`: `Section` (title, `scenes`, `eighths`), `Scene` (`heading`, `synopses`, `pages.eighths`, `speakers`, `speeches`, `spokenBy`, `words`, `timing`, `marks`) |
| Act band | `@drafter/outline`'s `structureStrip(index, linesPerPage(layout))`, as the HTML export's band |
| Inside/outside, time of day, place | `@drafter/cast`'s `placeOf` (`inside`, `time`, `location`) and `TIMES_OF_DAY` |
| Characters, screen time, share of the talking, presence, who shares scenes, firsts | `@drafter/cast`'s `castOf(...)`: `characters`, `byScene`, `inScene`, `figures` (`screenEighths`, `share`, `scenes`, `speaksIn`, `sharedWith`, `first`), and `gridModel` for presence; the Stats tab's `characterRows` and Scaffold's `sharePercents` for the same rounding |
| Places | `castOf(...).locations` (`LocationFigures`: `scenes`, `eighths`, `inside`, `times`) |
| Threads | `@drafter/notes`'s `setupsAndPayoffs(noteEntries(doc))` (`SetupThread`: `label`, `setups`, `payoffs`, `unpaid`) |
| Gaps | §6 |

The model is a plain object (numbers, short strings, indexes); the renderer only draws it. A screen-time "minute" is the script's rate applied to eighths, so the page agrees with Stats.

### 3.1 Lines of dialogue

The heart of the page: short lines, sprinkled through the scenes, that let a non-writer hear the script.

- **Picked automatically**, so a story map works with no setup. A candidate is **one speech**: one character's dialogue under one cue, never dual dialogue, never an exchange. Its text is cleaned for a non-writer: the cue's extension (`V.O.`, `O.S.`, `CONT'D`), parentheticals, emphasis marks, notes, and boneyard are removed; transitions are never candidates.
- **Call: the length rule.** A picked line has **3 to 18 words and at most 110 characters** after cleaning, ends with `.`, `!`, `?`, or a closing quote, and doesn't start with a filler ("and", "but", "so", "yeah", "well", "oh", "um", "no"). A line the writer marks (below) may run to **160 characters**; nothing longer is ever used.
- **Call: the spread.** At most one line per scene; scenes with a line at least three apart; **about one line for every four scenes**, at most **12** in all; at least one per act when the act has a candidate; no character more than three times. Among candidates, the scorer prefers 6–12 words, a line that ends a speech, and a speaker who hasn't had one yet; ties go to the earlier scene. Deterministic: the same script gives the same picks.
- **The writer can steer it, in the script.** **Call:** a note **`[[Quote]]`** inside a speech (on its own line under the dialogue, or at the end of a line of it) marks that speech as wanted; **`[[No quote]]`** marks it never to be used. They are ordinary Fountain notes: they survive saving, travel with the file, never print, and are found by `@drafter/notes`'s keyed-note reader (a new pair of whole-body marks beside `Setup`/`Payoff`). A marked line always goes in (if it passes the 160-character rule), and counts toward the spread.
- **In the editor:** **Use in story map** and **Never use in story map** on the context menu of a dialogue line, and in the palette, insert or remove those notes as one undo.
- **In the dialog** (§7), the picks are listed for a quick look: each with a checkbox (unticking writes `[[No quote]]`) and a "Pick another" that moves to the next candidate in the same scene.

### 3.2 What happens in each scene

**Call:** the scene's line is its **first synopsis** (`= …`, `Scene.synopses[0]`), cut to its first sentence; with no synopsis, the **first sentence of its first action paragraph**. Either is clamped to about **12 words** (cut at a word, with "…"), and to two lines on a phone by CSS. Character names in capitals in the action become title case ("JUNE crosses" → "June crosses"). A scene with neither shows only its place, time, length, and chips. The dialog's **Scene summaries** option (on by default) turns all of these lines off at once.

### 3.3 Acts

An act is a top-level section (`#` in a screenplay; a stage play's acts). Its title is the section's title with any leading "Act One:"-style label kept off ("Act one" is printed above it). Its **mood line** is the section's first synopsis, first sentence, about 12 words; none, no mood line.

### 3.4 Threads

Setups and payoffs come from the writer's **Setup** and **Payoff** notes (`[[Setup: label]]`, `[[Payoff: label]]`), drawn as arcs between the scenes they are in, labelled with the note's **label only** (never the rest of any note). **Call:** threads are **on by default**, because they are part of the shape and the labels are short names the writer chose; the dialog has a **Threads** checkbox. With no Setup notes, the section is left out.

### 3.5 Logline

**Call:** the logline is a **`Logline:` title-page key**. It travels with the Fountain file, other Fountain apps keep it as a title-page field, and Drafter's PDF doesn't print it (`@drafter/layout`'s `titleKeyPrints` prints only the keys it places). The dialog shows it for editing and writes it back to the title page (one undo) when changed. With none, the page goes from the title straight to the explainer line.

### 3.6 Draft number, date

**Call:** "Draft 03" is the current draft number from Drafts and Cuts, two digits (three past 99); the short ID in the last line is the last frozen draft's ID. A script with no frozen draft (or before Drafts and Cuts is built) shows "Draft 01" and the first 7 characters of the SHA-256 of the current text (`storage/hash.ts`'s `hashText`, the ID Drafts and Cuts will give it). "Updated" is the date the script was last saved.

## 4. Characters

### 4.1 Colours

**Call:** the **leading characters** (§4.3) each get a colour from a fixed palette of eight chosen to stand apart from the day/night colours and from each other on the dark ground (pink, blue, lavender, green, peach, lime, silver, and white rings for an off-screen voice — a character who only ever speaks `V.O.` or `O.S.`), assigned in order of screen time; the others are grey. A colour is never the only signal: the initial is on the chip, the name is beside every bar, and screen readers get names.

### 4.2 Hooks

**Call:** a character's hook comes from **their introduction**: the first action paragraph where their name appears in capitals (the usual way a script introduces someone, `JUNE HALVORSEN (71), …`). Drafter takes the age from a parenthesis just after the name and the rest of that sentence as the hook, cut to about **8 words**. The dialog lists every leading character's hook for editing; an edited hook is kept in the script's metadata block (`storyMap.hooks`, by character key), so it travels with the file and needs no note in the text. No introduction found: no hook, and the dialog shows an empty field.

### 4.3 Who leads

**Call:** cards for the **eight characters with the most screen time** (fewer if the script has fewer), the rest in the short list. A character who never speaks and is in fewer than two scenes is left out of the list (a crowd, a waiter).

### 4.4 Signature line

The character's own best line by §3.1's rules, preferring one marked `[[Quote]]`; it may be the same line used in the scenes. None: no line on the card.

## 5. Plain words

The page is for people who have never seen a script. **Call:** none of these words appear on it: slugline, scene heading, INT., EXT., parenthetical, extension, V.O., O.S., CONT'D, transition, action, element, beat, eighths.

- `INT.` and `EXT.` become **Inside** and **Outside**; `INT./EXT.` is "Inside and out".
- Times stay as plain words: Day, Night, Morning, Evening, Dawn, Dusk, and the rest of `TIMES_OF_DAY`; "CONTINUOUS", "LATER", and "MOMENTS LATER" show no time and the scene takes the time of the one before.
- A place is the heading's location in **title case**, its parts joined with commas ("HALVORSEN HOUSE - RADIO ROOM" → "Halvorsen House, Radio Room"); a locked scene number is dropped.
- Lengths are in **minutes** ("2 min", "about 1 hr 50 min"), and pages in "pages" ("110 pages so far"), never in eighths.
- The kind: "A screenplay in progress", "A finished screenplay", "A play in progress", "A finished play".

### 5.1 Stage plays

A stage play gets the same page: its acts are acts and its scenes (`##` sections, or scene headings when the play uses them) are scenes. A play's scenes usually carry no inside/outside or time of day, so **Call:** when fewer than half of the scenes have one, the strip has a **single lane**, coloured by act, the donuts are left out, and the scene rows drop the icon; a place shows when a heading or the scene's first line names one (`placeOf`), else the row is just the number, the scene's title if it has one, and what happens. Running time uses the script's rates (the dialogue estimate), as Stats does for plays.

A play also changes these, in plain words:

- **The label** reads "A stage play in progress" or "A finished stage play"; a play with exactly one act marked reads "A one-act play in progress" or "A finished one-act play", and those are the only words about acts its page shows (§5.2).
- **The interval.** Between two acts, the act band has a narrow dashed "Interval" column, the strip leaves a visible gap marked "Interval" on its ruler, and the scene list has a dashed "Interval" divider. The running time says so: "about 1 hr 45 min with an interval" (in progress: "1 hr 20 min so far, plus an interval"). **Call:** a play with two or more acts has one interval, between Acts 1 and 2. A `[[Interval]]` note marks a different place, and `[[No interval]]` turns it off. A one-act play, or a play with no acts marked, has no interval unless an `[[Interval]]` note marks one; then it falls after the scene that holds the note (never before the first scene or after the last).
- **Settings, not places.** Each setting is a tag sized by stage time, in the play's own words with a capital ("The front room", "The garden"). The facts grid counts settings.
- **Who's on stage.** See below.

**Call: who's on stage.** Each scene row in a play shows, in place of the chips, one short line per character on stage. Each line starts with the character's chip, and its bar runs across the scene from when they arrive to when they go. A full-width bar means they are there throughout. A bar that starts late means they enter; one that stops early means they leave. Under the lines, one plain sentence says what changed: "Dev enters halfway", "Josie comes in, then leaves", "Mr. Fell leaves near the end" (early, halfway, late or near the end, by quarter). Drafter works out the span from the scene's lines. A character arrives at the earliest of their first speech, their name in capitals in the action, or an action line that names them with "enters", "comes in", "appears" or "arrives". They go at an action line that names them with "exits", "exit", "leaves", "goes out", "goes off", or "goes" as the sentence's last word ("PELL goes to the window." is no exit), or else stay to the end of the scene. "Exeunt" and "All exit" end everyone. A verb belongs to the name before it; a verb before a name counts for it only when the verb opens the sentence ("Exit ROOK.") or no earlier name took it, so in "PELL leaves ROOK alone." only Pell leaves. **Known limit:** each character has one span per scene, from their first arrival to their last exit, so someone who leaves and comes back reads as there throughout the gap. Each moment is placed as a share of the scene's lines. The rows are a list labelled for screen readers ("On stage: Margit, Josie, Mr. Fell. Josie comes in, then leaves. Mr. Fell leaves halfway."). The bars are decoration beside that label, and colour is never the only signal, because each bar starts with a chip. The character cards' presence strips use the same spans, and so does **Who shares the stage most**: a ranked list of pairs, each with its two chips and a bar for the scenes they share the stage in (their spans overlap, not just the same scene). A screenplay's matrix counts the scenes two people are both in (`figures.sharedWith`). A play has fewer characters, so this list replaces the screenplay's matrix. Screenplays keep their chips. A screenplay's scene is short and cut, not staged, so arrivals and departures matter less there.

### 5.2 A script with no acts, or one

The maintainer, 2026-11-01: "Maybe be cautious in dividing into acts until more is written or the acts are specified," and "Plays especially it might be a one act with scenes."

**Call: acts only as the writer marks them.** The acts are the `#` (depth 1) sections; with none, the sections whose heading starts with the word "Act" ("Act One", "ACT 2: …", never "Actors"), at the shallowest level they use. Nothing else is an act: a screenplay with only `##` sequences has no acts, and a play of `##` scenes with no act marked is one run. Drafter never guesses acts from lengths or turns.

No acts, or exactly one: no act band and no act cards; the scenes are one run under a heading "The story", with the strip, pace, and everything else unchanged; the nav reads Shape · Characters · Scenes · Places · Threads. The progress sentence speaks of the whole ("The play is under way: …", "The script is written."), and a play has no interval unless one is marked (§5.1). The only act words a one-act play shows are its label, "A one-act play" (§5.1).

**Call: early drafts keep the shape simple.** With acts marked but under 10 pages or 6 written scenes, there is no act band (small blocks of one scene each read as noise): the strip shows the acts as small "Act 1", "Act 2" markers above it, and the scenes stay one colour scheme (time of day, or one colour for a play). Act colours appear only with two acts or more; two acts take coral and ember, so they stay apart.

## 6. In progress or finished, and the gaps

The reader should see at a glance what isn't written yet, drawn as **unfinished, not broken**: dashed outlines, quiet colour, and plain words.

### 6.1 What counts as a gap

**Call: four sources, in this order of trust.**

1. **An act with no scenes** — a top-level section whose `Section.scenes` is 0 (the writer has planned "Act Three" and written nothing under it). Drawn as a dashed act card "Not written yet", and a dashed block on the strip.
2. **A planned scene** — a scene with no action and no dialogue: only a heading (including Expand outline's stub, `STUB_HEADING`, which `@drafter/lint`'s `stub-heading` rule already finds), a heading and a synopsis, or a heading and notes. In the model, a scene whose `timing` is zero and whose printed `words` are only the heading's. Drawn as a dashed row ("Planned, not written yet", with its synopsis if it has one), a dashed one-page placeholder on the strip and the pace chart, and it counts as zero pages.
3. **A to-do in a scene** — a note with the **TODO** category (`[[TODO: …]]`, the `todo` head among `@drafter/notes`'s `STARTING_CATEGORIES`, or a `#todo` tag). Shown as a small coral "to do" mark on the scene's row, **never the note's text**.
4. **The planned length** — **Call:** a new, optional **Planned length** in pages, set in the dialog and kept in the script's metadata block (`storyMap.plannedPages`). Drafter has no whole-script target today (the Stats goal is a daily one), so nothing is guessed: with it, the strip's axis runs to the planned length and the unwritten tail is a dashed "still to write" stretch at the end of the last act; without it, there is no tail and no percentage.

### 6.2 The progress read

- With a planned length: **"About 82% written"** (pages written ÷ planned, rounded, never over 100%), "98 of 120 planned pages", the bar, and one generated sentence naming the acts (§6.3).
- Without one: no percentage and no bar; the sentence alone ("Acts 1 and 2 are written. Act 3 is under way: 2 scenes planned.").

### 6.3 The sentence

Built from the gaps, and never saying more than the numbers do:

- **An early draft** (under 10 pages or under 6 written scenes, `STORY_MAP_LIMITS.earlyPages` and `earlyScenes`, which the charts use too) gives only its pages and scenes: "4 of 40 planned pages · 6 scenes so far", or "4 pages · 6 scenes so far" without a planned length.
- **One act or none:** the play or the script as a whole: "The play is under way: 2 scenes planned.", "The script is written."
- **Pages still to write** (a tail): no act is called written. "The writing has reached Act 3: 14 scenes so far.", then each act with gaps, then the acts still to come.
- **Otherwise:** an act with no planned scene and no to-do (and at least one scene) is "written"; an act with gaps is "under way" (naming the planned scenes and to-dos); an act with nothing under it is "still to come". Only the acts the writer marked are named, empty ones included.

### 6.4 In progress or finished

**Call:** the dialog has a plain choice, **In progress** or **Finished**, defaulting to **In progress when any gap is found** (§6.1) and **Finished** otherwise, and remembered per script. Finished shows "A finished screenplay", no meter, no dashed shapes (planned scenes are left out, to-do marks hidden), and "The end" at the close; In progress shows everything in §6.

## 7. The Make a story map dialog

Short, with sensible defaults, so Enter makes a good page:

- **Status:** In progress / Finished (§6.4), and **Planned length** (pages, optional) beside In progress.
- **Logline** (one line, from `Logline:`; §3.5).
- **The line under your name:** "What I'm writing" (editable). **Explain the page** (on), with its sentence editable.
- **Include:** Scene summaries (on), Lines of dialogue (on), Threads (on), Your contact (off; from the title page's `Contact`, editable).
- **Lines of dialogue:** the picks for a quick look (§3.1), and **Characters:** each lead's hook (§4.2), collapsed under "Check the lines and hooks".
- **A plain line above the button:** "This page includes a few lines of dialogue and a one-line summary of each scene. Notes are never included."
- **Make story map** (primary), Cancel.

**Call:** what is about the text is kept in the text (`[[Quote]]`/`[[No quote]]` notes; `Logline:`); what is about the whole page and should travel is kept in the metadata block (`storyMap`: hooks, planned length); the rest (status, the include switches, the explainer and greeting lines, contact) is the script's own export setting, kept on its project in this browser like the other export options (`storage/export-options.ts`).

## 8. Privacy

- **Never in the file:** notes (other than Setup/Payoff labels when Threads is on), boneyard, to-do text, revision marks, the full script, any whole exchange, the title page's other fields, and the writer's contact unless they turn it on.
- **In by default, said plainly in the dialog:** scene summaries (synopses or first lines, ≤ 12 words), lines of dialogue (≤ 12, ≤ 110 characters each, or 160 when marked), hooks (≤ 8 words), threads' labels.
- **How this follows the HTML export:** the same "nothing unless chosen" rule as Export → HTML's **Include notes** (off by default; `notes: 'leave-out'`), and the story map ignores **Let Drafter reopen this file** (`reopenable`): a story map never carries the script and can't be reopened. Scene numbers follow the page's own numbering (1, 2, 3 in order), not the export options' scene numbering, because a non-writer reader needs order, not production numbers.

## 9. Not in this release

Markdown documents and novels (chapters as acts, sections as scenes: a later release, once Novel exists); a spoiler cutoff (a possible advanced option later, off by default); images or cover art; a light theme; a PDF or image of the page; translations of the page's own words.

## 10. Technical

### 10.1 One file, no script

- **Zero JavaScript.** The page is HTML, one `<style>`, and inline SVG. The nav is `#` links, the card row scrolls with CSS scroll snap, clamps are CSS, tooltips are SVG `<title>`. No `<script>` element exists, so nothing can run.
- **CSP:** the same `<meta http-equiv="Content-Security-Policy">` as Export → HTML (`packages/render-html-file/src/shell.ts`'s policy), without the script: `default-src 'none'; style-src 'sha256-…'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'`. **No `style` attribute anywhere:** what varies per script is either an SVG attribute (`x="12.5%"`, `width="3.1%"`, `height`, `stroke-dasharray`, `pathLength`) — presentation attributes, which `style-src` does not govern — or a **generated class** with its rule appended to the one stylesheet (the act band's `grid-template-columns: 224fr 448fr 208fr`, each character's colour variable), as the HTML export already does for its page geometry.
- **SVG without a viewBox where it can.** The strip, ruler, presence strips, ranking bars, and pace chart use percentage `x`/`width` and pixel heights, so they stretch to any width while text stays crisp. Only the thread arcs use a `viewBox` with `preserveAspectRatio="none"` and `vector-effect="non-scaling-stroke"`; their numbers are a second, percentage-positioned SVG on top.
- **No network:** no CDN, no remote font, no remote image. The only URL in the file is the optional `mailto:` link.
- **Built where:** **Call:** a new DOM-free package, `@drafter/story-map`: `model.ts` (the model, §3, from the parsed script, layout, scene index, cast, notes, and the options) and `render.ts` (the HTML string), reusing `@drafter/render-html-file`'s `escapeHtml`, `el`, and CSP hashing. The web app's export worker builds it off the main thread; the CLI gains `drafter build script.fountain --story-map out.html`.

### 10.2 Fonts

**Call:** Anton (display), Archivo (text), and Courier Prime (labels and lines of dialogue), each **subsetted to Latin, Latin-1, and Latin Extended-A (so names like Dvořák and Łukasz stay in one face) with common punctuation and converted to WOFF2 once**, committed under `packages/story-map/fonts/` with their `OFL.txt` and a README of sources and checksums (as `packages/render-pdf/fonts/README.md` does), and embedded as base64 `data:` URLs. The subsetting is a documented one-off (fontTools' `pyftsubset`), not a build dependency.

- **Licences:** all three are under the **SIL Open Font License 1.1**, which allows embedding, subsetting, and redistribution with software; none declares a Reserved Font Name (checked in each `OFL.txt`: Anton © 2020 The Anton Project Authors; Archivo © 2020 The Archivo Project Authors; Courier Prime © 2015 The Courier Prime Project Authors), so a subset may keep its name. The copyright line goes in a comment beside each `@font-face`.
- **Drafter already ships Courier Prime** (TTF, all four styles, in `packages/render-pdf/fonts/` and `apps/web/public/fonts/courier-prime/`); the story map subsets **Regular only**.
- **Archivo** ships upstream as a variable font (658 KB); two static instances (400 and 600) are cut from it with fontTools' `varLib.instancer`.
- **Measured** (2026-11-01, WOFF2 after subsetting): Anton 14.5 KB; Archivo 400 10.9 KB and 600 10.2 KB; Courier Prime Regular 17.5 KB. **53.1 KB in all, about 71 KB as base64.**
- A character outside the subset (a name in Greek, a line in Japanese) falls back per glyph to the reader's own fonts through each family's fallback list (`"Anton", Impact, "Arial Narrow", sans-serif`, …); nothing is dropped.

### 10.3 Size

- **Call: under 400 KB for a 120-page script; never over 1 MB** (300 pages, 200 scenes, 60 characters), so it goes by text message or email. The mockup's 47 scenes are about 100 KB of HTML and CSS before fonts; with fonts, about 175 KB.
- A test measures generated scripts of 120 and 300 pages and records the sizes in `docs/DECISIONS.md` (§12).

### 10.4 Long scripts

At 120 pages, 200 scenes, and 60 characters:
- **Strip and pace:** blocks are as wide as their scenes; a block narrower than 0.15% is drawn at 0.15%, so every scene stays visible as a sliver. The pace chart's bars stay one per scene.
- **Scenes:** every scene has its row. **Call:** with more than **80 scenes**, each act's scene list is a `<details>` element (open for the first act, closed for the rest, a summary line "42 scenes — show") so a phone isn't a 30,000-pixel scroll; the act card above it stays. A script with no acts (or one) folds the same way, in blocks of 50 scenes, each a `<details>` labelled "Scenes 51–100", the first open (decided at review, 2026-11-01).
- **Characters:** the ranking shows the top **12** and "and 48 more"; cards stay at eight; the shares matrix stays at the eight leads; the short list holds the next eight with "and N more".
- **Places:** the top **24** tags and "and N more".
- **Threads:** up to **12** arcs; the rest only in the list.
- **Lines of dialogue:** still at most 12 (§3.1).

### 10.5 Phones

390 px is the main layout: one column, 16 px side gutters, no sideways page scroll (the nav and the card row scroll on their own). Type stays large: the title fills the width, section heads at 52 px, scene places at 22 px, quotes at 24 px, body 16 px, labels 12–13 px. Charts are full width; the matrix fits eight leads at 390 px. `-webkit-text-size-adjust: 100%` keeps phone browsers from inflating text.

### 10.6 Print

**Call: a small light print stylesheet**, not none. Dark-only is a screen choice; printed dark wastes ink and prints poorly. `@media print` swaps the colour variables to ink on white, hides the nav, keeps cards, quotes, and rows from breaking across sheets, and nothing else (about 1 KB).

### 10.7 Accessibility

WCAG 2.2 AA on the dark palette, as the rest of Drafter:
- **Real headings:** one `h1` (the title), `h2` for each section and act, `h3` for characters and for scenes (a scene row sits under its act's or the story's `h2`, so no level is skipped; review, 2026-11-01).
- **Every chart has a text equivalent.** Each SVG is `role="img"` with a `<title>` saying what it shows, followed by a `<details>` "Show as a table" holding the same figures (scenes by act and time of day; screen time and share; pairs who share scenes; places; threads), so nothing is only a picture. Purely decorative SVG (icons beside words, the ruler) is `aria-hidden`.
- **Contrast:** text uses `--fg` (#e7efed) or `--mute` (#8ba19d), both AA on every surface; `--dim` (#5d7672) only for large display numbers and decoration. Dark text on the act band's colours is checked per colour (the mockup's first deep-coral act colour failed axe and was replaced with ember).
- **Colour is never alone:** lanes carry inside/outside, icons and words carry time, initials and names carry characters, dashes and words carry gaps.
- **The swipe row** is a focusable, labelled region so a keyboard can scroll it.
- **Reduced motion:** there is no motion except smooth scrolling for the nav, which `prefers-reduced-motion` turns off.
- axe runs on generated files at 390 and 1440 px (the mockup passes both with no violations).

### 10.8 Safety

Every piece of the writer's text — title, names, places, synopses, hooks, lines, thread labels — is escaped (`escapeHtml`) wherever it goes, **including inside SVG `<text>` and `<title>`**, which the HTML parser reads as foreign content but still decodes entities in, so an escaped `<` stays text. IDs and class names are generated from indexes (`s12`, `c-3`), never from names. The `mailto:` link is built from a validated address only (one `@`, no spaces, no `?` or `&`), else the contact shows as text.

## 11. What the mockup shows

A second mockup, for a play, shows *Low Season* by an invented writer, Sam Ferris: two acts, 12 scenes (one planned and an unwritten ending), six characters, three settings and who's on stage in each scene. The first is an invented feature, *Signal Hill* by an invented writer, Dana Morrow: three acts, 47 scenes in the in-progress version (two planned and an unwritten ending in Act 3, with a planned length of 120 pages), 50 in the finished one, twelve characters, fifteen places, eight threads (one never paid off), and eleven lines of dialogue. Its 1440 and 390 px screenshots were the review copy. The mockup links Google Fonts for convenience; the export embeds them (§10.2). It leaves out the "Show as a table" disclosures for brevity; the export has them.

## 12. Testing

- **Model (unit):** the length and spread rules for lines, and `[[Quote]]`/`[[No quote]]`; cleaning (extensions, parentheticals, emphasis, notes removed); hooks from introductions; places in plain words; times carried by CONTINUOUS; gaps (an act with no scenes, a heading-only scene, a heading-and-synopsis scene, a stub, a TODO note, a planned length) and the progress sentence; the stage-play single lane; a script with no acts; deterministic output.
- **Structure snapshots:** the original sample screenplay and stage play (`apps/web/app/editor/sample-scripts/`) and an original feature-length fixture rendered and parsed with jsdom: the headings outline, one row per scene in order, every chart with its `<title>` and table, no forbidden words (§5) in the visible text.
- **CSP:** the CSP's style hash matches the one `<style>`; there is no `script-src` and no `<script>`; no `style=` attribute and no `on*=` attribute anywhere.
- **No network:** the file opened in Playwright with every request blocked renders completely and attempts none; the only URL in the file is `mailto:` (when chosen), `data:`, or `#`.
- **Size budget:** 120 pages under 400 KB, 300 pages / 200 scenes / 60 characters under 1 MB, figures recorded.
- **axe** at 390 and 1440 px on the in-progress and finished files, no violations.
- **Trap document** (added to the hostile fixtures the HTML export uses): a title, character names, places, synopses, a line, a hook, and a thread label holding `</text><script>alert(1)</script>`, `"><svg onload=alert(1)>`, `]]>`, `<foreignObject>`, `&lt;` already escaped, U+2028, a lone surrogate, and a 5,000-character name; the file parses to the same structure, nothing runs in Playwright, and long text is clamped, not overflowing.
- **e2e:** Export → Story map from the toolbar, menu, palette, and desktop File menu; the dialog's defaults, a changed logline written to the title page, Use in story map from the editor's context menu writing `[[Quote]]`.

## 13. Content rules for samples

Every fixture, mockup, and screenshot uses original text written for Drafter. No text, names, story, or sentences from the maintainer's reference page, from any produced script, or from another app's samples.

## 14. The calls

1. The name is **Story map**; the page greets the reader with "What I'm writing" (§1).
2. Export → Story map… produces only one HTML file (§1.1).
3. The page shows all of the script so far; no spoiler setting this release (§2).
4. Lines of dialogue: one speech, 3–18 words, ≤ 110 characters (160 when marked), cleaned of extensions and parentheticals (§3.1).
5. About one line per four scenes, at most 12, spread by act and speaker, deterministic (§3.1).
6. The writer steers lines with `[[Quote]]` and `[[No quote]]` notes, and Use in story map in the editor (§3.1).
7. A scene's line is its first synopsis, else its first action sentence, about 12 words; Scene summaries is on by default (§3.2).
8. An act's mood line is its section's first synopsis (§3.3).
9. Threads on by default, labels only (§3.4).
10. The logline is a `Logline:` title-page key (§3.5).
11. Draft number from Drafts and Cuts; with none, "Draft 01" and the SHA-256 of the text (§3.6).
12. Eight lead colours away from the day/night colours; the rest grey (§4.1).
13. Hooks from the character's introduction, about 8 words; edits kept in the metadata block (§4.2).
14. Cards for the eight with the most screen time (§4.3).
15. No screenwriting words on the page: Inside/Outside, plain times, places in title case, minutes and pages (§5).
16. A stage play with few times or places gets one lane and no donuts (§5.1).
17. Gaps from empty acts, planned scenes, TODO notes, and an optional planned length; nothing guessed (§6.1).
18. In progress or Finished is the writer's choice, defaulting from whether gaps are found (§6.4).
19. Text choices in the text, page-wide ones in the metadata block, the rest in the project's export settings (§7).
20. Nothing private by default; summaries and lines are on, said plainly in the dialog; `reopenable` is ignored (§8).
21. Zero JavaScript; the HTML export's CSP without a script; no style attributes (§10.1).
22. A new package, `@drafter/story-map`, and `drafter build --story-map` (§10.1).
23. Anton, Archivo (400, 600), and Courier Prime Regular, subsetted WOFF2, embedded as base64, about 71 KB (§10.2).
24. Under 400 KB at 120 pages, never over 1 MB (§10.3).
25. Over 80 scenes, each act's scene list folds into a `<details>`; with no acts, the run folds in blocks of 50 (§10.4).
26. A small light print stylesheet (§10.6).
27. A play has one interval, between Acts 1 and 2, unless a `[[Interval]]` or `[[No interval]]` note says otherwise. It shows on the act band, the strip, the scene list and the running time (§5.1).
28. **Who's on stage:** a play's scene rows show one chip-led bar per character, from entrance to exit, with one plain sentence ("Dev enters halfway"). Spans come from first speech or mention, and from "enters" and "leaves" in the action. Pairs are ranked in a list instead of a matrix (§5.1).
