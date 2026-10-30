# drafter.dev — Technical Design

*Companion to `drafter-architecture.md`. This document says how each piece works.*

Author: Christopher Schweda · Status: Draft v0.2 · October 2026 · License target: MIT

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
                                  │ recovery copy          ▲ open/import
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

`fountain` depends on nothing. `templates` depends on nothing but its own schema (it imports `fountain` only for element-kind types). No package depends on Vue, Nuxt, or the DOM except `render-html` (DOM only) and `cm-fountain` (CodeMirror only). `cli` wraps `fountain`, `templates`, `layout`, and `render-pdf`.

---

## 2. `@drafter/fountain` — parser and printer

### 2.1 Design decisions

- **The output is a CST, not an AST.** Every node keeps its raw source text and the exact whitespace around it, so `print(parse(src)) === src` holds byte-for-byte for *any* input, not just well-formed input. Semantic fields (`kind`, `name`, `text`) are computed from the raw text and cached on the node.
- **Markup is visible.** Drafter does not hide Fountain syntax. The editor shows `@`, `!`, `>`, `~`, `#`, `=`, `[[ ]]`, `/* */` as typed. An optional "clean" display mode (Phase 4) hides markers with CodeMirror replace-decorations without changing the document. This resolves the source-is-truth contradiction: the text is always exactly what the writer sees or can choose to see.
- **Block-based, and cheap to parse in full.** Fountain's unit of meaning is the *block* — a run of non-blank lines bounded by blank lines (§2.5 defines *blank*). A block's kind depends only on its own lines, so a parse is one linear pass, and Drafter simply reparses the whole document on every change (§2.7).

### 2.2 Data structures

```ts
interface Doc {
  titlePage: TitlePage | null;
  blocks: Block[];               // in document order
  trailing: string;              // whitespace after the last block (the whole text, if there are no blocks)
  meta: DrafterMeta | null;      // JSON from the `/* drafter … */` block (§8.6)
  diagnostics: ParseDiagnostic[];// what the parser can see on its own (§2.10)
  source: string;                // the full text (reference, not copy)
}

interface Span { from: number; to: number }   // character offsets into source

interface Block {
  span: Span;                    // from first char of first line to end of last line
  leading: string;               // blank lines before this block (trivia), e.g. "\n\n"
  lines: Line[];
  kind: BlockKind;
  // kind-specific semantic data, computed on first read and cached; null only for kinds that have none:
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
  | 'note' | 'boneyard' | 'page_break';
```

A `character` block and its following `parenthetical`/`dialogue`/`lyric` blocks form a **dialogue group**. Fountain places no blank line between character, parenthetical, and dialogue, so in the raw text they are *one* block; the parser splits that physical block into logical blocks: the first line is `character`, each line wrapped in parentheses is `parenthetical` (multi-line ones per §4.3), each line starting with `~` is `lyric` (a sung line), and remaining lines are `dialogue` (consecutive dialogue lines merge into one `dialogue` block with embedded newlines). The `DialogueGroup` is a view over these, not a node. A logical block's `leading` is the line break that separates it from the one before, so printing stays lossless.

Boneyard `/* */` may span any number of blocks; a note `[[ ]]` may span lines but never a blank line. Both are found in a pre-pass (§2.4), and the regions they cover are marked so that block classification skips their content.

### 2.3 Title page

The title page is a run of `Key: value` lines at the very top of the file, ended by the first blank line. Values may continue on following lines if those lines are indented by three or more spaces or a tab. Keys are case-insensitive; the parser preserves the original key text. Recognized keys: `Title`, `Credit`, `Author`, `Authors`, `Source`, `Draft date`, `Date`, `Contact`, `Copyright`, `Notes`. Unknown keys are kept and round-tripped; the layout engine ignores them unless the template names them. Drafter does **not** store settings in the title page (see §8.6).

### 2.4 Pre-pass: notes and boneyard

A single left-to-right scan records every `[[ … ]]` and `/* … */` region as a `Span` in a sorted list. Nesting is not supported (per spec).

- A **boneyard** may span any number of lines and blocks; the spec lets it cover as much of the script as you like. Lines inside it are never blank (the region connects them), so a boneyard never splits the block it sits in. An unclosed `/*` extends to end of file and produces an `unclosed-boneyard` error (§2.10).
- A **note** may span lines but not a blank line: the spec says an empty line inside a note must hold two spaces to stay connected. A `[[` with no `]]` before the next blank line is literal text and produces an `unclosed-note` warning, so typing `[[` never hides the rest of the script.

Region content is removed from a line before classification and layout. A line that's empty once its regions are removed is *transparent*: it neither ends a block nor produces output. A physical block made only of transparent lines takes the kind of the region that fills it, `note` or `boneyard`, so the Notes tab and the outline can still find it.

### 2.5 Block classification

The parser walks each physical block line by line. Every test runs on a line's *test text*: the raw line with a trailing `\r`, a leading U+FEFF, and any note or boneyard content removed, and leading whitespace trimmed. Trailing spaces are ignored by every rule except 10, because the spec makes a space after `TO:` the way to write that line as action.

A line is **blank** if its test text is empty or whitespace only, with one exception: a line of exactly two spaces is not blank. The spec uses it to connect lines into one element, such as a pause inside a speech or an empty line inside a note. Lines inside a boneyard are never blank (§2.4). The editor never auto-indents (§3.3), so a whitespace-only line is always typed on purpose.

Rules are tried in order on the first line of each *run*: the lines of a physical block not yet classified. **Extent** is how many lines the new logical block takes; classification then continues with a new run on the following line.

| # | Test on the first line of the run | Kind | Extent |
|---|---|---|---|
| 1 | `===` or a longer run of `=` only | `page_break` | this line |
| 2 | starts with `#` (one or more) | `section` (depth = count of `#`) | this line |
| 3 | starts with `=` | `synopsis` | this line |
| 4 | starts with `!` | `action` (forced; marker stripped for `sem.text`) | the run |
| 5 | starts with `@` | `character` (forced) | the run, as a dialogue group (§2.2) |
| 6 | starts with `~` | `lyric` | consecutive `~` lines |
| 7 | starts with `>` and ends with `<` | `centered` | consecutive `>…<` lines |
| 8 | starts with `>` | `transition` (forced) | this line |
| 9 | starts with `.` followed by a letter or digit | `scene_heading` (forced) | this line |
| 10 | entirely uppercase, ending in `TO:` with nothing after it | `transition` | this line |
| 11 | matches `^(INT\.?/EXT\|INT\|EXT\|EST\|I/E)[. ]` (case-insensitive), and either the run is one line or the line is entirely uppercase | `scene_heading` | this line |
| 12 | the line is shaped like a cue (below), its character name is entirely uppercase, and the run has at least one more line | `character` | the run, as a dialogue group (§2.2) |
| 13 | otherwise | `action` | the run |

A line that rules 1–3 match always starts a new run, even in the middle of an action paragraph, because the spec defines sections, synopses, and page breaks line by line. Inside a dialogue group, every line belongs to the speech: only parentheticals (§4.3) and `~` lyrics are recognized there. When one of rules 8–11 matches a line that has more lines after it in the run, that's the first lenient reading below.

**Entirely uppercase** means the text contains at least one uppercase letter (`\p{Lu}`) and no lowercase letters (`\p{Ll}`); digits, punctuation, and spaces are allowed. Scripts without letter case, such as Chinese or Japanese, therefore never produce an automatic cue; use `@`. For rule 12, the line must be shaped like a cue: a *character name*, then optionally one or more parenthetical extensions, then optionally `^`, and nothing else. The uppercase test applies to the name alone. So an extension may be any case, as in the spec's own `HANS (on the radio)`, while an action line that opens `MARGARET (60s), cardigan buttoned wrong,` is not a cue. Extensions are parsed into `sem.extension`. A trailing `^` marks dual dialogue (`sem.dual = true`) and is stripped from the name.

Rule 12's "at least one more line" is the spec's requirement that a character cue be followed by dialogue; a lone uppercase line is action (a shouted word, a sound), full stop. A look-ahead exception ("the next block is dialogue-shaped") was considered and rejected. The lint rule `character-without-dialogue` catches the usual typo instead.

**Lenient readings.** Where the spec's strict reading would garble a common mistake, Drafter reads the file more generously. It records a portability diagnostic (§2.10) at that spot, and the Strict Fountain lint rules (§9) offer a fix that rewrites the source into strict form. Everything not listed here follows the spec exactly.

| Situation | Strict reading | Drafter's reading | Diagnostic and fix |
|---|---|---|---|
| A scene heading or transition followed directly by text, with no blank line between (for rule 11, only when the line is entirely uppercase) | a natural heading or transition becomes a character cue, with the text as its dialogue | the heading or transition ends at its line, and the next line starts a new run | `heading-blank-after`: insert a blank line |
| A parenthetical wrapped across lines inside a speech (§4.3) | the continuation lines are dialogue | one multi-line `parenthetical` | `multiline-parenthetical`: join it onto one line |

The uppercase condition limits the lenient heading reading to the case where the strict reading turns a heading into a cue. A mixed-case paragraph that starts `Int is short for interior.` stays action. A standalone one-line `INT is short for interior.` is a scene heading under both readings, as the spec says; write `!INT is short for interior.` to force action.

Scene numbers: a scene heading ending in `#…#` (e.g. `INT. KITCHEN - NIGHT #12A#`) yields `sem.number = '12A'`, and the number is stripped from `sem.text`.

Scene heading decomposition: `sem.prefix` (`INT.`), `sem.location` (`KITCHEN`), `sem.time` (`NIGHT`) by splitting on the last ` - ` (space-hyphen-space) or ` – `. If there is no separator, `time` is null and a lint rule may fire depending on the template.

### 2.6 Inline emphasis

Within `action`, `dialogue`, `parenthetical`, `centered`, and `lyric` text: `*italic*`, `**bold**`, `***bold italic***`, `_underline_`. Markers must be unescaped (`\*` is a literal asterisk). An opening marker must be followed by a non-space; a closing marker must be preceded by a non-space; unmatched markers are literal. Emphasis does not cross line boundaries. The result is `InlineRun[]` of `{ text, bold, italic, underline, span }`.

### 2.7 Reparsing

The editor calls `reparse(doc, changes)`. `changes` is a list of `{ from, to, insert }` ranges in the old document's coordinates, sorted and non-overlapping: the shape of a CodeMirror ChangeSet, so a multi-cursor edit arrives as one call. `reparse` applies them to `doc.source` and runs a full `parse` on the result.

Drafter reparses in full on every change, by design. A parse is one linear pass, a 120-page feature is about 200 KB, and the result is a fresh, immutable `Doc` that shares no state with older editor states. A windowed incremental reparse was designed and set aside: the note/boneyard pre-pass, block-boundary changes, and title-page edits all reach outside any fixed window, and shifting absolute spans either mutates blocks that older states still hold or copies them anyway.

Budget: parsing a 200 KB script takes under 5 ms on a 2020-era laptop, measured by `pnpm bench`. If profiling ever shows the budget can't be met, a windowed reparse can return behind the same `reparse` signature, guarded by the property test in §2.9.

### 2.8 Printer

`print(doc)` concatenates the title page's raw text, then `block.leading + block.lines.map(l => l.raw).join('\n')` for every block, then `doc.trailing`. A block's `leading` holds the line break that ends the line before it, if there is one, plus any blank lines; `trailing` holds whatever follows the last block, usually a final newline. Because every node retains raw text, printing is trivially lossless. Semantic edits (rename a character everywhere, renumber scenes, change a synopsis) are expressed as **text changes** `{ from, to, insert }[]` computed against spans, never as mutations of `sem` followed by re-serialization. This keeps the printer dumb and the invariant intact.

`toJSON(doc)` is the CST as data, for `drafter build --json` and other tools: `{ v: 1, titlePage, blocks: [{ kind, forced, span, leading, lines, sem }], trailing, meta, diagnostics }`, with every `sem` materialized and `lines` as raw strings. It omits `source`, which is just `print` of the rest.

### 2.9 Invariants and tests

- `print(parse(s)) === s` for every string `s`, including malformed input. Property-tested with arbitrary strings across the full UTF-16 range (lone surrogates, `\r`, and U+FEFF included) and with mutations of generated scripts.
- `reparse(parse(a), changes)` deep-equals `parse(b)`, where `b` is `a` with `changes` applied, for random multi-range edit sequences, spans included.
- A fixtures directory of hand-written `.fountain` files with expected block-kind sequences as `.json` sidecars, covering every row of the classification table, both lenient readings, and every ambiguity the spec discusses (uppercase action lines, `INT` as the first word of an action sentence, lone transitions, lowercase extensions, dual dialogue, CRLF line endings).

### 2.10 Parse diagnostics

```ts
interface ParseDiagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  span: Span;
  message: string;
  portability?: true;          // a lenient reading (§2.5); the Strict Fountain lint rules act on these
}
```

The parser reports what it can see without a template or a layout:

| Code | Severity | When |
|---|---|---|
| `unclosed-boneyard` | error | `/*` without `*/`; the region runs to end of file |
| `unclosed-note` | warning | `[[` without `]]` before the next blank line; the text stays literal |
| `invalid-meta` | warning | the metadata block (§8.6) isn't valid JSON; `doc.meta` is `null` |
| `heading-blank-after` | info, portability | a heading or transition followed directly by text (§2.5) |
| `multiline-parenthetical` | info, portability | a parenthetical wrapped across lines (§4.3) |

`drafter check` prints every diagnostic and exits non-zero if any is an error. In Phase 1, `@drafter/lint` shows them in the Problems pane alongside its own rules and supplies the fixes.

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
| `Tab` | in `character` line | toggle extension: cycle `` → `(V.O.)` → `(O.S.)` → ``. `(CONT'D)` isn't offered: the engine adds it (§5.4). |
| `Tab` | in `action` line with text | uppercase the line and prefix `@` (convert to cue). **This mutates case** and is therefore a distinct, undoable command named `convertToCharacter`, never silent. |
| `Shift+Tab` | in `character` line | remove `@` if present and lowercase-except-first-letter (convert to action, command `convertToAction`) |
| `Mod+Alt+1..7` | anywhere | force kind via marker: `.` heading, `!` action, `@` character, `(…)` parenthetical, `>` transition, `>…<` centered, `~` lyric. Inserting a marker never changes case. (Not `Mod+1..7`: browsers use Ctrl/Cmd+1–8 to switch tabs.) |
| `Mod+Shift+D` | in dialogue group | append `^` to the character line (dual dialogue) |
| `Mod+/` | selection | wrap in `[[ … ]]` (note) |
| `Mod+Shift+/` | selection | wrap in `/* … */` (boneyard) |
| `Mod+S` | anywhere | save to file (§8.2), suppressing the browser's own Save Page |
| `Mod+Shift+S` | anywhere | save as a new file |

Auto-uppercasing applies only in cue mode after `Tab` on a blank line and in scene headings whose prefix matched rule 11. It is an input filter (`EditorState.transactionFilter`) that rewrites inserted text, so it is visible, immediate, and undoable, and it never retroactively changes text already typed. `Enter` never auto-indents, because a whitespace-only line can change how Fountain reads the lines around it (§2.5).

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

All template measurements are in **characters** (horizontal) and **lines** (vertical) at the template's base font. For monospace fonts at 12pt, 10 characters = 1 inch and 6 lines = 1 inch, so a US letter page is 85 × 66 and a 1.5"/1" left/right margin gives a 60-character text column. Inches are accepted in template files as `{ in: 1.5 }` and converted at load time: horizontal values × 10, vertical values × 6. A value that doesn't land on a whole character or line is a `TemplateError`, not a silent rounding, and the engine never sees inches. Phase 0 supports 12 pt monospace fonts only.

### 4.2 Schema

```ts
interface Template {
  id: string;                 // 'us-screenplay'
  name: string;
  extends?: string;           // resolved at load; child values override parent
  page: {
    paper: 'letter' | 'a4';             // physical size for the PDF: 612 × 792 pt, or 595.28 × 841.89 pt
    width: number; height: number;      // the character grid, chars × lines (letter: 85 × 66; A4: 82 × 70)
    margin: { top; bottom; left; right } // lines / chars, measured from the top-left corner
    font: { family: string; monospace: boolean; pt: number };
    numbering: { position: 'top-right' | 'none'; line: number; firstNumbered: number; format: string }; // line: from the top edge; '{n}.'
    header?: Field; footer?: Field;
  };
  roles: Record<Role, RoleStyle>;       // see 4.3
  roleMap: RoleRule[];                  // see 4.3
  keepWithNextLines: number;            // lines of the following block that must share its page (§5.3); default 2
  dialogueSplit: {
    more: string; contd: string;        // "(MORE)", "(CONT'D)"
    moreIndent: number;                 // column of the (MORE) line, from the left margin
    minLinesBefore: number; minLinesAfter: number;
    contdAfterAction: boolean;          // add (CONT'D) when a speaker continues after action (§5.4)
  };
  dual: { gap: number; width: number; indent: { character: number; parenthetical: number; dialogue: number } };
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

The grid is the paper size rounded down to whole characters and lines; the leftover goes to the right and bottom margins, so an A4 PDF keeps A4's true size.

### 4.3 Roles and the role map

Fountain has thirteen block kinds. Formats have *roles* — a radio script has sound cues, a stage play has stage directions, a sitcom has act headings. Rather than extend Fountain syntax, a template maps kinds to roles with ordered rules, first match wins. A rule's `kind` is one kind, a list, or `*`; character rules match `names`, an exact, case-insensitive list, never a regular expression:

```jsonc
"roleMap": [
  { "kind": "section", "depth": 1, "role": "act_heading" },
  { "kind": "section", "depth": 2, "role": "scene_heading_play" },
  { "kind": "character", "names": ["SFX", "FX", "SOUND"], "role": "sfx_cue" },
  { "kind": "character", "names": ["MUSIC"], "role": "music_cue" },
  { "kind": "dialogue", "afterRole": "sfx_cue", "role": "sfx_text" },
  { "kind": "action", "role": "stage_direction" },
  { "kind": "scene_heading", "role": "disabled" },
  { "kind": ["section", "synopsis", "note", "boneyard"], "role": "omit" },
  { "kind": "*", "role": "@kind" }          // default: role name = kind name
]
```

Two roles are reserved. `omit` produces no output: the spec says sections, synopses, notes, and boneyard never print, so built-in templates map them to `omit` unless the format prints them, as the stage play does with its act and scene headings. `disabled` renders the block the way an action block renders in that template, with a `disabled-element` diagnostic ("this format has no sluglines"). Every other role a rule can produce must have a style in `roles`; for the `@kind` catch-all, that means a style for every kind that can reach it. `page_break` is structural and never goes through the role map.

**Structure follows kinds; style follows roles.** Dialogue groups, dialogue splitting, `(MORE)` and `(CONT'D)`, and dual dialogue are driven by block kinds: a `dialogue` block splits across pages whatever its role, `sfx_text` included. Roles choose indent, width, case, spacing, and type style, nothing else.

Because the role map works on standard Fountain, a Drafter radio script opened in any other Fountain tool still reads correctly — `SFX` appears as a speaking character, which is how radio scripts are conventionally typed anyway. Stage plays are the caveat: their act and scene headings are `#` sections, which other Fountain tools don't print, so a Drafter play printed elsewhere loses those headings (the source still shows them).

One documented extension: **multi-line parentheticals**. The spec implies parentheticals are single lines. Stage plays need a wrapped inline direction inside a speech. Drafter's parser treats a run of lines inside a dialogue group as one `parenthetical` when the first line starts with `(` and leaves it open, the last line ends with the `)` that closes it, and no line in between starts with `(`. Anything else follows the spec: a single line wrapped in parentheses is a parenthetical, and other lines are dialogue, so `(to Horatio) Look.` followed by `Is that a ghost?)` stays dialogue. Other tools show the continuation lines as dialogue, which is readable, if not pretty. It's one of the lenient readings in §2.5, documented in the Reference tab, with a `multiline-parenthetical` diagnostic and a fix that joins the lines.

### 4.4 Built-in templates and inheritance

`us-screenplay` is the root. It maps `section`, `synopsis`, `note`, and `boneyard` to `omit`; turns scene numbers off by default (spec scripts are unnumbered, and shooting scripts switch them on); sets `dialogueSplit.contdAfterAction: true`; and puts `(MORE)` at the character-cue indent. `tv-single-camera` extends it with `act_heading` styling. `tv-multi-camera` extends it with `dialogue.lineSpacing: 2`, `action.case: 'upper'`. `stage-play-standard` extends nothing (different page model). `uk-screenplay` extends `us-screenplay` with `paper: 'a4'` and the 82 × 70 grid that A4 gives at Courier 12.

`extends` merges a child onto its parent. Objects merge key by key, with the child winning. The child's `roleMap` rules go *before* the parent's, so they take precedence under first-match-wins. Every other array replaces the parent's. Validation runs on the merged result, against a JSON Schema generated from the TypeScript types. A template that fails validation, names a missing parent, or forms an `extends` cycle is rejected with a list of errors, never partially applied.

### 4.5 User templates

Stored in IndexedDB `templates` table keyed by `id`, with a `builtin: false` flag. Loaded from a file or pasted JSON. Exportable. A project references a template by `id`; if the id is missing on load (someone opened the file on another machine), Drafter falls back to `us-screenplay` and shows a non-blocking banner.

---

## 5. `@drafter/layout` — pagination

### 5.1 Contract

```ts
paginate(doc: Doc, template: Template, opts?: { sceneNumbers?: boolean }): Layout   // opts.sceneNumbers overrides template.sceneNumbers.enabled

interface Layout {
  pages: Page[];                   // the title page, if any, is pages[0], with number 0
  index: { blockIndex → { page: number; line: number } }   // first printed line of each block; an omitted block maps to the next printed line
  diagnostics: LayoutDiagnostic[]; // dual-overflow, unpaired-dual, disabled-element
}
interface Page {
  number: number;                  // 1-based; title page is page 0
  lines: LayoutLine[];             // body lines only: exactly height − margin.top − margin.bottom entries; blank lines are explicit
  pageNumber?: { text: string; line: number; col: number };   // in the top margin, per template.page.numbering
  sceneNumbersLeft: Array<{ line: number; text: string }>;
  sceneNumbersRight: ...;
  header?: string; footer?: string;
}
interface LayoutLine {
  col: number;                     // chars from left margin
  runs: InlineRun[];               // text with style, already wrapped to fit
  role: Role;
  blockIndex: number; span: Span;  // source mapping; synthetic lines (MORE, CONT'D) have blockIndex -1
  synthetic?: 'more' | 'contd' | 'blank';
}
```

Pure, deterministic, no DOM. Line numbers count from 0 at the first body line of a page. Runs in a Web Worker in the app and on the main thread in the CLI.

### 5.2 Block → lines

For each printed block, resolve its role and style, then word-wrap its *printable text* to `style.width` columns. Printable text is the source text with markers, notes, boneyard content, and escape backslashes removed.

- Each source line wraps separately: Fountain treats every line break as intent.
- In action, leading spaces are kept and tabs become four spaces; in every other element, leading whitespace is ignored (both per spec).
- Break at spaces; a word longer than `width` is hard-broken (rare: URLs).
- Emphasis runs are carried across wraps.
- `case: 'upper'` is applied to text, not markers.
- `align: 'center'` computes `col = indent + floor((width - lineLength)/2)`; `right` computes `col = indent + width - lineLength`.
- A dialogue group becomes `character` line(s), then parentheticals, lyrics, and dialogue lines, with `spaceBefore` 0 inside the group.

Proportional fonts (`monospace: false`) are Phase 3; Phase 0 rejects them with `UnsupportedTemplateError`. When they arrive, measure with the font file's own advance widths, the same bytes `render-pdf` embeds, not `OffscreenCanvas.measureText`: canvas doesn't exist in Node and measures differently across platforms, which would break determinism and CLI parity.

### 5.3 Page filling

A greedy first-fit with look-ahead, line by line. Blocks whose role is `omit` produce nothing.

```
for each printed block B (in order):
  lines = wrap(B)
  need  = spaceBefore(B) + lines.length                  // spaceBefore is 0 at the top of a page
  if B.keepWithNext:
    N     = the first following block without keepWithNext
    chain = need + (need of each keepWithNext block between B and N)
                 + spaceBefore(N) + min(N's lines, keepWithNextLines)
                 + 1 if N is dialogue that would split there, for its (MORE)
    if chain doesn't fit in the rest of the page but fits on an empty page:  newPage
  if need fits in the rest of the page:                  place
  else if B is a dialogue block:                         splitDialogue(B)      // §5.4; by kind, whatever its role
  else if B.keepTogether and need fits on an empty page: newPage; place
  else:                                                  place as many lines as fit; newPage; continue with the rest
```

A chain too tall for an empty page is placed normally, so the loop always advances. `spaceBefore` is suppressed at the top of a page, and the first line on a page is never blank. A `page_break` ends the current page unless that page is still empty, so forced breaks never create blank pages and consecutive `===` lines act as one.

### 5.4 Dialogue splitting

When a dialogue block of `n` wrapped lines doesn't fit in the `remaining` lines of a page, let `p = min(remaining − 1, n − minLinesAfter)`: the most lines that can stay while leaving one line for `(MORE)` and at least `minLinesAfter` lines for the next page. If `p ≥ minLinesBefore`:

1. Place `p` dialogue lines, never splitting inside a parenthetical and never ending on one.
2. Emit a synthetic `(MORE)` line at `dialogueSplit.moreIndent`.
3. New page. Emit a synthetic character line `NAME (CONT'D)`. If the cue already has an extension, append to it — `NAME (V.O.) (CONT'D)` — unless it already ends in `(CONT'D)`.
4. Continue with the remaining lines, splitting again if they still don't fit.

Otherwise, move the whole group to the next page. Character cues have `keepWithNext`, so a cue is never orphaned. With the default thresholds of 2 and 2, `minLinesAfter` never blocks a split, because a speech that doesn't fit always leaves at least two lines over; it starts to matter at 3.

**Continued speeches.** With `dialogueSplit.contdAfterAction`, a cue also gets `(CONT'D)` when the same character spoke the previous dialogue group in the same scene and only non-dialogue blocks came between. A cue that already ends in `(CONT'D)` isn't extended again, and dual dialogue neither gets nor triggers a continued-speech `(CONT'D)`. That's why nobody needs to type `(CONT'D)`: the `manual-contd` rule (§9) offers to remove one the engine would add anyway.

### 5.5 Dual dialogue

A dialogue group whose character line ends in `^` pairs with the dialogue group immediately before it, unless that group is already paired. The pair is laid out as two columns, each `dual.width` wide: the left at the left margin, the right at `dual.width + dual.gap`. Within a column, cues, parentheticals, and dialogue sit at `dual.indent.character`, `.parenthetical`, and `.dialogue`. Lines are zipped; the taller column sets the height. A dual block is `keepTogether`. If it's taller than a page, it falls back to sequential layout with a `dual-overflow` diagnostic, and a `^` with no partner is laid out normally with an `unpaired-dual` diagnostic. Dual dialogue is never split with `(MORE)`.

### 5.6 Scene numbers and forced breaks

When scene numbers are on (`opts.sceneNumbers` if given, otherwise `template.sceneNumbers.enabled`), each `scene_heading` line gets a number at `sceneNumbers.left` and `.right`: its locked `sem.number` if present, otherwise its 1-based position among all scene headings. Auto-assigned numbers are *not* written to the source unless the user runs "Lock scene numbers," which is a text edit inserting `#n#` on every heading. Forced page breaks are covered in §5.3.

### 5.7 Worker protocol

```ts
// main → worker
{ type: 'layout', seq: number, docVersion: number, changes?: ChangeSet, template: Template, opts }
// worker → main
{ type: 'pages', seq, docVersion, layout: Layout }
```

The worker keeps its own copy of the text, applies each `changes` set, and reparses (§2.7). The main thread debounces requests (50 ms trailing) and renders a `pages` message only if its `seq` is newer than the last one rendered. A slow layout therefore still shows the newest finished pages, never nothing, with a subtle "updating" indicator while `docVersion` lags the editor. For a 120-page script a full paginate takes single-digit milliseconds; the worker exists so that a pathological document can never freeze typing.

### 5.8 Testing

Fixture scripts with expected page and line positions, keyed by the 1-based source line where each block starts. The expectations are written before the layout code, from the rules in this section, with the arithmetic recorded beside them, and the maintainer reviews them before they're frozen. Property tests: no page has more body lines than the template allows; no page starts blank; no character or scene-heading line is the last content line on a page; every non-synthetic line maps to a span inside its block; joining a block's non-synthetic line texts with single spaces equals its printable text with role case applied and whitespace runs collapsed. PDFs are compared by text and positions extracted with `pdfjs-dist`, not by bytes.

---

## 6. Renderers

### 6.1 `render-html` (right pane)

Framework-free. `render(layout, template, container)` produces one `<div class="page">` per page (pages aren't landmarks; see §13) containing a `<pre>`-like grid: each `LayoutLine` is a `<div class="line role-dialogue" style="--col: 10" data-block="42">` with `<span>` runs for emphasis. Position is `padding-left: calc(var(--col) * 1ch)`; vertical rhythm is `line-height: calc(1in / 6)`. Fonts: `@font-face` for Courier Prime (OFL) with `font-display: block`; rendering is deferred until `document.fonts.load('12pt "Courier Prime"')` resolves so `1ch` is correct. Page chrome (margins, number) is CSS. Re-render diffs by page: a page whose `lines` are deep-equal to the previous render is left untouched (cheap; pages are small).

Clicks on a line dispatch `drafter:goto` with the line's `span.from`; the editor selects that offset. Scroll-sync: on editor cursor move, the pane scrolls the page containing `layout.index[blockIndex]` into view (unless the user has scrolled the pane manually in the last 2 s).

### 6.2 `render-pdf`

pdf-lib, with `@pdf-lib/fontkit` registered (`pdfDoc.registerFontkit`); pdf-lib can't embed any font beyond the standard 14 without it. Page size from `template.page.paper` (letter 612 × 792 pt, A4 595.28 × 841.89 pt). Embed Courier Prime regular/bold/italic/bold-italic (OFL permits embedding); the caller passes the font bytes in, and the package never reads files. For each `LayoutLine`: `x = marginLeftPt + col * charWidthPt` where `charWidthPt = 7.2` for Courier 12 (600/1000 em); `y = pageHeightPt - marginTopPt - (lineIndex + 1) * 12`. Underline is a 0.5pt rule at baseline − 2. Scene numbers, page numbers, headers are plain text at their columns. Title page from `TitlePageLayout`. Revision mode (Phase 4) adds an asterisk at column `width + 1` for lines whose span intersects a changed region from the snapshot diff, and optionally sets page background to the revision color. Output is a `Uint8Array` handed to the download/FS layer. Runs in a worker too (pdf-lib is pure JS).

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

- **Scene range.** `sceneRange(i)` = from the heading block's `span.from` (including its `leading` if the user is moving it) to the `span.to` of the last block before the next heading or section. The metadata block (§8.6) is never part of a scene range, so moving the last scene leaves it at the end of the file.
- **Move scene A after scene B.** Two changes: delete `sceneRange(A)`, insert its text after `sceneRange(B)`. Applied as a single transaction with CodeMirror's change-set composition so offsets are consistent. Scene numbers in `#n#` are left alone; a lint rule flags out-of-order locked numbers.
- **The scene index and identity.** `sceneIndex(doc, template, layout?)` derives the scenes, sections, and tree from each parse ([Phase 2 design](drafter-phase2-design.md) §5.1). A scene's identity lives in the editor's session (`sceneIds` in `cm-fountain`), mapped through every change and carried across Drafter's own moves by an annotation (§5.2); it is never saved.
- **Edit synopsis.** If the scene has a `synopsis` block, replace its text (after `=`); otherwise insert `= text` at the top of the scene's header, under the heading.
- **Set color.** Write `[[Color: blue]]` in the scene's header, after its synopses (Phase 2 design §5.4; decided 2026-10-28). The color is in the scene's own text, so it survives reordering, renaming, and editing in another app.
- **Condense.** Not an operation: it is the fold-all command (§3.5) plus the Outline tab. "Export as treatment" walks sections → synopses → first action paragraph of each scene into Markdown.
- **Expand from outline.** Input: Markdown with `#` headings and list items. Output: Fountain text where headings become `#` sections, each list item becomes a `= synopsis` under a stub `INT./EXT.` heading chosen by a simple heuristic (`INT.` unless the item contains "outside", "exterior", "street", "road", etc.), followed by a blank action placeholder. The user then fixes headings. This is deliberately dumb; it gives the writer a starting point, not a story. *Superseded by Phase 2 design §6.5:* every stub's heading is `INT. LOCATION - DAY` (`## New scene` in a play), with no guessing, and the `stub-heading` lint rule (info) lists the stubs still holding it.
- **Cards.** The Cards view is a different rendering of the same `OutlineModel = { sections: [{ title, scenes: [{ id, heading, synopsis, color, pageStart, pageEnd, characters }] }] }`, which `outline` computes from `Doc` + `Layout.index`.

---

## 8. Storage

### 8.1 Dexie schema

```ts
db.version(1).stores({
  projects:  'id, title, updatedAt',        // { id, title, templateId, source, meta, updatedAt, savedHash?, savedAt?, fsHandleId? }
  snapshots: 'id, projectId, createdAt',    // { id, projectId, createdAt, source, label? }
  templates: 'id',                          // user templates
  handles:   'id',                          // { id, handle: FileSystemFileHandle }  (Chromium only)
  settings:  'key',
});
```

`templateId` and `meta` are caches derived from `source` on every save; when they disagree, `source` wins.

### 8.2 Saving and the recovery copy

Drafter saves like a desktop app (architecture §6.2). Two kinds of save never mix:

- **Save to file** is explicit. `Mod+S` writes the file; `Mod+Shift+S`, or the first save of a new script, picks a new one. On Chromium both go through the File System Access handle (§8.5); elsewhere they download a complete `.fountain`. A project records `savedHash`, a hash of the source as last saved to file, and `savedAt`, and the script has unsaved changes whenever the hash of the current source differs from `savedHash`. *Revert to Saved* restores the snapshot taken at the last save (§8.4).
- **The recovery copy** is automatic. Every editor transaction updates an in-memory `source`; a 750 ms trailing debounce, with a 5-second maximum wait during continuous typing, writes `projects.source`. Pending writes also flush on `visibilitychange` (when the page is hidden) and `pagehide`, because `beforeunload` can't wait for IndexedDB. Reopening Drafter restores each project from its recovery copy, with unsaved changes included and still marked unsaved.

**Leave warnings.** While a script has unsaved changes, Drafter registers a `beforeunload` handler, and it removes the handler once the script is saved, because a permanent one can keep the page out of the back/forward cache. The browser shows its own generic confirmation; custom text isn't possible. Navigating away from the editor inside the app goes through a Nuxt route guard that shows Drafter's dialog: *Save*, *Leave without saving* (the changes stay in the recovery copy), or *Cancel*. Neither warning is reliable on phones and tablets, or when the system kills a tab, which is why the recovery copy is written continuously rather than on a timer.

The status bar shows the file's state ("saved 2 min ago" or "unsaved changes") and, separately, the recovery copy's state (§8.3).

### 8.3 Recovery-copy warnings

On first project creation, Drafter calls `navigator.storage.persist()`. It then checks the recovery copy's health at every launch and after any failed write:

| State | Detected by | What the user sees |
|---|---|---|
| Persistent | `navigator.storage.persisted()` resolves `true` | "Recovery copy: kept in this browser" in the status bar, and a shield icon in the project list |
| Not persistent | `persisted()` resolves `false`: refused, not yet granted (Chromium without site engagement), Safari without installing, or a private window | a persistent, dismissible warning that this browser may clear the recovery copy, with two remedies: save to a file, or install Drafter as an app |
| Unavailable | IndexedDB won't open, or a write fails (quota, blocked site data) | a warning that stays until the problem clears: the changes exist only in memory until the script is saved to a file |

Private windows can't always be detected, so the warning says the browser *may* clear the copy rather than claiming it will. This is the honest answer to the "forever" promise: Drafter makes storage as durable as the browser allows and tells the user the truth.

### 8.4 Snapshots

A snapshot is the full source (a feature is ~150–250 KB), stored gzip-compressed with the browser's `CompressionStream`. Created: every 10 minutes of active writing, on every save to file, on explicit "Take snapshot" (with optional label), and before a bulk operation (expand, a reader merge, Fix all, Revert to Saved, restoring a snapshot) and FDX import; a single scene move is not one, since undo covers it (Phase 2 design §11.1). A snapshot equal to the newest is not taken. Retention: keep all labeled snapshots; keep all unlabeled from the last 24 hours; thin to one per hour for 7 days; one per day for 90 days; then delete. The snapshot of the last save is always kept. Compare view diffs two snapshots at the line level (Myers diff on lines), renders both as pages, and marks changed lines; this is also the input to revision-mode PDF.

Built in Plan C (v0.13.0), in four places that go beyond or sharpen the above (`docs/DECISIONS.md`, Plan C). The saved row `saved:<id>` stays Phase 1's, uncompressed and unlisted, and each save also takes a "Saved" history snapshot, which is how thinning keeps the snapshot of the last save (Call 2). Opening a file takes an "Opened" snapshot (Call 3), and loading a changed file over the script takes a "Before reloading" snapshot (Call 5); both are additions to Phase 2 design §11.1's list. Thinning keeps the last snapshot of each hour and each day by local time and always keeps the newest, so a writer back after 90 days keeps their last one rather than losing it to "then delete" (Call 8).

### 8.5 Files on disk

| Capability | Chrome, Edge, and other Chromium browsers | Firefox | Safari |
|---|---|---|---|
| Open file, keep handle, save in place | ✅ `showOpenFilePicker` | ❌ | ❌ |
| Persisted handle across sessions | ✅ (stored in IDB; asks again unless the user chose "Allow on every visit") | — | — |
| Drag-and-drop import | ✅ | ✅ | ✅ |
| Download export | ✅ | ✅ | ✅ |
| `storage.persist()` honored | usually | prompts the user | only if installed |

Brave is the exception among Chromium browsers: it ships with the File System Access API turned off, so it saves by download, like Firefox and Safari. Feature-detect `showOpenFilePicker` rather than sniffing the browser.

On Chromium a project may be bound to a file. Save writes through the handle; Save As, or the first save of a new script, uses `showSaveFilePicker`. The handle is stored in IndexedDB (§8.1). On a later visit Drafter calls `requestPermission()`, and Chrome's three-way prompt lets the user choose "Allow on every visit," after which Save never asks again. Drafter watches the file's `lastModified` on focus to detect external edits (the flow in the Phase 1 design, §9.6). On Firefox, Safari, and Brave, Save downloads a complete `.fountain` named after the title page's `Title`, and repeated saves land in the Downloads folder as numbered copies. The UI uses the same verbs everywhere and explains the difference once.

### 8.6 Drafter metadata in the file

Non-prose state that belongs to the whole script and must travel with the file (template id, locked dictionary, revision marks) lives in a single boneyard block at the end of the file. Phase 2 adds `storylines` (each label's name and color), `categories` and `readers` (their colors), `review` (set while a copy is out for notes), and `guides` (the pacing view's structure guide); none is keyed by scene ([Phase 2 design](drafter-phase2-design.md) §5.5). Scene colors are header notes in the scene, not entries here (§7):

```
/* drafter
{ "v": 1, "template": "us-screenplay",
  "dictionary": ["Keokuk", "Vogeltronics"],
  "revision": { "label": "Pink", "since": "2026-10-20T15:00:00Z" } }
*/
```

The metadata block is the file's last block: a boneyard that opens with `/* drafter` and a line break, followed only by whitespace. A `/* drafter` block anywhere else is an ordinary boneyard. The parser exposes its JSON as `doc.meta` (`null`, with an `invalid-meta` diagnostic, if it doesn't parse), and the printer writes it back verbatim. When Drafter writes the block, it escapes every `/` inside JSON strings as `\/`, so no value can contain `*/` and close the boneyard early. Other Fountain tools ignore boneyards entirely, so the file is portable. Keeping it at the end, as one block, means it never interrupts reading the source. (Title-page keys are reserved for human-meaningful fields.)

The template comes from, in order: an explicit choice (the CLI's `--template`, or the app's switcher), `meta.template`, then `us-screenplay`. An unknown id falls back to `us-screenplay` with a warning, as in §4.5.

---

## 9. `@drafter/lint`

```ts
interface Rule {
  id: string; severity: 'error' | 'warning' | 'info';
  local?: boolean;            // only needs the changed scene and its neighbors
  run(ctx: { doc: Doc; layout?: Layout; template: Template; options }): Diagnostic[];
}
interface Diagnostic { ruleId; severity; span: Span; message; fix?: TextChange[] }
```

Rules run after each reparse (debounced 300 ms), on the main thread, bounded to the changed scene plus its neighbors for rules marked `local: true`; document-wide rules (name similarity, character census) run on an idle callback. Diagnostics feed both the CodeMirror gutter and the Problems tab.

Starter rules, with their false-positive controls:

| Rule | Logic | Control |
|---|---|---|
| `unclosed-region` | note or boneyard without a terminator (the parse diagnostics in §2.10) | — (error for a boneyard, warning for a note) |
| `heading-no-prefix` | forced (`.`) scene heading without INT/EXT | off by default: forced headings are how Fountain writes a heading without a prefix |
| `heading-no-time` | `sem.time` null | option: `requireTime` |
| `character-without-dialogue` | a one-line, all-uppercase action block followed, after one blank line, by a block that starts with `(` or reads like dialogue: the cue-then-blank-line typo that the strict rule turns into two action blocks | — |
| `manual-contd` | a typed `(CONT'D)` that the engine would add anyway (§5.4) | fix: remove |
| `similar-names` | two character names, both at least five letters, with Damerau-Levenshtein ≤ 1 **and** one of them used ≤ 2 times total **and** neither a prefix of the other | info only; user can "mark as distinct" (stored in meta) |
| `long-speech` | dialogue block > N wrapped lines | option N (default 12) |
| `long-scene` | scene spans > N pages (needs layout) | option N (default 5) |
| `transition-not-last` | transition not immediately before a heading/section/end | — |
| `dual-overflow` | dual dialogue taller than a page (a layout diagnostic, §5.5) | — |
| `first-appearance-case` | character's first mention in action is not uppercase — checks only the *first* action occurrence of the exact name token, so `the WAITRESS` vs `WAITRESS` is not flagged | info |
| `locked-numbers-out-of-order` | `#n#` sequence not monotonic | — |
| `heading-blank-after` | Strict Fountain: a heading or transition followed directly by text (§2.5) | fix: insert a blank line |
| `multiline-parenthetical` | Strict Fountain: a parenthetical wrapped across lines (§4.3) | fix: join onto one line |

The **Strict Fountain** rules mark every place where Drafter read the file more generously than the spec. They're info-level by default. The Strict Fountain setting raises them to warnings and adds "Fix all," which rewrites the source into strict form.

Phase 1 ships `unclosed-region`, `character-without-dialogue`, `manual-contd`, `heading-no-time`, `similar-names`, `transition-not-last`, and the Strict Fountain rules; the rest arrive in Phase 4.

Every rule has fixtures that assert both hits and *non*-hits.

---

## 10. `@drafter/spell`

**Engine: nspell only.** One checker, one dictionary set, one set of squiggles. Native browser spellcheck is explicitly disabled on the editor (`spellcheck="false"`) to avoid conflicting underlines.

Built in Phase 2, Plan D (v0.14.0). Until then, Phase 1 turned on the browser's own spellcheck in the Source pane; now the Spellcheck setting turns Drafter's own on and off, and the browser's is off in the Source pane either way. Other text fields keep the browser's (the desktop app's bundled Chromium dictionary).

- Bundled: `en_US` and `en_GB` (SCOWL-derived Hunspell dictionaries, permissive license), as static files the service worker precaches. **As built (Plan D, Call 2):** the downloadable packs are not built, so other languages wait for Phase 4; `DictionaryInfo` in `@drafter/spell` is the shape a pack will take, and each pack will ship its own license file and the UI will show it. This keeps the MIT app free of GPL dictionary data. The Third-party licences help page serves each license file verbatim.
- Checking runs in its own worker (nspell is pure JS, and its suggestions are slow enough to delay layout if they shared one) on the changed blocks only. **As built (Plan D, Call 5):** the worker gets the whole text after a 300 ms pause and its session caches tokens per block and verdicts per word, which is "changed blocks only"; the main thread only posts and maps. It never checks: character names (every `sem.name`), every token in a scene heading's location, words in the project dictionary, all-caps tokens of ≤ 3 letters, and anything inside `[[ ]]` or boneyard by default (toggle).
- **As built (Plan D, Call 9):** the writer's personal dictionary is `personalDictionary` in the settings table, managed in Settings with Remove, and applies to every script in this browser; it never goes in a file.
- Project dictionary = `meta.dictionary` (persisted in the file) ∪ harvested names/locations (not persisted; recomputed). "Add to dictionary" writes to `meta.dictionary`. "Add to personal dictionary" writes to IndexedDB `settings.personalDictionary`, which applies across projects.
- Suggestions come from nspell; the quick-fix menu lists up to 5.
- Full-document check is a command that runs every block and lists results in the Problems tab under a "Spelling" group. **As built (Plan D, Call 13):** the group is the app's, drawn from the marks, not a `@drafter/lint` rule, because spelling marks are not lint diagnostics (Phase 2 design §12).
- **As built (Plan D, Call 18):** the Source pane's browser spellcheck is off whether Drafter's is on or off.

---

## 11. `@drafter/stats`

Computed from `Doc` + `Layout` on idle: page count and estimated runtime (pages × 1.0 min, configurable); per-character line count, word count, and speech count; per-scene page length and character list; INT/EXT and time-of-day breakdowns; a pacing series (words of dialogue vs. action per page) for the chart. Everything is derived and nothing is stored.

---

## 12. Table read

Web Speech API. The command walks dialogue groups; each distinct character is assigned a voice from `speechSynthesis.getVoices()` (round-robin by language, user-overridable per character in a small settings panel stored in `settings`). Action is read in a neutral voice at 1.1× rate; parentheticals are skipped; scene headings are read. The editor highlights the current block. Availability and quality depend on the OS; the feature degrades to "unavailable" if no voices exist. Offline behavior depends on the browser's local voices and is not guaranteed — the UI says so.

---

## 13. Accessibility

Target WCAG 2.2 AA from the first public release, verified automatically from Phase 1 (axe, keyboard tests, and accessibility-tree assertions), and with NVDA and VoiceOver last, after every phase is built (Phase 2 design §20).

- **Source pane:** CodeMirror's content element is `contenteditable` with `role="textbox"` and `aria-multiline`. Drafter adds a live region that announces element kind on block change ("Character", "Dialogue") so a screen-reader user hears structure. (A per-line `aria-roledescription` wouldn't work: browsers don't expose it on elements without a role, such as CodeMirror's line elements.)
- **Rendered pane:** the script is one landmark region labeled "Script," not one region per page (a feature would have 120), and each page starts with a visually hidden "Page N" marker. Headings follow what prints, so heading navigation walks the script's structure: scene headings are `<h2>`, and in templates that print sections (the stage play), act headings are `<h2>` and scene headings `<h3>`. Character cues aren't headings, since a feature has about a thousand; each dialogue group is a group labeled by its cue. Synthetic lines (`(MORE)`, page numbers) are `aria-hidden`.
- **Keyboard:** every pane, tab, and command reachable without a mouse; `F6` cycles panes; the command palette (`Mod+K`) exposes every action.
- **Visual:** respects `prefers-reduced-motion`; offers a dark theme by default, a light theme, and a "Match system appearance" setting that's off by default; and a user font-size setting that scales both panes (the rendered pane scales uniformly so pagination is unchanged).
- The outline, cards, and stats views are plain lists/tables first, with drag-and-drop as an enhancement that always has a keyboard equivalent ("Move scene up/down").

---

## 14. Security

There is no server, no accounts, and no network calls after the app loads (except user-initiated dictionary downloads). Remaining surface:

- **Imported content is untrusted text.** FDX is parsed with a strict XML parser (no DTD, no entities beyond the five built-ins, no external references). All text reaches the DOM via `textContent`, never `innerHTML`. Notes and synopses are rendered as text.
- **Templates are data, not code.** JSON validated against the schema. Role rules match character names with exact lists, not regular expressions, so a template can't carry a catastrophic pattern.
- **No plugin API in v1.** If one is added, plugins run in a Web Worker with no DOM access and communicate via a message protocol that exposes read-only `Doc` and returns `TextChange[]`/`Diagnostic[]`; nothing else.
- **CSP:** `default-src 'self'; font-src 'self'; worker-src 'self'; connect-src 'self' https://<dictionary-cdn>`. No inline scripts after build, which takes deliberate setup: Nuxt UI's color-mode script must be allowed by hash, and `@nuxt/icon` must bundle its icons instead of fetching them from the Iconify API at runtime. Loading templates by URL would need `connect-src` to allow their hosts, so it's deferred.
- **Exports** never include anything not in the source + meta block.

---

## 15. Testing strategy

| Layer | Tool | What |
|---|---|---|
| `fountain` | Vitest + fast-check | round-trip property tests; classification fixtures; `reparse` ≡ `parse` of the edited text |
| `layout` | Vitest | position fixtures; structural property tests (§5.8) |
| `render-pdf` | Vitest + pdfjs-dist | text + position extraction compared to layout |
| `fdx` | Vitest | export→import→export stable; import of hand-made FDX fixtures |
| `lint`, `spell` | Vitest | hit/non-hit fixtures per rule |
| `cm-fountain` | Vitest + jsdom | keymap behaviors as state transitions |
| app | Playwright | open/edit/export flows; a11y via axe; browser matrix Chromium/Firefox/WebKit |
| CLI | snapshot | `drafter build fixtures/*.fountain` produces PDFs with expected page counts |

Fixtures are written for this project. Scripts under copyright are not included; realistic test content is original or synthetic.

---

## 16. Build and deploy

- pnpm workspace; each package builds with `tsdown` to ESM with `.d.ts` (tsup, the original choice, is no longer maintained); `apps/web` imports workspace packages directly. One root `vitest.config.ts` lists the packages under `test.projects`.
- Nuxt 4 and `nuxi generate`. `/` is the editor, client-rendered (`ssr: false`) and prerendered as a shell carrying the page's metadata; `/docs/**` is prerendered. Deploy settings live in `apps/web/netlify.toml`.
- Workers are built by Vite from `new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' })`.
- PWA via `@vite-pwa/nuxt`: precache the app shell, fonts, and `en_US` dictionary; network-first for nothing (there is no network).
- Netlify publishes `.output/public`, which Nitro's `static` preset writes. The preset is pinned because on Netlify Nitro would otherwise pick `netlify-static`, which writes `dist/`. `_headers`, written after the build by `apps/web/scripts/csp.mjs`, sets the CSP. There's no `_redirects`: Netlify serves `404.html` by itself. No functions directory exists.
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
| Saving | Like a desktop app: Save writes the file (in place on Chromium, by download elsewhere), with a warning before leaving with unsaved changes. An always-on recovery copy in IndexedDB is written as you type, with warnings when it's unavailable or may be cleared. |
| PDF import | out of scope through Phase 4. |
| Plugins | none in v1; worker-sandboxed design reserved. |
| License | MIT; no code from GPL screenwriting projects. |
| Strict or lenient Fountain? | Lenient where the strict reading garbles a common mistake (§2.5); each lenient reading has a Strict Fountain lint rule whose fix rewrites the source into spec form. |
| Notes across blank lines? | No. A note ends at the first blank line, per the spec, and an unclosed `[[` stays literal. A boneyard may span anything. |
| Incremental or full reparse? | Full reparse on every change; a windowed version can return behind the same API if profiling demands it. |
| Role rules | Exact, case-insensitive name lists; no regular expressions. |
| `(CONT'D)` | Added by the engine at page breaks and, per template, for continued speeches; never typed. |
| Build and test tools | tsdown, Vitest projects, `pdfjs-dist` for PDF assertions. |
