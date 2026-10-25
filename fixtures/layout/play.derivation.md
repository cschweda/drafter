# play.fountain — derivation

Template `stage-play-standard` (the file's metadata block names it too). Column 60. Act headings are centered and uppercase with 2 lines of space before; scene headings are centered with 1; cues are centered and uppercase with 1; parentheticals sit at 10; dialogue at 0; stage directions at 10 with 1 line of space before. Centering puts a line at ⌊(60 − length) / 2⌋ (§5.2).

| Source | Block | Role | Body line | Col | Why |
|---|---|---|---|---|---|
| 1 | `# Act One` | act_heading | 0 | 26 | prints `ACT ONE` (7): ⌊53 / 2⌋ = 26; space before dropped at the top |
| 3 | `## Scene 1` | scene_heading_play | 2 | 26 | `Scene 1` (7) |
| 5 | action | stage_direction | 4 | 10 | 46 characters, under the 50-character width |
| 7 | MARGARET | character | 6 | 26 | 8 characters: ⌊52 / 2⌋ = 26 |
| 8 | (quietly) | parenthetical | 7 | 10 | |
| 9 | dialogue | dialogue | 8 | 0 | |
| 11 | DANNY (offstage) | character | 10 | 22 | uppercase applies to the whole cue: `DANNY (OFFSTAGE)` (16): ⌊44 / 2⌋ = 22 |
| 12 | dialogue | dialogue | 11 | 0 | |
| 14 | action | stage_direction | 13 | 10 | |
| 16 | MARGARET | character | 15 | 26 | |
| 17 | parenthetical, 2 lines | parenthetical | 16–17 | 10 | a multi-line parenthetical; the first line is 39 characters, under the 40-character width |
| 19 | dialogue | dialogue | 18 | 0 | |
| 21 | `## Scene 2` | scene_heading_play | 20 | 26 | |
| 23 | action | stage_direction | 22 | 10 | |
| 25 | `INT. KITCHEN - NIGHT` | disabled | 24 | 10 | a play has no sluglines: printed the way action prints here, with a `disabled-element` diagnostic |
| 27 | DANNY | character | 26 | 27 | 5 characters: ⌊55 / 2⌋ = 27 |
| 28 | dialogue | dialogue | 27 | 0 | |

The metadata block (30–32) prints nothing. `contdAfterAction` is false in this template, so MARGARET at 16 gets no `(CONT'D)`. **Pages:** 1.
