# Classic Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second way of typing over the same Fountain file: a `Fountain | Classic` switch in the top bar, Enter and Tab that move through the script's elements, autofill for names and places, and a left pane that looks like a script with no marks showing, shipped as v0.25.0 with Fountain Mode the default and unchanged.

**Architecture:** One new compartment, `writingMode`, holds `classic()` from `packages/cm-fountain/src/classic/` or nothing, and sits ahead of `language` in `editorExtensions`. `classic()` is a state field (`classicLine`), keymaps at `Prec.highest`, transaction filters that write needed marks in the transaction that types them and keep the cursor out of hidden places, and decorations that hide marks and indent lines from the template's numbers. Logic is pure commands over `EditorState` where it can be, so the byte tests run with no browser. Nothing about the mode reaches the file, and every other feature keeps reading `parsedDoc`.

**Tech Stack:** TypeScript, CodeMirror 6 (`@codemirror/view` 6.43.15, `state`, `autocomplete` 6.20.4, `commands` 6.11.1), Vue 3 / Nuxt, Vitest + fast-check (jsdom in `cm-fountain`), Playwright, axe. No new dependency.

**Spec:** `docs/drafter-classic-mode-design.md`. Every **Call** and **Decided** in it binds (§18). Where this plan settles something the spec leaves open, or where the real code can't do what the spec says, it says **my call**; Task 15 records each in DECISIONS. The ones that change what a Call says are listed under **Spec against the code** below.

**Starts from:** `classic-design`, rebased on `main` at v0.24.3. Ships as **v0.25.0**.

**Execution:** subagent-driven, an implementer and a reviewer per task. Tasks 2 to 9 are all in one folder and depend on each other's Interfaces blocks, so run them in order.

## Global Constraints

- **Clean room (§17.1):** built from the shared screenwriting convention, the maintainer's words, the Fountain specification, and CodeMirror's documentation and source. No code, screens, or text from any other app, and no other app's source is opened. Reasons in comments and docs are this project's own, never "it's what that app does". Fixtures, samples, and test strings are original. **Signal Hill** is the sample (`apps/web/scripts/ui-shots-script.fountain`), with names such as JUNE and DALE.
- **Naming:** the UI says "Fountain", "Classic", and "Classic Mode". Never "Final Draft mode": that name appears only as a palette keyword (`final draft`), in the help page's "the way writers of apps like Final Draft expect", and in its trademark line.
- **The file (§4.1):** what Classic Mode may write is the table in §4.1, plus **my call** a mark's own space (`# `, `## `, `= `) and `!!` (see Spec against the code, 4). Nothing about the mode goes in a file, draft, snapshot, or export. Switching and moving write nothing. Everything uses `state.lineBreak`, so CRLF stays CRLF; a byte-order mark stays.
- **Fountain Mode is byte-for-byte unchanged when Classic is off.** With the compartment empty no Classic code is in the editor. The existing `cm-fountain` suite runs untouched, and Task 1 adds the pin (`Fountain Mode is unchanged`). No shared setting may change: never pass `interactionDelay`, `activateOnTypingDelay`, or any other option to `autocompletion()`.
- **Budgets (§13):** parsing a 200 KB script stays under 5 ms (`pnpm bench`). With Classic on, a keystroke on line 3,000 of the 120-page script makes no long task (over 50 ms) and adds under 1 ms at p95 against Fountain Mode. No second parse of the script per keystroke. Decorations for visible ranges only.
- **Accessibility bar (§12):** WCAG 2.2 AA in dark and light. Keyboard ways out: Esc then Tab, Esc Esc Tab with a list open, Ctrl+M (Shift+Alt+M on a Mac), F6, `Mod+K`. Pending elements, moves, lists, and the switch are announced. No transitions anywhere in Classic Mode, in any motion setting. New pairings hold contrast in both themes; a note's rule is at least 3:1. Forced colours use `CanvasText`.
- **Security (§13):** no network and no file reads. Script text reaches the screen only as text nodes (`Completion.label`, CodeMirror's text). No script text in `innerHTML`, a CSS value, or a hand-built attribute. Template numbers are checked with `Number.isInteger` before they enter a CSS variable. Every new pattern is anchored and linear.
- **Plain language** in every message, in the house voice, with curly apostrophes in user-facing copy.
- **Gates:** `set -e -o pipefail` at the top of every shell block; never `(cmd; echo $?)`; never pipe `pnpm check` to `tail`. Build packages first (`pnpm -r --filter "./packages/*" build`) before web typecheck or web tests. Web typecheck is `pnpm --filter @drafter/web typecheck`. Browser tests use `E2E_PORT=4198`, never 4190. `pnpm install` after any `package.json` change or merge. Per task: `pnpm check`, the package's tests, and the task's own commands.
- **Browser tests on a pull request are required.** CI runs chromium with `--grep-invert "long task|quickly|budget|within"`, so a test whose name holds one of those words is skipped on a pull request. Name the budget test with `budget`, and keep those four words out of every other test name in this plan (say "in two seconds", not "within two seconds"). Every test list a new page or command touches is updated in the task that adds it (Task 15 names them).
- **Commits** carry no `Co-Authored-By` or any other AI trailer. CHANGELOG `[Unreleased]` gets an entry in every task that changes behaviour.
- **Versions named in docs:** Classic Mode v0.25.0; Novel v0.26.0; Production v0.27.0.

## Spec against the code

Checked against the installed CodeMirror source and the real parser on 2026-11-02. Each is resolved in the task named.

1. **Enter can't be left to CodeMirror while a list is open (Call 12, §7.3).** `acceptCompletion` returns false for 75 ms after a list opens (`interactionDelay`), and Fountain's Enter then runs, so a writer who types `JU` and Enter at about 100 ms gets a line break and no `JUNE`. That setting can't change, as Fountain Mode shares it. **Resolved (my call):** Classic's Enter and Tab never hand over. Both call `acceptOffer(view)`, which reads `selectedCompletion` or ranks the source itself and applies the option in one transaction. A click still goes through CodeMirror, to the same `apply`. Task 8.
2. **A filter can't do Up and Down (Call 17, §6.4).** `classicCaret` has no view, so it can't keep the goal column: a Down that lands on a passed-over blank line would come out at a line's start, every time. **Resolved (my call):** `ArrowUp` and `ArrowDown` are Classic keys that repeat `view.moveVertically` past `passedOver` lines. The filter keeps its place as the one rule for everything else, and `passedOver` is the one predicate. Task 5.
3. **`appChange` is in the app (§8.4, §11).** It's defined in `apps/web/app/editor/typewriter.ts`, and filters in `cm-fountain` can't import it. **Resolved:** it moves to `packages/cm-fountain/src/state.ts`, and `typewriter.ts` re-exports it, so the six files that import it don't change. Task 1.
4. **A typed `!` vanishes on Action (§4.2).** `!Bang` parses as forced action printing `Bang`, the kind matches, no mark is written, and the `!` is then hidden: the writer sees the key do nothing and loses the character on the page. **Resolved (my call):** the check compares the printed text as well as the kind, so Action writes `!!Bang` (the parser prints `!Bang`). `@` on Character and `.` on a chosen Scene heading stay "the same mark", as §4.2 says. Task 3.
5. **One paragraph parsed alone can read as a title page (§4.2).** `parse('Title: x')` gives a title page and no blocks, so a mid-script line `Title: x` would get a `!` it doesn't need. A leading break stops it (`parse('\nTitle: x')` is action). **Resolved:** `readsAs` parses `\n` + the run. On line 1 the full parse says title page, and typing a title page would be marked `!Title: …` by the Action rule, so a title page couldn't be typed at all. **Resolved (my call):** a **soft** line 1 that reads as a title page takes no mark and becomes the title page (`blocked`), a third shape beside a heading's and a transition's. Task 3.
6. **New text can land on the metadata block's own line (§8.3, §8.4).** `setMeta` on an empty script writes the block at offset 0, so a new blank stage play has no line above the block, and `x/* drafter…` reads as `meta: null`: the first letter turns a stage play into a screenplay. **Resolved (my call):** when the protected range starts at 0, or text goes in where no break stands before the block, `keepMetadata` adds two `state.lineBreak`s after the inserted text, in the same transaction. A block at `lineAt(from).from` is hidden with its whole lines, and through the end of the text when only white space follows (`setMeta` leaves a trailing break). Task 7.
7. **The trap harness can't live in `cm-fountain` (§15.2).** Import traps become text only through `openFile`, which is in the app. **Resolved (my call):** `apps/web/test/trap-classic.test.ts`, beside `trap-open.test.ts`, in jsdom. `classic` is added to a trap's `expect` by a mapping over `web-open`, not by hand. Task 13.
8. **A move carries `input`, not `select` (§11).** `command()` gives `input`, as §6 requires, so `centersOn` won't see a Tab that writes nothing, and a `navigated` check doesn't apply to it. **Resolved (my call):** an annotation, `classicMove`, from `cm-fountain`, which `centersOn` counts. Task 12.
9. **`.zoom` isn't the pattern's class (§3.2).** The Inspector's control is `.zoom-button` in `InspectorTools.vue`. Follow that component. Task 10.

**Two points for the maintainer, where the spec works but may not be what's wanted.** The plan builds what the spec says; each is one line and one test to change.

- **`INT.` right after a speech writes a cue.** Enter at the end of a speech gives a pending Character, which is firm (Call 6, §5). A writer who goes straight on to a new scene types `INT. DINER` and gets `@INT. DINER`. Ending a speech and starting a scene is one of the commonest moves in a script. **Recommendation:** treat a worked-out pending Character (not one chosen) as soft for a heading prefix only: `a heading prefix on a worked-out Character is a heading`. `INT.` with its dot or space is not a plausible name. Task 3 pins today's spec behaviour, in `settle.test.ts`, and Task 3's `shapeOf` is where it changes.
- **The Beat Board block.** A `/* beat board` block before the metadata block is also the app's data, but §8.3 and §8.4 cover only `doc.meta`. In Classic Mode it shows as struck-through text, and Select All then Delete takes it (Undo restores it), as it does in Fountain Mode. **Recommendation:** leave it for this release, and add it to DEFERRED.

## Review Focus

1. **A writer goes back to a line and changes its element:** the bar or `Mod+Alt+n` on a line with text, then more typing, then Undo. The stored element must follow the line, a stale `classicLine` must never re-add a mark, and Undo must leave no mark with no letter. → Task 3 (`makeElement on the cursor's line replaces the stored element`), Task 4 (`undo after a bar change gives the text back`).
2. **The script changes under the cursor:** a template change, Revert to Saved, a file reloaded, a module's edit, or an Outline move while the writer is on a pending line. `classicLine` must drop what it stored, and nothing may be marked or tidied. → Task 2 (`a change that isn't the writer's drops the stored line`), Task 4 (`an app change near a made line tidies nothing`).
3. **Scripts in no-case writing systems, and emoji:** `李明`, a name in Arabic, an emoji at a line's start. Marks, capitals, and hidden-mark steps must count code points, never split a surrogate pair, and bidirectional text must keep its caret. → Task 3 (`a surrogate pair is capitalised as one`), Task 5 (`the caret steps over a mark beside an emoji`).
4. **Very long paragraphs:** a 100,000-character line, or one paragraph of 50,000 lines. `readsAs` must not parse the whole paragraph on each key. **My call:** the run is capped at 64 lines and 8 KB around the cursor; past the cap, no new mark is written. → Task 3 (`a keystroke on a 100,000-character line stays cheap`), in `classic.complexity.test.ts`.
5. **Mode and script change together:** a Markdown document opened, a sample opened, or a read-only draft while Classic is on, with a list or chooser open, and back. The chooser and list must close, Markdown must get nothing, and a read-only editor must give Tab back. → Task 10 (`a Markdown document gets nothing, and the next script is Classic again`), Task 9 (`a load closes the chooser`).

---

## File Structure

- `packages/fountain/src/meta.ts` (`existingBlock` → exported `metadataSpan`), `packages/fountain/src/index.ts`.
- `packages/cm-fountain/src/`:
  - `state.ts` (`appChange`), `elements.ts` (exports `blocked`, `elementTemplate`), `fountain.ts` (provides `elementTemplate`), `highlight.ts` (`lineMarks`), `complete.ts` (`completionOverride`, exported helpers), `index.ts`.
  - `classic/index.ts`: `classic(options)`, the keymap, what the package exports.
  - `classic/line.ts`: `classicLine`, `elementAt`, the pending rule.
  - `classic/marks.ts`: `readsAs`, `settleLine`, the filter, capitals, tidying.
  - `classic/keys.ts`: the §6 tables as `StateCommand`s.
  - `classic/caret.ts`: `classicCaret`, `passedOver`, the delete rules, Up and Down.
  - `classic/hidden.ts`: `hiddenSpans`.
  - `classic/view.ts`: decorations, atomic ranges, line classes, the template's CSS variables.
  - `classic/metadata.ts`: `protectedRange`, `keepMetadata`, the block's decoration.
  - `classic/offer.ts`: what autofill offers, and `acceptOffer`.
  - `classic/chooser.ts`: §9.1.
  - `classic/compose.ts`: §10's input methods.
- `packages/cm-fountain/test/classic/`: `harness.ts`, one test file for each source file, `model.test.ts`, `promises.test.ts`, `classic.complexity.test.ts`.
- `apps/web/app/editor/`: `extensions.ts`, `apply-settings.ts`, `session.ts`, `theme.ts`, `element-bar.ts`, `element-names.ts`, `typewriter.ts`, `writing-mode.ts` (new: the switch's one action), `classic-key-line.ts` (new).
- `apps/web/app/components/`: `ModeSwitch.vue` and `ClassicHint.vue` (new); `AppToolbar.vue`, `FocusMarker.vue`, `ElementBar.vue`, `ElementAnnouncer.vue`, `AppStatusBar.vue`, `SettingsDialog.vue`, `SourcePane.vue`.
- `apps/web/app/settings/settings.ts`, `settings/apply.ts`, `commands/data.ts`, `commands/builtin.ts`, `commands/help-menu.ts`, `composables/useElementBarShown.ts`, `tour/tour.config.ts`.
- `apps/web/app/pages/docs/classic-mode.vue` (new); `index.vue`, `shortcuts.vue`, `fountain.vue`, `what-is-drafter.vue`; `whats-new/entries.ts`.
- `fixtures/trap/` (`entry-points.ts`, `traps.ts`, `README.md`, `MANIFEST.md`), `apps/web/test/trap-classic.test.ts`, `.github/workflows/desktop.yml`.
- `apps/web/e2e/classic.spec.ts` (new); `a11y.spec.ts`, `keyboard.spec.ts`, `phone.spec.ts`, `composition.spec.ts`, `cast-budget.spec.ts`.
- `brand/build.mjs` and what it writes, `README.md`, `docs/*`.

---

### Task 1: Groundwork, with Fountain Mode pinned

Nothing here changes behaviour. It's the seams later tasks need, and the test that proves it.

**Files:**
- Create: `packages/cm-fountain/test/classic/harness.ts`, `packages/cm-fountain/test/classic/unchanged.test.ts`, `packages/cm-fountain/src/classic/index.ts`
- Modify: `packages/fountain/src/meta.ts`, `packages/fountain/src/index.ts`, `packages/cm-fountain/src/state.ts`, `elements.ts`, `fountain.ts`, `highlight.ts`, `complete.ts`, `index.ts`, `apps/web/app/editor/typewriter.ts`
- Test: `packages/fountain/test/meta.test.ts`, `packages/cm-fountain/test/highlight.test.ts`

**Interfaces — Produces:**
```ts
// @drafter/fountain
/** The `/* drafter … */` boneyard `parse` reads as `doc.meta`; null when there is none. Was `existingBlock`. */
export function metadataSpan(doc: Doc): Span | null;

// cm-fountain, state.ts (moved from the app; typewriter.ts: `export { appChange } from '@drafter/cm-fountain'`)
export const appChange: AnnotationType<boolean>;

// elements.ts
export function blocked(state: EditorState, pos: number): 'title page' | 'region' | null;  // now exported
/** The template, for what needs more than the structure. `fountain({ template })` provides it. */
export const elementTemplate: Facet<() => Template, (() => Template) | null>;

// highlight.ts: decorateLine's marker walk, as data. Both kinds still draw as `cm-f-marker`.
export interface LineMark { from: number; to: number; kind: 'mark' | 'scene_number' }
export function lineMarks(from: number, raw: string, runs: readonly InlineRun[], regions: readonly Region[], hasKey: boolean): LineMark[];

// complete.ts: one branch at the top of fountainCompletionSource
export const completionOverride: Facet<(context: CompletionContext) => CompletionResult | null, ((context: CompletionContext) => CompletionResult | null) | null>;
export { names, times, transitions, extensions, sectionTitles, optionsAfter, withoutLine };  // for classic/offer.ts, not in index.ts

// classic/index.ts: empty for now, filled by each task
export interface ClassicOptions { say?: (text: string) => void }
export function classic(options?: ClassicOptions): Extension;   // returns [] in this task
```
`classic/harness.ts` re-exports `editor`, `render`, `type`, `run`, `press` from `../helpers`, and adds `classicEditor(marked: string, options?: { template?: Template }): EditorState` (a state with `parsedDoc`, `fountainInput()`, `elementStructure`, `elementTemplate`, and `classic()`), and `keys(state, 'JUNE', 'Tab', 'hello', 'Enter')`, which runs each named key's command or types each string.

- [ ] **Step 1: Write the failing tests.**
  - `unchanged.test.ts`, `Fountain Mode is unchanged`: for each file in `fixtures/classification` and the three Fountain samples, with no `classic()`: the `fountainDecorations` of the whole document equal a snapshot taken from `main` before this task (commit it first, from the unmodified code); `completionOverride` is unset and `fountainCompletionSource` gives the same options on five probe positions; `Enter`, `Tab`, and `Shift-Tab` at the same positions give the same `render` as a stored expectation.
  - `meta.test.ts`, `metadataSpan is the block doc.meta reads`, and `null for a damaged block`.
  - `highlight.test.ts`, `lineMarks: scene numbers are their own kind` (`INT. X #12#` gives one `scene_number` span over `#12#`), `a stray ** is no mark` (none), `a forced @ and a closing < are marks`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/cm-fountain test` → the new names FAIL; the snapshot test passes on the old code.
- [ ] **Step 3: Implement** by moving and exporting. `decorateLine` calls `lineMarks` and pushes `MARKER` for each, so the output doesn't change. A scene number is found with the parser's own rule for a trailing `#…#`, only on a `scene_heading` line: read it from `packages/fountain` and export it rather than copying the pattern. `fountainCompletionSource` starts `const override = state.facet(completionOverride); if (override) return override(context);`.
- [ ] **Step 4: Run them.**
  ```bash
  set -e -o pipefail
  pnpm -r --filter "./packages/*" build
  pnpm --filter @drafter/fountain test
  pnpm --filter @drafter/cm-fountain test
  pnpm --filter @drafter/web typecheck
  pnpm --filter @drafter/web exec vitest run test/typewriter.test.ts
  pnpm check
  ```
- [ ] **Step 5: Commit.** `refactor(cm-fountain): the seams for Classic Mode, with Fountain Mode pinned`

### Task 2: The line's element

**Files:**
- Create: `packages/cm-fountain/src/classic/line.ts`, `packages/cm-fountain/test/classic/line.test.ts`
- Modify: `packages/cm-fountain/src/classic/index.ts`, `packages/cm-fountain/src/index.ts`

**Interfaces — Consumes:** `elementStructure`, `blocked`, `cueIndex`, `parsedDoc`. **Produces:**
```ts
/** `scene_heading` in a play is a Scene (`##`), and `action` a stage direction, as the element commands read them. */
export type ClassicKind = ElementKind | 'page_break';
export interface StoredLine {
  /** The start of the line, mapped through changes. */
  from: number;
  kind: ClassicKind;
  /** §4.2: empty on arrival, not chosen, the cursor hasn't left. */
  soft: boolean;
  /** A pending element the writer chose (Tab, the chooser, a bar button). */
  chosen: boolean;
  /** The marks Classic wrote on this line in this stay, as positions. */
  added: readonly Span[];
  /** The empty line or `()` made in this stay, with the breaks that made it (§4.4). */
  made: Span | null;
  /** Autofill dismissed with Escape, until the next letter (§7.3). */
  dismissed: boolean;
}
export interface ClassicElement {
  kind: ClassicKind | 'note' | 'boneyard' | 'title_page';
  pending: boolean;
  soft: boolean;
  /** What Enter and Tab would do here: an element, or the chooser. */
  enter: ClassicKind | 'chooser' | null;
  tab: ClassicKind | null;
}
export const setStored: StateEffect<Partial<StoredLine> & { kind: ClassicKind }>;
export const setDismissed: StateEffect<boolean>;
export const classicLine: StateField<StoredLine | null>;
export function pendingAt(state: EditorState, pos: number): ClassicKind;   // §5's three rules
export function elementAt(state: EditorState): ClassicElement | null;       // the main cursor; null in a selection or with several cursors
```
`classicLine` is cleared when the cursor leaves the line, when a transaction with `appChange` or no user event changes the text, and on any `docChanged` transaction that isn't `input.type` or Classic's own (`classicEdit`, an `Annotation<true>` defined here). A cursor arriving on an empty line that has no stored element starts one worked out by `pendingAt`, `soft` true where the pending is Action in a template with `structure.headings`.

- [ ] **Step 1: Write the failing tests:** `directly under a name, a parenthetical, or a line of speech is Dialogue`; `after a speech is Character`; `elsewhere is soft Action, and a stage direction in a play, which is firm`; `a new script and the line after a Transition are soft Action`; `a line with text reads the parse, and a play's roles`; `a lone name is a Character while its Dialogue line is pending`; `a chosen element wins`; `a click on an empty line and an undo agree` (no stored line needed); `a change that isn't the writer's drops the stored line`; `a line the cursor returns to is firm`; `elementAt is null with a selection, and with several cursors`; `the title page, a note, and a boneyard are named, with no enter or tab`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/cm-fountain exec vitest run test/classic/line.test.ts` → FAIL.
- [ ] **Step 3: Implement** `line.ts`; add `classicLine` to `classic()`, and export `classic`, `classicLine`, `elementAt`, `ClassicElement`, `ClassicKind` from `index.ts`. `enter` and `tab` come from one pure table, `NEXT` in `line.ts`, which Task 4 uses too, so the status line and the keys can't disagree.
- [ ] **Step 4: Run them** → PASS; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): Classic Mode's idea of the element on a line`

### Task 3: Marks and capitals

**Files:**
- Create: `packages/cm-fountain/src/classic/marks.ts`, `packages/cm-fountain/test/classic/settle.test.ts`, `packages/cm-fountain/test/classic/classic.complexity.test.ts`
- Modify: `packages/cm-fountain/src/classic/index.ts`

**Interfaces — Produces:**
```ts
export const MAX_RUN = { lines: 64, chars: 8192 } as const;                       // my call, Review Focus 4
/** Would the parser read `text` at this line as `kind`, printing `words`? Parses `\n` + the capped run; line 1 uses `reparse` on `parsedDoc`. */
export function readsAs(state: EditorState, line: Line, text: string, kind: ClassicKind, words: string): boolean;
/** A heading's or a transition's shape, or a title page's on line 1 (§4.2, soft lines only). */
export function shapeOf(state: EditorState, line: Line, text: string): 'scene_heading' | 'transition' | 'title_page' | null;
/** The line's text with the mark it needs for `kind`, and the marks it had that this stay added taken off. */
export function settleLine(state: EditorState, line: Line, text: string, stored: StoredLine): { text: string; kind: ClassicKind; added: readonly Span[] };
export const classicMarks: Extension;   // transaction filter + capitals
```
**The filter** runs on `input.type` transactions with one cursor, steps back for `input.type.compose`, `undo`, `redo`, `appChange`, no user event, and `input.replace`, and never edits a line but the cursor's. It returns `[tr, { changes, sequential: true }]`, the pattern of `upperCaseTyping`. Registration order: it's in the compartment ahead of `language`, so it sees `upperCaseTyping`'s result. **Capitals** apply in Scene heading, Character, Transition, and Act lines, to the typed insertion only, by code point, with the same surrogate handling as `upperCaseTyping` (extract it to a shared helper in `input.ts`), and not inside a note or boneyard (`inNote`). A prefix completed on a soft line capitalises its typed letters in the same transaction, and nothing else that was there.

**Marks by kind:** Action `!`, Scene heading `.`, Character `@` (tested with a following line, as `readsAsCue` does), Transition `>`, Lyric `~`, Centered `>…<`, Act and play Scene `# ` and `## `, Section `# `, Synopsis `= `. Marks that are always needed are written with the first letter. `!` before the word goes when `readsAs` says the text alone prints the same words, which is what catches `!Bang` → `!!Bang`.

- [ ] **Step 1: Write the failing tests** in `settle.test.ts`, one test for each row of §4.2's table, by its words, typing letter by letter and asserting the document after every letter; and:
  - `.45 in the drawer gets its ! at its second character`, `.FLASHBACK on Action stays Action`, `BANG on Action stays Action`, `!BANG is written by Shift+Enter` (the assertion is in Task 4; here `settleLine` given a text below), `a keystroke on a line with text under it writes the ! at once`;
  - `a typed ! on Action is kept`: `!Bang` writes `!!Bang`, printing `!Bang`; `=== on Action is !===`, `~la on Action is !~la`, `>foo on Action is !>foo`, `@home`, `#1 fan`, `= sign`;
  - `int. on a soft line is a heading, capitals on its prefix`: `int.` → `INT.`; `i/e x`, `int./ext. x`, `est. x`, each with the parser's prefixes;
  - `a soft line of capitals ending TO: is a Transition`, `firm Action keeps CUT TO: with !`, `a play's stage direction is firm: SMASH CUT TO: and INT. take !`;
  - `.INT, .INT., then INT. takes its dot off` (a chosen Scene heading), `>CUT TO, then CUT TO: takes its > off`;
  - `a mark from an opened file is never touched`, `a name in a script with no case is @李明`, `june pasted on a Character is @june`;
  - `Title: x mid-script takes no mark`, `Title: x on a soft line 1 becomes the title page`, `Title: x on a firm line 1 takes !`;
  - `a surrogate pair is capitalised as one`, `the mark and the letter are one undo step`, `a name of all capitals needs no mark`;
  - `makeElement on the cursor's line replaces the stored element`;
  - `INT. on a pending Character after a speech is a cue, as the spec has it`: `@INT. DINER` (see Spec against the code, the first point for the maintainer);
  - in `classic.complexity.test.ts`, in the style of `keymap.complexity.test.ts` with its `withinBudget`: `a keystroke on a 100,000-character line stays cheap`, `one paragraph of 50,000 lines stays cheap`, `a line of 50,000 spaces`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/cm-fountain exec vitest run test/classic/settle.test.ts test/classic/classic.complexity.test.ts` → FAIL.
- [ ] **Step 3: Implement** `marks.ts`; `classic()` adds `classicMarks`.
- [ ] **Step 4: Run them** → PASS; `pnpm --filter @drafter/cm-fountain test`; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): Classic Mode writes the marks a line needs, in the keystroke that needs them`

### Task 4: Enter, Tab, and tidying

**Files:**
- Create: `packages/cm-fountain/src/classic/keys.ts`, `packages/cm-fountain/test/classic/keys.test.ts`, `packages/cm-fountain/test/classic/tidy.test.ts`
- Modify: `packages/cm-fountain/src/classic/marks.ts` (`tidyLeft`), `classic/index.ts`, `src/keymap.ts` (nothing but `export` on what `keys.ts` needs)

**Interfaces — Produces:**
```ts
/** Each is a pure command through `command()`, with `classicEdit` set, and false in a read-only editor, in `blocked` places, with several cursors, or with the writer's Tab focus mode on. */
export const classicEnter: StateCommand;
export const classicTab: StateCommand;
export const classicShiftTab: StateCommand;
export const classicShiftEnter: StateCommand;
/** Set `kind` as the pending element of an empty line, writing nothing. */
export function choosePending(kind: ClassicKind): StateCommand;
export const tidyLeft: Extension;   // §4.4, the filter
/** On a transaction that moves the cursor and writes nothing. */
export const classicMove: AnnotationType<true>;
```
`classic/index.ts` gains `const classicKeys = Prec.highest(keymap.of([...]))` binding `Enter`, `Tab`, `Shift-Tab`, `Shift-Enter`. `Enter` with no cursor-end rule returns false, so Fountain's Enter applies with several cursors. Task 8 wraps these two with autofill and Task 9 sends an empty line's Enter to the chooser. Until Task 9, Enter on an empty line returns true and does nothing.

"Cursor at its end" means the visible end, before a hidden closing mark. For now that's Centered's `<`, handled here; Task 5's `visibleEnd` replaces it. A new element always gets one blank line above and below, and no key adds a second. Enter and Tab on a name that has a speech move into it and write nothing.

- [ ] **Step 1: Write the failing tests.** `keys.test.ts`, as data: one table for each table in §6 (§6.1 both templates, §6.2, §6.3), rows `[name, before, key, after]` with `|` the cursor, generated with `test.each`. Every row of the spec appears, with its words. Add:
  - the six steps of the agreed flow, as one test, `the agreed flow, key by key`, with a final document compared byte for byte, on a blank script and on a script with a following scene;
  - `Tab never splits a line`, `Tab collapses a selection and writes nothing`, `Enter replaces a selection with one break`, `several cursors fall through to Fountain's Enter`;
  - `Shift+Enter at the end of BANG writes !BANG`, `Shift+Enter on an empty speech line writes two spaces`, `Shift+Enter elsewhere does what Enter does`;
  - `Tab walks the row and writes nothing`, for both templates, and `Shift+Tab walks back`;
  - `a read-only editor gives Tab back`, `the title page and a note give Tab back`;
  - `a CRLF file gets CRLF`, `a byte-order mark stays`;
  - `each key is one undo step and undo gives the exact text back`, `undo after a bar change gives the text back`.

  `tidy.test.ts`: `an empty line made and left is gone`, `a () made and left is gone with its line`, `a blank line that was in the file stays`, `at the end of the file it does nothing`, `an app change near a made line tidies nothing`, `the tidy and the move are one transaction`.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement** the tables as data (`NEXT` from Task 2 for the destination, a `WRITES` table beside it for the text), so they could be read by a later settings page (§17.2) with no more said here. `tidyLeft` follows `dropBarCueMark`: a filter returning `[tr, { changes, sequential: true }]`, standing back for `appChange`, no user event, and `input.replace`.
- [ ] **Step 4: Run them** → PASS; `pnpm --filter @drafter/cm-fountain test`; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): Enter and Tab move through the script in Classic Mode, and leave nothing behind`

### Task 5: The caret and the delete rules

**Files:**
- Create: `packages/cm-fountain/src/classic/hidden.ts`, `classic/caret.ts`, `packages/cm-fountain/test/classic/caret.test.ts`, `test/classic/delete.test.ts`
- Modify: `classic/index.ts`, `classic/keys.ts` (uses `visibleEnd`)

**Interfaces — Produces:**
```ts
// hidden.ts: the one list both this task and the view read
export interface HiddenSpan { from: number; to: number; kind: 'lead' | 'close' | 'pair' | 'note' | 'boneyard' | 'escape' | 'dual' }
/** What's hidden on the line: `lineMarks` less scene numbers, title-page lines, and an unclosed region's opener, plus closed regions' delimiters. A section's or synopsis's mark takes its space. */
export function hiddenSpans(state: EditorState, line: Line): HiddenSpan[];
export function visibleStart(state: EditorState, line: Line): number;
export function visibleEnd(state: EditorState, line: Line): number;

// caret.ts
/** A blank line between two elements, which isn't a place to stand (§6.4). Not an extra blank line, and not this stay's `made` line. */
export function passedOver(state: EditorState, pos: number): boolean;
export const classicCaret: Extension;       // transaction filter on selection changes
export const keepHiddenMarks: Extension;    // transaction filter on `delete.*`
export const classicArrows: Command[];      // ArrowUp, ArrowDown
export const classicBackspace: StateCommand;
export const classicDelete: StateCommand;
```
**`classicCaret`:** a lone cursor that lands inside or just before a hidden mark, or on a passed-over line, moves to the right place in its direction of travel (compared with the start state's head). A click on a passed-over line goes to the end of the element above. `Home`, `End`, and `Mod+End` come out right through it and `visibleStart`, `visibleEnd`. Extending a selection isn't moved. Cost: one line lookup, one `blockAt`.

**`classicArrows` (Spec against the code, 2):** `view.moveVertically(range, forward)`, repeated while `passedOver` and the line changes, keeping `goalColumn`, dispatched with `userEvent: 'select'` and `scrollIntoView`. Shift+arrows stay CodeMirror's.

**`keepHiddenMarks`:** CodeMirror's `deleteBy` runs `skipAtomic`, so Backspace just after a hidden `**` would take the whole pair. On a `delete.backward` or `delete.forward` that would take a hidden mark with text left on the line, the filter replaces the change with one that takes the character the writer sees, and an emptied pair goes with its last letter. It covers `Alt+Backspace` and `Cmd+Backspace` the same way. `delete.selection` is as in Fountain Mode.

- [ ] **Step 1: Write the failing tests.** `caret.test.ts`, in a real `EditorView` where a view is needed: `Left and Right step over a hidden mark as one`, `the cursor is never before a leading mark`, `reaching a line's end goes on to the next element's start`, `Home is the visible start and End the visible end`, `Mod+End is the end of the last element`, `a click on a passed-over line is the end of the element above`, `Up and Down pass a blank line between elements and keep their column`, `an extra blank line is a place to stand`, `the line just made is a place to stand`, `goto and reveal never land in a mark`, `an extending selection isn't moved`, `the caret steps over a mark beside an emoji`, `a right-to-left line keeps its order`, `an unclosed /* isn't hidden`, `a scene number is a place to stand`, `moving writes nothing`.

  `delete.test.ts`: one test for each §6.4 bullet: `Backspace at the visible start joins to the element above, in one step`, `on an empty line removes it and goes above`, `in an empty () takes both`, `Delete at the end of a line is the same join`, `Backspace after a hidden ** takes the last letter`, `an emptied pair goes with its last letter`, `Alt+Backspace takes the words the writer sees`, `a selection across one half of a pair does what Fountain Mode does`, `Backspace after a page break takes it`, `) before ) moves past it`.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.** Bind `ArrowUp`, `ArrowDown`, `Backspace`, and `Delete` in `classicKeys`. A typed `)` isn't a key binding: `classicMarks`' filter turns it into a move past the `)` that's there.
- [ ] **Step 4: Run them** → PASS; `pnpm --filter @drafter/cm-fountain test`; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): in Classic Mode the caret stays where a writer can see it`

### Task 6: The left pane

**Files:**
- Create: `packages/cm-fountain/src/classic/view.ts`, `packages/cm-fountain/test/classic/view.test.ts`
- Modify: `classic/index.ts`, `apps/web/app/editor/theme.ts`

**Interfaces — Produces:**
```ts
export const classicView: Extension;
/** `--c-<role>-indent`, `-width`, as whole numbers; a role whose numbers aren't integers is left out. */
export function roleVariables(template: Template): Record<string, string>;
/** `cm-c-<role>` for the cursor's line (stored) and every other line (the parser). */
export function lineClassOf(state: EditorState, line: Line): string | null;
```
- A `ViewPlugin` rebuilds on `docChanged`, `viewportChanged`, and a `classicLine` change, for `view.visibleRanges` only. It gives `Decoration.replace` for `hiddenSpans`, the same set to `EditorView.atomicRanges`, and `Decoration.line` for `lineClassOf`. It reuses the walk of `fountainDecorations` rather than a second pass over the blocks.
- Widgets, all with fixed words: `NoteRule` (a thin rule, at each end of a note, replacing `[[` and `]]`), `PageBreak` ("Page break", replacing `===`, atomic), `DualTag` ("dual", replacing `^`). `ignoreEvent` as CodeMirror's defaults. `aria-hidden` on the rule; `PageBreak`'s words are real text.
- `EditorView.editorAttributes.of((view) => …)` gives `class: 'cm-classic'` and, from `elementTemplate`, a `style` of `roleVariables` joined, kept by a `WeakMap` on the template, so a keystroke costs a lookup.
- `theme.ts` adds rules **all under `.cm-classic`**, so nothing applies with the compartment empty: each `.cm-c-*` with `padding-left: min(calc(var(--c-…-indent) * 1ch), <share>%)` and `max-width`; screenplay shares 30% for Character, 26% Parenthetical, 16% Dialogue, 45% Transition with `text-align: right`, and the same shape for a play; `cm-f-scene_heading`, `-character`, `-transition`, `-parenthetical` back to `var(--text)`; headings bold; `--note` and rule on notes; a section's size and weight; `.cm-c-note-rule` at least 3:1; `@media (forced-colors: active)` with `CanvasText` for the rule and the page-break line. **No `transition` or `animation` property.** Italics and bold come from the role's `style`, in `lineClassOf`'s class (`cm-c-italic`).

- [ ] **Step 1: Write the failing tests** in a real `EditorView`, on `view.contentDOM`: for each kind of mark in §8.3, `… is hidden, and the text is unchanged` (`@McGRAW`, `.FLASHBACK`, `!BANG`, `>FADE OUT.`, `>THE END<`, `~la`, `# Act`, `= sum`, `**bold**`, `\*`, `[[note]]`, `/* cut */`); `the title page shows as it is`; `a scene number stays visible`; `an unclosed /* and a stray ** show`; `a mark isn't in the DOM, so a reader never hears it`; `BANG on Action draws Action while the cursor is on it`; `a lone name draws Character while its Dialogue is pending, then Action`; `an opened file draws what the parser says`; `a line of <img src=x onerror=…> stays text`; `the indents come from the template, in numbers`; `a template whose numbers aren't integers adds no variable`; `only the visible ranges are decorated` (a script long enough that jsdom's viewport leaves lines out).
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them** → PASS; `pnpm -r --filter "./packages/*" build`, `pnpm --filter @drafter/web typecheck`, `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): the left pane looks like a script in Classic Mode`

### Task 7: The metadata block

**Files:**
- Create: `packages/cm-fountain/src/classic/metadata.ts`, `packages/cm-fountain/test/classic/metadata.test.ts`
- Modify: `classic/index.ts`, `classic/caret.ts` (clamps to the range)

**Interfaces — Consumes:** `metadataSpan`, `appChange`, `classicCaret`. **Produces:**
```ts
/** From the line breaks before the block to its end; null with no block `parse` reads as `doc.meta`. */
export function protectedRange(state: EditorState): Span | null;
export const keepMetadata: Extension;     // the filter, the backstop
export const metadataHidden: Extension;   // a StateField giving one block Decoration.replace
```
The decoration covers `lineAt(from).from` to `lineAt(to).to`, through the end of the text when only white space follows. `classicCaret` clamps both ends of every selection, lone cursors included, to the range's start. `keepMetadata` cuts a writer's change that overlaps the range back to the part above it, keeping the insert, selection, and user event, and stands back for `undo`, `redo`, `appChange`, no user event, and `input.type.compose`. **My call (Spec against the code, 6):** with no break between the insertion's end and the block, it adds two `state.lineBreak`s after the insert, in the same transaction.

- [ ] **Step 1: Write the failing tests,** one for each row of §8.4's table, on a stage play with a block, and:
  - `Select All, Delete leaves the block and an empty line`, `one undo gives the text back, byte for byte`, `a template holds`;
  - `the first letter of a new blank stage play keeps its template`: a document that is only the block, `doc.meta` equal after typing `x`, and the block still last;
  - `the selection stops above the block`, `Mod+End stops above the block`, `a block with a trailing break draws no extra line`, `an indented block is hidden whole`;
  - `setMeta, undo, and appChange pass the filter`; `a composition is not rewritten`;
  - `a damaged block isn't protected and shows as a boneyard`; `two blocks: only the last is protected`;
  - `with Classic Mode off, Select All then Delete removes the block`.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them** → PASS; `pnpm --filter @drafter/cm-fountain test`; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): the metadata block stays put in Classic Mode`

### Task 8: Autofill

**Files:**
- Create: `packages/cm-fountain/src/classic/offer.ts`, `packages/cm-fountain/test/classic/offer.test.ts`
- Modify: `classic/index.ts`

**Interfaces — Consumes:** `completionOverride`, `names`, `times`, `transitions`, `extensions`, `sectionTitles`, `optionsAfter`, `withoutLine`, `classicLine`, `setDismissed`, `classicEnter`, `classicTab`. **Produces:**
```ts
export interface Offer { from: number; options: Completion[] }
/** What §7.1 offers at `pos`, ranked; null where nothing is, or autofill was dismissed. */
export function offerAt(state: EditorState, pos: number, explicit: boolean): Offer | null;
export function classicSource(context: CompletionContext): CompletionResult | null;
/** The highlighted option of an open list, or the top of `offerAt`; applies it in one transaction. False with nothing to accept. */
export const acceptOffer: Command;
export function placesRecent(doc: Doc, lineFrom: number): string[];
```
- `classicSource` is `offerAt` with `filter: false` and the same `getMatch` as today, provided through `completionOverride`. It offers from the first letter in Character, Scene heading, and Transition (a play's Scene too), never on an empty line unless `explicit`. A heading's prefix list applies only to a **chosen** Scene heading; on soft Action, `INT. ` reaches places by the shape (§4.2). `explicit` with the text an exact place offers times at the end of the line, with `from` at the cursor, and each option's `apply` writes ` - TIME`.
- Each option has `apply: (view, completion, from, to) => …` dispatching one transaction: `insertCompletionText` with `pickedCompletion`, plus, in the same transaction, §7.3's next move: a name goes to Dialogue, a time or transition to Action, an extension stays. A place and a prefix stay on the line, then call `startCompletion(view)`. A name with lower case carries its hidden `@`.
- **Enter and Tab (Spec against the code, 1):** `classicKeys` binds `Enter` and `Tab` as `(view) => acceptOffer(view) || runState(view, classicEnter or classicTab)`. Escape binds a command that dispatches `setDismissed.of(true)` and returns false, so CodeMirror's `closeCompletion`, and the view's own arming of Tab, go on as they do. Down, Up, and PageDown stay CodeMirror's.

- [ ] **Step 1: Write the failing tests** in the style of `complete.test.ts`, each row of §7.1 for what's offered and its order, and each bullet of §7.3 in a real `EditorView`:
  - `places are most recent above the cursor first, in Classic Mode only` (Fountain order pinned beside it);
  - `lower-case names are offered`, `the line being typed is never offered`, `(CONT'D) isn't offered`, `a space after a name offers extensions, and so does (`;
  - `it opens at the first letter`, `it doesn't open on an empty line`;
  - `JU and Tab gives JUNE and Dialogue, with no list drawn`, `with Enter too`, `in the 75 ms after a list opens`, `with a list drawn`, each as one transaction and one undo step;
  - `a name with no match goes on to Dialogue`, `JO after Escape stays JO`, `the next letter offers again`, `a full label goes on`;
  - `accepting a place writes it and offers times`, `accepting a time writes  - NIGHT and goes to Action`, `Escape leaves INT. KITCHEN with no dash`, `a typed  - works as today`;
  - `accepting a prefix writes INT.  and offers places`;
  - `a transition goes to Action, an extension stays`;
  - `a name that breaks a list shows as text` (`<img src=x onerror=…>`: `label`, no `innerHTML`, read from the list's DOM);
  - `Fountain Mode's source is untouched`.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.** The source is synchronous, so `offerAt` serves the key path with no CodeMirror state. Screen-reader words (§7.4) go through `options.say`: "3 suggestions: JUNE" on opening, the highlighted label as it moves (a `ViewPlugin` reading `selectedCompletion` and `completionStatus`), and "JUNE. Dialogue." on accepting.
- [ ] **Step 4: Run them** → PASS; `pnpm --filter @drafter/cm-fountain test`; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): autofill for names and places in Classic Mode`

### Task 9: The chooser and the element commands

**Files:**
- Create: `packages/cm-fountain/src/classic/chooser.ts`, `packages/cm-fountain/test/classic/chooser.test.ts`
- Modify: `classic/index.ts`, `classic/keys.ts`, `packages/cm-fountain/src/index.ts`

**Interfaces — Produces:**
```ts
export interface ChooserItem { kind: ClassicKind; label: string; letter: string }   // letter: lower case, in the label
export function chooserItems(structure: ElementStructure, inSpeech: boolean): ChooserItem[];
export const classicChooser: Extension;
export const openChooser: StateCommand;
/** An element button or key: on an empty line in Classic Mode, `choosePending`; else `makeElement(kind)`. In Fountain Mode, exactly `makeElement(kind)`. */
export function elementCommand(kind: ClassicKind): StateCommand;
```
- A `StateField` for the open state gives `showTooltip`. The tooltip is `role="listbox"`, each row `role="option"` with a stable id, the active one `aria-selected`, with the letter in `<u>` built by `textContent`, never `innerHTML`. `EditorView.contentAttributes.compute` adds `aria-expanded`, `aria-controls`, `aria-activedescendant` while it's open. Rows are at least 44px tall below 1024px.
- **Keys while it's open** go first, at `Prec.highest`, through a `keydown` handler that takes Up, Down, Enter, Escape, and letters, and lets nothing reach the text: Up and Down move, Enter picks, a letter picks at once, and Escape closes and leaves the line as it was. Any other key, a click elsewhere, or a selection change closes it.
- **Letters, exactly:** Action `a`, Scene heading `s`, Character `c`, Transition `t`, Centered `e`, Lyric `l`, Section `i`, Synopsis `y`, Page break `b`, Dialogue `d`, Parenthetical `p`. In a play: Stage direction `s`, Act `a`, Scene `n`, Character `c`, Centered `e`, Lyric `l`, Synopsis `y`, Page break `b`, `d`, `p`. Order as §9.1.
- A pick writes nothing but `choosePending`, firm, except Page break (`insertPageBreak`) and anything that must be set apart. `Enter` in `classicEnter`'s empty-line case calls `openChooser`.
- `Mod-Alt-1…7` in `classicKeys` run `elementCommand` for `FORCED_KINDS`, with the same `onHint` words: read `elementHint`.

- [ ] **Step 1: Write the failing tests:** `Enter on an empty line opens it, and the file doesn't change`; `the items for a screenplay, a play, and in a speech`; `each letter picks`, as a table; `Up, Down, and Enter pick`; `Escape closes it and the line stays`; `a pick writes nothing`; `Action chosen is firm`; `a chosen Page break writes ===`; `a click picks`; `a load closes the chooser`; `the text box says the list is open, and which item`; `no letter reaches the text`; `an element key on an empty line sets the pending element`; `on a line with text it runs makeElement`; `with Classic Mode off elementCommand is makeElement`.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.** Export `chooserItems`, `elementCommand`, and `openChooser` from `index.ts`.
- [ ] **Step 4: Run them** → PASS; `pnpm --filter @drafter/cm-fountain test`; `pnpm check`.
- [ ] **Step 5: Commit.** `feat(cm-fountain): a chooser for the next element, and element keys that write nothing on an empty line`

### Task 10: The mode in the app

**Files:**
- Create: `apps/web/app/editor/writing-mode.ts`, `apps/web/app/components/ModeSwitch.vue`, `apps/web/test/writing-mode.test.ts`
- Modify: `apps/web/app/editor/extensions.ts`, `apply-settings.ts`, `session.ts`, `settings/settings.ts`, `settings/apply.ts`, `components/AppToolbar.vue`, `FocusMarker.vue`, `SettingsDialog.vue`, `commands/data.ts`, `commands/builtin.ts`
- Test: `apps/web/test/settings.test.ts`, `apply-settings.test.ts`, `command-data.test.ts`, `palette`'s and `shortcuts`' tests as they fail

**Interfaces — Produces:**
```ts
// settings.ts
export type WritingMode = 'fountain' | 'classic';
export const WRITING_MODES: readonly WritingMode[];
// Settings gains `writingMode: WritingMode` ('fountain') and `classicHintSeen: boolean` (false); isValid checks the first against WRITING_MODES.

// extensions.ts: `writingMode.of(NOTHING)` goes immediately before `language.of(…)`
export const writingMode: Compartment;
/** The same object each time, as TYPEWRITER is. Markdown gets nothing. */
export function writingModeExtension(mode: WritingMode, kind: DocumentKind): Extension;
// `const CLASSIC = classic({ say: sayElement })`, and at the same place in the base attributes, `aria-label` 'Source' stays; classic()'s contentAttributes come first, so 'Source, Classic Mode' and `aria-describedby` win.

// apply-settings.ts
export function applyEditorSettings(view: EditorView, settings: Settings, kind: DocumentKind): void;

// session.ts
readonly element: Readonly<ShallowRef<ClassicElement | null>>;   // follows `elementAt` when Classic is on; `cursor` as it is in Fountain Mode

// writing-mode.ts
export const CLASSIC_NOTICE = 'Classic Mode. Enter and Tab move between elements.';
export const FOUNTAIN_NOTICE = 'Fountain Mode. You type the marks.';
/** Sets the setting, says the notice, and gives focus back to the editor, with `view.scrollSnapshot()` in the reconfiguring dispatch. */
export function setWritingMode(mode: WritingMode): void;
```
**`ModeSwitch.vue`** (`data-tour="mode"`): §3.2 exactly. Wide: `role="group"` named "Writing mode", two real buttons with `aria-pressed`, the pressed one in `--accent-soft` and `--accent-text` with a border (forced colours), in the pattern of `.zoom-button` in `InspectorTools.vue`. Below 1024px: one button with the current word, named "Writing mode: Classic. Switch to Fountain.", at least 24px. `v-if` a Fountain script. Tooltips verbatim from §3.2. No transition. `AppToolbar.vue`: after `<SampleChip>`, before `.before-actions`; not in `TOOLBAR_FOLD_ORDER`. It's in the bar's `fit()` width by being a child, so nothing else changes. `FocusMarker.vue`: the compact form, after `.state`.

**Commands** in `data.ts`: `{ id: 'switch-to-classic', title: 'Switch to Classic Mode', group: 'View', keywords: ['final draft', 'mode', 'typing'] }`, `{ id: 'switch-to-fountain', title: 'Switch to Fountain Mode', group: 'View', keywords: [same] }`, and `{ id: 'switch-writing-mode', title: 'Switch writing mode', group: 'View', keys: 'Mod-Alt-0', global: true, keywords: [same] }` (**my call:** one key needs one command). The first two are enabled only when they'd do something; all three need a Fountain script. **Settings:** a row in the `writing` section, "Writing mode", Fountain and Classic, with the line from §3.3. `elementCommand` replaces `makeElement` in `builtin.ts`'s `element()` and its neighbours, and `insertPageBreak` on an empty line stays as it is.

`setKind` adds `writingMode.reconfigure(writingModeExtension(settings.value.writingMode, next))` to the dispatch with `language`. `load` passes `next` to `applyEditorSettings`, as do `settings/apply.ts`'s watcher (with `editor.kind.value`), whose list gains `writingMode`.

- [ ] **Step 1: Write the failing tests:**
  - `settings.test.ts`: `writingMode starts as fountain`, `a bad row is refused`.
  - `apply-settings.test.ts`: `Classic Mode goes in and comes out with no change to the text`, `a switch keeps the undo depth and the selection`, `changing another setting doesn't rebuild it`, `a load sets it again`, `a Markdown document gets nothing, and the next script is Classic again`, `setKind reconfigures it with the language`, `the compartment comes before language` (Classic's Tab runs first).
  - `command-data.test.ts`: `Mod-Alt-0 is free`, the commands' keywords, `the two switches are enabled only when they'd do something`.
  - `writing-mode.test.ts`: `a switch says its notice`, `a switch gives focus to the editor`, `the file is never touched`.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them.**
  ```bash
  set -e -o pipefail
  pnpm -r --filter "./packages/*" build
  pnpm --filter @drafter/web typecheck
  pnpm --filter @drafter/web exec vitest run
  pnpm check
  ```
- [ ] **Step 5: Add to CHANGELOG and commit.** `feat: a Fountain | Classic switch in the top bar, the palette, Settings, and on Mod+Alt+0`

### Task 11: Saying where you are: the announcer, the bar, the key line, the hint, the tour

**Files:**
- Create: `apps/web/app/editor/classic-key-line.ts`, `apps/web/app/components/ClassicHint.vue`, `apps/web/test/classic-key-line.test.ts`
- Modify: `components/ElementAnnouncer.vue`, `ElementBar.vue`, `AppStatusBar.vue`, `SourcePane.vue`, `pages/index.vue`, `editor/element-bar.ts`, `editor/element-names.ts`, `tour/tour.config.ts`, `settings/` nothing new
- Test: `apps/web/test/element-bar.test.ts`, `tour`'s test as it fails

**Interfaces — Produces:**
```ts
// element-names.ts
export function classicElementName(element: ClassicElement, structure: ElementStructure): string;   // "Stage direction", "Act", "Scene"
// classic-key-line.ts
export function keyLine(element: ClassicElement | null, structure: ElementStructure): string;       // "Enter: Character · Tab: Parenthetical"; '' with no element
// element-bar.ts
export function classicTip(button: BarButton, structure: ElementStructure): string;                 // no `Mark:`, no mark's character
```
- **`ElementAnnouncer.vue`** reads `session.element` in Classic Mode and `cursor` in Fountain Mode, so Fountain Mode's words don't change. A key that moves says where it went even when the word is the same: clear the region, then set it after `nextTick`. An arrow onto another line speaks only when the element changes.
- **`ElementBar.vue`:** the chip names `element`, pending included, and presses its button. Tooltips come from `classicTip`, whose sentences follow §9.2's: "Character. The name above a speech. Tab goes here from Action." The chip and `?` open `/docs/classic-mode/`. Buttons run the commands they did, which Task 10 made `elementCommand`.
- **`AppStatusBar.vue`:** `<span class="wide-only" data-item="keys">` with `keyLine`, in `--muted`, not a live region; it changes with the element, never with each letter. The chip's `aria-description` carries the same words.
- **`SourcePane.vue`:** a `sr-only` `<span id="classic-leave">` with "To leave the text, press Escape, then Tab. If a list is open, press Escape twice.", which `classic()`'s `aria-describedby` names. Always in the DOM.
- **`ClassicHint.vue`:** under the top bar in `index.vue`, shown when `writingMode === 'classic' && !classicHintSeen`, with §9.3's words verbatim, Got it and Learn more, each setting `classicHintSeen`. It takes no focus, and has a polite live region that's always in the DOM.
- **`tour.config.ts`:** one step, `id: 'mode'`, target `[data-tour="mode"]`, words of the tour's own voice. `TOUR_VERSION` stays 1. A welcome sentence: "Fountain-first", with Classic Mode beside it (§16).

- [ ] **Step 1: Write the failing tests:** `keyLine` as a table over §6's elements; `classicTip`: `tooltips hold no mark` (no `@`, `!`, `>`, `~`, `#`, `=`, `Mark:` in any button's tip, screenplay and play); `the chip names a pending element`; `a pending Stage direction, Act, and Scene are named`; `Fountain Mode's announcer says nothing on a blank line`; `the same word is said twice`; `the hint shows once, and takes no focus`; the tour's own test updated for one more step, with `TOUR_VERSION` still 1.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them** (the block in Task 10, Step 4) → PASS.
- [ ] **Step 5: Add to CHANGELOG and commit.** `feat: Classic Mode says where you are, in words, on the bar, and in the status bar`

### Task 12: Phones, input methods, paste, and typewriter

**Files:**
- Create: `packages/cm-fountain/src/classic/compose.ts`, `packages/cm-fountain/test/classic/compose.test.ts`, `test/classic/paste.test.ts`
- Modify: `classic/marks.ts`, `classic/index.ts`, `apps/web/app/components/ElementBar.vue`, `SourcePane.vue`, `composables/useElementBarShown.ts`, `editor/typewriter.ts`
- Test: `apps/web/test/typewriter.test.ts`

**Interfaces — Produces:**
```ts
export const classicComposition: Extension;
/** Runs `then` now, or a task after a composition ends, with `relint`'s check for one abandoned. */
export function whenComposed(view: EditorView, then: () => void): void;
export const COMPOSITION_CHECK_MS = 500;
/** What Tab does, for a button; waits for a composition. */
export const classicNext: Command;
```
- **Composition (§10):** a `ViewPlugin` listens for `compositionend`, then in a `setTimeout` (never a microtask: `session.ts` explains the lost text) dispatches one transaction that capitalises what was typed and adds any mark, with `classicEdit`. While `view.composing`, a line class `cm-c-composing` on Character, Scene heading, and Transition lines gives `text-transform: uppercase`, only then, or an opened `@McGRAW` would show as `MCGRAW`. Enter and `classicNext` go through `whenComposed`.
- **Paste (§11):** a `input.paste` or `input.drop` of one line takes the line's element and may get a mark, as `settleLine`; several lines add no marks. It gets the blank lines it needs above and below (`Paste gets its blank lines`). `input.replace` is left alone.
- **Next button:** the first control in the element row, in Classic Mode, below 1024px with the keyboard up: "Next: Character", at least 44px wide, `@mousedown.prevent`. `useElementBarShown` is true then whatever the setting, and in focus mode (§10). Other cases don't change.
- **`centersOn`:** returns true for `tr.annotation(classicMove)`, ahead of the `navigated` check. `classicMove` comes from `@drafter/cm-fountain`. `keys.ts` sets it on a key that writes nothing.

- [ ] **Step 1: Write the failing tests.** `compose.test.ts`: `a composition is never rewritten while it runs`, `it's capitalised after it ends, with its mark, in one step`, `an abandoned composition is settled`, `Enter waits for it`, `capitals by CSS only while composing`. `paste.test.ts`: `a Fountain script pasted in comes out as it was`, `one line takes the line's element`, `pasted june on a Character is @june`, `a paste gets the blank lines it needs`, `paste isn't capitalised`, `a replace-all is left alone`. `typewriter.test.ts`: `a Tab that writes nothing centres`.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them** (the block in Task 10, Step 4, plus `pnpm --filter @drafter/cm-fountain test`) → PASS.
- [ ] **Step 5: Add to CHANGELOG and commit.** `feat: Classic Mode on phones and with input methods, paste, and typewriter scrolling`

### Task 13: The byte promise and the traps

**Files:**
- Create: `packages/cm-fountain/test/classic/oracle.ts`, `model.test.ts`, `promises.test.ts`, `apps/web/test/trap-classic.test.ts`
- Modify: `fixtures/trap/entry-points.ts`, `traps.ts`, `README.md`, `MANIFEST.md` (regenerated), `harness.test.ts` (only its doc-count list if it fails), `.github/workflows/desktop.yml` (line 107's step gains `trap-classic.test.ts`), `README.md`'s trap count, `packages/cm-fountain/test/complexity.test.ts`' hostile list for the new patterns

**Interfaces — Produces:**
```ts
// oracle.ts: written from the spec alone, importing nothing from src/classic
export interface Spoken { kind: ClassicKind; words: string }
export function fountainOf(elements: readonly Spoken[], template: 'screenplay' | 'stage'): string;
```
`fixtures/trap`: `Entry` gains `'classic'`; `ENTRY_POINTS` gains §15.2's words; `TRAPS` gets `classic: { kind: 'opens' }` by a mapping over every trap whose `web-open` outcome opens as Fountain (not Markdown), applied where `TRAPS` is exported. §15.2's new traps are added by hand, each with a sentence in `tests`, generated when they're large.

- [ ] **Step 1: Write the tests, which pass if Tasks 2 to 9 are right.** A failure here is a bug in those, fixed there, not by changing the oracle.
  - `model.test.ts`, with fast-check: `typing the elements gives the oracle's bytes`, `and parses back to the same elements`, for both templates; words from an arbitrary with `.45`, `@home`, `#1`, `!Bang`, `INT. `, all capitals, `CUT TO:`, `~`, `===`, no-case names, and emoji across the pair.
  - `promises.test.ts`: `Classic only adds what it may` (a diff checker of §4.1's table, allowing a prefix's letters to change case and the two additions in Global Constraints); `moving writes nothing` (every file in `fixtures/classification`, the samples, and the generators; arrows, Home, End, `Mod+End`, random clicks, Page keys; tidying only takes back what the test made); `switching writes nothing` (`doc.eq`, no `docChanged`, the same selection, the same `undoDepth`); `a letter and its mark are never split` (undo and redo with spaced time); `Action stays Action` (capitals on Action never become a cue, by any key sequence, and a line that would read as a cue because of the line below has its `!`); `the metadata block stays` (any key sequence: its bytes the same, last, `doc.meta` equal); `marks kept` (a script with a mark on every line, edited on one, keeps every other line's bytes); `CRLF stays CRLF`; `a byte-order mark stays`.
  - `trap-classic.test.ts`, reusing `trap-open.test.ts`'s open: for each `trapsFor('classic')`, the text through `openFile`, then in a real `EditorView` with `classic()`: the pane drawn, the cursor walked through every line by `state.update` (no view), and through at most 2,000 evenly spaced lines by `view.dispatch`, the mode switched both ways, then the text byte-identical, nothing thrown, and the walk inside `LIMIT_MS`. The list-breaker's name is in the DOM only as text.
  - The traps of §15.2, all of them: `classic-only-marks`, `classic-unclosed-boneyard-line-1`, `classic-unclosed-note`, `classic-boneyard-in-note`, `classic-note-across-lines`, `classic-meta-damaged`, `classic-meta-not-last`, `classic-meta-twice`, `classic-long-line`, `classic-5mb`, `classic-spaces-heading`, `classic-100k-marks`, `classic-bidi-edge`, `classic-combining-edge`, `classic-list-breaker`.
- [ ] **Step 2: Run them.**
  ```bash
  set -e -o pipefail
  pnpm -r --filter "./packages/*" build
  pnpm --filter @drafter/cm-fountain test
  pnpm --filter @drafter/web exec vitest run test/trap-classic.test.ts
  pnpm vitest run --project trap
  pnpm check
  ```
  `MANIFEST.md` regenerates with `-u` on `the manifest` test alone; read its diff before committing.
- [ ] **Step 3: Fix what they find, in the task's own file, and run them again.**
- [ ] **Step 4: Add to CHANGELOG and commit.** `test: Classic Mode's byte promise, by property and through every trap`

### Task 14: In the browser, and the budgets

**Files:**
- Create: `apps/web/e2e/classic.spec.ts`
- Modify: `apps/web/e2e/a11y.spec.ts`, `keyboard.spec.ts`, `phone.spec.ts`, `composition.spec.ts`, `cast-budget.spec.ts`, `focus.spec.ts` if the marker's list is asserted, `first-visit.spec.ts`, `tour.spec.ts`

- [ ] **Step 1: Write the tests,** one for each §15.4 bullet, with the spec's words in their names, none using the four filtered words (Global Constraints):
  - `classic.spec.ts`: `the agreed flow from a blank script`, the file compared; `the switch shows at 1280, 1024, 800, and 320px and never folds`; `the switch shows in focus mode`; `the switch is absent in Markdown`; `a first visit is Fountain`, `a reload keeps the choice`; `Settings, the palette, and the key all switch, and the file doesn't change`; `Esc then Tab leaves the editor`, `Esc then Shift+Tab`, `one Esc with a list open doesn't, and Esc Esc Tab does`, `in focus mode Esc leaves it too`, `Ctrl+M`, `F6`; `JU and Tab with no wait gives JUNE and Dialogue`, `with Enter`, `a name with no match moves on`, `JO after Escape stays JO`; `Select All, Delete on a stage play keeps the template, and Undo restores`, `cut and paste over all, the same`; `the first letter of a blank stage play keeps the template`; `int. becomes INT.`, `BANG on Action stays at the Action indent, and Enter gives a new Action`; `forced colours`; `reduced motion: nothing has a transition` (`getComputedStyle` on the list, chooser, hint, and switch).
  - `a11y.spec.ts`: axe with Classic Mode on, in dark and light, with the list, chooser, and hint open. Contrast of `--note` and `--muted` on `--current-line`, and the status bar's key line.
  - `keyboard.spec.ts`: `no trap in Classic Mode, walked by Tab`.
  - `phone.spec.ts`: `the Next button`, `the row shows whatever the setting, and in focus mode`, `the chooser`.
  - `composition.spec.ts`: `names and heading capitals after a composition`, `text isn't lost at Enter`.
  - `cast-budget.spec.ts`: `Classic Mode typing budget at 120 pages` with `long-script.ts`: on line 3,000, no long task, as "typing with the Stats tab shown" does; `Classic Mode adds under 1 ms a keystroke at p95: budget`; `a switch at 120 pages: budget`; `scrolling at 120 pages doesn't jump in Classic Mode: budget`.
  - `first-visit.spec.ts`: a first visit's `writingMode`, and that no hint shows.
- [ ] **Step 2: Run them.**
  ```bash
  set -e -o pipefail
  pnpm -r --filter "./packages/*" build
  E2E_PORT=4198 pnpm --filter @drafter/web e2e --project=chromium -g "Classic|classic"
  E2E_PORT=4198 pnpm --filter @drafter/web e2e --project=firefox -g "Classic|classic"
  E2E_PORT=4198 pnpm --filter @drafter/web e2e --project=webkit -g "Classic|classic"
  ```
  Then the same with `--project=phone` and `--project=phone-webkit`.
- [ ] **Step 3: Fix what they find,** in the code that's wrong, and take a screenshot of the left pane in dark and light at 1280 and 320px with the `viewcap` MCP server to look at it (Playwright from `apps/web` for several states).
- [ ] **Step 4: Run them again,** then the whole of chromium: `E2E_PORT=4198 pnpm --filter @drafter/web e2e --project=chromium`.
- [ ] **Step 5: Add to CHANGELOG and commit.** `test: Classic Mode in every browser, and its budgets`

### Task 15: Docs, the image, and the gates

**Files:**
- Create: `apps/web/app/pages/docs/classic-mode.vue`
- Modify:
  - **Lists a new help page must join:** `apps/web/app/commands/data.ts` (`HELP_PAGES`: `{ id: 'help-classic-mode', path: '/docs/classic-mode', title: 'Classic Mode' }` after Fountain cheat sheet), `commands/help-menu.ts` (`HELP_MENU_ICONS`: `'help-classic-mode': 'i-lucide-corner-down-left'`), `pages/docs/index.vue` (its description, and its blurb), `apps/web/test/command-data.test.ts` (`has the fifteen help pages`, and both path lists at lines 140 and 203), `apps/web/e2e/a11y.spec.ts` (the path list at 603). Check that nothing's missed: `grep -rln "help-self-hosting\|docs/self-hosting" apps packages scripts --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.output --exclude-dir=.nuxt` must name no file that doesn't also hold `classic-mode`.
  - `pages/docs/shortcuts.vue` (a Classic Mode section), `pages/docs/fountain.vue` (the line at its top), `pages/docs/what-is-drafter.vue` (a sentence), `whats-new/entries.ts`, `brand/build.mjs`, the files it writes, `brand/README.md`, `apps/web/scripts/ui-shots.mjs` (`--readme`), `docs/images/`, `README.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/DEFERRED.md`, `docs/WHY.md`, `docs/AUDITS.md`, `docs/drafter-classic-mode-design.md` (Status line), `CHANGELOG.md`

- **Help page (§16):** in order: what it is, "It isn’t Fountain typing; it’s what many script writers expect, and your file stays Fountain"; how to switch; the tables of §6 in plain words, with the first-time flow; autofill; the chooser; leaving the text in §12's words, Esc twice with a list open, Ctrl+M (Shift+Alt+M on a Mac), F6; phones; what's hidden and why it's safe; "Is my file still Fountain? Yes."; "Final Draft is a trademark of its owner, and Drafter isn’t connected with it."
- **What's new:** `id: 'v0.25.0-classic-mode'`, kind `New`, version `0.25.0`, `banner: true`, title "Classic Mode: type the way many screenwriters expect", text "Enter and Tab move through the script, names and places fill themselves in, and your file stays Fountain.", link `/docs/classic-mode/`.
- **The image (§16):** `'Fountain first.'` → `'Fountain or Classic.'`, same gradient; `'Classic mode: coming soon.'` → `Same file. Your choice of keys.`; the first line stays; the two front cards show §16's scene both ways, verbatim; the alt text at line 274 and in the README: "Drafter: Fountain or Classic. The same scene typed both ways, on two script pages…"; the comment at lines 245 and 246. Run the build, then read the PNG to check it.
- **README:** the Status line, the front-door paragraph, a Features row, the Roadmap moved to done, a gallery picture from `ui-shots --readme`, line 3's alt text. **ROADMAP,** and **WHY** as a choice. **DEFERRED:** §17.2's list, and the Beat Board block. **AUDITS:** Classic Mode pending the next audit. **DECISIONS** ("Classic Mode"): every Call as built, and each **my call** in this plan: Spec against the code 1 to 9 and the run's cap; `switch-writing-mode` as a third command; the trap harness's place; the mark's own space; the answer to the two points for the maintainer.
- **CHANGELOG `[Unreleased]`:** Added: Classic Mode, one paragraph. Changed: `appChange` moved to `cm-fountain`. The release itself, its version bump, and its section belong to the release, after the maintainer's by-hand checks of §15.5, and aren't in this plan.

- [ ] **Step 1: Write the page, the docs, and the image.** Then `pnpm test-counts`, and update counts where the docs give them.
- [ ] **Step 2: Full gates:**
  ```bash
  set -e -o pipefail
  pnpm install
  pnpm -r --filter "./packages/*" build
  pnpm check
  pnpm -r --workspace-concurrency=1 --filter "./packages/*" test
  pnpm --filter @drafter/web typecheck
  pnpm --filter @drafter/web exec vitest run
  pnpm --filter @drafter/desktop test
  pnpm vitest run --project trap
  pnpm bench
  E2E_PORT=4198 pnpm --filter @drafter/web e2e --project=chromium
  ```
- [ ] **Step 3: Check the words.** `grep -rniE "final draft mode|classic mode: coming" apps/web/app brand/build.mjs README.md` finds nothing. Every "Final Draft" in `apps/web/app` for this feature is a keyword, the help's comparison, or its trademark line.
- [ ] **Step 4: Commit.** `docs: Classic Mode in the help, the README, What's new, the image, and the decisions`

---

## Self-review

- **Spec coverage:** §1–2 → the header. §3.1 → Task 10. §3.2 → Task 10 (switch, focus mode, Markdown). §3.3 → Task 10. §3.4 → Tasks 10, 13 (`switching writes nothing`). §4.1–4.2 → Task 3; §4.3 → Tasks 2, 6; §4.4 → Task 4; §4.5 → Tasks 6, 13. §5 → Task 2. §6.1–6.3 → Task 4; §6.2's Enter → Task 9; §6.4 → Tasks 4, 5. §7.1–7.3 → Task 8; §7.4 → Task 8. §8.1–8.3 → Tasks 5, 6; §8.4 → Task 7. §9.1 → Task 9; §9.2 → Tasks 9, 11; §9.3 → Task 11. §10 → Task 12 (the row, Next, composition), Task 9 (chooser's rows). §11 → Task 12 (paste, typewriter), Task 7 (Copy and Cut, by the selection's clamp), Task 3 (filters stepping back), Task 10 (Markdown), Task 13. §12 → Tasks 8, 9, 10, 11, 14. §13 → Global Constraints, Tasks 3, 14. §14 → File Structure. §15.1 → Task 13; §15.2 → Task 13; §15.3 → each task; §15.4 → Task 14; §15.5 → the release, Task 15. §16 → Task 15. §17 → Global Constraints, Task 15 (DEFERRED). §18 → each Call is in the task for its section.
- **Types:** `ClassicKind`, `StoredLine`, `ClassicElement`, `HiddenSpan`, `LineMark`, `Offer`, `ChooserItem`, `Spoken`, `WritingMode` are defined once and used by those names after. `classicEdit` (Task 2), `classicMove` (Task 4), `setStored`, `setDismissed` (Task 2), `completionOverride`, `elementTemplate`, `metadataSpan`, `appChange` (Task 1). `visibleEnd` is Task 5's; Task 4 handles only Centered's `<` by itself until then, and Task 5 replaces that.
- **Proportion:** the plan carries names, signatures, and test names; every body is the implementer's.
