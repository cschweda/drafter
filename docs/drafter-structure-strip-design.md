# The Structure strip — Design

**Status:** designed 2026-10-29, to ship as v0.15.0, right after Plan D (spellcheck, v0.14.0). The plan is [`docs/plans/2026-10-29-structure-strip.md`](plans/2026-10-29-structure-strip.md).

**Asked for (maintainer, 2026-10-29):** an outline shown above the script, as a band of rows (one per outline level, then the scenes), each block sized by its length and colored, clickable, "and make it toggle-able".

**Clean room (binding).** This is Drafter's own strip, drawn from Drafter's own data (the scene index) in Drafter's own visual language (its theme tokens, its scene-color swatches, its Fountain marks). Nothing is traced or reproduced from another screenwriting app: not its layout, colors, row names, icons, or words. No code or assets from any screenwriting app.

Each choice open to the designer is marked **Call:**, and all of them are listed in §12.

## 1. What it is

The **Structure strip** is a thin band across the top of the window, under the toolbar, that shows the whole script at once along one horizontal axis of pages. Each row is one level of the script's structure: one row per section depth the script uses (`#`, `##`, `###`), then a row of every scene, then a page ruler. Every block starts where its part of the script starts on the pages and is as wide as it is long, so a long act is a long block and a 1/8-page scene is a sliver. A scene's block takes its `[[Color: …]]`. Clicking a block goes there. The block holding the cursor is marked as the writer types and moves.

It's off until the writer turns it on, and one setting turns it on everywhere: a toolbar button, a palette command with a key, and a Settings switch.

## 2. Where it sits

- **Call:** one band across the full width of the window, under the toolbar and the bars below it (read-only, file, storage, sample), above both panes, whichever tabs they show. Reason: the strip is a map of the script, not of a pane. Tabs swap between panes and on and off (Source, Script, Outline, Cards, Compare…), and a strip inside one pane would come and go with them. Across the top it stays put and reads the same whatever is open. It lives inside the shell's `.top` block (`apps/web/app/pages/index.vue`), so the shell's grid is unchanged.
- It is not repeated above the Source or over Preview, Outline, or Compare. There is one strip, and it shows the same thing whatever the panes show.

## 3. Rows

From the top:

1. **Section rows.** One row for each section depth from 1 to 3 that the script uses, in depth order. A depth the script doesn't use gets no row, so `#` then `###` gives two rows. **Call:** sections deeper than `###` are not drawn (the Outline still lists them), so the strip is never more than five rows. A stage play's `#` acts make its one section row: its `##` lines are scenes, as the scene index already reads them.
2. **The scenes row.** Every scene, in order.
3. **The page ruler.** Page numbers at a spacing that keeps them about 40 px apart (1, 5, 10, 15… on a long script; every page on a short one), with a tick at each page when there's room.

- **Call:** the rows are labeled at their left with the Fountain marks themselves, `#`, `##`, `###`, and **Scenes**. The mark is the one thing that's true of every script (Drafter can't know that a writer's `#` means acts), and it teaches the marks: the maintainer is learning Fountain, and Drafter shows its marks wherever it can. For a screen reader, each row is a group named "Sections marked #" (or ##, ###), or "Scenes".

### 3.1 Sizes, along one axis of pages

- **Call:** the axis is in pages. A scene starts at `(page − 1) + (line − 1) / linesPerPage`, from `Scene.pages`, and ends where the next scene starts. The last scene ends at its start plus its `eighths / 8`. So the scenes tile the axis exactly, with no gaps or overlaps, and the eighths' rounding never makes them drift from the ruler.
- A section's block runs from the start of its first scene to the end of its last, so it sits exactly above them. **Call:** a section with no scenes (`Section.eighths` null) is a thin tick at the place of the next scene after it (or the end), with its name in the card, so it is never lost and never takes room.
- Text before the first scene (the title page, a cold-open note) takes no room: the axis starts at the first scene.
- **Call:** **fit to width, always.** The whole script fills the strip's width, with no horizontal scrolling and no zoom in v1. A 120-page script is about 10 px a page on a laptop; a 1/8-page scene is a sliver but still a block that a pointer can find and a key can reach, and the card names it. A zoom that scrolls is deferred (`docs/DEFERRED.md`) until the strip has been used.

### 3.2 Before the pages are ready

The scene index has pages only when the layout matches the parse. While typing adds or removes a block, the layout lags by a moment and the index has no pages.

- **Call:** the strip keeps the last strip it drew with pages until a new layout arrives, so it doesn't flicker or jump while the writer types. Each block keeps the scene's id (`useOutline().idOf`), so going to a block always uses the scene as it is now, and a block whose scene has gone since goes nowhere and says so.
- **Call:** with no layout at all (the worker couldn't start, or failed before its first layout), the blocks are sized by printed words instead, and the ruler is hidden, since there are no pages to number.

### 3.3 Labels and color

- A section's block shows its title; a scene's block shows its number and heading ("12 INT. KITCHEN - NIGHT"). Labels are cut with an ellipsis, and **Call:** a block narrower than 28 px shows no label, only its color.
- **Call:** a scene with a `[[Color: …]]` Drafter knows is filled with a light tint of that color's swatch (`SWATCH` in `outline/labels.ts`, mixed toward the page color, so the text in `--text` stays readable in both themes) and a full-strength edge at its bottom. A color word Drafter doesn't know, and a scene with none, get the neutral (`--chrome-2`). Section blocks are neutral, alternating two neutral tones along a row so neighbors are told apart. A thin line (`--line`) separates every block.
- Color is never the only signal (Phase 2 design §5.7): the card and each block's name say the color's name.

## 4. Interactions

- **Going there.** **Call:** clicking a block, or Enter or Space on it, does what choosing an Outline row does: `editor.goto(item.span.from)`. The Source cursor goes to the scene's heading (or the section's line), the Source tab shows and has focus, and the Script pane follows the cursor as it always does (`cursorBlock`), so both panes show the place. Reason: one way of "going to a scene" across Drafter (Outline, Go to scene…, and now the strip), and the writer lands ready to type.
- **Where you are.** **Call:** the scene holding the cursor, and the sections it sits in, are marked (a heading-colored outline and `aria-current="location"`), updated as the writer types and moves; that's the existing `cursorBlock` and the live scene index, so no extra work. While the Script pane shows, a small **in-view marker** on the ruler shows the page at the top of the Script pane, updated as the writer scrolls it, so reading the pages also moves something in the strip.
- **Hover and focus.** **Call:** one small card, drawn by the strip under the block that is hovered or focused, gives the scene's number and heading, its page and length ("page 12 · 1 3/8 pp"), its color, its goal (`fields.goal`) and its first synopsis; for a section, its title, number of scenes, and length. The card is `aria-hidden`; each block's accessible name says the same (`sceneName`/`sectionName` from `outline/labels.ts`, plus the goal).
- **Keyboard.** **Call:** the strip is one Tab stop. Its blocks are buttons with a roving `tabindex` (the pattern of the Outline tree and the History list): Left and Right move along a row, Up and Down move to the block in the row above or below that covers the focused block's middle (or the nearest), Home and End go to a row's first and last block, and Enter or Space goes there. Focus enters on the current scene's block. The buttons sit in one group per row inside a group named "Structure strip".
- **No dragging.** **Call:** the strip moves nothing in v1. Reordering has three homes already (Outline, Cards, the Source's commands), and the strip's blocks are often too small to drag well. The strip edits no text, so undo, read-only, and the recovery copy are untouched.

## 5. Turning it on and off

- **Call:** one setting, `structureStrip` in `settings.ts`, **off by default** (as the script map, §14 of the Phase 2 design, keeps the writing screen calm for a newcomer), remembered on this device like every setting.
- Three controls set it:
  - a **Structure** round button in the toolbar, after Focus, pressed while the strip shows (`aria-pressed`), with its own pastel circle;
  - **Toggle the structure strip** in the palette, the View group, the Keyboard shortcuts page, and the desktop app's View menu, on **Mod+Alt+O** (Call: a key next to Mod+, for Settings, unused by CodeMirror's keymaps and the major browsers; bound on the window, so it works with focus anywhere);
  - a **Structure strip** switch in Settings: "Show your script's sections and scenes as a band of blocks above the panes, each as wide as it is long. Click one to go there."
- **Markdown documents** have no scenes, so the strip never shows for one. The button and the command stay where they are, disabled with the reason ("A Markdown document has no scenes."), and the setting is kept for the next Fountain script.
- **Focus mode** hides it (it sits in `.top`, which focus mode removes).
- **Phones.** **Call:** not shown below 1024 px, and the toolbar's button is hidden there; the Outline tab does the job on a phone, as it does for the script map (§14). The setting stays as it was, so a tablet turned sideways shows it again.
- **No scenes yet.** **Call:** with no scenes (sections alone have nothing to span), the strip is one quiet line ("No scenes yet. Each scene heading you write shows here."), so turning it on visibly did something.

## 6. Read-only

In a read-only tab (another tab has the script) or while the file is being checked, the strip shows everything and going to a block works (it only moves the cursor). It has no edit controls to disable.

## 7. Performance

- The strip reads `useOutline().index`, the scene index the Outline already builds after every parse. There is no extra parse and no extra layout; the strip adds one pass over the index (`structureStrip`, linear in scenes and sections).
- **Call:** the strip is drawn as DOM, not canvas or SVG: absolutely positioned buttons whose `left` and `width` are percentages of the axis, so a window resize redraws nothing, and Vue keeps each block by its id, so typing that doesn't change the structure changes only the blocks whose numbers moved.
- **Budget:** building the strip of a 120-page script with about 150 scenes and three section levels takes under 2 ms (a unit test), and typing into a 120-page script with the strip on causes no long task (the existing Chromium long-task test in `script.spec.ts`, run again with the strip on).

## 8. Accessibility

Accessibility work waits for the final steps (maintainer, 2026-10-28). The strip is fully keyboard-usable and reuses existing patterns (roving focus, named groups and buttons, `aria-current`, `aria-pressed`). The existing axe tests stay green; no new axe tests are written here, and an axe check of the strip is deferred to the final accessibility steps.

## 9. Where the code goes

- **Call:** the geometry is pure and lives in `@drafter/outline` beside the scene index (`packages/outline/src/strip.ts`: `structureStrip`, `linesPerPage`), where Plan E's Timeline and script map can reuse it and the package's random-script arbitraries can property-test it. `apps/web` keeps the keys, the names, the session, and the drawing (`apps/web/app/strip/`, `StructureStrip.vue`).

## 10. How it relates to Phase 2's script map and Timeline

The Phase 2 design plans three views along the script: storylines' **Timeline** in the Outline (§13: one lane per storyline along the page timeline, each scene a block at its page and sized by its length), the **script map** beside the Source (§14: every scene a block top to bottom, sized by length, colored by INT/EXT, day or night, storyline, or scene color), and the **pacing view** in Stats (§15: bars at each scene's page).

- The strip is a fourth view on the same idea, and the first to ship: sections and scenes along pages, horizontal, over the panes.
- **Call:** it ships no storyline rows and no "color by" menu. Those belong to Plan E with storylines themselves.
- What Plan E inherits: `structureStrip`'s page axis and block geometry (a Timeline lane is a strip row filtered to one storyline's scenes), the ruler's page marks (the pacing view's axis), the strip's keys (§13's Timeline keyboard is the same: Left and Right along a lane, Up and Down between lanes, Enter goes), and its block names.
- **Open for Plan E, not decided here:** whether the script map (§14) is still wanted once the strip exists, or becomes the strip with a "color by" choice and storyline rows. Both show every scene sized by length and go there on a click; the map's one difference is that it runs down beside the Source.

### 10.1 The plan list shifts by one minor

The strip takes v0.15.0, so the Phase 2 plans after Plan D each move up one minor, as §22 already does when a release lands between two plans (the Mac app, Plan FD):

| Plan | Was | Now |
|---|---|---|
| D — Spellcheck | v0.14.0 | v0.14.0 |
| **Structure strip** | — | **v0.15.0** |
| E — Seeing the script | v0.15.0 | v0.16.0 |
| F — The Beat Board | v0.16.0 | v0.17.0 |
| G — Reader notes | v0.17.0 | v0.18.0 |
| H — Reference | v0.18.0 | v0.19.0 |

The letters stay as they are, so the rest of the Phase 2 design still reads.

## 11. Not in v1

A zoom that scrolls; dragging to reorder; storyline rows and "color by"; a phone version; an axe check of the strip (final accessibility steps). Each is a line in `docs/DEFERRED.md`.

## 12. Calls

1. One full-width band under the toolbar and its bars, above both panes, whatever tabs show; not per pane, not above the Source (§2).
2. A row per section depth 1–3 the script uses, then Scenes, then a page ruler; deeper sections not drawn (§3).
3. Rows labeled with the Fountain marks `#`, `##`, `###`, and Scenes (§3).
4. A page axis from each scene's page and line; a scene ends where the next starts, the last by its eighths; sections span their scenes; an empty section is a tick (§3.1).
5. Fit to width, always; no zoom or horizontal scroll in v1 (§3.1).
6. Keep the last paged strip while the layout catches up; go by scene id; words when there is no layout, with no ruler (§3.2).
7. Labels cut with an ellipsis, none under 28 px (§3.3).
8. Scene color as a tint of Drafter's swatch with a full-strength edge; unknown or none neutral; sections in two alternating neutrals (§3.3).
9. Click, Enter, or Space goes there as the Outline does: Source cursor at the heading, Source focused, Script pane follows (§4).
10. The cursor's scene and its sections marked, plus an in-view marker for the Script pane's top page (§4).
11. One hover-and-focus card, `aria-hidden`; each block's name says the same (§4).
12. One Tab stop, roving focus: Left and Right in a row, Up and Down to the overlapping block, Home and End, Enter and Space (§4).
13. No dragging or editing in v1 (§4).
14. One setting `structureStrip`, off by default, per device; a toolbar button, a palette command on Mod+Alt+O, and a Settings switch (§5).
15. Never for Markdown (controls disabled with the reason); hidden in focus mode (§5).
16. Hidden on phones, and its toolbar button with it (§5).
17. A script with no scenes shows one line instead of rows (§5).
18. Read-only: shown, navigation works (§6).
19. DOM with percentage positions, keyed by id; a 2 ms build budget and no long task on typing (§7).
20. Geometry in `@drafter/outline`; drawing in `apps/web` (§9).
21. No storylines or "color by" in v1; Plan E decides the script map's future (§10).
22. The strip is v0.15.0; Plans E–H move to v0.16.0–v0.19.0 (§10.1).
