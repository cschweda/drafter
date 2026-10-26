# @drafter/cm-fountain

Fountain in [CodeMirror 6](https://codemirror.net/), for [Drafter](https://github.com/cschweda/drafter). The editor holds the parse of its text in its state, and everything that reads the script reads it from there: `@drafter/fountain` is the only parser, and there is no Lezer grammar. It is framework-free, and runs wherever CodeMirror's view does: in a browser, and in jsdom for tests. The state field and `fountainDecorations` need only an `EditorState`.

```ts
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { fountainHighlighting } from '@drafter/cm-fountain';

new EditorView({
  state: EditorState.create({ doc: text, extensions: [fountainHighlighting()] }),
  parent: container,
});
```

## API

| Export | What it does |
|---|---|
| `parsedDoc` | A `StateField<Doc>` that holds the parse of the text: `parse` when the state is created, `reparse(doc, changes)` on every change. Read it with `state.field(parsedDoc)`. A transaction that changes no text keeps the same `Doc`. |
| `fountainDecorations(state, ranges)` | The highlighting decorations for the ranges given, read from `parsedDoc`, as a `DecorationSet`. |
| `fountainHighlighting()` | A view plugin that keeps `fountainDecorations` for the visible ranges. It brings `parsedDoc` with it. |
| `fountainCompletionSource(context)` | A CodeMirror completion source for character names, locations, times, transitions, and section titles, read from `parsedDoc`. The state must have the field. |
| `fountainCompletion()` | `autocompletion({ override: [fountainCompletionSource] })`, with `parsedDoc` added. |

This version holds the parse and highlights it. The keymap, autocomplete, folding, and lint come later, on the same field.

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
| A cue line: the line before is blank or there is none, and the text before the cursor starts with `@`, or has two or more letters and none in lower case | The script's character names, the one whose last cue before the cursor is nearest first, then by number of cues. After a name and a space, or from an open `(`: `(V.O.)`, `(O.S.)`, and the extensions the script uses. |
| A scene heading, after the prefix and a space | Its locations, the most used first. |
| A scene heading, after ` - ` | Its times of day, the most used first, then `DAY`, `NIGHT`, `CONTINUOUS`, `LATER`, and `MOMENTS LATER`. |
| A line that starts with `>` | Its transitions, the most used first, then `CUT TO:`, `DISSOLVE TO:`, `SMASH CUT TO:`, and `FADE OUT.`. |
| After `#` | Its section titles, in the order of the script. |

- **Read from the text.** The parse reads a cue that is still being typed as action, so where the cursor is comes from the text of its line, by the rules of technical design §2.5. Only a cue's name has to be in capitals, so an extension may be in any case.
- **When it opens.** Typing opens the list once two characters of what is being completed are typed. Asking for it (`context.explicit`) opens it at any length, and on an empty line after a blank one, where it lists the cast. A name that needs an `@` to be a cue (`McCLANE`, or a name with no case) is offered only after one.
- **Enter.** The list opens with its first option selected, so Enter would accept it. A label that is the text it would replace, ignoring case, is left out for that reason: with `MARGARET` typed in full there is nothing to offer, no list opens, and Enter goes on to the speech.
- **Its own matching.** The options come in the order the source ranks them, matched from the start of the text and ignoring case, with `filter: false`, and the source is asked again after each keystroke. A pass costs about 0.6 ms in a script of 100 KB.

## License

MIT
