# Notes

The notes in the script (`[[like this]]`) listed in the Problems pane with their line numbers, and a
command that removes them all.

- **Button:** "Notes" calls `setProblems` with one info item per note, labelled "Notes" in the
  Problems pane (with the note's text, shortened, and its line). Choosing one selects the note in
  Source. Running it again refreshes the list. The items follow the text as it is edited, and are
  not counted as problems.
- **Tab:** none; the Problems pane is where it reports.
- **Command:** "Notes: remove all notes" asks first, saying how many ("Remove 10 notes from this
  script? You can undo it with Undo."), then removes every note in one `applyChanges` call, so one
  Undo brings them all back. If the call returns `false` (the script changed, or can't be edited
  right now) it says nothing was removed.
- **Needs:** nothing from the network; it reads `doc().regions`.

## What a removal leaves

A note on lines of its own takes its lines, and one blank line when that would leave two in a row
(`A`, blank, note, blank, `B` becomes `A`, blank, `B`). A note beside text takes the space beside it
(`Rain. [[x]]` becomes `Rain.`, `A [[x]] B` becomes `A B`). A boneyard (`/* … */`) is not a note and
stays.

## Markdown documents

Notes does nothing in a Markdown document. `[[…]]` there is usually a link to another page, not a
note, and Markdown has no notes that never print. The button clears its items and says **Not
available for Markdown documents.**; the remove command is hidden from the palette.

## Files

- `index.ts`: the module (`default`), and `removalChanges` for the tests.
- `index.test.ts`: runs it against `samples/screenplay.fountain` and small scripts through a fake
  `ModuleContext` (`../fake-context.ts`).
