# contd.fountain — derivation

Template `us-screenplay`, which sets `contdAfterAction: true`. A cue gets `(CONT'D)` when the same character spoke the previous speech **in the same scene** and only non-dialogue blocks came between (§5.4).

| Source | Block | Body line | Text | Why |
|---|---|---|---|---|
| 1 | heading | 0 | | |
| 3 | MARGARET | 2 | `MARGARET` | first speech |
| 6 | action | 5 | | |
| 8 | MARGARET | 7 | `MARGARET (CONT'D)` | same speaker as the previous speech, only action between |
| 11 | DANNY | 10 | `DANNY` | a different speaker |
| 14 | action | 13 | | |
| 16 | DANNY | 15 | `DANNY (CONT'D)` | continues after action |
| 19 | heading | 19 | | space before 2: lines 17–18 |
| 21 | DANNY | 21 | `DANNY` | a new scene, so no `(CONT'D)` |

Each cue takes one line of space before, its dialogue follows directly, and action takes one line of space before. **Pages:** 1.
