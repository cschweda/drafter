# forced-break.fountain — derivation

Template `us-screenplay`; body 54 lines (0–53). A `===` ends the current page **unless that page is still empty**, so a forced break never creates a blank page and back-to-back breaks act as one (§5.3).

| Source | Block | Page | Body line | Why |
|---|---|---|---|---|
| 1 | `===` | — | — | page 1 is still empty: ignored |
| 3 | heading | 1 | 0 | |
| 5 | action (10 lines) | 1 | 2–11 | |
| 16 | `===` | — | — | ends page 1 |
| 18 | action | 2 | 0 | space before dropped at the top |
| 20 | action (52 lines) | 2 | 2–53 | needs 1 + 52 = 53, exactly what's left; page 2 is now full |
| 73 | `===` | — | — | page 2 is full, so this changes nothing: the next block starts page 3 either way |
| 75 | action | 3 | 0 | |
| 77 | `===` | — | — | ends page 3 |
| 79 | `===` | — | — | page 4 is still empty: ignored |
| 81 | `FADE OUT.` | 4 | 0 | a lone uppercase line is action (no `TO:`, no `>`) |

**Pages:** 4, none of them blank.
