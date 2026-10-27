# @drafter/cm-fountain

Fountain in [CodeMirror 6](https://codemirror.net/), for [Drafter](https://github.com/cschweda/drafter). The editor holds the parse of its text in its state, and everything that reads the script reads it from there: `@drafter/fountain` is the only parser, and there is no Lezer grammar. It is framework-free, and runs wherever CodeMirror's view does: in a browser, and in jsdom for tests. The state field, `fountainDecorations`, and `cursorElement` need only an `EditorState`.

```ts
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fountain } from '@drafter/cm-fountain';
import { builtins } from '@drafter/templates';

new EditorView({
  state: EditorState.create({
    doc: text,
    extensions: [
      fountain({
        template: () => builtins['us-screenplay'],
        onCursorElement: (element) => console.log(element),
      }),
    ],
  }),
  parent: container,
});
```

`fountain()` is the whole package in one extension. The app adds the rest of an editor around it: history, search, the theme, and the fold gutter and keys.

## API

| Export | What it does |
|---|---|
| `fountain(options?)` | The parse, highlighting, input filters, keymap (at `Prec.high`), completion, and folding; and with `options.template`, lint (`options.lintOptions` for its options); and with `options.onCursorElement`, the cursor callback. Tab on a blank line starts a cue and opens the list of names. |
| `parsedDoc` | A `StateField<Doc>` that holds the parse of the text: `parse` when the state is created, `reparse(doc, changes)` on every change. Read it with `state.field(parsedDoc)`. A transaction that changes no text keeps the same `Doc`. |
| `fountainDecorations(state, ranges)` | The highlighting decorations for the ranges given, read from `parsedDoc`, as a `DecorationSet`. |
| `fountainHighlighting()` | A view plugin that keeps `fountainDecorations` for the visible ranges. It brings `parsedDoc` with it. |
| `fountainInput()`, `cueMode`, `barCue` | The input filters: upper-case typing in a cue started with Tab or the element bar, and in a scene heading; and the `@` of a cue the element bar began taken off when the cursor leaves its line, if the name doesn't need it. |
| `fountainKeymap` and its commands | Enter, Tab, Shift-Tab, Mod-Alt-1 to 7 for the element commands (`makeElement`: heading, action, cue, parenthetical, transition, centered, lyric), Mod-Shift-d for dual dialogue, Mod-/ for a note, and Mod-Shift-/ for a boneyard: `fountainEnter`, `fountainTab`, `fountainShiftTab`, `convertToCharacter`, `convertToAction`, `forceKind`, `toggleDual`, `wrapInNote`, and `wrapInBoneyard`. |
| `makeElement(kind)`, `insertPageBreak`, `wrapInBold`, `wrapInItalic`, `wrapInUnderline` | The element bar's commands: make the cursor's line (or each line of a selection) a scene heading, action, cue, dialogue, parenthetical, transition, centered text, lyric, section, or synopsis, writing natural Fountain and a forcing mark only where the line needs one; put in a page break; wrap the selection in emphasis. `canMakeParenthetical(state)` says whether a parenthetical applies at the cursor, `readsAsName(state)` whether the line is a name with no speech under it yet, and `elementHint(kind, state)` why a command would do nothing there, in a sentence. `forceKind(kind)` always adds the mark, and has no key. |
| `withCompletion(command)` | A view command that runs a state command and opens the completion list when its transaction asks (`opensCompletion(tr)`): a heading, cue, or transition just begun. |
| `fountainCompletionSource(context)` | A CodeMirror completion source for character names, locations, times, transitions, and section titles, read from `parsedDoc`. The state must have the field. |
| `fountainCompletion()` | `autocompletion({ override: [fountainCompletionSource] })`, with `parsedDoc` added. |
| `fountainFolding()` | Folds sections and scenes. It brings `parsedDoc` and a `codeFolding` with its placeholder. |
| `cursorElement(state)` | The `{ blockIndex, lineIndex, kind }` under the main cursor, or null on a blank line. The title page is `blockIndex` -1 and `kind` `'title_page'`. |
| `onCursorElement(callback)` | Calls back when `cursorElement` changes, after a move or an edit. The callback runs inside the view's update, so it must not dispatch. |
| `fountainLint({ template, options })` | `@codemirror/lint`'s linter (300 ms) and gutter, running `@drafter/lint` on `parsedDoc`. `template` and `options` are read at each lint. |
| `relint(view)` | Lints now, with no edit. Call it after the template or the options change. |
| `toCodeMirror(diagnostics)` | Lint's diagnostics as CodeMirror's: a fix becomes one action, named by its title. Its actions are unguarded and apply their changes to whatever text the editor holds; use `fountainLint`, whose actions apply only to the text that was linted. |

## The parse

CodeMirror counts every line break as one position, whatever the file used, so `parsedDoc` parses `state.doc.toString()`, which joins the lines with `\n`. The parser's offsets are then CodeMirror's positions, even when an app sets `EditorState.lineSeparator`. Each transaction's changes reach `reparse` in the old document's positions, sorted and not overlapping; ranges that touch are joined.

## The highlighting

The package ships no CSS: the app's theme styles these classes.

| Class | Applied to |
|---|---|
| `cm-f-<kind>` | Each line of each block, as a line decoration: `cm-f-scene_heading`, `cm-f-action`, `cm-f-character`, `cm-f-parenthetical`, `cm-f-dialogue`, `cm-f-transition`, `cm-f-centered`, `cm-f-lyric`, `cm-f-section`, `cm-f-synopsis`, `cm-f-note`, `cm-f-boneyard`, and `cm-f-page_break`. |
| `cm-f-title` | Each line of the title page, continuation lines too. |
| `cm-f-title-key` | Each title field's `Key:`, through its colon. |
| `cm-f-b`, `cm-f-i`, `cm-f-u` | Marks over the runs that are bold, italic, or underlined. A run with two styles has two marks. |
| `cm-f-note`, `cm-f-boneyard` | Marks over each note and each boneyard, from its opening delimiter to its closing one. |
| `cm-f-marker` | Every other character of a line that is in no run and no note or boneyard, except whitespace. That covers forced markers (`!`, `@`, `.`, `~`, `>`), `#`, `=`, `^`, emphasis markers, scene numbers, and escapes, so a theme can dim them. |

- **Same name, two elements.** A line of a note or a boneyard block has the class of its kind, and the note's own mark has it too, so a theme can tell them apart by element: `.cm-line.cm-f-note` is the line and `span.cm-f-note` is the note.
- **Only the ranges you give.** The ranges are widened to whole lines, and only the blocks, title lines, and notes and boneyard that touch them are decorated, so a keystroke costs the lines in view and not the script. Ranges may overlap, repeat, or come in any order, and are cut off at the ends of the text.
- **Printed text is left alone.** `INT. HALL - DAY #12#` dims `#12#` and not the heading or the space before the number, and `**bold**` dims each `**`. A backslash that escapes `*`, `_`, or another backslash is a marker too, and so are the delimiters of emphasis inside emphasis of the same style (`*a *b* c*`).
- **Visible ranges.** The plugin rebuilds when the text changes or the visible ranges do, which includes folding and unfolding.

## The completion

`fountainCompletionSource` reads what to offer from `parsedDoc`, and the state must have the field. `fountainCompletion()` adds it, with CodeMirror's own popup and keys (Ctrl+Space asks for the list).

| Where | What it offers |
|---|---|
| A cue line: the line before is blank, a section, a synopsis, or a page break, or there is none, and the text before the cursor starts with `@`, or has two or more letters and none in lower case | The script's character names, the one whose last cue before the cursor is nearest first, then by number of cues. After a name and a space, or from an open `(`: `(V.O.)`, `(O.S.)`, and the extensions the script uses. |
| A scene heading, after the prefix and a space | Its locations, the most used first. |
| A scene heading, after ` - ` | Its times of day, the most used first, then `DAY`, `NIGHT`, `CONTINUOUS`, `LATER`, and `MOMENTS LATER`. |
| A line that starts with `>` | Its transitions, the most used first, then `CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`, and `FADE OUT.`. |
| After `#` | Its section titles, in the order of the script. |
| Anywhere else, when asked (Ctrl+Space) | The character names that go on from the word before the cursor, or the whole cast where no word has started. |

- **Read from the text.** The parse reads a cue that is still being typed as action, so where the cursor is comes from the text of its line, by the rules of technical design §2.5. Only a cue's name has to be in capitals, so an extension may be in any case.
- **When it opens.** Typing opens the list once two characters of what is being completed are typed. Asking for it (`context.explicit`) opens it at any length, and on an empty line after a blank one, where it lists the cast. A name that needs an `@` to be a cue (`McCLANE`, or a name with no case) is offered only after one.
- **Enter.** The list opens with its first option selected, so Enter would accept it. When the text typed is already one of the labels, ignoring case, nothing is offered, for that reason: with `MARGARET` typed in full there is nothing to offer, no list opens, and Enter goes on to the speech. That holds when a longer name starts with it, too (`DAN` beside `DANNY`): Enter would lengthen the writer's name, so the writer types `DANN` to reach `DANNY`.
- **Its own matching.** The options come in the order the source ranks them, matched from the start of the text and ignoring case, with `filter: false`, and the source is asked again after each keystroke. A pass costs about 0.6 ms in a script of 100 KB.

## The keymap

Every command is an ordinary transaction, one undo step, and finds its context in `parsedDoc`. A command with nothing to do returns false, so the key is left to the browser: a Tab that meant nothing is never taken, which would trap the keyboard. `fountain()` binds Tab to `fountainTab` and, when it started a cue (an `@` on a blank line), asks the completion to open, so the list of names comes up after Tab on a blank line. `fountainKeymap` itself is the plain bindings.

## Folding

| Fold | From | To |
|---|---|---|
| A section | The end of its title line | The end of the last block before the next section of equal or shallower depth, so it holds its deeper sections and scenes |
| A scene | The end of its heading line | The end of the last block before the next scene heading or section |

The blank lines before the next heading are left out of the fold, a heading with nothing under it has no fold, and the metadata block at the end is in no fold. A folded scene shows its heading, an ellipsis, and the first synopsis inside it (`INT. HALL - DAY… Margaret finds the letter.`); a folded section shows its title and an ellipsis. The placeholder is built with `textContent`. `fountainFolding()` brings `codeFolding` with this placeholder, so an app adds `foldGutter` and the fold keys, not a `codeFolding` of its own.

## The cursor's element

`cursorElement(state)` is the element under the main selection's head, found by one binary search of the blocks: `blockIndex` in `doc.blocks`, `lineIndex` within the block, and `kind`. On a blank line it is null. On the title page it is `{ blockIndex: -1, lineIndex, kind: 'title_page' }`. A line of exactly two spaces inside a speech is a line of that speech. `onCursorElement` is called when the three fields change, after a move or after an edit that shifts them, and not for the element the cursor starts in: read that with `cursorElement(view.state)`.

## Lint

`fountainLint` runs `lint(doc, template, options)` on the parse 300 ms after typing stops, and shows the result in CodeMirror's gutter and tooltips. The rule ids are the diagnostics' `source`. A fix is an action that applies its changes as one transaction, and only if the text is still the text that was linted: the offsets in a fix cannot be moved the way CodeMirror moves a diagnostic's range. After an edit, choosing a stale fix asks for a new lint and changes nothing, and the new diagnostics carry fixes that fit. A fix inserts the editor's own line break, `\r\n` in a CRLF file. Call `relint(view)` after changing the template or the options: `forceLinting` alone runs only a lint that is already pending, and a change to the options is no edit, so it would change nothing until the next keystroke.

## License

MIT
