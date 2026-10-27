# The element bar — design (v0.5.0)

*A slim row of buttons across the top of the Source pane that writes Fountain's marks for you, and teaches them as it does.*

Status: approved in conversation by the maintainer on 2026-10-27. Their words: "a button bar (small, but visible) across the top of the source panel for things like character, scene headings, etc. … click a button and it add the fountain marks for that specific part", and "the idea here is that someone new to fountain (like me) may not yet have all the fountain marks internalized." The builder's proposal below was accepted ("yes that sounds good"). Items marked **Call** are the builder's choices.

## 1. Purpose

Teaching first. A writer new to Fountain should be able to write a correct script without knowing the marks, and come to know them by watching the bar write them. Speed for people who already know Fountain comes second (they have the keys, and can hide the bar).

## 2. What exists

- `packages/cm-fountain/src/keymap.ts`: `forceKind(kind)` for scene_heading, action, character, parenthetical, transition, centered, lyric (Mod-Alt-1…7, adding `MARKERS`), `toggleDual` (Mod-Shift-D), `wrapInNote` (Mod-/), `wrapInBoneyard` (Mod-Shift-/), and Tab/Enter element cycling.
- `ElementAnnouncer.vue` already knows the cursor line's element (`editor/element-names.ts`).
- Completion (`complete.ts`) opens for locations after `INT. ` and names on a cue.
- These commands are keys only today: they are not in the palette or on the Keyboard shortcuts page.

## 3. The bar

One row under the Source pane's title bar (`AppPane.vue`), in the pane's chrome colours, ~28 px tall, small labelled buttons.

**Left: "You're in: Dialogue."** The current line's element in plain words, from the same source as `ElementAnnouncer`. Hovering or focusing it gives a short reason, e.g. "the line after a character name", "a line starting INT., EXT., EST., INT./EXT. or I/E", "forced by the `!` at its start". Not a live region (the announcer already speaks element changes when that setting is on).

**Buttons, in order:** Scene `INT.` · Action · Character `@` · Dialogue · Parenthetical `( )` · Transition `>`, then a **More** menu (Centered `> <`, Lyric `~`, Dual dialogue `^`, Note `[[ ]]`, Boneyard `/* */`, Section `#`, Synopsis `=`, Page break `===`, Bold `**`, Italic `*`, Underline `_`), then **?** (the cheat sheet) and **⋯** (Hide the element bar). Each button shows its mark in the monospace face, dimmed, after its label. The button for the current line's element is shown pressed (`aria-pressed`).

**Tooltips (and a long-press on touch):** one sentence on the element's rule, its mark, and its key. E.g. Character: "A name in capitals on its own line, after a blank line, with dialogue under it. Drafter adds `@` only when capitals alone won't do. Mod+Alt+3."

## 4. What a click does

Acts on the cursor's line (or each line of a selection for line kinds; the selection's text for Bold/Italic/Underline/Note/Boneyard), as **one undo step**, then returns focus to the editor with the cursor where the writer would type next. It writes **natural Fountain when it can** and a forcing mark only when needed, so the script reads cleanly:

- **Scene:** an empty line becomes `INT. ` and the location completion opens; a line with text is uppercased and, unless it already starts with a heading prefix, gets `INT. ` before it (**Call**) — or `.` if the writer's text starts with something that isn't a place (builder decides a simple rule and records it). A blank line is ensured above.
- **Character:** the line is uppercased; `@` is added only if capitals alone won't make it a cue (it has lowercase letters the writer keeps — i.e. it's a forced mixed-case name — or there's no blank line above and one can't be added). An empty line starts a cue (as Tab does) and opens the names list.
- **Dialogue:** on an empty line after a character or parenthetical, nothing to add (it's already dialogue; the cursor stays). On an action line just below a cue, removes the blank line between. Elsewhere it starts a new cue line above (as Tab) so the writer types the name. **Call:** the builder picks the least surprising behaviour per case and tests each.
- **Parenthetical:** wraps the line's text in `( )` (an empty line gets `()` with the cursor inside); only valid under a cue or in dialogue — elsewhere the button is disabled with the tooltip saying why.
- **Action:** removes forcing marks from the line, adding `!` only if the line would otherwise read as something else (all capitals, `INT.` etc.).
- **Transition:** uppercases; adds `>` unless it already ends in `TO:` and stands alone.
- **Centered / Lyric / Section / Synopsis / Page break / Dual / Note / Boneyard / emphasis:** the existing commands or the obvious mark.
- Pressing the button for the element the line already is does nothing harmful (**Call:** it removes a forcing mark if one was added, else nothing).

Reuse `forceKind`, `toggleDual`, `wrapInNote`, `wrapInBoneyard`, and the Tab cue start; new logic lives in `packages/cm-fountain` as pure commands with unit tests, so the CLI-independent package stays the source of truth.

## 5. Markdown documents

A shorter bar: Heading `#`, Bold `**`, Italic `*`, List `-`, Numbered `1.`, Quote `>`, Link `[ ]( )`, Code `` ` `` — same look, tooltips, and "You're in: Heading 2" on the left.

## 6. Where it shows

- On by default for every kind. **Settings → Element bar** turns it off; ⋯ → Hide does the same (and a toast says where to turn it back on). Remembered like the other settings.
- Hidden in focus mode, in a read-only tab (shown greyed is noisier), and in the Script/Preview panes.
- On a phone: one horizontally scrolling row, above the text; it doesn't cover the keyboard.
- Every action is also a palette command ("Element: Character", "Markdown: Bold", …) and is listed on the Keyboard shortcuts page with its keys, from `commands/data.ts`.

## 7. The Fountain cheat sheet

A help page, prerendered like the others (`/docs/fountain/`), offline: every element with its mark, its rule in one sentence, and a two-line example, in the order the bar lists them; plus title-page keys, notes, boneyard, emphasis, dual dialogue, page breaks, and Drafter's `/* drafter */` block. Opened from the bar's **?**, Help in the Drafter menu, and the palette. Written fresh from the Fountain spec (fountain.io), no text copied from other apps (clean room).

## 8. Testing

- Unit (cm-fountain): each command on empty lines, lines with text, lines already of that kind, selections, lines at the start/end of the document, after a title page, inside dual dialogue; each is one transaction and undoes in one step; natural-vs-forced rule for Character, Scene, Action, Transition.
- e2e (all projects): the bar shows on the Source pane, the current element is pressed and named, each main button writes the expected text in a small script, More's items work, ? opens the cheat sheet, Hide hides it and Settings brings it back, it's hidden in focus mode and on Markdown shows the Markdown set; phone row scrolls.
- No new axe checks (accessibility comes last), but buttons are real `<button>`s with names, keyboard reachable, and the tooltips are also the buttons' descriptions.
