# dialogue-split.fountain — derivation

Template `templates/split-test.json`: `us-screenplay` with **`minLinesAfter: 3`** (`minLinesBefore` stays 2). Body 54 lines (0–53); `(MORE)` and the `(CONT'D)` cue sit at column 22.

A speech that doesn't fit is split after `p = min(remaining − 1, n − minLinesAfter)` dialogue lines, where `remaining` counts the lines left after the cue and its space before, if `p ≥ minLinesBefore`; otherwise the whole speech, cue included, moves to the next page (§5.4).

**Page 1.** F1 is 48 lines at 0–47; the cursor is at 48, leaving 6 lines.
- MARGARET (8 lines): space before at 48, cue at **49**, 4 lines left. p = min(4 − 1, 8 − 3) = min(3, 5) = **3** ≥ 2, so it splits: dialogue at **50**–52, `(MORE)` at **53**; 5 lines carry over (≥ 3).

**Page 2.** `MARGARET (CONT'D)` at **0**, the 5 carried lines at 1–5.
- F2 (43 lines): space before at 6, lines **7**–49; the cursor is at 50, leaving 4 lines.
- DANNY (6 lines) needs 1 + 1 + 6 = 8 > 4. After the space before and cue, 2 lines are left: p = min(2 − 1, 6 − 3) = **1** < 2, so it moves whole, **because of `minLinesBefore`**.

**Page 3.** DANNY at **0**, dialogue 1–6.
- F3 (41 lines): space before at 7, lines **8**–48; the cursor is at 49, leaving 5 lines.
- HANS (4 lines) needs 1 + 1 + 4 = 6 > 5. After the space before and cue, 3 lines are left: p = min(3 − 1, 4 − 3) = **1** < 2, so it moves whole, **because of `minLinesAfter`**. With the default of 2, p would be min(2, 2) = 2 and it would split. (The keep-with-next chain alone, 2 + 2 + 1 = 5, fits in the 5 lines, so the cue stays only until the split check moves the whole speech.)

**Page 4.** HANS at **0**, dialogue 1–4.
- F4 (42 lines): space before at 5, lines **6**–47; the cursor is at 48, leaving 6 lines.
- DANNY (V.O.) (7 lines): space before at 48, cue at **49**, 4 lines left. p = min(3, 7 − 3) = **3** ≥ 2: dialogue at **50**–52, `(MORE)` at **53**, 4 lines carry over.

**Page 5.** `DANNY (V.O.) (CONT'D)` at **0** (the existing extension keeps its place), the 4 carried lines at 1–4.

No speaker continues straight after their own speech, so no continued-speech `(CONT'D)` appears. **Pages:** 5.
