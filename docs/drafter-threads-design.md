# Threads: see which scenes each plot thread is in (design)

Status: drafted 2026-11-26 for v0.29.0, from a brainstorm with the maintainer; checked by a builder's read; approved by the maintainer the same day ("yes please continue").

This replaces Part 2 of the [seeing-the-script design](drafter-seeing-the-script-design.md) (§6 to §8, "storylines, the map, and pacing") as the plan for v0.29.0. What it leaves out is listed under Non-goals and goes to `docs/DEFERRED.md`.

## 1. Intent

The maintainer, in their words: "I want to see which scenes each plot thread is in. I want a visual representation." Shown three mockups (lanes along the pages, a grid of threads by scenes, the Structure strip colored by thread), they chose **lanes**: "it makes the most sense to me." Asked whether novels get threads too: "yes, threads in novels too."

So the release is one picture, done well, for scripts and novels: a row per plot thread, running along the work from start to end, with a block wherever the thread is present. It answers at a glance: where does this thread go quiet, where do threads meet, is one thread crowding the others out.

## 2. Goals

1. **Tag** a scene (script) or a passage (novel) with one or more threads, quickly, from the places the writer already is.
2. **Name and color** each thread: a short label (`A`, `B`, `Maya`) plus an optional longer name ("Maya and her father") and a color.
3. **See the lanes**: one row per thread, along the work, with block widths by length; hover or focus a block for what it is; click or Enter to go there.
4. **Rename, recolor, and remove** a thread across the whole work, as one undo.
5. Works fully by **keyboard** and **screen reader**, in both themes, on a phone.

## 3. Non-goals (this release)

From the October design, deferred to a later release (each a line in DEFERRED):

- The pacing chart and its guides, and the Stats tab's Pacing section.
- Storyline marks in the Script pane's margin.
- The Structure strip's **Color by** (inside/outside, day/night, thread).
- Threads in Classic Mode's own surfaces beyond what the shared Outline already gives.
- Plot threads in exports (the Story Atlas, HTML, PDF). The lanes are a writing view.

## 4. Anti-goals (failure even if it works)

- **The file stops being what it was.** A script must stay plain Fountain any app reads; a novel must stay plain Markdown another app shows as an ordinary document. No conversion of existing files.
- **A setting or a nag.** No prompt to tag scenes, no empty-state that scolds. A script with no threads shows one quiet line on how to add one.
- **Typing gets slower.** The lanes are computed only while shown, after typing pauses, as the strip and Stats are.
- **Color alone carries meaning.** Every block and lane has its label as text or as its accessible name.
- **Another app's names.** "Threads" and "Lanes" were checked on 2026-11-26: Final Draft's outlining features are Story Map, Beat Board, Structure Points, and Structure Lines; no screenwriting app found uses "Threads" or "Lanes" as a feature's name. Inside Drafter, the Story Atlas had a section called "Threads" (setups and payoffs); it is renamed (§7.7).

## 5. Constraints

- Clean room, as always: designed from Drafter's own data; no other app's look, words, or code.
- Privacy promise: nothing new touches the network.
- Locked pages (Production): reading threads never edits the script; tagging edits only notes, which a lock already allows.
- Read-only states (a draft being viewed, a locked file the writer can't edit): tagging, rename, and color are `aria-disabled` with the reason, as Scene details is today.
- Budgets: computing the lanes ≤ 10 ms for a 120-page script or a 120,000-word novel, measured by growth as `packages/outline/test/scaling.ts` does. No long task while typing with the lanes shown.

## 6. Approaches considered

**A. Threads stay where each kind of file already keeps its details (chosen).** In a script, a scene's threads are the `[[Storyline: A]]` notes Drafter already reads inside the scene (`Scene.storylines` in `@drafter/outline`), and each thread's name and color live in the script's settings block (`/* drafter */`, `setMeta`). In a novel, each passage's threads are a list beside its status and synopsis in the novel's trailing facts comment (`@drafter/novel`'s `Facts`). One Lanes view draws both, from a common list of units in order, each with a length and its threads.
*Trade-off:* two stores behind one picture, but each file stays what its kind already is: a script's threads are readable in the Fountain text, and a novel is still ordinary Markdown elsewhere. No conversion.

**B. One store for both.** Scripts would keep thread membership in a hidden block keyed by a scene id, as novels do. Tagging would work one way everywhere, but a script's threads would no longer be in the Fountain text, scene ids would have to survive cut and paste, and existing `[[Storyline:]]` notes would need converting. Rejected for those reasons.

**C. (Placement, not storage) the lanes as their own Inspector tab or a full-width view.** Rejected in favor of a second view of the Outline tab, which is where the October design and the writer's habits put "the shape of the work"; it is one click from the tree.

The maintainer chose A ("A, go with your recommendation").

## 7. The design

### 7.1 Words

- In the app the feature is **Threads**: "Threads…" in menus, "New thread", "No thread", "Rename thread…". The view is **Lanes**.
- In a script's text the note is **`[[Thread: A, B]]`** from v0.29.0 (the maintainer, 2026-11-26: "Thread, go with your recommendation"), so the word in the file matches the word on screen. Drafter **reads both** `Thread` and `Storyline` as the same field, forever; it **writes** `Thread`, and when it rewrites a scene's notes (Threads…, rename, remove) a `Storyline` note it touches becomes a `Thread` note. It never rewrites notes it isn't asked to touch. The cheat sheet, the lint field rule (`duplicate-field`), Scene details' field label, and `FieldKey` gain `thread` with `storyline` as its alias. A Drafter before v0.29.0 shows a `Thread` note as an ordinary note: accepted.

### 7.2 The data

**Scripts.**
- Membership: `Scene.storylines` from the scene index, unchanged (every Storyline note's comma-separated labels, case-folded once each, in order typed).
- Names and colors: a `storylines` map in the settings block, keyed by the case-folded label: `{ "a": { "name": "The heist", "color": "yellow" } }`. Absent entries mean "no name" and "a color chosen for you" (§7.4).
- `@drafter/notes` gains: `threadInfo(doc, index)` (every label in use or named: label as first typed, name, color, whether the color was chosen), `setThreadInfo(doc, label, { name?, color? })`, `setSceneThreads(doc, scene, labels)` (rewrites the scene's Storyline notes into one note, or removes it when empty), `renameThread(doc, from, to)` and `removeThread(doc, label)` (every note plus the settings entry, one transaction). These names are the October design's `storyline*` functions, renamed.

**Novels.**
- `Facts` gains `threads?: string[]` per node, read and written by `readFacts` / `writeFacts` in the existing trailing comment, with the same cut-to-length rules as synopsis (each label ≤ 40 code units, ≤ 12 per node; longer is cut when read).
- Names and colors: `NovelFacts` gains `threads?: Record<string, { name?: string; color?: string }>`, keyed by case-folded label.
- `readOne` and `writeFacts` keep only fields they know, so both learn `threads`; then `carryFacts` carries a passage's threads when its heading is renamed. `carryFacts` copies only `bookTarget` and `manuscript` at the book level today, so it must also learn to carry `NovelFacts.threads`. `orphanedFacts` already reports facts whose node is gone.
- `@drafter/novel` gains the same five operations over facts.

**The common shape** (new, in `@drafter/outline`, pure):

```ts
interface LaneUnit { id: string; label: string; heading: string; from: number; length: number; threads: string[] }
interface Lanes { units: LaneUnit[]; threads: { key: string; label: string }[]; total: number; unit: 'pages' | 'words' | 'lines' }
function lanesOf(units: LaneUnit[]): Lanes   // threads in order of first appearance; "No thread" is implied
```

- A script's units are its scenes, length in pages from the layout when it is ready, else in printed lines (`unit: 'lines'`, and the ruler shows no page numbers until pages arrive).
- A novel's units are its leaf passages: each section, or a whole chapter that has no sections. Length is words. A part heading is not a unit. *(Builder's call how a chapter's own words before its first section are shown; suggestion: as a unit of its own when it has any words, labeled with the chapter's title.)*
- A thread tagged on a chapter that has sections applies to each of its sections, unless a section has threads of its own. *(Builder's call; see §8.)*

### 7.3 The Lanes view

The Outline tab gets a **Tree | Lanes** switch on its slim bar, remembered on the device (`outlineView`). For a novel, the same switch on the novel outline. Plain Markdown documents (not Novel) don't offer it: "A Markdown document has no scenes."

```
 Threads             p1        p11        p21        p31        p41
 A · The heist       ██  █ ███     ██          ██ ███        ████    ██
 B · Maya & dad        ██    ██  ███   █    ██       █ ████  ██ █
 C · Detective             ███ ██ ███       ███  ██          ████
 No thread                    ▒                  ▒
```

- **Rows:** one per thread in order of first appearance, then **No thread** (units with none), shown only when some unit has none. Each row's header: color swatch, label, and name when set.
- **The axis:** the whole work, start to end, scaled to the pane's width; a ruler above with page numbers (scripts) or word counts in thousands (novels). The cursor's unit is outlined in every row it appears in.
- **Blocks:** one per unit in that thread, at its place and length, tinted with the thread's color, with the scene number (script) or a short title (novel) where it fits. A unit in several threads has a block in each row.
- **Hover or focus a block:** a card with the heading, length, and all its threads.
- **Click or Enter:** go to that scene or passage in the editor, as the tree does.
- **A block's menu** (right-click, the context-menu key, or a ⋯ on focus): the scene menu the tree and cards already use (`sceneMenuItems`), which gains **Threads…**.
- **A row header's menu:** Rename thread…, Name…, Color…, Remove from every scene….
- **Empty state:** "No threads yet. Add one from a scene's menu: Threads…" (for a novel: "from a chapter's or section's menu").
- **Phone width:** a list grouped by thread: each thread a heading, then its units as rows (heading and length), then No thread.

### 7.4 Tagging, naming, coloring

- **Threads…** in every scene menu (Outline tree, Cards, the Lanes' blocks, the palette for the cursor's scene) and in the novel's passage menus opens a small dialog: a checklist of every thread (swatch, label, name), a **New thread** field (label; Enter adds and checks it), and **Save**. Saving writes one change (one undo).
- Scene details' existing Storyline text field stays, and offers the labels in use as suggestions.
- **Colors:** Drafter's existing nine color words (`SCENE_COLORS` in `@drafter/notes`: red, orange, yellow, green, teal, blue, purple, pink, gray), so one vocabulary and one `isColor` check serve scene colors and threads (my call, 2026-11-26). A thread's chip is a different shape from a scene's color chip (suggestion: a bar or a striped tab, not the round dot) so the two aren't confused; the builder checks contrast of each in both themes. Until the writer picks one, a thread is shown in the next color in order of first appearance, and nothing is written to the file.
- **Rename** rewrites every note (script) or facts entry (novel) and moves the name and color, one undo, then says "Renamed thread A to Heist in 12 scenes." Renaming onto an existing label asks: "Heist is already a thread. Merge A into it?"
- **Remove from every scene…** asks first, says how many, and is one undo.

### 7.5 Keyboard and screen reader

- The lanes are one Tab stop: an ARIA grid, one row per thread. Left and Right move along a row's blocks; Up and Down move to the next row's block nearest in position; Home and End go to a row's ends; Enter goes to the unit; the context-menu key or Shift+F10 opens the block's menu.
- Each block's accessible name: "Scene 14, INT. WAREHOUSE – NIGHT, 2 pages, threads A and C." Each row header: "Thread A, The heist, 9 scenes."
- A **table** equivalent ("Show as table" on the slim bar's menu): Thread, Name, Scenes (as a list of numbers), Pages or Words, Share of the work. It doubles as the place to rename and recolor without the grid.
- axe on the Lanes view, the table, the Threads… dialog, and the phone list, in both themes at both widths.

### 7.6 Where else threads show

- **Chips** on Outline rows and cards: one per thread, color plus label as text (accessible name "thread A, The heist"). The DEFERRED line "Storyline labels on cards" closes.
- **The Stats tab** gets a **Threads** section: the same table as §7.5. *(Optional for this release; the builder may defer it if the table above covers it, and say so.)*
- **Drafter for Claude:** `script_overview` and `read_scene` (`packages/mcp/src/tools/script.ts`) include each scene's threads and their names.

### 7.7 The Story Atlas's section is renamed

The Story Atlas's section of arcs from a setup to its payoff was called **Threads**. It becomes **Setups and payoffs** (the maintainer, 2026-11-26), so "Threads" means plot threads everywhere in Drafter. Scope: the Atlas dialog's checkbox ("Setups and payoffs"), the section's heading, nav label, and SVG title and description (`packages/story-atlas/src/render/threads.ts`), the help page (`/docs/story-atlas/`), and the tests that name them. Internal identifiers (`include.threads`, the section's `id`, the file name) may stay or change, the builder's call, but a saved Atlas choice must keep working: the stored key for the section's on/off is read as before. A changelog line under Changed.

## 8. Left to the builder (decide, and record in DECISIONS)

- How a chapter's own words before its first section appear in the lanes (§7.2).
- Whether a chapter's threads pass down to its sections that have none (§7.2). Suggestion: yes, shown as a lighter block, so the writer can tag a whole chapter at once.
- The eight colors' values, and the swatch shape.
- The block's minimum width in px (a half-page scene in a 120-page script is under 3 px on a laptop; suggestion: 4 px minimum, overlap allowed, focus outline always visible).
- Virtualization: not expected to be needed (a lane has at most a few hundred blocks), but measure.
- Test layout: unit tests for `lanesOf`, the notes and facts operations (including rename/merge/remove as one change), and the facts round trip; trap documents for hostile labels (very long, many, RTL and joiners, labels that differ only by case); e2e for the view, keyboard, the dialog, the phone list, and axe.

## 9. Decided with the maintainer

1. **The keyword:** `Thread`, read alongside `Storyline` (§7.1).
2. **The name clash:** the Story Atlas's "Threads" section becomes "Setups and payoffs" (§7.7).

## 10. My calls (check while reading)

- Threads reuse the nine existing color words; a thread chip has a different shape from a scene's color (§7.4).
- The lanes live in the Outline tab as Tree | Lanes, not a tab of their own (§6 C).
- Pacing, margin marks, and Color by wait for a later release (§3).
- A novel's lane unit is the leaf passage; part headings are not units (§7.2).
- Writing a thread rewrites only the notes of the scene being changed; old `Storyline` notes elsewhere are left as they are (§7.1).
