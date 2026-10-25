# Layout fixtures

Hand-derived page positions for `@drafter/layout`. **Status: awaiting the maintainer's review.** These expectations were written before any layout code, from technical design §5 and the template values, and should be frozen only once someone other than their author has checked them.

Each fixture has three files:

- `<name>.fountain` — the script.
- `<name>.expected.json` — where its blocks land.
- `<name>.derivation.md` — the arithmetic behind every number, for review.

## The expectation format

```jsonc
{
  "template": "us-screenplay",          // a built-in id, or a path under this folder
  "pages": 4,                           // every page, title page included
  "firstLineOf": {                      // source line where a block starts → its first printed line
    "27": { "page": 1, "line": 23, "col": 22 }
  },
  "synthetic": [                        // optional: (MORE) and (CONT'D) lines, which have no source line
    { "page": 1, "line": 53, "col": 22, "text": "(MORE)" }
  ],
  "textOf": { "8": "MARGARET (CONT'D)" }, // optional: the printed text of a block's first line
  "diagnostics": [{ "code": "disabled-element", "line": 25 }] // optional: layout diagnostics
}
```

- `page` is `Page.number`: the title page is 0 and the script starts at 1.
- `line` is the 0-based body line, counting from the first line inside the top margin.
- `col` is optional, in characters from the left margin.
- Source lines are 1-based.

`synthetic`, `textOf`, `col`, and `diagnostics` go beyond the kickoff's `{ pages, firstLineOf }`, which can't show `(MORE)`, `(CONT'D)`, columns, or the disabled-element diagnostic.

## The fixtures

| Fixture | What it pins down |
|---|---|
| `short` | A title page and three pages of ordinary screenplay: spacing, a transition at the foot of a page, a heading pushed to the next page, right-aligned and centered lines. |
| `dialogue-split` | Four speeches at the foot of a page, under `templates/split-test.json` (`minLinesAfter: 3`): one splits with `(MORE)` and `(CONT'D)`; one moves whole because of `minLinesBefore`; one moves whole because of `minLinesAfter`; one keeps its `(V.O.)` in the `(CONT'D)` cue. |
| `contd` | `(CONT'D)` for a speaker who continues after action, and not across a scene heading. |
| `keep-with-next` | A heading, a cue, and a heading followed by a cue, each pulled to the next page. |
| `dual` | Two speeches side by side: column positions and zipped rows. |
| `forced-break` | `===` at the very start, in the middle, after a full page, and twice in a row: never a blank page. |
| `play` | The stage-play template: centered acts, scenes, and cues; stage directions; a multi-line parenthetical; a disabled slugline. |
