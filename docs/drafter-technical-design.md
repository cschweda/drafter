# drafter.dev — Technical Design

*Companion to `drafter-architecture.md`. This document says how each piece works.*

Author: Christopher Schweda · Status: Draft v0.1 · October 2026 · License target: MIT

---

## 0. Clean-room statement

Drafter is a clean-room implementation. Every algorithm, data structure, and format rule in this document is derived from exactly three inputs:

1. The **public Fountain specification** (fountain.io) — an open text format whose syntax is published for anyone to implement.
2. The **publicly documented structure of Final Draft's `.fdx` file format** — plain XML whose element and attribute names are visible in any `.fdx` file a user owns.
3. **General software engineering** — text editing, line-breaking, pagination, and browser storage techniques that are common knowledge.

No source code from Beat, Final Draft, Trelby, Scrite, BetterFountain, afterwriting, Highland, Slugline, Fade In, or any other screenwriting application has been read, copied, adapted, or consulted in producing this design. Where this document describes behavior that other applications also exhibit (Tab cycling, `(MORE)`/`(CONT'D)` splitting, scene numbering), that behavior is dictated by the format and by industry formatting conventions, not by any product. Contributors must preserve this: **do not read other screenwriting applications' source while working on `@drafter/*` packages.** Reading their documentation, using their binaries, and comparing their output is permitted; reading their code is not.

---

## 1. System overview

```
                     ┌──────────────────────────────────────────────────┐
                     │                 apps/web (Nuxt 4, SPA)            │
                     │                                                  │
   keystrokes ──────▶│  CodeMirror 6 ──doc text──▶ @drafter/fountain    │
                     │       ▲                          │ CST           │
                     │       │ decorations,             ▼               │
                     │       │ diagnostics      ┌───────────────┐       │
                     │       │                  │ Derived state │       │
                     │       │                  │  outline, chars,     │
                     │       └──────────────────│  locations, lint,    │
                     │                          │  spell, stats        │
                     │                          └───────┬───────┘      │
                     │                                  │ CST+template  │
                     │                       ┌──────────▼──────────┐   │
                     │                       │  Layout Worker      │   │
                     │                       │  @drafter/layout    │   │
                     │                       └──────────┬──────────┘   │
                     │                                  │ Pages        │
                     │            ┌─────────────────────┼─────────┐    │
                     │            ▼                     ▼         ▼    │
                     │      render-html            render-pdf   stats  │
                     │      (right pane)           (export)            │
                     └──────────────────────────────────────────────────┘
                                  │ autosave               ▲ open/import
                                  ▼                        │
                     IndexedDB (Dexie) ◀──────────▶ File System Access / download
```

One parser. One text buffer (CodeMirror's `EditorState.doc`). Everything else is a pure function of that buffer plus the active template, and every derived view maps back to the buffer by character offset.

### 1.1 Package dependency graph

```
fountain ◀── templates ◀── layout ◀── render-html
   ▲                          ▲   ◀── render-pdf
   │                          │   ◀── stats
   ├── cm-fountain            │
   ├── outline                │
   ├── lint ──────────────────┘   (lint needs page positions for "scene too long")
   ├── fdx
   └── spell
```

`fountain` depends on nothing. `templates` depends on nothing but its own schema (it imports `fountain` only for element-kind types). No package depends on Vue, Nuxt, or the DOM except `render-html` (DOM only) and `cm-fountain` (CodeMirror only).

---

## 2. `@drafter/fountain` — parser and printer

### 2.1 Design decisions

- **The output is a CST, not an AST.** Every node keeps its raw source text and the exact whitespace around it, so `print(parse(src)) === src` holds byte-for-byte for *any* input, not just well-formed input. Semantic fields (`kind`, `name`, `text`) are computed from the raw text and cached on the node.
- **Markup is visible.** Drafter does not hide Fountain syntax. The editor shows `@`, `!`, `>`, `~`, `#`, `=`, `[[ ]]`, `/* */` as typed. An optional "clean" display mode (Phase 4) hides markers with CodeMirror replace-decorations without changing the document. This resolves the source-is-truth contradiction: the text is always exactly what the writer sees or can choose to see.
- **Block-based, context-sensitive, incremental.** Fountain's unit of meaning is the *block* — a run of non-blank lines bounded by blank lines. A block's kind depends on its own lines plus, at most, the kind of the block immediately before it. That bounded context is what makes incremental reparsing cheap.

### 2.2 Data structures

```ts
interface Doc {
  titlePage: TitlePage | null;
  blocks: Block[];               // in document order
  source: string;                // the full text (reference, not copy)
}

interface Span { from: number; to: number }   // character offsets into source

interface Block {
  span: Span;                    // from first char of first line to end of last line
  leading: string;               // blank lines before this block (trivia), e.g. "\n\n"
  lines: Line[];
  kind: BlockKind;
  // kind-specific semantic data, computed lazily:
  sem: SceneHeadingSem | CharacterSem | DialogueSem | SectionSem | ... | null;
  forced: boolean;               // kind came from a forced marker
}

interface Line {
  span: Span;
  raw: string;                   // exact text, including trailing spaces
  inline?: InlineRun[];          // emphasis runs, computed lazily
}

type BlockKind =
  | 'scene_heading' | 'action' | 'character' | 'parenthetical' | 'dialogue'
  | 'transition' | 'centered' | 'lyric' | 'section' | 'synopsis'
  | 'note' | 'boneyard' | 'page_break' | 'blank';
```

A `character` block and its following `parenthetical`/`dialogue` blocks form a **dialogue group**. Fountain places no blank line between character, parenthetical, and dialogue, so in the raw text they are *one* block; the parser splits that physical block into logical blocks: the first line is `character`, each line wrapped in parentheses is `parenthetical`, remaining lines are `dialogue` (consecutive dialogue lines merge into one `dialogue` block with embedded newlines). The `DialogueGroup` is a view over these, not a node.

Notes `[[ ]]` and boneyard `/* */` may span blocks. They are extracted in a pre-pass (§2.4) and the regions they cover are marked so that block classification skips them.

### 2.3 Title page

The title page is a run of `Key: value` lines at the very top of the file, ended by the first blank line. Values may continue on following lines if those lines are indented by three or more spaces or a tab. Keys are case-insensitive; the parser preserves the original key text. Recognized keys: `Title`, `Credit`, `Author`, `Authors`, `Source`, `Draft date`, `Date`, `Contact`, `Copyright`, `Notes`. Unknown keys are kept and round-tripped; the layout engine ignores them unless the template names them. Drafter does **not** store settings in the title page (see §8.6).

### 2.4 Pre-pass: notes and boneyard

A single left-to-right scan records every `[[ … ]]` and `/* … */` region as a `Span` in a sorted list. Nesting is not supported (per spec). Unclosed regions extend to end of file and produce a lint diagnostic. The classifier treats characters inside these regions as whitespace for the purpose of deciding whether a line is blank, which matches the spec's rule that a boneyard removes its content from the script.

### 2.5 Block classification

Given a physical block `B` with lines `L[0..n]` and the kind of the previous non-blank block `P`, in this order:

| # | Test on `L[0]` (after trimming leading spaces) | Kind |
|---|---|---|
| 1 | `===` or longer run of `=` only, single line | `page_break` |
| 2 | starts with `#` (one or more) | `section` (depth = count of `#`) |
| 3 | starts with `=` | `synopsis` |
| 4 | starts with `!` | `action` (forced; marker stripped for `sem.text`) |
| 5 | starts with `@` | `character` (forced) |
| 6 | starts with `~` | `lyric` |
| 7 | starts with `>` and ends with `<` | `centered` |
| 8 | starts with `>` | `transition` (forced) |
| 9 | starts with `.` and `L[0][1]` is not `.` | `scene_heading` (forced) |
| 10 | single line, all uppercase letters, ends with `TO:` | `transition` |
| 11 | first word (before space or period) matches `^(INT|EXT|EST|INT\.?/EXT|I/E)\.?$` case-insensitive, and `P !== 'character'` | `scene_heading` |
| 12 | `L[0]` is entirely uppercase (letters), contains at least one letter, previous block is not `character`, and block has ≥ 1 more line **or** the next block is dialogue-shaped | `character` (the whole physical block becomes a dialogue group per §2.2) |
| 13 | otherwise | `action` |

"Entirely uppercase" means: every letter in the line is uppercase; digits, punctuation, and spaces are allowed. A trailing parenthetical extension `(V.O.)`, `(O.S.)`, `(CONT'D)` is part of the character line and is parsed into `sem.extension`. A trailing `^` marks dual dialogue (`sem.dual = true`) and is stripped from the name.

Rule 12's "block has ≥ 1 more line" is the spec's requirement that a character cue be followed by dialogue; a lone uppercase line is action (a shouted word, a sound). The exception "next block is dialogue-shaped" does not exist in the spec and is **not** implemented; it is listed only to record that it was considered and rejected — a lone uppercase line is action, full stop. The lint rule `character-without-dialogue` catches the usual typo instead.

Scene numbers: a scene heading ending in `#…#` (e.g. `INT. KITCHEN - NIGHT #12A#`) yields `sem.number = '12A'`, and the number is stripped from `sem.text`.

Scene heading decomposition: `sem.prefix` (`INT.`), `sem.location` (`KITCHEN`), `sem.time` (`NIGHT`) by splitting on the last ` - ` (space-hyphen-space) or ` – `. If there is no separator, `time` is null and a lint rule may fire depending on the template.

### 2.6 Inline emphasis

Within `action`, `dialogue`, `parenthetical`, `centered`, and `lyric` text: `*italic*`, `**bold**`, `***bold italic***`, `_underline_`. Markers must be unescaped (`\*` is a literal asterisk). An opening marker must be followed by a non-space; a closing marker must be preceded by a non-space; unmatched markers are literal. Emphasis does not cross line boundaries. The result is `InlineRun[]` of `{ text, bold, italic, underline, span }`.

### 2.7 Incremental parsing

The editor calls `reparse(doc: Doc, change: { from, to, insert })`. Steps:

1. Apply the change to `doc.source`.
2. Find the block containing `from` and the block containing `to` (binary search on `blocks[].span`). Expand the window one block backward (classification depends on the previous block) and one block forward (the next block's classification depended on the changed block).
3. Re-run the note/boneyard pre-pass only if the change touches `[`, `]`, `/`, or `*`, or lies inside an existing region; otherwise shift existing region spans.
4. Re-split and re-classify the window. Compare the kind of the block *after* the window to its previous kind; if it changed, extend the window forward one block and repeat (this converges within one or two blocks in practice because kinds rarely cascade).
5. Shift the spans of all blocks after the window by `insert.length - (to - from)`.

Full reparse is O(n) and fast enough for any script (a 120-page feature is ~6,000 lines); incremental parsing exists to keep keystroke latency flat, not because full parsing is slow. A `debug.fullReparseCheck` flag reparses from scratch and asserts structural equality on every change in development builds.

### 2.8 Printer

`print(doc)` concatenates `block.leading + lines.map(l => l.raw).join('\n')` for every block, plus the title page's raw text. Because every node retains raw text, printing is trivially lossless. Semantic edits (rename a character everywhere, renumber scenes, change a synopsis) are expressed as **text changes** `{ from, to, insert }[]` computed against spans, never as mutations of `sem` followed by re-serialization. This keeps the printer dumb and the invariant intact.

### 2.9 Invariants and tests

- `print(parse(s)) === s` for every string `s`, including malformed input. Property-tested with random byte strings and with mutations of real scripts.
- `structurallyEqual(parse(s), reparse(parse(s'), delta(s', s)))` for random edit sequences, where `structurallyEqual` compares kinds, raw text, and semantic fields but **not** spans (spans are positional and compared separately).
- A fixtures directory of hand-written `.fountain` files with expected block-kind sequences as `.json` sidecars, covering every row of the classification table and every ambiguity the spec discusses (uppercase action lines, `INT` as the first word of an action sentence, lone transitions, dual dialogue).

---

## 3. `@drafter/cm-fountain` — editor integration

### 3.1 State

A CodeMirror `StateField<Doc>` holds the parse. Its `update` applies each transaction's changes through `reparse` (§2.7). All other editor features read this field; none re-parse.

### 3.2 Highlighting without a second parser

A `ViewPlugin` builds a `DecorationSet` from `Doc.blocks` for the visible viewport only (`view.viewport` plus a margin). Each block gets a line decoration with class `cm-f-<kind>` and each inline run a mark decoration. Markers (`@`, `!`, `#`, `=`, `>`, `<`, `~`, `[[`, `]]`, `/*`, `*/`, `#n#`) get `cm-f-marker` so they can be dimmed, or replaced with zero-width widgets in "clean" mode. There is no Lezer grammar; `@drafter/fountain` is the only parser.

### 3.3 Keymap

The keymap is a layer of *conveniences* over plain text editing. Every command is expressed as an ordinary transaction and is undoable. The table defines behavior precisely; `cur` is the block containing the cursor, `line` its current line.

| Key | Context | Effect |
|---|---|---|
| `Enter` | in `character` line | insert `\n` (next line becomes dialogue by Fountain rules — nothing to insert) |
| `Enter` | in `dialogue`, line non-empty | insert `\n` (continues dialogue) |
| `Enter` | in `dialogue`, line empty | insert `\n` (second newline ends the group; next text is action) |
| `Enter` | in `parenthetical`, cursor before `)` | move cursor past `)`, then insert `\n` |
| `Enter` | in `scene_heading` | insert `\n\n` (headings are always followed by a blank line) |
| `Enter` | in `transition` | insert `\n\n` |
| `Tab` | on empty line after blank | insert `@` and set a transient "cue mode" flag: the next printable characters are uppercased as typed until `Enter`. The `@` stays in the text. |
| `Tab` | on empty line inside dialogue group | insert `(` `)` with cursor between (parenthetical) |
| `Tab` | in `character` line | toggle extension: cycle `` → `(V.O.)` → `(O.S.)` → `(CONT'D)` → `` |
| `Tab` | in `action` line with text | uppercase the line and prefix `@` (convert to cue). **This mutates case** and is therefore a distinct, undoable command named `convertToCharacter`, never silent. |
| `Shift+Tab` | in `character` line | remove `@` if present and lowercase-except-first-letter (convert to action, command `convertToAction`) |
| `Mod+1..7` | anywhere | force kind via marker: `.` heading, `!` action, `@` character, `(…)` parenthetical, `>` transition, `>…<` centered, `~` lyric. Inserting a marker never changes case. |
| `Mod+Shift+D` | in dialogue group | append `^` to the character line (dual dialogue) |
| `Mod+/` | selection | wrap in `[[ … ]]` (note) |
| `Mod+Shift+/` | selection | wrap in `/* … */` (boneyard) |

Auto-uppercasing applies only in cue mode after `Tab` on a blank line and in scene headings whose first word matched rule 11. It is an input filter (`EditorState.transactionFilter`) that rewrites inserted text, so it is visible, immediate, and undoable, and it never retroactively changes text already typed.

### 3.4 Autocomplete

A `CompletionSource` keyed on `cur.kind`:

- In a character line (or after `@`): names from `Doc.characters()` — the distinct `sem.name` set, ranked by recency of last use, then frequency. Extensions offered as secondary completions.
- In a scene heading: after the prefix, locations from `Doc.locations()`; after ` - `, times (`DAY`, `NIGHT`, `CONTINUOUS`, `LATER`, `MOMENTS LATER`, plus any time strings already used).
- On a line starting with `>`: transitions seen in the document plus `CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`, `FADE OUT.`.
- After `#`: existing section titles (for cross-reference while outlining).

Completion is explicit (`Ctrl+Space`) or triggered after two characters; it never auto-inserts on `Enter` unless the popup is open and an item is selected.

### 3.5 Folding

Fold ranges are computed from the CST: each `section` folds to the next section of equal or shallower depth; each `scene_heading` folds to the next heading or section. Folded headers show the heading text plus the first synopsis line, which is what "condense to outline" means in the source pane (§7).

### 3.6 Cursor ↔ element mapping

`Doc.blockAt(offset)` and `Block.span` make both directions O(log n). The editor exports a `cursorElement` reactive value `{ blockIndex, lineIndex, kind }` that the right pane subscribes to for scroll-sync and that the status bar displays.

---

## 4. `@drafter/templates` — format definitions

### 4.1 Units

All template measurements are in **characters** (horizontal) and **lines** (vertical) at the template's base font. For monospace fonts at 12pt, 10 characters = 1 inch and 6 lines = 1 inch, so a US letter page is 85 × 66 and a 1.5"/1" left/right margin gives a 60-character text column. Inches are accepted in template files as `{ in: 1.5 }` and converted at load time; the engine never sees inches.

### 4.2 Schema

```ts
interface Template {
  id: string;                 // 'us-screenplay'
  name: string;
  extends?: string;           // resolved at load; child values override parent
  page: {
    width: number; height: number;      // chars × lines (letter: 85 × 66)
    margin: { top; bottom; left; right } // lines / chars
    font: { family: string; monospace: boolean; pt: number };
    numbering: { position: 'top-right' | 'none'; firstNumbered: number; format: string }; // '{n}.'
    header?: Field; footer?: Field;
  };
  roles: Record<Role, RoleStyle>;       // see 4.3
  roleMap: RoleRule[];                  // see 4.3
  dialogueSplit: { more: string; contd: string; minLinesBefore: number; minLinesAfter: number };
  dual: { gap: number; width: number };
  sceneNumbers: { enabled: boolean; left: number; right: number };
  titlePage: TitlePageLayout;
  lint?: { enable?: string[]; disable?: string[]; options?: Record<string, unknown> };
}

interface RoleStyle {
  indent: number;             // chars from left margin
  width: number;              // max chars per line
  align?: 'left' | 'center' | 'right';
  case?: 'upper' | 'as-is';
  spaceBefore: number;        // blank lines before (collapsed with previous spaceAfter: max, not sum)
  spaceAfter?: number;
  keepWithNext?: boolean;     // never last on a page
  keepTogether?: boolean;     // never split across pages (if it fits on one)
  lineSpacing?: 1 | 2;
  prefix?: string; suffix?: string;   // e.g. '(' ')' for parentheticals stored without them
  style?: { bold?; italic?; underline? };
}
```

### 4.3 Roles and the role map

Fountain has thirteen block kinds. Formats have *roles* — a radio script has sound cues, a stage play has stage directions, a sitcom has act headings. Rather than extend Fountain syntax, a template maps kinds to roles with ordered rules, first match wins:

```jsonc
"roleMap": [
  { "kind": "section", "depth": 1, "role": "act_heading" },
  { "kind": "section", "depth": 2, "role": "scene_heading_play" },
  { "kind": "character", "name": "^(SFX|FX|SOUND)$", "role": "sfx_cue" },
  { "kind": "character", "name": "^MUSIC$", "role": "music_cue" },
  { "kind": "dialogue", "afterRole": "sfx_cue", "role": "sfx_text" },
  { "kind": "action", "role": "stage_direction" },
  { "kind": "scene_heading", "role": "disabled" },
  { "kind": "*", "role": "@kind" }          // default: role name = kind name
]
```

`disabled` means the block renders as action with a lint warning ("this format has no sluglines"). Because the role map works on standard Fountain, a Drafter radio script opened in any other Fountain tool still reads correctly — `SFX` appears as a speaking character, which is how radio scripts are conventionally typed anyway.

One documented extension: **multi-line parentheticals**. The spec implies parentheticals are single lines. Stage plays need a wrapped inline direction inside a speech. Drafter's parser treats consecutive lines inside a dialogue group that begin with `(` on the first line and end with `)` on the last as one `parenthetical`. Other tools will show the continuation lines as dialogue, which is readable, if not pretty. This is the only place Drafter's reading of Fountain is more generous than the spec, and it is documented in the Reference tab.

### 4.4 Built-in templates and inheritance

`us-screenplay` is the root. `tv-single-camera` extends it with `act_heading` styling. `tv-multi-camera` extends it with `dialogue.lineSpacing: 2`, `action.case: 'upper'`. `stage-play-standard` extends nothing (different page model). `uk-screenplay` extends `us-screenplay` with A4 page dimensions (A4 at Courier 12 is 82 × 70). Templates are validated against a JSON Schema generated from the TypeScript types; a template that fails validation is rejected with a list of errors, never partially applied.

### 4.5 User templates

Stored in IndexedDB `templates` table keyed by `id`, with a `builtin: false` flag. Loaded from a file or pasted JSON. Exportable. A project references a template by `id`; if the id is missing on load (someone opened the file on another machine), Drafter falls back to `us-screenplay` and shows a non-blocking banner.

---

## 5. `@drafter/layout` — pagination

### 5.1 Contract

```ts
paginate(doc: Doc, template: Template, opts: { sceneNumbers: boolean }): Layout

interface Layout {
  pages: Page[];
  index: { blockIndex → { page: number; line: number } }   // first line of each block
}
interface Page {
  number: number;                  // 1-based; title page is page 0
  lines: LayoutLine[];             // exactly page.height - margins entries; blank lines are explicit
  sceneNumbersLeft: Array<{ line: number; text: string }>;
  sceneNumbersRight: ...;
  header?: string; footer?: string;
}
interface LayoutLine {
  col: number;                     // chars from left margin
  runs: InlineRun[];               // text with style, already wrapped to fit
  role: Role;
  blockIndex: number; span: Span;  // source mapping; synthetic lines (MORE, CONT'D, headers) have blockIndex -1
  synthetic?: 'more' | 'contd' | 'blank' | 'header' | 'footer' | 'pagenum';
}
```

Pure, deterministic, no DOM. Runs in a Web Worker in the app and on the main thread in the CLI.

### 5.2 Block → lines

For each block, resolve its role and style, then word-wrap `sem.text` (or each dialogue line) to `style.width` columns:

- Break at spaces; a word longer than `width` is hard-broken (rare: URLs).
- Emphasis runs are carried across wraps.
- `case: 'upper'` is applied to text, not markers.
- `align: 'center'` computes `col = indent + floor((width - lineLength)/2)`; `right` computes `col = indent + width - lineLength`.
- A dialogue group becomes `character` line(s), then parentheticals, then dialogue lines, with `spaceBefore` 0 inside the group.

Proportional fonts (`monospace: false`): the worker measures with `OffscreenCanvas.measureText` using the template font, and `width` is interpreted in *em-widths* of the font's average character. This path is supported but second-class; all v1 built-in templates are monospace.

### 5.3 Page filling

A greedy first-fit with look-ahead, line by line:

```
for each block B (in order):
  lines = wrap(B)
  need  = spaceBefore(B) + lines.length
  if cursor + need <= pageHeight:            place
  else if B.role is dialogue (or sfx_text etc.):   splitDialogue(B)
  else if B.keepTogether and lines.length <= pageHeight:  newPage; place
  else:                                     place as many lines as fit; newPage; continue
  after placing B: if B.keepWithNext and B is last on page:  pull B to next page
                   (and recursively its own keepWithNext predecessor, e.g. heading+character)
```

`spaceBefore` is suppressed at the top of a page. The first line on a page is never blank.

### 5.4 Dialogue splitting

If a dialogue block of `n` wrapped lines does not fit and `remaining >= minLinesBefore + 1` and `n - remaining >= minLinesAfter`:

1. Place `remaining - 1` dialogue lines (never splitting inside a parenthetical).
2. Emit a synthetic `(MORE)` line at the parenthetical indent.
3. New page. Emit a synthetic character line `NAME (CONT'D)` (if the character already had an extension, e.g. `(V.O.)`, emit `NAME (V.O.) (CONT'D)`).
4. Continue with the remaining lines.

If the thresholds fail, move the whole group to the next page. Character cues have `keepWithNext`, so a cue is never orphaned.

### 5.5 Dual dialogue

Two consecutive dialogue groups where the second character line has `^` are laid out as two columns: each wrapped to `dual.width`, left at `indent`, right at `indent + dual.width + dual.gap`. Lines are zipped; the taller column determines height. A dual block is `keepTogether`; if it exceeds a page it falls back to sequential layout with a lint warning. Dual dialogue is never split with `(MORE)`.

### 5.6 Scene numbers and forced breaks

If `opts.sceneNumbers`, each `scene_heading` line gets its number (from `sem.number` or auto-assigned sequentially when none is present) rendered at `sceneNumbers.left` and `.right`. Auto-assigned numbers are *not* written to the source unless the user runs "Lock scene numbers," which is a text edit inserting `#n#` on every heading. `page_break` ends the page immediately.

### 5.7 Worker protocol

```ts
// main → worker
{ type: 'layout', seq: number, docVersion: number, changes?: ChangeSet, template: Template, opts }
// worker → main
{ type: 'pages', seq, docVersion, layout: Layout }
```

The worker keeps its own `Doc` and applies `changes` incrementally. The main thread debounces requests (50 ms trailing) and discards any `pages` message whose `seq` is less than the latest sent. The right pane always renders the newest *received* layout and shows a subtle "updating" indicator if `docVersion` lags the editor by more than one request. For a 120-page script a full paginate takes single-digit milliseconds; the worker exists so that a pathological document can never freeze typing.

### 5.8 Testing

Fixture scripts with expected page/line positions for every block, generated once by hand-counting and then frozen. Property tests: no page exceeds height; no page starts blank; no character line is last on a page; every non-synthetic line maps to a span inside its block; concatenating all non-synthetic line text equals the wrapped block text. Golden PDFs are compared by extracted text positions, not bytes.

---

## 6. Renderers

### 6.1 `render-html` (right pane)

Framework-free. `render(layout, template, container)` produces one `<section class="page" aria-label="Page 7">` per page containing a `<pre>`-like grid: each `LayoutLine` is a `<div class="line role-dialogue" style="--col: 10" data-block="42">` with `<span>` runs for emphasis. Position is `padding-left: calc(var(--col) * 1ch)`; vertical rhythm is `line-height: calc(1in / 6)`. Fonts: `@font-face` for Courier Prime (OFL) with `font-display: block`; rendering is deferred until `document.fonts.load('12pt "Courier Prime"')` resolves so `1ch` is correct. Page chrome (margins, number) is CSS. Re-render diffs by page: a page whose `lines` are deep-equal to the previous render is left untouched (cheap; pages are small).

Clicks on a line dispatch `drafter:goto` with the line's `span.from`; the editor selects that offset. Scroll-sync: on editor cursor move, the pane scrolls the page containing `layout.index[blockIndex]` into view (unless the user has scrolled the pane manually in the last 2 s).

### 6.2 `render-pdf`

pdf-lib. Page size from template (letter 612 × 792 pt). Embed Courier Prime regular/bold/italic/bold-italic (OFL permits embedding). For each `LayoutLine`: `x = marginLeftPt + col * charWidthPt` where `charWidthPt = 7.2` for Courier 12 (600/1000 em); `y = pageHeightPt - marginTopPt - (lineIndex + 1) * 12`. Underline is a 0.5pt rule at baseline − 2. Scene numbers, page numbers, headers are plain text at their columns. Title page from `TitlePageLayout`. Revision mode (Phase 4) adds an asterisk at column `width + 1` for lines whose span intersects a changed region from the snapshot diff, and optionally sets page background to the revision color. Output is a `Uint8Array` handed to the download/FS layer. Runs in a worker too (pdf-lib is pure JS).

### 6.3 `fdx` — Final Draft XML

**Export.** An `.fdx` is `<FinalDraft DocumentType="Script" Template="No" Version="…"><Content>…</Content>…</FinalDraft>`. Each logical block becomes `<Paragraph Type="T"><Text>…</Text></Paragraph>` with `T` ∈ `Scene Heading | Action | Character | Parenthetical | Dialogue | Transition | General | Shot`. Mapping: `centered` → `Action` with `Alignment="Center"`; `lyric` → `Dialogue` with `Style="Italic"`; `section` → `General` plus an outline entry; `synopsis` → the scene's `<SceneProperties Summary="…">`; `note` → `<ScriptNote>`; `boneyard` → omitted; scene numbers → `<Paragraph Number="12A">`; dual → `<DualDialogue>` wrapper; emphasis → `<Text Style="Bold">` runs; title page → `<TitlePage>` paragraphs. Element names and attributes come from inspecting `.fdx` files, which is permitted.

**Import.** Inverse mapping to Fountain text, emitting forced markers wherever the inferred kind would differ from what the plain text implies (an all-caps action line gets `!`; a character named lowercase gets `@`). Unknown paragraph types become action with a `[[fdx: Type]]` note so nothing is silently dropped. Import never produces a `Doc` directly; it produces Fountain text, which is then parsed — so FDX import is covered by the same invariants as everything else.

### 6.4 Other exports

- `.txt` — `Layout` rendered with spaces: a faithful fixed-width script, readable anywhere.
- `.html` (standalone) — `render-html` output inlined into one file with the font as a data URI (~200 KB).
- `.md` (outline) — sections as headings, scenes as list items with synopses.
- `.json` — the CST, for tooling.

---

## 7. `@drafter/outline` — structure operations

Every operation returns `TextChange[]` for the editor to apply in one transaction, so it is undoable and keeps the source as truth.

- **Scene range.** `sceneRange(i)` = from the heading block's `span.from` (including its `leading` if the user is moving it) to the `span.to` of the last block before the next heading or section.
- **Move scene A after scene B.** Two changes: delete `sceneRange(A)`, insert its text after `sceneRange(B)`. Applied as a single transaction with CodeMirror's change-set composition so offsets are consistent. Scene numbers in `#n#` are left alone; a lint rule flags out-of-order locked numbers.
- **Edit synopsis.** If the scene has a `synopsis` block, replace its text (after `=`); otherwise insert `= text` on a new line after the heading.
- **Set color.** Write to the metadata block (§8.6) keyed by a stable scene id; scene ids are the heading text plus an occurrence counter, recomputed on each parse. Colors therefore survive reordering but not renaming — acceptable, and documented.
- **Condense.** Not an operation: it is the fold-all command (§3.5) plus the Outline tab. "Export as treatment" walks sections → synopses → first action paragraph of each scene into Markdown.
- **Expand from outline.** Input: Markdown with `#` headings and list items. Output: Fountain text where headings become `#` sections, each list item becomes a `= synopsis` under a stub `INT./EXT.` heading chosen by a simple heuristic (`INT.` unless the item contains "outside", "exterior", "street", "road", etc.), followed by a blank action placeholder. The user then fixes headings. This is deliberately dumb; it is a scaffolding tool, not a story generator.
- **Cards.** The Cards view is a different rendering of the same `OutlineModel = { sections: [{ title, scenes: [{ id, heading, synopsis, color, pageStart, pageEnd, characters }] }] }`, which `outline` computes from `Doc` + `Layout.index`.

---

## 8. Storage

### 8.1 Dexie schema

```ts
db.version(1).stores({
  projects:  'id, title, updatedAt',        // { id, title, templateId, source, meta, updatedAt, fsHandleId? }
  snapshots: 'id, projectId, createdAt',    // { id, projectId, createdAt, source, label? }
  templates: 'id',                          // user templates
  handles:   'id',                          // { id, handle: FileSystemFileHandle }  (Chromium only)
  settings:  'key',
});
```

### 8.2 Autosave

Every editor transaction updates an in-memory `source`; a 750 ms trailing debounce writes `projects.source`. `beforeunload` flushes synchronously (best effort). The status bar shows "autosaved Ns ago" from the last successful write, and turns amber if a write has failed (quota, private mode).

### 8.3 Persistence hardening

On first project creation: `navigator.storage.persist()`. If it resolves `false` (Safari, or Chromium without engagement), the UI shows a persistent, dismissible notice explaining that the browser may discard local data and offering two fixes: install as an app (PWA) or save to a file. The project list shows a shield icon for persisted storage. This is the honest answer to the "forever" promise: Drafter makes it as durable as the browser allows and tells the user the truth.

### 8.4 Snapshots

A snapshot is the full source (a feature is ~150–250 KB). Created: every 10 minutes of active editing, on explicit "Snapshot" (with optional label), before any outline operation, and before FDX import. Retention: keep all labeled snapshots; keep all unlabeled from the last 24 hours; thin to one per hour for 7 days; one per day for 90 days; then delete. Compare view diffs two snapshots at the line level (Myers diff on lines), renders both as pages, and marks changed lines; this is also the input to revision-mode PDF.

### 8.5 Files on disk

| Capability | Chromium (Chrome/Edge/Brave/Arc) | Firefox | Safari |
|---|---|---|---|
| Open file, keep handle, save in place | ✅ `showOpenFilePicker` | ❌ | ❌ |
| Persisted handle across sessions | ✅ (stored in IDB; re-prompts for permission) | — | — |
| Drag-and-drop import | ✅ | ✅ | ✅ |
| Download export | ✅ | ✅ | ✅ |
| `storage.persist()` honored | usually | usually | only if installed |

On Chromium a project may be bound to a file: `Save` writes through the handle; `Open` from disk reads it and watches `lastModified` on focus to detect external edits (prompt: reload / keep mine / snapshot both). On other browsers "Save" means "download `.fountain`" and the project list is the source of truth. The UI uses the same verbs everywhere and explains the difference once.

### 8.6 Drafter metadata in the file

Non-prose state that must travel with the file (template id, scene colors, locked dictionary, revision marks) lives in a single boneyard block at the end of the file:

```
/* drafter
{ "v": 1, "template": "us-screenplay",
  "scenes": { "INT. KITCHEN - NIGHT#1": { "color": "blue" } },
  "dictionary": ["Keokuk", "Vogeltronics"],
  "revision": { "label": "Pink", "since": "2026-10-20T15:00:00Z" } }
*/
```

The parser recognizes `/* drafter` specially and exposes it as `Doc.meta`; the printer writes it back verbatim. Other Fountain tools ignore boneyards entirely, so the file is portable. Keeping it at the end, as one block, means it never interrupts reading the source. (Title-page keys are reserved for human-meaningful fields.)

---

## 9. `@drafter/lint`

```ts
interface Rule {
  id: string; severity: 'error' | 'warning' | 'info';
  run(ctx: { doc: Doc; layout?: Layout; template: Template; options }): Diagnostic[];
}
interface Diagnostic { ruleId; severity; span: Span; message; fix?: TextChange[] }
```

Rules run after each reparse (debounced 300 ms), on the main thread, bounded to the changed scene plus its neighbors for rules marked `local: true`; document-wide rules (name similarity, character census) run on an idle callback. Diagnostics feed both the CodeMirror gutter and the Problems tab.

Starter rules, with their false-positive controls:

| Rule | Logic | Control |
|---|---|---|
| `unclosed-region` | note/boneyard without terminator | — (error) |
| `heading-no-prefix` | scene heading without INT/EXT when template has sluglines | off in play templates |
| `heading-no-time` | `sem.time` null | option: `requireTime` |
| `character-without-dialogue` | uppercase single line immediately followed by an indented or parenthetical line | — |
| `manual-contd` | character extension literally `(CONT'D)` typed by user | fix: remove |
| `similar-names` | two character names with Damerau-Levenshtein ≤ 1 **and** one of them used ≤ 2 times total **and** neither is a prefix of the other | info only; user can "mark as distinct" (stored in meta) |
| `long-speech` | dialogue block > N wrapped lines | option N (default 12) |
| `long-scene` | scene spans > N pages (needs layout) | option N (default 5) |
| `transition-not-last` | transition not immediately before a heading/section/end | — |
| `dual-overflow` | dual dialogue taller than a page | — |
| `first-appearance-case` | character's first mention in action is not uppercase — checks only the *first* action occurrence of the exact name token, so `the WAITRESS` vs `WAITRESS` is not flagged | info |
| `locked-numbers-out-of-order` | `#n#` sequence not monotonic | — |

Every rule has fixtures that assert both hits and *non*-hits.

---

## 10. `@drafter/spell`

**Engine: nspell only.** One checker, one dictionary set, one set of squiggles. Native browser spellcheck is explicitly disabled on the editor (`spellcheck="false"`) to avoid conflicting underlines.

- Bundled: `en_US` (SCOWL-derived Hunspell dictionary, permissive license). Other languages are downloadable dictionary packs the user adds; each pack ships its own license file and the UI shows it. This keeps the MIT app free of GPL dictionary data.
- Checking runs in the layout worker (nspell is pure JS) on the changed blocks only, skipping: character names (every `sem.name`), every token in a scene heading's location, words in the project dictionary, all-caps tokens of ≤ 3 letters, and anything inside `[[ ]]` or boneyard by default (toggle).
- Project dictionary = `meta.dictionary` (persisted in the file) ∪ harvested names/locations (not persisted; recomputed). "Add to dictionary" writes to `meta.dictionary`. "Add to personal dictionary" writes to IndexedDB `settings.personalDictionary`, which applies across projects.
- Suggestions come from nspell; the quick-fix menu lists up to 5.
- Full-document check is a command that runs every block and lists results in the Problems tab under a "Spelling" group.

---

## 11. `@drafter/stats`

Computed from `Doc` + `Layout` on idle: page count and estimated runtime (pages × 1.0 min, configurable); per-character line count, word count, and speech count; per-scene page length and character list; INT/EXT and time-of-day breakdowns; a pacing series (words of dialogue vs. action per page) for the chart. Everything is derived and nothing is stored.

---

## 12. Table read

Web Speech API. The command walks dialogue groups; each distinct character is assigned a voice from `speechSynthesis.getVoices()` (round-robin by language, user-overridable per character in a small settings panel stored in `settings`). Action is read in a neutral voice at 1.1× rate; parentheticals are skipped; scene headings are read. The editor highlights the current block. Availability and quality depend on the OS; the feature degrades to "unavailable" if no voices exist. Offline behavior depends on the browser's local voices and is not guaranteed — the UI says so.

---

## 13. Accessibility

Target WCAG 2.2 AA from the first public release, verified with axe and manual NVDA/VoiceOver passes.

- **Source pane:** CodeMirror's content element is `contenteditable` with `role="textbox"` and `aria-multiline`. Drafter adds a live region that announces element kind on block change ("Character", "Dialogue") so a screen-reader user hears structure, and a per-block `aria-roledescription` via decorations.
- **Rendered pane:** every page is a landmark region; every scene heading is an `<h2>` and every section an `<h1>`/`<h2>` by depth, so heading navigation walks the script's structure; character cues are `<h3>`; dialogue lines are plain text. Synthetic lines (`(MORE)`, page numbers) are `aria-hidden`.
- **Keyboard:** every pane, tab, and command reachable without a mouse; `F6` cycles panes; the command palette (`Mod+K`) exposes every action.
- **Visual:** respects `prefers-reduced-motion`, `prefers-color-scheme`, and a user font-size setting that scales both panes (the rendered pane scales uniformly so pagination is unchanged).
- The outline, cards, and stats views are plain lists/tables first, with drag-and-drop as an enhancement that always has a keyboard equivalent ("Move scene up/down").

---

## 14. Security

There is no server, no accounts, and no network calls after the app loads (except user-initiated dictionary downloads). Remaining surface:

- **Imported content is untrusted text.** FDX is parsed with a strict XML parser (no DTD, no entities beyond the five built-ins, no external references). All text reaches the DOM via `textContent`, never `innerHTML`. Notes and synopses are rendered as text.
- **Templates are data, not code.** JSON validated against the schema; regexes in `roleMap` are compiled with a length cap and tested against a timeout (a template with a catastrophic regex is rejected).
- **No plugin API in v1.** If one is added, plugins run in a Web Worker with no DOM access and communicate via a message protocol that exposes read-only `Doc` and returns `TextChange[]`/`Diagnostic[]`; nothing else.
- **CSP:** `default-src 'self'; font-src 'self'; worker-src 'self'; connect-src 'self' https://<dictionary-cdn>`. No inline scripts after build.
- **Exports** never include anything not in the source + meta block.

---

## 15. Testing strategy

| Layer | Tool | What |
|---|---|---|
| `fountain` | Vitest + fast-check | round-trip property tests; classification fixtures; incremental ≡ full reparse |
| `layout` | Vitest | position fixtures; structural property tests (§5.8) |
| `render-pdf` | Vitest + pdf-parse | text + position extraction compared to layout |
| `fdx` | Vitest | export→import→export stable; import of hand-made FDX fixtures |
| `lint`, `spell` | Vitest | hit/non-hit fixtures per rule |
| `cm-fountain` | Vitest + jsdom | keymap behaviors as state transitions |
| app | Playwright | open/edit/export flows; a11y via axe; browser matrix Chromium/Firefox/WebKit |
| CLI | snapshot | `drafter build fixtures/*.fountain` produces PDFs with expected page counts |

Fixtures are written for this project. Scripts under copyright are not included; realistic test content is original or synthetic.

---

## 16. Build and deploy

- pnpm workspace; each package builds with `tsup` to ESM with `.d.ts`; `apps/web` imports workspace packages directly.
- Nuxt 4, `nuxi generate`, route rules per `drafter-architecture.md` §3 note: `/editor/**` is `ssr: false`; `/`, `/docs/**`, `/templates` prerendered.
- Workers are built by Vite from `new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })`.
- PWA via `@vite-pwa/nuxt`: precache the app shell, fonts, and `en_US` dictionary; network-first for nothing (there is no network).
- Netlify publishes `.output/public`; `_headers` sets the CSP; `_redirects` is generated by Nuxt's Netlify preset. No functions directory exists.
- CLI (`packages/cli`) wraps `fountain` + `layout` + `render-pdf` with Node's `fs`; published as `@drafter/cli` so `npx @drafter/cli build script.fountain` works without the web app.

---

## 17. Decisions recorded

| Question | Decision |
|---|---|
| Hide markup or show it? | Show it. Optional "clean" display later, as decorations only. |
| AST or CST? | CST with trivia; lossless print is a hard invariant. |
| One parser or two? | One. Highlighting is decorations over the CST. |
| Spellcheck | nspell only; native off. `en_US` bundled; others opt-in with license shown. |
| Units | characters × lines; inches converted at load. |
| Metadata location | single `/* drafter … */` boneyard at end of file. |
| FS access on Firefox/Safari | download/upload; persistence notice; PWA nudge. |
| PDF import | out of scope through Phase 4. |
| Plugins | none in v1; worker-sandboxed design reserved. |
| License | MIT; no code from GPL screenwriting projects. |
