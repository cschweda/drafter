# dual.fountain — derivation

Template `us-screenplay`: `dual` is two columns of 28 characters with a gap of 4, so the left column starts at 0 and the right at 28 + 4 = **32**. Within a column, cues sit at 8, parentheticals at 4, and dialogue at 0 (§5.5). Rows are zipped; the taller column sets the height.

| Row (body line) | Left column | Right column |
|---|---|---|
| 2 | `MARGARET` at col 0 + 8 = **8** | `DANNY` at col 32 + 8 = **40** (the `^` is removed) |
| 3 | `You can't just turn up` at **0** | `(wet)` at 32 + 4 = **36** |
| 4 | `at midnight with a cake.` at 0 | `I know.` at 32 + 0 = **32** |

The heading is at line 0; the dual block takes the first cue's space before (line 1) and rows 2–4; the action after it takes line 5 as space before and prints at **6**. Every dialogue line is under 28 characters, so nothing wraps. **Pages:** 1.
