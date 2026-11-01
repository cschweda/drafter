# @drafter/story-map

The **Story map** of a [Drafter](https://github.com/cschweda/drafter) screenplay or stage play: one self-contained, dark HTML page, with no script, that shows someone who doesn't read scripts everything written so far. Its shape, its people, every scene in order, and the gaps. It touches no file and no DOM.

```ts
import { buildStoryMap } from '@drafter/story-map';

const map = buildStoryMap({ doc, template, layout: paginate(doc, template), options });

map.acts; // [{ n: 1, title: 'The Lamp', scenes: [0, 1, …], pages, minutes, empty }]
map.scenes[1]; // { n: 2, act: 1, place: 'Lighthouse, Lamp Room', time: 'Night', timeKind: 'night', inside: 'Inside', minutes, chips, … }
map.characters[0]; // { name: 'Mara', lead: true, color: 0, voice: false, minutes, scenes, share, presence, … }
map.places; // [{ name, scenes, minutes, size: 1–5 }], the top 24
map.facts; // { pages, minutes, scenes, characters, places }
```

**The model** is a plain object of numbers, short strings, and indexes, read from what Drafter already works out for the Script tab, Stats, and Scaffold: `@drafter/outline`'s scene index and its pages, and `@drafter/cast`'s cast and places. Nothing is counted twice, so the page agrees with Stats.

**Plain words.** The page never says slugline, INT., EXT., V.O., or eighths. `INT.` is "Inside", `EXT.` "Outside", and `INT./EXT.` "Inside and out"; a place is the heading's location in title case, its parts joined with commas, a locked scene number dropped; `LATER` and `CONTINUOUS` show no time and take the scene before's colour; lengths are minutes ("2 min", "about 1 hr 50 min").

**Acts** are the top-level sections. A scene before the first act (a cold open) is Act 1's. An act's title loses a leading "Act One:" label. A script with no sections has no acts, and its scenes are one run.

**People.** The eight characters with the most screen time lead, and get a colour in that order; a lead who is only ever heard (every cue `V.O.` or `O.S.`) is a white ring instead. A character who never says a word and is in fewer than two scenes is left out. A character's share of the talking is in whole percents that add up to 100 (`@drafter/cast`'s `shares`).

**Lines of dialogue.** A line is one speech, never dual dialogue, cleaned for a reader: no cue, extension (`V.O.`, `CONT'D`), parenthetical, note, or emphasis mark. It has 3–18 words, at most 110 characters, ends a sentence, and doesn't open with a filler ("Well, …"). About one scene in four gets one, at most 12, spread in even stretches through the script, at least three scenes apart, three at most per speaker, and one in each act that has a candidate. A `[[Quote]]` note in a speech (or alone on the line under it) always puts it in, up to 160 characters; `[[No quote]]` keeps it out. Each character's best line is their signature line.

**Summaries and hooks.** A scene's line is its first synopsis, else its first action sentence, at most 12 words, speakers' names in title case; an act's mood is its first synopsis. A character's hook and age come from the first action paragraph that names them in capitals (`ODILE VANCE (60s), a ferry pilot, …`). Threads join each `[[Setup: …]]` label's scene to its first payoff's.

The design is `docs/drafter-story-map-design.md`.
