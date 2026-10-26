# Cast

Every character in the script, with the number of speeches and the scene of the first appearance.
Choosing a character goes to their first cue.

- **Button:** "Cast" shows the module's tab and moves focus into it (`ctx.openTab()`).
- **Tab:** "Cast". A row is the name, `5 speeches`, and `first in scene 1, INT. KITCHEN - NIGHT`
  (or `first before the first scene`). Characters are in the order they first speak.
- **Command:** "Cast: copy the list" puts the list on the clipboard as plain text, one character to
  a line: `MARGARET: 6 speeches, first in scene 1 (INT. KITCHEN - NIGHT)`. If the browser won't copy,
  the module says so; the list is never sent anywhere.
- **Needs:** nothing from the network; it reads `doc()`.

## What counts

One cue is one speech. `MARGARET`, `@Margaret`, and `MARGARET (CONT'D)` are one character: the name
is compared without regard to capitals, and an extension such as `(V.O.)` is not part of it. Both
sides of a dual dialogue count.

## States

- A script with no characters says **No characters yet.**
- A Markdown document has no characters: **Not available for Markdown documents.** The copy command
  is hidden from the palette there (`enabled`), and says the same if it is run anyway.

## Files

- `index.ts`: the module (`default`), and `castRows` and `castText` for the tests.
- `index.test.ts`: runs it against `samples/screenplay.fountain` and small scripts through a fake
  `ModuleContext` (`../fake-context.ts`).
