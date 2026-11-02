# Classic Mode — Design

**Status:** designed 2026-11-02, the maintainer's five decisions in, planned for v0.25.0. The flow below is the one the maintainer agreed to ("yes that's it"). It comes after Self-hosting (v0.24.3) and before Novel (v0.26.0) and Production (v0.27.0). The roadmap entry is in [ROADMAP.md](ROADMAP.md), and the first decision is in [DECISIONS](DECISIONS.md), "Classic Mode".

**Asked for (maintainer), in their words:**
- 2026-11-01: "is it worth adding a final draft mode (instead of a fountain mode) for people who might be used to final draft? There's still source on the left, rendered script on the right -- but the way to type the script it would be more familiar for people who don't know fountain marks but are used to final draft."
- 2026-11-01: "please call it 'Classic Mode' … (indicate that it's not fountain -- it's what many script writers expect). Default to fountain mode but make it easy to switch to classic mode."
- 2026-11-02, on what makes it feel right: "a noticable 'classic mode' on one of the top navbars. The idea, say, that you would start to type a name, autofill the name, and then tab to the next logical screenplay part. Isn't that how final draft works? It helps out with autofill and tabbing"
- 2026-11-02: "put the mode display 'fountain' or 'classic' in the navbar so it's visible all during the screenplay creation -- and someone can switch between the two. Fountain mode to start, then maybe switch to classic mode or back again. The idea is that fountain is at the core -- but classic mode make it work and feel like final draft. Source in the left -- a rendered screen/play in the right"

**Agreed with the maintainer ("yes that's it"):**

1. Scene heading: type INT., offered places already used; pick one, then DAY/NIGHT offered. Enter goes to Action.
2. Action: Enter starts a new action line. Tab goes to Character.
3. Character: type JU, offered JUNE; Tab or Enter accepts and goes to Dialogue.
4. Dialogue: Enter goes to the next Character. Tab goes to a Parenthetical.
5. After a Parenthetical, Enter goes back to Dialogue.
6. Enter on an empty line lets you choose a different element (Transition, Scene heading…).

Headings and names capitalise themselves. The left side looks like a script, no Fountain marks showing. The file stays plain Fountain underneath. Autofill lists names and places already in the script, most recent first.

**Decided by the maintainer, 2026-11-02 ("go with your recommendations"):**

1. The mode is one app-wide setting (§3.1).
2. Tab on a name with no match goes to Dialogue; Enter after a Transition goes to Action; Tab on an empty line walks Action, Character, Transition, Scene heading (§6).
3. Notes stay in place on the left, brackets hidden, with a thin rule at each end (§8.3).
4. Names are all capitals in Classic Mode for v0.25.0; a mixed-case name is typed once in Fountain Mode, then autofill offers it (§17.2).
5. The hidden metadata block is protected in Classic Mode: Select All then Delete leaves it in place (§8.4).

**Promises this design must keep:** the file is plain Fountain, and switching never changes it. Fountain Mode is the default and doesn't change. No accounts, no server, no tracking, no network. A strong clean room. WCAG 2.2 AA. Typing stays fast at 120 pages. Plain language. Dark by default. Everything free.

Each choice made by the designer is marked **Call:**, and each the maintainer settled says **Decided**. They are all listed in §18.

## 1. Intent

Fountain asks a writer to learn a few marks and to think about blank lines. Many working writers don't want that. Their hands already know a different way: press Enter and Tab, and the app works out what comes next. Classic Mode gives them that way of typing, in the same two panes, over the same file.

**What it is:** a way of typing and a way of showing the left pane. Enter and Tab move between elements, autofill offers names and places, headings and names capitalise themselves, and the left side looks like a script.

**What it isn't:** another file format, another document kind, or a copy of any app. There's no separate save path, no conversion, and nothing about the mode in the file. Everything that reads a script (the Script pane, Outline, Cards, Scaffold, Stats, exports, the CLI, Drafter for Claude) sees the same text and needs no change.

**Who it's for:** a writer used to apps like Final Draft, who opens Drafter, sees "Classic" in the top bar, and clicks it. And a writer who starts in Fountain Mode and wants to try something else on a tired day.

**What the UI says:** "Fountain" and "Classic", and "Classic Mode" in sentences. Never "Final Draft mode", since that's a trademark. The help page may say it works the way writers of apps like Final Draft expect.

## 2. What's there to build on

The design leans on what the editor already does, so Classic Mode is a thin layer:

- **One editor, one text.** `apps/web/app/editor/session.ts` keeps one CodeMirror view for the visit. `parsedDoc` (`packages/cm-fountain/src/state.ts`) holds the parse, and every feature reads it.
- **Compartments.** `extensions.ts` already swaps features on and off without touching the text (spellcheck, typewriter, line numbers, language). `applyEditorSettings` puts them back after `load`.
- **Natural Fountain.** `elements.ts` already writes a forcing mark only where it's needed (`makeElement`), and asks the parser with `readsAsCue` and `kindWith`. `dropBarCueMark` in `input.ts` already takes a mark off in the same transaction that moves the cursor away.
- **The templates' structure.** `structureOf(template)` says whether a script has headings, transitions, acts, and stage directions, so one rule set serves both templates.
- **Completion.** `complete.ts` already offers names (nearest cue above the cursor first), places, times, transitions, extensions, and section titles.
- **What counts as a mark.** `highlight.ts` already works out every marker character on a line and gives it `cm-f-marker`.
- **The element bar and the announcer.** `ElementBar.vue` and `ElementAnnouncer.vue` already name the element the cursor is in.
- **An escape from Tab.** CodeMirror 6.43 (`InputState.keydown`) lets Tab through to the browser for two seconds after an Escape that reaches it, and `defaultKeymap` has Ctrl+M (Shift+Alt+M on a Mac), which turns that on until it is turned off. `F6` and `Mod+K` already leave the editor.

What's new: an idea of the element the cursor is in on an **empty** line (§5), the Enter and Tab rules (§6), hiding marks (§8), and the mode switch (§3).

## 3. The mode

### 3.1 One setting

A new setting, `writingMode: 'fountain' | 'classic'`, in `settings.ts`, with `'fountain'` in `DEFAULT_SETTINGS`, so a first visit is Fountain Mode.

**Decided (maintainer, 2026-11-02): the mode belongs to the app, not to each script.** It's a habit of the writer's hands, not a fact about a script. A per-script mode would have to live somewhere: in the metadata block it would change the file, which breaks the first promise, and in the browser's project row it wouldn't travel with the file, so the same script would open differently on two computers. A writer who changes mode for one script can change it back with one click.

The setting isn't stored in the file, in a draft, in a snapshot, or in an export.

### 3.2 The switch in the top bar

A control in `AppToolbar.vue`, in the row with the title, always on screen while writing:

- **On a wide screen:** a two-part segmented control reading **Fountain | Classic**, the same pattern as the Inspector's Fit · 100% (`.zoom`), with the mode in use in `--accent-soft` and `--accent-text`. Both words always show, so it's noticeable and says at a glance that there's a choice.
- **It sits right after the title and save state,** before Open, Save, and Export. **Call:** there rather than at the far right, because it's about the writing, and the far right is quiet settings like the theme.
- **Below 1024px:** one button with the current word ("Classic"). A tap switches. It's named "Writing mode: Classic. Switch to Fountain."
- **It never folds.** It stays out of `TOOLBAR_FOLD_ORDER`, like the search and Help. The title gives way first, as it already does.
- **Tooltip:** "Classic Mode: Enter and Tab move you through the script, the way many screenwriting apps work. Your file stays Fountain." and its Fountain twin: "Fountain Mode: you type the script as plain text, with Fountain's marks."
- **Semantics:** a `role="group"` named "Writing mode", with two real buttons using `aria-pressed`, as the Source's toggles do.

**In focus mode** the top bar goes, and the mode must still show ("visible all during the screenplay creation"). `FocusMarker.vue`, which already carries what the writer mustn't lose sight of, gets the same word as a small button.

**A Markdown document:** the switch isn't shown. **Call:** hidden rather than greyed, because with a Markdown document neither word is true. The setting stays, and it applies again at the next script.

### 3.3 Other ways to switch

- **Settings,** in the Writing section: a row "Writing mode" with Fountain and Classic and the line "Classic Mode is typed the way many screenwriting apps work. Your file stays Fountain."
- **The command palette:** "Switch to Classic Mode" and "Switch to Fountain Mode", each enabled only when it would do something, with the keywords `final draft`, `mode`, and `typing`, so a writer who searches for those finds it.
- **A key.** **Call: `Mod+Alt+0`,** next to the element keys `Mod+Alt+1…7`, with no clash in `commands/data.ts`. It's on the Keyboard shortcuts page from the same data.

### 3.4 What a switch does

A new compartment, `writingMode` in `extensions.ts`, holds `classic()` or nothing. A switch is one `reconfigure`, and carries no change to the text. So:

- The text, the undo history, the selection, and the Script pane are untouched, because a transaction with no changes can't alter them.
- Undo works across a switch.
- The switch keeps the cursor's line where it is on the screen (`scrollSnapshot` is by line) and returns focus to the editor.
- `load` starts the compartments over, so `applyEditorSettings` sets this one again, with the document's kind: Markdown gets nothing. `setKind` keeps the state and doesn't reset compartments, so it needs its own `writingMode.reconfigure` in the same dispatch as `language`.
- A polite notice says "Classic Mode. Enter and Tab move between elements." or "Fountain Mode. You type the marks." (`sayElement`).

The same extension object is reused, as `TYPEWRITER` is, so changing another setting doesn't rebuild it.

**Fountain Mode gains nothing and loses nothing.** With the compartment empty, none of this code is in the editor, and its keys, completion, and colours are as they were.

## 4. The file

This section is the promise, and everything else bends to it.

### 4.1 The rule

**A file written in Classic Mode is plain Fountain that a writer could have typed, key for key, in Fountain Mode. Nothing marks it as Classic. Switching mode never writes anything. Moving through a script never writes anything.**

Exactly what Classic Mode may put in the text:

| What | When |
|---|---|
| The characters the writer typed | Always. In a heading, name, or transition they arrive in capitals, in the transaction that types them, as `upperCaseTyping` already does |
| Line breaks | One between a name and its speech and inside a speech; a blank line between other elements (§6) |
| `(` and `)` | When Tab makes a Parenthetical. They print, so they aren't marks |
| ` - ` and a time | When the writer accepts a time of day (§7) |
| Two spaces | On an empty line inside a speech, made with Shift+Enter: that is Fountain's way to keep a speech together (§6.4) |
| The words of an accepted suggestion | When the writer accepts one |
| Capitals on a heading's prefix | When `int.`, `ext.`, `est.`, `i/e`, or `int./ext.` typed on the line in this stay completes a heading, the letters of the prefix already typed become capitals, in the same transaction (§4.2). The writer's words don't otherwise change |
| A forcing mark | Only as §4.2 says |

Never written: indent spaces, tabs, a mode flag, a metadata field, any other change to the case of existing text, or any change to a line the writer isn't on.

Everything uses `state.lineBreak`, so a file with CRLF stays CRLF, and a byte-order mark stays, as the element commands already do (`BOM`, `here`).

### 4.2 Forcing marks

Each line in Classic Mode has an element (§5). After every keystroke on the line, in the **same transaction**, Classic Mode asks: would the parser read this text as this element? If yes, no mark. If no, it adds the mark, which is hidden. So the file is right at every moment, including at an autosave, the Script pane never disagrees for a moment, and one undo takes the letter and its mark together. **One exception (maintainer, 2026-11-02):** a line made by Enter or Tab inside a speech, while the cursor is on it. Until a letter is typed there, the text under it reads as Action. The first letter heals that, as the line then continues the speech with one break, and leaving takes the line away (§4.4). The mode switch and the save paths should tidy such a line too (Tasks 10 and 12).

| The writer is in | And types | The parser alone reads | Written |
|---|---|---|---|
| Scene heading (chosen) | `FLASHBACK - 1987` | Action | `.FLASHBACK - 1987` |
| Scene heading | `INT. DINER - DAY` | Scene heading | as typed, no mark |
| Character (a pasted or lower-case name) | `june` | Action | `@june` |
| Character, a name in a script with no capitals | `李明` | Action | `@李明` |
| Action (chosen, or a line returned to) | `INT. BY THE DOOR` | Scene heading | `!INT. BY THE DOOR` |
| Action (chosen, or a line returned to) | `CUT TO:` | Transition | `!CUT TO:` |
| Action, any | `.45 in the drawer` | Scene heading | `!.45 in the drawer` |
| Action, any | `.FLASHBACK` | Scene heading | `!.FLASHBACK` |
| Action | `#1 fan`, `@home`, `= sign` | Section, cue, synopsis | `!#1 fan`, `!@home`, `!= sign` |
| Action, Shift+Enter pressed at the end of `BANG` | `BANG` | Character, once a line follows | `!BANG`, written by the Shift+Enter, while the cursor is still on that line |
| Transition | `FADE OUT.` | Action | `>FADE OUT.` |
| Transition | `CUT TO:` | Transition | as typed, no mark |
| Stage direction | `SMASH CUT TO:` | A transition, disabled in a play | `!SMASH CUT TO:` |
| Lyric, centered, a play's Act and Scene | anything | Needs its mark always | `~`, `>…<`, `#`, `##` |

**A line in Action stays Action.** **Call:** Character is reached by Tab or the chooser, never by typing capitals. `BANG` on an Action line stays Action and keeps its indent while it's typed, Enter gives a blank line and a new Action line, and no mark is needed, as a blank line follows it. A line that would read as a cue only because of what comes after it gets its `!` at the moment the writer makes that happen, on the line they are on: the Shift+Enter in the table, or a keystroke on a line that already has text directly under it. So a mark is never written on a line the cursor has left, and §4.1 needs no exception.

**Soft and firm.** The only thing that turns an Action line into something else is a heading's prefix or a transition's shape, and only while the line is **soft**.

- **Soft** means: the line was empty when the cursor arrived, it wasn't chosen, and the cursor hasn't left it since. It's a state of this stay, held in `classicLine` while the line is being typed, never worked out from the text.
- **On a soft line,** a heading prefix (`INT.`, `ext `, and the rest, as the parser's `HEADING` reads them) makes the line a Scene heading, with no mark, and that's how "type INT." works in the agreed flow. A line of capitals ending in `TO:` makes it a Transition, with no mark.
- **Everything else is firm,** and keeps its element with a mark: an Action the writer chose in the chooser (§9.1), the element bar, or with Tab; every other element; and **any line with text the cursor returns to**, which is plain Action however it began.
- **A line starting with a mark's character is never a shape.** `.45 in the drawer` and `.FLASHBACK` typed on Action, soft or firm, are the writer's words: a writer in Classic Mode isn't typing Fountain's marks. Each gets `!` at its second character, when the parser would first read a forced heading. For a heading that names no place, a writer chooses Scene heading and types `FLASHBACK`, which writes `.FLASHBACK` with the `.` hidden. A `.` typed in a chosen Scene heading is the same mark.

**Call: soft Action only in a template with headings.** In a stage play a stage direction is firm, since headings and transitions don't exist there.

**A mark comes off too.** A mark Classic Mode added during this stay on the line is taken off if it stops being needed: `.INT`, then `.INT.`, then `INT. ` as the prefix completes, in the same way `dropBarCueMark` takes off an `@`. Classic Mode remembers which marks it added, only while the cursor stays on the line.

**Marks it didn't write are never touched.** A mark from an opened file stays, needed or not, even when the writer edits that line. **Call:** this costs a harmless extra mark now and then, and it means Classic Mode can never change what it didn't write.

**How it asks the parser.** `kindWith` reparses the whole script, which is too much on every keystroke. Classic Mode parses only the run of lines around the cursor, the way `readsAsCue` parses one line, so the cost follows the paragraph, not the script. Line 1 is the exception, as text there can read as a title page; it uses the full parse in `parsedDoc`.

**What has no mark.** Fountain has no way to force dialogue, so a line of a speech that starts with `~` is a lyric, and a whole line in `( )` is a parenthetical. Classic Mode shows what the parser reads. Inline text isn't escaped either (§8.3).

### 4.3 A name with no speech

`JUNE` typed and left with nothing under it is action to the parser (rule 12 wants a line under a cue). **Call: no mark.** While the cursor is on the name, or on the pending Dialogue line just under it, the left pane draws a Character (§8.2). Once the cursor goes elsewhere both panes draw what the parser reads, Action, and agree. An `@` here would be added and removed every time a writer paused, and a name alone isn't a finished element.

### 4.4 An empty line left behind

Enter makes an empty line for what comes next. If the writer goes elsewhere without typing, the breaks Classic Mode made for it are taken away in the same transaction as the move, the same pattern as `dropBarCueMark`. An empty `()` that Tab made is taken away the same way when the cursor leaves it, with its line. So wandering leaves nothing behind. It applies only to the empty line or `()` made in this stay, never to blank lines that were already in the file. At the end of the file, and on an edit made by the app, it does nothing.

### 4.5 Marks already in a file

A script full of marks opens in Classic Mode with nothing changed and nothing written: every mark is simply not shown (§8). The element of each line is what the parser says. `@McGRAW` shows as `McGRAW` in the Character position. The trap and property tests in §15 hold this to the byte.

## 5. Elements

**The elements** are the ones `ELEMENT_NAMES` and the element bar already have. In a screenplay: Scene heading, Action, Character, Dialogue, Parenthetical, Transition, and in the chooser's second group Centered, Lyric, Section, Synopsis, Page break. In a stage play, following `structureOf`: Act, Scene, Stage direction, Character, Dialogue, Parenthetical, and Centered, Lyric, Synopsis, Page break. A stage play has no headings or transitions (its role map disables them).

**A line with text** has the element the parser gives it, read from `parsedDoc`, except the line the cursor is on, which has the element stored for it, and a name with a pending Dialogue under it, which stays a Character. Opened files have what the parser says. Roles for a play come from `resolveRole`, as the bar's do.

**An empty line** has a **pending element**: what the next thing typed will be. The file has nothing to say about it, so it's worked out:

- Directly under a name, a parenthetical, or a line of speech: **Dialogue**.
- Otherwise, if the nearest element above is in a speech: **Character**.
- Otherwise: **Action** (soft), or Stage direction in a play.

A state field, `classicLine`, holds only what can't be worked out: the element of the line being typed, whether it's soft (§4.2), a pending element the writer **chose** (Tab, the chooser, a bar button), the marks added this stay, the empty line or `()` made this stay, and whether autofill was dismissed there (§7.3). It's never saved. **Call: work the pending element out, and store only the exceptions.** That way a click on an empty line, an undo, or a newly opened script all behave the same, and there's little state to go wrong.

**Where a scene heading comes from.** Enter never gives a pending Scene heading. A writer types `INT.` on an Action line, or picks it in the chooser. **Call:** the agreed flow starts with "type INT.", and with a firm pending heading after a transition or at the top of a script, a writer who starts with a line of action would get it in capitals.

**A new script** starts on a soft pending Action. So does the line after a Transition, **decided** (maintainer, 2026-11-02).

**The session** gains `element`, the current element including a pending one, which the announcer, the bar, the status bar, and the phone's Next button read (`session.ts`).

## 6. Enter, Tab, and the other keys

Fountain Mode's keys in `bindings.ts` stay. Classic Mode's keymap comes first and returns false where it doesn't act.

**Call: Classic's keys sit at `Prec.highest`, ahead of `language` in the extension order,** because CodeMirror's completion keys are at that level too, inside `fountainCompletion`, which is inside `language`, and Tab must be Classic Mode's before Fountain's Tab runs. So Classic's keys run first, and **Classic's Enter returns false while a completion list is open,** which leaves Enter to CodeMirror's `acceptCompletion`. What happens after accepting belongs to the option (§7.3).

Every row below is one transaction, one undo step, with the user event `input`, which `command()` in `keymap.ts` already gives. None acts in a read-only editor, on the title page, or in a note or boneyard (`blocked`), so Tab there is given back and moves focus, as it does today.

### 6.1 A line with text, cursor at its end

| Element | Enter | Tab | Writes |
|---|---|---|---|
| Scene heading | Action | Action | a blank line |
| Action | Action | Character | a blank line |
| Character | Dialogue | Dialogue | one break |
| Parenthetical | Dialogue | Dialogue | moves past `)`, one break |
| Dialogue, last line of the speech | Character | Parenthetical | Enter: a blank line. Tab: one break and `()`, the cursor inside |
| Dialogue, an earlier line | a new line of the speech | Parenthetical | one break (a blank line here would cut the speech) |
| Transition | Action | Action | a blank line |
| Centered | Action | Action | a blank line |
| Lyric | Lyric | Dialogue in a speech, Action outside | one break |
| Section, Synopsis | Action | Action | a blank line |

**Decided (maintainer, 2026-11-02):** with no match to accept, Tab on a name goes to Dialogue, and Enter or Tab after a Transition goes to Action.

**Stage play.** The same, with Stage direction for Action, and:

| Element | Enter | Tab | Writes |
|---|---|---|---|
| Act | Scene | Scene | a blank line; Scene is firm |
| Scene | Stage direction | Stage direction | a blank line |
| Stage direction | Stage direction | Character | a blank line |

**An element already below.** New text always gets one blank line above and below, wherever one is needed, and a key never adds a second. On a name that already has a speech, Enter and Tab go into the speech and write nothing (as `dialogue` does).

### 6.2 An empty line

| Pending | Enter | Tab | Shift+Tab |
|---|---|---|---|
| Action, Character, Transition, Scene heading | Opens the chooser (§9.1) | Next in the row Action → Character → Transition → Scene heading → Action | Back along the row |
| Dialogue | Opens the chooser | Parenthetical: writes `()`, the cursor inside | Back to the end of the name, removing the empty line |
| An empty Parenthetical `()` | Removes `()`, back to pending Dialogue | The same | The same |

In a play the row is Stage direction → Character → Act → Scene → Stage direction. **Decided (maintainer, 2026-11-02): Tab walks a row of elements on an empty line.** It writes nothing, the element shows in the chip, and it's a quick way to reach Transition without opening the chooser.

### 6.3 The cursor mid-line, and selections

| Case | Enter | Tab |
|---|---|---|
| Action | Splits into two action paragraphs | As at the end of the line: a new Character below, with no split |
| Dialogue | Splits, one break, the same speech | Parenthetical below the line, with no split |
| Scene heading or Transition | Splits; the second part is Action | As at the end of the line |
| Character | The rest of the line becomes Dialogue | Dialogue |
| Parenthetical | Past the `)`, then Dialogue | The same |

**Call: Tab never splits a line.** Tab means "what comes next", so it acts as it does at the end of the line, wherever the cursor is.

**With a selection:** Enter replaces it with one break, as `fountainEnter` does. Tab collapses it to its end and writes nothing; the next Tab moves on. **Several cursors:** Classic Mode's keys stand back, and Fountain's Enter applies, as there's no one element to reason about.

### 6.4 Other keys

- **Shift+Tab, on a line with text:** the cursor goes to the end of the element above, and nothing is written. On an empty line, §6.2.
- **Shift+Enter:** **Call:** a line break inside the element: one break in Action or Dialogue. On an empty line in a speech it writes two spaces, so the speech holds together as Fountain requires (`cursor.ts`). In other elements it does what Enter does.
- **Backspace at the visible start of a line with text:** joins the line to the element above, taking away the blank line, the break, and any hidden mark of that line in one step. **Call:** one press, since the writer sees one join.
- **Backspace on an empty line:** removes it and goes to the end of the element above, the blank line with it. It undoes Enter.
- **Backspace in an empty `()`:** removes both parentheses. Pending Dialogue.
- **Delete at the end of a line:** the same join, from the other side.
- **A delete that would take one half of a hidden pair, or a hidden mark with text left on the line, leaves the mark.** `Alt+Backspace` and `Cmd+Backspace` delete the words the writer sees. Backspace just after a hidden `**` takes the last letter inside it, and an emptied pair goes with its last letter. A selection deleted across one half of a pair does what it does in Fountain Mode, and the half left over shows as text (§8.1).
- **Typing `)` just before a `)`:** moves past it.
- **The arrows:** Left and Right step over hidden marks as one position (§8.1), and reaching a line's end goes on to the next element's start. Up and Down move through the lines the writer sees, and **a blank line between two elements is passed over**, as the space on a page isn't a place to stand. An extra blank line, or the empty line the writer just made, is a place to stand.
- **Home:** the start of the visible text, after any hidden mark. **End:** the end of the text, before a hidden closing mark. **`Mod+End`:** the end of the last element, before the metadata block (§8.3).
- **A click** on a passed-over blank line puts the cursor at the end of the element above.
- **`Ctrl+Space`:** asks for autofill, as it does today.
- **`Mod+Alt+1…7`,** `Mod+Shift+D`, `Mod+/`, and `Mod+Shift+/` keep working (§9.2).

Arrows, Home, End, clicks, and `goto` and `reveal` all run through one rule: a transaction filter on selection changes, `classicCaret`, which moves a lone cursor that lands inside or just before a hidden mark, or on a passed-over blank line, to the right place, in the direction it was travelling. The filter is the only code that knows these places. Extending a selection isn't moved.

## 7. Autofill

Autofill is the existing completion list, `fountainCompletionSource`, told by Classic Mode which element the line is. In Fountain Mode it stays as it is.

### 7.1 What's offered

| Where | Offered | Order |
|---|---|---|
| Scene heading, at the start | `INT.`, `EXT.`, `INT./EXT.`, `EST.`, `I/E` | That order |
| After the prefix | Places in the script | **Most recent above the cursor first** |
| After a place | Times of day: those used in the script, then `DAY`, `NIGHT`, `CONTINUOUS`, `LATER`, `MOMENTS LATER` | Most used first, as `times` does |
| Character | Names in the script | Most recent above the cursor first, as `names` already does |
| Character, after a name and a space, or after `(` | Extensions in use, then `(V.O.)`, `(O.S.)` | Most used first |
| Transition | Those in the script, then `CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`, `FADE OUT.` | Most used first |
| A play's Scene | Section titles in use | Script order |

Names and places are read from `parsedDoc` without the cursor's own line (`withoutLine`), so the text being typed is never offered back. Names with lower case are offered in Classic Mode, since Classic Mode writes the `@` they need. Nothing comes from outside the script.

**Places get most-recent order in Classic Mode only.** `places` today puts the most used first, which is right for Fountain Mode, and Fountain Mode doesn't change. **Call:** the maintainer's rule is "most recent first"; the same walk `names` uses does it.

**`(CONT'D)` isn't offered,** as the layout adds it for a speaker who continues (`dialogueSplit.contdAfterAction`, `paginate.ts`). A writer may type it; Fountain lets them, and it's their text.

**The extensions are reached by typing.** Fountain Mode's Tab cycle on a name (`cycleExtension`) can't stay, as Tab means "go on" here. **Call:** typing a space after a name offers extensions, and so does `(`.

### 7.2 When it opens

**Call: from the first letter in Character, Scene heading, and Transition,** where Fountain Mode waits for two, because a writer in these elements is always asking for this. It doesn't open on an empty line, since Enter there means the chooser. `Ctrl+Space` opens it anywhere.

### 7.3 Accepting and dismissing

- **Enter or Tab** accepts the highlighted suggestion. Up and Down move in the list. CodeMirror binds Enter already; Classic Mode adds Tab.
- **Fast typing gets the same answer.** `JU` and Tab must give `JUNE`, even when the list hasn't drawn yet: CodeMirror waits `activateOnTypingDelay` (100 ms) before it opens one. So on Tab or Enter, with no list open, where a list would be offered, Classic Mode asks the same source for the same ranked options and accepts the top one itself, in the key's own transaction. With no match it just moves on. Fountain Mode's delays, and CodeMirror's settings, don't change. **Autofill dismissed with Escape stays dismissed** until the next letter, so a writer who wants `JO` can have it.
- **On a name:** accepting goes straight to Dialogue, in one transaction and one undo step ("Tab or Enter accepts and goes to Dialogue").
- **On a place:** accepting writes the place, and the list of times opens. **Call: the ` - ` isn't written until a time is accepted.** The times list is offered at the end of the line, and accepting `NIGHT` writes ` - NIGHT`. Escape leaves `INT. KITCHEN` with no dash trailing. Typing ` - ` by hand also works, as today.
- **On a time:** accepting goes straight to Action. There's nothing left to do on the line, so a second Enter would be wasted.
- **On a prefix:** accepting writes `INT. ` and offers places.
- **On an extension or transition:** accepting writes it and stays on the line, for an extension, or goes to Action, for a transition.
- **Escape** closes the list and writes nothing. The next Enter or Tab acts as in §6, with the typed text as it stands. With a list open, that Escape is the list's, and it doesn't arm Tab (§12).
- **If the typed text is already a label,** there's no list, as today (`optionsAfter`): `JO` with `JOHN` in the script offers `JOHN`, and a writer who wants `JO` presses Escape. `JOHN` typed in full goes on with Enter.
- Typing goes on narrowing the list. A click accepts. Left, Right, or moving away closes it.

### 7.4 Screen readers

CodeMirror already gives the list `role="listbox"`, and the editor `aria-autocomplete`, `aria-controls`, and `aria-activedescendant`. Not every reader follows an active descendant inside a text box, so the live region also says it, once when the list opens ("3 suggestions: JUNE") and as the highlight moves. Accepting says what happened in the element's own words ("JUNE. Dialogue.").

## 8. The left pane

### 8.1 Hiding marks

**Call: decorations only, never a change to the text.** `Decoration.replace` takes a mark out of the drawn line and the same set goes to `EditorView.atomicRanges`, so the cursor steps over it as one position. The marks aren't in the DOM, so a screen reader doesn't read them, and nothing about them is copied into the document. Copying still gives the true text with its marks (§11).

- **The set:** what `decorateLine` already finds as `cm-f-marker`, plus the opening and closing of notes and boneyard. `cm-f-marker` is split so highlighting and hiding read one list, with scene numbers as a kind of their own that isn't hidden (§8.3). Hiding is done for the visible ranges only, as highlighting is.
- **The metadata block is the exception.** It can span lines, and CodeMirror refuses a multi-line or block replace from a view plugin, so a small `StateField` provides that one decoration. Everything else stays in the view plugin.
- **The cursor never sits before a leading hidden mark.** `classicCaret` (§6.4) moves it after, so typing can't land in front of a `@` and turn it into text.
- **A mark that doesn't pair isn't hidden.** An unclosed `/*`, a stray `**`: the parser doesn't read these as marks, and Classic Mode shows what the parser reads, as text. **Call:** better a visible oddity the writer can fix than hidden text that changes the page, and an unclosed boneyard must be seen or the rest of the script looks cut for no reason.
- **Search:** finds the true text, marks included. A match on a hidden mark selects it, with nothing to see. **Call:** a small cost, left as it is for this release.

### 8.2 Looking like a script

**The left pane uses Courier Prime and the template's own numbers,** read from `template.roles`, so a template is the one source for both panes.

| Role | Screenplay indent, width (characters) | Stage play |
|---|---|---|
| Scene heading | 0, 60, bold | |
| Action or Stage direction | 0, 60 | 10, 50, italic |
| Character | 22, 33 | centered |
| Parenthetical | 16, 25 | 10, 40, italic |
| Dialogue | 10, 35 | 0, 60 |
| Transition | 40, 20, right aligned | |
| Lyric | 10, 35, italic | 10, 50, italic |
| Centered | centered | centered |
| Act, Scene | | centered, Act in capitals on the screen |

- **What is drawn:** the stored element on the line the cursor is on (§5), and what the parser reads everywhere else. **Call:** so typing `BANG` on Action never jumps to the Character indent, and an opened file draws exactly what the parser says.
- **How:** a line decoration per element, `cm-c-character` and so on, with `padding-left` and a `max-width` in `ch`, set from the template as CSS variables on the editor. No character is added to the text.
- **Narrow panes.** The indents shrink with the pane, `min(<indent>ch, <share of the width>)`, so nothing scrolls sideways, down to a 320px phone (WCAG 1.4.10). **Call:** the left pane's lines match the page's when the pane is at least 60 characters wide, and aren't promised to when it's narrower. The Script pane stays the true page.
- **Blank lines stay.** They're the space on the page, so the left pane reads like one. A second blank before a scene heading isn't drawn; a small margin stands for it.
- **Colour.** **Call: no colour per element.** Text in `--text`, headings bold. The script reads as a script. Notes and boneyard keep their colours, so they can't be mistaken for what prints. `--bg` and the dark default stay; the left pane doesn't turn into paper.
- **Focus bar and current line:** as they are. The theme's `inset` bar is on `.cm-line`, so it isn't moved by the indent.
- **Line numbers and fold gutter:** as they are, if the writer has them on.

### 8.3 Everything that isn't an element of the page

| Item | In Classic Mode | Enter and Tab there |
|---|---|---|
| **Title page** | Shown as it is, `Title: Signal Hill`, with its keys in `--title`. It's a form of keys, and there's nothing to hide | Fountain's Enter; Tab moves focus. The chip says "Title page" |
| **Note** `[[ ]]` | Brackets hidden. The words stay in place in `--note` italics with a thin rule at each end, so a reader can see where it starts and stops. **Decided (maintainer, 2026-11-02):** kept inline, not moved to a margin, so nothing about the page's position is invented | The note is the writer's own: Enter is a plain break, Tab moves focus |
| **Setup and payoff** `[[Setup: x]]` | The same; `Setup:` stays visible, since it's the note's words | The same |
| **Boneyard** `/* */` | Delimiters hidden, struck through, as now | The same as a note |
| **Unclosed boneyard** | The opening `/*` stays visible (§8.1) | The same |
| **Metadata block** `/* drafter … */` | Not shown at all, through its `StateField` (§8.1). The cursor stops before it. It's the app's data, and a Classic writer has no use for it | Not reachable, and protected (§8.4). The writer's new text always lands above it, so the block stays last, which `readMeta` needs |
| **Section** `#` | `#` hidden; depth shown by size and weight | Chooser's second group; Enter goes to Action |
| **Synopsis** `=` | `=` hidden, `--muted` italics | Chooser's second group; Enter goes to Action |
| **Page break** `===` | A thin rule with the words "Page break". Atomic, so one Backspace removes it | |
| **Centered** `> <` | Marks hidden, centered | |
| **Lyric** `~` | `~` hidden, italics | |
| **Scene number** `#12#` | Stays visible in `--muted`, as written, and editable. It's a production number the writer needs to see, and it isn't in the hidden set (§8.1) | |
| **Dual dialogue** `^` | `^` replaced by a small tag, "dual", on the name, not in the text. `Mod+Shift+D` toggles it | |
| **Emphasis** `**`, `*`, `_` | Marks hidden; bold, italics, underline shown. The bar and palette add them | |
| **Escapes** `\*` | The backslash hidden | |
| **Typed marks** | **Call:** in-line marks aren't refused. A writer who types `[[a note]]`, `/*`, or `*word*` gets what Fountain makes of them. Only marks at the start of a line (§4.2) are made safe. Classic Mode doesn't add `\` escapes; a lone `*` shows, and two may read as italics, as the help page says | |

### 8.4 Protecting the metadata block

**Decided (maintainer, 2026-11-02): Select All then Delete leaves the block in place.** A writer who can't see the block can't be expected to know it holds the script's template and settings, and losing it would turn a stage play into a screenplay. The protected range runs from the line breaks just before the block to the block's end, for the block `parse` reads as `doc.meta`. `existingBlock` in `meta.ts` already finds it, and gets exported. A damaged block isn't `doc.meta`, so it shows as an ordinary boneyard and isn't protected. There are two layers, and both are in `classic()`, so Fountain Mode doesn't change:

- **The selection stops above it.** `classicCaret` also clamps both ends of every selection to the start of the protected range. **Call:** this does most of the work, since Select All, Shift+`Mod+End`, and a drag then never hold the block, and an input method never needs its text rewritten.
- **A filter keeps the range, as a backstop.** `keepMetadata`, a transaction filter, cuts any writer's change that overlaps the range back to the part above it, keeping what it inserts, the selection, and the user event. It stands back for `undo`, `redo`, `appChange`, transactions with no user event, and `input.type.compose`, as a composition must not be rewritten (§10). So `setMeta`, a template change, Revert to Saved, and a module's change all still work.

| Writer does | Result |
|---|---|
| Select All, Delete | The script's text goes; the block stays, with an empty line above it for the cursor. The template holds |
| Undo after that | One step brings the text back, byte for byte. The block was never touched |
| Select All, Cut | The clipboard has the text without the block, and the text goes; the block stays |
| Select All, Copy | The text without the block. To carry a whole file, Save As does that (§11, Copy) |
| Select All, paste | The pasted text replaces the text; the block stays below it, with the paste's blank line |
| Paste over all of text that ends in its own metadata block | Paste is what was copied, so it goes in; the kept block stays last and wins, and the pasted one shows as a boneyard the writer can delete. **Call:** rare, and nothing is lost |
| Select All, type | The first letter replaces the text, above the block |
| Switch to Fountain Mode | The block shows as it always has, and there it can be selected and deleted |

## 9. The chooser, the element bar, and teaching

### 9.1 The chooser

Enter on an empty line opens a small list at the cursor, "Choose an element":

- **Screenplay:** Action, Scene heading, Character, Transition, then Centered, Lyric, Section, Synopsis, Page break. Dialogue and Parenthetical are added when the line is in a speech.
- **Stage play:** Stage direction, Act, Scene, Character, then Centered, Lyric, Synopsis, Page break, with the same additions.

Up and Down move, and Enter picks. Each item also has one underlined letter that picks it at once: **A**ction, **S**cene heading, **C**haracter, **T**ransition, c**E**ntered, **L**yric, sect**I**on, s**Y**nopsis, page **B**reak, **D**ialogue, **P**arenthetical. In a play, **S**tage direction, **A**ct, sce**N**e. Escape closes it, and the line stays as it was. A click or tap picks.

**Call: a list of its own, not the completion list.** The completion list filters on text in the document, and nothing here should go in the document: the file stays exactly as it was until the writer types. It's a CodeMirror tooltip with its own keys while open, with `role="listbox"` and `aria-activedescendant` in the pattern completion uses. Picking writes nothing but the choice in `classicLine`, except Page break and any element a chooser pick must set apart. Choosing Action makes it firm.

### 9.2 The element bar

The bar stays in both modes. In Classic Mode:

- **The chip names the element,** a pending one included ("Character"), and its button is pressed.
- **Tooltips lose their marks.** The `Mark:` line is left out and the sentence is one that doesn't teach Fountain, from a new `classicTip` beside `tip` in `element-bar.ts`: "Character. The name above a speech. Tab goes here from Action." **Call:** a writer in Classic Mode asked not to learn marks.
- **On an empty line, a button sets the pending element** and writes nothing, the same as the chooser. It doesn't write `INT. ` or `@`, as `makeElement` does in Fountain Mode.
- **On a line with text, a button runs `makeElement`,** unchanged, and that's how a line changes element. `Mod+Alt+1…7` run the same commands.
- **The chip and `?` open the Classic Mode help,** not the Fountain cheat sheet.
- **Setting off:** the bar can be hidden in Classic Mode as today, as Enter, Tab, and the chooser do its work. The phone's exception is in §10.

### 9.3 Teaching

- **A first-run hint.** The first time Classic Mode is turned on, a small card under the top bar, which stays until dismissed: "Classic Mode. Press Enter and Tab to move through the script, and Enter on an empty line to choose an element. Your file stays Fountain. To leave the text, press Esc, then Tab; if a list is open, press Esc twice." with Got it and Learn more. It's stored as `classicHintSeen` in the settings, so it isn't shown again. It takes no focus, and it reaches a screen reader through a polite live region.
- **A key line in the status bar.** While the cursor is in Classic Mode, on a wide screen: "Enter: Character · Tab: Parenthetical". It changes with the element, never with each letter. **Call:** always on, in `--muted`. It's the quietest possible teacher, and it answers "what does Tab do here?" at the moment of asking. It isn't a live region, since the keys would talk over the writer; a screen reader gets it through the chip's description.
- **The tour:** one step on the switch, with `data-tour="mode"`. **Call: `TOUR_VERSION` stays,** so people who've seen the tour don't see it again for one step. The What's new banner tells them.
- **Guided starters** stay as they are. Their notes teach the element bar's buttons, which are still there.

## 10. Phones

An on-screen keyboard has Enter and no Tab. Everything in §6 must be reachable without one.

- **A Next button** at the start of the element row, which `SourcePane.vue` already puts on top of the keyboard. It does what Tab does, and it says where it goes: "Next: Character". It's at least 44px wide and takes no focus (`@mousedown.prevent`, as the bar's buttons do), so the keyboard stays up. **Call:** a button that names its destination, since there's no key to learn and no room for a key line.
- **The row shows in Classic Mode on a phone with the keyboard up, whatever the Element bar setting,** and in focus mode, because without it there is no Tab. The row is otherwise as it is, and folds into More as it does today.
- **Enter on an empty line** opens the chooser, with rows at least 44px tall, above the keyboard.
- **Autofill** shows as today, and a tap accepts and moves on, as Tab does.
- **Backspace** is the keyboard's. CodeMirror already reads it from the page's changes on Android, and §6.4 applies.

**Input methods.** Android keyboards, and input methods for Chinese, Japanese, and Korean, type through a composition. The editor must not change text during one: `upperCaseTyping` already steps back for `input.type.compose`, and `session.ts` explains how a dispatch mid-composition loses text. So on Android, Fountain's capitalising doesn't reach a word until later. For Classic Mode:

- During a composition, the Character, Scene heading, and Transition lines show in capitals by CSS (`text-transform: uppercase`), so a writer sees what they expect.
- **When the composition ends,** in a task after it (as `relint` does, with its check for a composition abandoned), Classic Mode capitalises what was typed and adds any needed mark in one transaction.
- Enter and the Next button during a composition wait for it to end. Autofill is offered from the composed text once it's in the document.

This is the riskiest part of the design and is tested on a real Android phone (§15.5).

## 11. Paste, open, and the rest of the app

- **Paste is what was copied.** Text goes in verbatim, with no capitals added, as `upperCaseTyping` leaves a paste alone. **Call: the parser reads a multi-line paste, and Classic Mode adds no marks to it.** A Fountain script pasted in comes out as Fountain, in the right elements, with its own marks. A one-line paste into a line takes that line's element, and gets a mark only if the line needs one, as in §4.2: pasted `june` on a Character line is `@june`.
- **A paste gets the blank lines it needs,** around it, as the rule in §6.1 gives new text, so it can't run into a neighbour.
- **Copy and Cut give the true text,** marks and all, and only the metadata block stays out, as a selection can't hold it (§8.4), so a selection pasted into Fountain Mode, or another Drafter tab, is the same script. **Call:** a selection copied to another program keeps its marks too. A "copy as plain script" is for later.
- **Drag and drop of text:** as paste. A dropped file opens, as it does today.
- **Opening a script:** §4.5. Every entry point is unchanged. FDX, Highland, and Fade In import to Fountain text as before.
- **Find and Replace:** a replacement is `input.replace`, which Classic Mode's filters leave alone. A replacement can leave a line that reads differently, as it can in Fountain Mode.
- **Undo and redo:** Classic Mode's filters step back for `undo` and `redo`, and for `appChange` and transactions with no user event. So the Outline moving a scene, a module, Revert to Saved, and a cut put back are never settled, marked, or tidied.
- **Spelling:** unchanged. Marks are ranges in the text, and they don't care about hidden characters. A hidden mark is never a word.
- **Problems and lint:** unchanged, and on the same text. A problem may name a mark the writer can't see. **Call:** left for this release; Classic-written text doesn't raise them, and §15 tests that.
- **Outline, Cards, Scaffold, Stats, Structure strip, Notes, Story map:** unchanged, since they read `parsedDoc`. A click that goes to a line (`goto`, `reveal`) goes through `classicCaret`, so it never lands inside a hidden mark.
- **Scroll sync, folding, typewriter:** unchanged. Scroll sync speaks in offsets and line blocks. Classic's cursor moves that write nothing carry the `select` user event and a `navigated` check, so `centersOn` needs to know about them, or Tab across a line won't centre in typewriter scrolling.
- **Compare, History, Drafts and Cuts, recovery:** unchanged. They see the text.
- **Read-only** and frozen drafts: marks stay hidden and the look stays, since these are decorations. Keys are given back, so Tab moves focus.
- **Markdown documents:** Classic Mode isn't offered (§3.2). `applyEditorSettings` passes the kind, and a Markdown document gets nothing, whatever the setting. A later novel in Markdown is Novel's design (v0.26.0), not this one.

## 12. Accessibility

Classic Mode meets WCAG 2.2 AA in both themes, and it's tested the way the rest of the app is (§15.4).

- **Tab has an escape (WCAG 2.1.2).** Fountain Mode's rule is that a Tab with no meaning is given back. In Classic Mode Tab nearly always has a meaning, so a keyboard user needs a way out, and has four:
  - **Esc, then Tab** (or Shift+Tab) moves focus within two seconds. This is CodeMirror's own behaviour. **With a list open, it's Esc, Esc, Tab:** the first Esc is taken by the list (CodeMirror's plugin handlers run first), and the second arms Tab. Classic Mode doesn't call `setTabFocusMode` to shorten this. **In focus mode** a plain Esc also leaves focus mode (`onEscape` in `pages/index.vue`, when nothing else used the key), so Tab then moves focus in the full layout.
  - **Ctrl+M** (Shift+Alt+M on a Mac), CodeMirror's own key, makes Tab move focus until it's pressed again, for a writer who needs longer than two seconds. The help page lists it, and the §6 Tab keys don't run while it's on.
  - **F6** moves to the Inspector, on a wide screen and outside focus mode.
  - **`Mod+K`** opens the palette anywhere.

  WCAG asks that a user be told when the way out isn't a plain Tab. **So the text box describes it:** `aria-describedby` on the editor gives "To leave the text, press Escape, then Tab. If a list is open, press Escape twice." in Classic Mode, and the first-run hint and help page say the same.
- **The editor's name** is "Source, Classic Mode", so the mode is heard on entering it.
- **The current element is announced.** `ElementAnnouncer.vue` reads `session.element`, not `cursor`, so it says a pending element where today a blank line says nothing. Every Enter and Tab says where it went, even Action to Action, by resetting the live region so that the same word is spoken again. An arrow onto another line speaks only when the element changes, as it does today, so reading isn't a stream of words.
- **The chooser and the list** are `role="listbox"` with an active descendant, and they speak through the live region too (§7.4). Their open state is on the text box.
- **The mode switch** is two named buttons with `aria-pressed`, a real tab stop in the top bar. The change is announced.
- **Hidden marks** aren't in the DOM, and the arrows skip them, so a screen reader reads what a sighted writer sees. Indents are CSS and aren't read out.
- **Contrast.** All colours are existing tokens, which the axe tests hold at AA in both themes. New pairings to check: `--note` and `--muted` on `--current-line`, the note's rule, and the status bar's key line. A rule on a note is at least 3:1 (WCAG 1.4.11).
- **Forced colours.** The `.cm-revealed` pattern applies: a note's rule and the page-break line use system colours (`CanvasText`), and the pressed mode has a border.
- **Colour alone** never carries meaning: notes are italic with rules, and a boneyard is struck through.
- **Reduced motion.** Nothing in Classic Mode moves. The list, chooser, hint, and switch have no transitions, in any setting, and the left pane changes at once. The rule is kept by not adding any.
- **Reflow and zoom.** §8.2's indents shrink. The text size setting scales through `--text-scale`, and `ch` follows.
- **NVDA and VoiceOver.** The automated tests are not proof of how it sounds. Classic Mode goes in the final NVDA and VoiceOver pass that Phase 2 ends with, on the maintainer's PC, with a line on the checklist for each of: the pending element, the chooser, autofill, and leaving the text.

## 13. Performance and security

**Performance.** The budgets stand: parsing a 200 KB script in under 5 ms (`pnpm bench`), and "typing never stutters, even in a 120-page script" (Phase 1 design). What Classic Mode adds per keystroke:

- **No second parse of the script.** Everything reads `parsedDoc`. The needed-mark check parses one paragraph (§4.2).
- **Decorations for the visible ranges only,** as highlighting does, built from the same walk, so hiding marks doesn't add a second pass over the parse.
- **`classicCaret`** is one line lookup and one block search (`blockAt`, a binary search).
- **Autofill** reads names and places while a list is open, as it does today. Most-recent order for places is one walk of the blocks above the cursor, as `names` does, and only while the list is open.
- **New budget:** with Classic Mode on, a keystroke on line 3,000 of the 120-page script makes no long task (over 50 ms), with the same test as "typing with the Stats tab shown" in `cast-budget.spec.ts`. Classic Mode adds under 1 ms a keystroke at p95, measured against Fountain Mode. A switch of mode at 120 pages finishes within one frame's worth of main-thread work, plus CodeMirror's measure.

**Height of the text.** Different indents change how lines wrap, and CodeMirror estimates the height of lines off screen. It re-measures as they come in, as it already does with wrapping. Scrolling is tested at 120 pages for jumps. A switch keeps the cursor's line in place by the scroll snapshot.

**Security.** Classic Mode opens no network connection, and it reads no file. Everything it offers comes from the open script. Text from a script reaches the left pane only as CodeMirror's text nodes: suggestions are `Completion.label`, and tags and widgets are the app's fixed words. **No script text goes in `innerHTML`, a CSS value, or an attribute built by hand.** Indents come from the template's validated numbers, and those numbers are checked as numbers before they go in a CSS variable. The patterns in new code are anchored and linear, and `complexity.test.ts` covers them with the hostile scripts it already has.

## 14. Where the code goes

- **`packages/cm-fountain/src/classic/`**, a new folder, exported as `classic(options)`:
  - `line.ts`: `classicLine`, `elementAt(state)`, and the pending-element rule (§5).
  - `keys.ts`: the tables of §6, as pure `StateCommand`s through `command()`.
  - `marks.ts`: the needed-mark check and its transaction filter (§4.2), capitals by element, and the tidying of §4.4.
  - `caret.ts`: `classicCaret` (§6.4) and the delete rules.
  - `view.ts`: the decorations, atomic ranges, and line classes (§8).
  - `chooser.ts`: §9.1.
- **`complete.ts`** gains one branch for Classic Mode, reading a facet that `classic()` provides. With no facet, every path is as it was.
- **`highlight.ts`** exposes the marker list it already works out; its output doesn't change.
- **`apps/web/app/editor/`:** `extensions.ts` (the compartment), `apply-settings.ts`, `session.ts` (`element`), `theme.ts` (`.cm-c-*`), `element-bar.ts` (`classicTip`), `typewriter.ts` (§11).
- **`apps/web/app/components/`:** a new `ModeSwitch.vue`, used in `AppToolbar.vue` and `FocusMarker.vue`; `ElementBar.vue`, `ElementAnnouncer.vue`, `AppStatusBar.vue`, `SettingsDialog.vue`, `SourcePane.vue`, and a hint card.
- **`settings.ts`:** `writingMode`, `classicHintSeen`, and their `isValid` rules. **`commands/data.ts` and `builtin.ts`:** the commands.

No new dependency. `@codemirror/autocomplete` and `@codemirror/view` are already there.

**Call: the logic stays in `cm-fountain`,** as pure commands over `EditorState` where it can, as the element bar's are, so that the byte tests in §15 can run with no browser.

## 15. Tests

### 15.1 The byte promise

- **A model test.** An oracle written apart from the code, `fountainOf(elements)`, turns a list of elements (kind and words) into canonical Fountain by the spec's rules. Fast-check generates element lists, a test drives the Classic commands key by key (Enter, Tab, typing, accepting), and the document must equal the oracle's output, byte for byte, and parse back to the same elements. Words come with the awkward starts: `.45`, `@home`, `#1`, `INT. `, all capitals, `CUT TO:`, `~`, no-case scripts, and emoji across the surrogate pair.
- **A second property: Classic only adds what it may.** Any key sequence, on any script: the text afterwards, with the writer's inserted characters removed, differs from the text before only by the items in §4.1's table. A diff checker in the test enforces it, and it allows one change to existing text: the letters of a heading prefix typed in this stay changing to capitals, and nothing else about them.
- **Moving writes nothing.** On every script in `fixtures/classification`, the samples, and the generators: arrows, Home, End, `Mod+End`, clicks at random, and Page keys. The document is unchanged. **Tidying is the one allowed change,** and it only takes back what the same test made.
- **Switching writes nothing.** Any state, any number of switches: `doc.eq`, no `docChanged` transaction, the selection the same, `undoDepth` the same.
- **Undo.** The history groups a run of typing, so a step may hold several letters. **A letter and its mark are never split:** no undo or redo stops between them, or leaves a mark with no letter. Enter, Tab, and an accepted suggestion are a step each, and undoing one gives back the exact text before it, as does a test that types with spaced time, so that each letter is its own step. Undo across a switch works.
- **Action stays Action.** Words in capitals on Action never become a cue, by any key sequence, and a line that the parser would read as a cue only because of the line below always has its `!`.
- **Tidying.** An empty line or `()` made and left is gone; one that was in the file stays.
- **The metadata block stays.** Any key sequence on a script with a block, in Classic Mode, Select All with Delete, Cut, paste, and typing included: the block's bytes are the same and it is still the last block, so `doc.meta` is equal. Undo after each gives back the text before it. `setMeta`, undo, and a change with `appChange` still pass the filter. With Classic Mode off, Select All then Delete removes the block, as it does today, which proves Fountain Mode didn't move. A damaged block isn't protected.
- **Marks kept.** A script with a mark on every line, edited on one line, keeps every other line's bytes. Line endings: CRLF files stay CRLF. A byte-order mark stays.
- **What Fountain Mode does.** The whole existing `cm-fountain` suite runs unchanged, with Classic Mode off, and proves Fountain Mode didn't move.

### 15.2 Trap documents

A new entry point, **`classic`**, in `fixtures/trap/entry-points.ts`: "A hostile script open in Classic Mode: the left pane drawn, the cursor walked through every line, and a mode switched." Its harness (`packages/cm-fountain/test/`, in a real `EditorView` under jsdom) runs **every trap that reaches Fountain text**, and checks: the text is byte-identical afterwards, nothing throws, and every call ends within its time. It adds traps of its own to `traps.ts`, and to [MANIFEST.md](../fixtures/trap/MANIFEST.md):

- a script of nothing but marks, a line of `@@@@`, `!!!!`, `>>><<<`;
- unclosed `/*` at line 1, unclosed `[[`, a boneyard inside a note, a note across lines;
- a metadata block that's damaged, not last, or two of them;
- a 100,000-character line, a 5 MB script, a heading of 50,000 spaces, 100,000 forced marks;
- bidirectional override characters and combining marks on a hidden mark's edge;
- a name made to be a list-breaker, `<img src=x onerror=…>`, in a cue and in a place, which must show as text in the list.

### 15.3 Units

`packages/cm-fountain/test/classic/`: every row of every table in §6 for both templates, as text before and after with the cursor marked; each row of §4.2's table; §7's offers, order, and accepts, in the style of `complete.test.ts`; `classicCaret` in each case; §8's marks; and complexity in the style of `keymap.complexity.test.ts`. `apps/web/test`: the settings' default is `fountain`, an invalid row is refused, the commands are enabled correctly, and tooltips contain no mark.

### 15.4 The browser

`apps/web/e2e/classic.spec.ts`, in every project:

- The agreed flow, from a blank script, key by key, then the file compared.
- The switch: visible in the top bar at 1280, 1024, 800, and 320px; never folded; in focus mode; absent in Markdown.
- A first visit is Fountain. A reload keeps the choice.
- Settings, palette, and key all switch; the file doesn't change.
- Esc, Tab and Esc, Shift+Tab leave the editor; with a list open, one Esc doesn't and Esc, Esc, Tab does; in focus mode Esc also leaves focus mode; Ctrl+M; F6.
- `JU` and Tab typed with no wait gives `JUNE` and Dialogue, with Enter too; a name with no match moves on; `JO` after Escape stays `JO`.
- Select All, Delete, on a stage play with a metadata block: the template holds, and Undo restores the text. Cut and paste over all, the same.
- `int.` becomes `INT.`; `BANG` on Action stays at the Action indent, and Enter gives a new Action.
- Added to `a11y.spec.ts`: axe with Classic Mode on, in dark and light, with the list, chooser, and hint open.
- Added to `keyboard.spec.ts`: no trap, walked by Tab.
- Added to `phone.spec.ts`: the Next button, the row, the chooser. `composition.spec.ts`: names and heading capitals after a composition; text not lost at Enter.
- `forced-colors` and `prefers-reduced-motion` emulated.
- A long script: `long-script.ts` at 120 pages, the budget of §13.

### 15.5 By hand

A real Android phone and an iPhone, an IME in Japanese, and NVDA and VoiceOver, each before the release or, for the readers, in the final pass (§12).

## 16. Docs, What's new, the image

- **A help page, "Classic Mode"** (`apps/web/app/pages/docs/classic-mode.vue`, in `HELP_PAGES`), prerendered and offline: what it is, in a sentence ("It isn't Fountain typing; it's what many script writers expect, and your file stays Fountain"); how to switch; the §6 tables in plain words, with the first-time flow; autofill; the chooser; leaving the text, in the §12 words, Esc twice with a list open; phones; what's hidden and why it's safe; and "Is my file still Fountain? Yes." The trademark line, as the Drafter for Claude page has its own: Final Draft is a trademark of its owner, and Drafter isn't connected with it.
- **Keyboard shortcuts** (`docs/shortcuts.vue`): a Classic Mode section.
- **The Fountain cheat sheet:** one line at the top: "Don't want to learn marks? Try Classic Mode."
- **What is Drafter** and the tour's welcome: a sentence each. "Fountain-first" stays true, with Classic Mode beside it.
- **What's new** (`whats-new/entries.ts`): `v0.25.0-classic-mode`, kind New, `banner: true`, as a big change. "Classic Mode: type the way many screenwriters expect. Enter and Tab move through the script, names and places fill themselves in, and your file stays Fountain." The link goes to the help page. Test counts are refreshed by the release's script.
- **README:** the Status line and front-door paragraph; a Features row; the Roadmap moves it to done; a gallery picture of Classic Mode from `ui-shots --readme`; the line 3 image's alt text. **docs/ROADMAP.md,** and **docs/DECISIONS.md** in the Classic Mode section for every call, as built. **docs/WHY.md** can say it as a choice. **CHANGELOG:** the release's section.
- **Clean-room audit:** Classic Mode added to the next audit in [AUDITS](AUDITS.md).
- **The og:image** (`brand/build.mjs`, then `og-image.svg`, `.png`, and the animated SVG, and `brand/README.md`):
  - `'Fountain first.'` becomes **`'Fountain or Classic.'`**, in the same gradient.
  - `'Classic mode: coming soon.'` goes. In its place, "Same file. Your choice of keys."
  - The first line stays: "Fountain: a plain-text script format".
  - **The two front cards of the fan show the same scene typed both ways.** A Fountain card, flush left with marks showing, and a Classic card with no marks, indented like a page:

    ```
    Fountain                 Classic

    INT. RADIO ROOM - NIGHT  INT. RADIO ROOM - NIGHT

    June works the dial.     June works the dial.

    @McGRAW                            McGRAW
    (on the radio)                 (on the radio)
    Say again?                   Say again?

    >FADE OUT.                            FADE OUT.
    ```

    **Call:** this text, because the difference only shows if the scene has a mark in it; a plain scene looks alike both ways. The words are original, written for this.
  - The alt text in `build.mjs` and in the README: "Drafter: Fountain or Classic. The same scene typed both ways, on two script pages…".

## 17. Clean room, non-goals, and later

### 17.1 Clean room

Built from the shared screenwriting convention (what comes after what on a page), the maintainer's own experience, the Fountain specification, public documentation, and CodeMirror's documentation and source, an ordinary dependency. **No code, screens, or text from any other app, and no other app's source is opened.** The element flow in §6 is the maintainer's words. Where the designer filled a gap, this document gives a reason of its own, never "it's what that app does". Any likeness to an app's behaviour comes from the shared convention, which [clean-room.md](clean-room.md) permits. The look is Drafter's own tokens and the template's numbers. Sample text, fixtures, and tests are original; Signal Hill is the sample, with names such as JUNE and DALE.

### 17.2 Not in this release

- **Mixed-case names by typing.** **Decided (maintainer, 2026-11-02):** a name typed in Classic Mode is all capitals for v0.25.0. To get `McGRAW`, type it once in Fountain Mode as `@McGRAW`; after that autofill offers it. A rule for guessing would be wrong as often as right.
- **Ways to change the Enter and Tab tables.** No custom key settings. A writer may ask; the tables stay data so it could come later.
- **Cycling the most likely speaker,** a key or a suggestion that guesses the other person in a two-hander. Agreed flow says most recent first, and that's what ships.
- **A paper look** for the left pane, and page breaks drawn in it.
- **Show marks** while in Classic Mode, a toggle. Switching to Fountain Mode shows them in one click.
- **A title-page form.** It stays as text.
- **Notes in a margin** (§8.3), **copy as a plain script** (§11), **search that skips hidden marks** (§8.1), **Problems in Classic words** (§11).
- **Guided starters written for Classic Mode.**
- **Per-script mode** (§3.1). Rejected, not deferred, unless the file promise changes.
- **Revision mode, scene numbering, and other production typing:** v0.27.0, which must keep this design's rules.
- **Novel:** Classic Mode doesn't apply (v0.26.0).

## 18. The calls

1. **Decided: mode** is one app-wide setting, `writingMode`, default `fountain`; never in the file (§3.1).
2. **Switch's place:** right after the title and save state, before Open; never folds (§3.2).
3. **Markdown:** the switch is hidden, not greyed (§3.2).
4. **Key:** `Mod+Alt+0`, with palette commands and a Settings row (§3.3).
5. **Needed marks are settled per keystroke,** in the transaction that types (§4.2).
6. **Soft and firm:** Action is soft only while freshly reached, empty on arrival, and being typed in this stay; a line returned to is plain Action and keeps itself with a mark; `.45` and `.FLASHBACK` typed on Action stay Action; soft only where the template has headings (§4.2).
7. **Marks not written in this stay are never touched** (§4.2).
8. **A name with no speech takes no `@`,** and draws as what the parser reads once the cursor goes elsewhere (§4.3).
9. **An empty line or `()` left behind is taken away** in the move's transaction (§4.4).
10. **The pending element is worked out;** only exceptions are stored (§5).
11. **A heading is never pending by flow:** type `INT.` or use the chooser; a new script and the line after a Transition start on soft Action (§5).
12. **Classic's keys at `Prec.highest`,** ahead of `language` (§6).
13. **Decided: Tab walks a row of elements** on an empty line; Tab on a name with no match goes to Dialogue; Enter after a Transition goes to Action (§6).
14. **Tab never splits a line** (§6.3).
15. **Shift+Enter is a break inside the element,** with two spaces on an empty speech line (§6.4).
16. **One Backspace joins** two elements, with the blank line and hidden mark (§6.4).
17. **Blank lines between elements are passed over** by arrows and clicks, through one selection filter, `classicCaret` (§6.4).
18. **Most-recent order for places in Classic Mode only** (§7.1).
19. **Extensions by typing a space or `(`;** Tab's cycle is gone in Classic Mode; `(CONT'D)` isn't offered (§7.1).
20. **Autofill opens at the first letter** in Character, Heading, and Transition, never on an empty line (§7.2).
21. **The ` - ` is written with the time,** not with the place; accepting a name or a time moves on at once (§7.3).
22. **Marks are hidden with decorations and atomic ranges,** never by changing text (§8.1).
23. **A mark that doesn't pair stays visible** (§8.1).
24. **Search left as it is** for this release (§8.1).
25. **Indents from the template,** shrinking in narrow panes; matching the page promised only at 60 characters or wider (§8.2).
26. **No colour per element** (§8.2).
27. **Decided: notes stay inline,** with brackets hidden and a rule at each end; the metadata block is hidden and the cursor stops above it (§8.3).
28. **In-line marks typed by hand work as Fountain;** only marks at a line's start are made safe (§8.3).
29. **The chooser is a list of its own,** with an underlined letter for each item, and writes nothing (§9.1).
30. **Tooltips lose their marks** in Classic Mode (§9.2).
31. **A key line in the status bar;** a first-run hint; `TOUR_VERSION` stays (§9.3).
32. **A phone's Next button names its destination,** and its row shows in Classic Mode whatever the setting (§10).
33. **Multi-line paste is left to the parser;** a one-line paste takes the line's element (§11).
34. **Copy gives the true text** with its marks (§11).
35. **Problems' wording unchanged** for this release (§11).
36. **The logic lives in `cm-fountain`,** as pure commands where it can (§14).
37. **The cards' sample has a mark in it,** so the two modes look different (§16).
38. **Decided: names are all capitals** in Classic Mode for v0.25.0; a mixed-case name is typed once in Fountain Mode (§17.2).
39. **A line in Action stays Action:** Character is reached by Tab or the chooser, never by typing capitals; a cue-only-by-what-follows line gets `!` on the line the writer is on (§4.2).
40. **Drawing follows the stored element while the cursor is on the line,** and the parser elsewhere; opened files draw what the parser says (§8.2).
41. **Decided: the metadata block is protected:** selections stop above it, a transaction filter keeps its range as a backstop, undo and app changes pass, and Fountain Mode is unchanged (§8.4).

## Added after planning (maintainer, 2026-11-02)

- A worked-out pending Character is soft for heading prefixes only: `INT.` typed straight after a speech starts a Scene heading.
- The Beat Board block stays unprotected for this release (in DEFERRED): Select All then Delete removes it, and Undo restores it.
