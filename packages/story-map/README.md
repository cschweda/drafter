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

**Acts only as the writer marks them.** The acts are the `#` sections; with none, the headings that start with the word "Act" at the shallowest level used; otherwise there are none, and the scenes are one run. Nothing is guessed from lengths. A scene before the first act (a cold open) is Act 1's. An act's title loses a leading "Act One:" label. The page draws acts (a band, colours, act cards) only with two or more and past an early draft (`STORY_MAP_LIMITS.earlyPages` 10, `earlyScenes` 6).

**People.** The eight characters with the most screen time lead, and get a colour in that order; a lead who is only ever heard (every cue `V.O.` or `O.S.`) is a white ring instead. A character who never says a word and is in fewer than two scenes is left out. A character's share of the talking is in whole percents that add up to 100 (`@drafter/cast`'s `shares`).

**Lines of dialogue.** A line is one speech, never dual dialogue, cleaned for a reader: no cue, extension (`V.O.`, `CONT'D`), parenthetical, note, or emphasis mark. It has 3–18 words, at most 110 characters, ends a sentence, and doesn't open with a filler ("Well, …"). About one scene in four gets one, at most 12, spread in even stretches through the script, at least three scenes apart, three at most per speaker, and one in each act that has a candidate. A `[[Quote]]` note in a speech (or alone on the line under it) always puts it in, up to 160 characters; `[[No quote]]` keeps it out. Each character's best line is their signature line.

**Summaries and hooks.** A scene's line is its first synopsis, else its first action sentence, at most 12 words, speakers' names in title case; an act's mood is its first synopsis. A character's hook and age come from the first action paragraph that names them in capitals (`ODILE VANCE (60s), a ferry pilot, …`). Threads join each `[[Setup: …]]` label's scene to its first payoff's.

**Gaps** (`gaps.ts`): an act with no scenes, a planned scene (a heading with no action or dialogue: it adds no pages), a scene with an open to-do note (the mark only, never its text), and, with `storyMap.plannedPages`, the pages still to write. `defaultStatus` is In progress when any is found; `finishedMap` takes the planned scenes out and lays the rest end to end. The sentence never says more than the counts.

**Stage plays** (`stage.ts`): settings from the heading, the `##` title, or a short first sentence ("The same" carries over); one interval between Acts 1 and 2 with two acts or more, moved by `[[Interval]]` and turned off by `[[No interval]]`; who's on stage, one span per character per scene from their first speech, capitals mention, or "enters", to "exits", "leaves", or "Exeunt"; and the pairs who share the stage longest.

**The page.**

```ts
import { renderStoryMap, STORY_MAP_FONT_FILES } from '@drafter/story-map';

const html = renderStoryMap({ map, fonts, lang: 'en', generator: 'Drafter 0.24.1' });
```

`renderStoryMap` returns one HTML string: the greeting, the facts, the shape (strip, donuts, pace), the characters, the scenes, the places, and the threads, each chart a hand-built SVG with `role="img"`, a `<title>`, and **Show as a table**. It has no `<script>`, no `on…` attribute, no `style` attribute, and no URL but `#…`, `data:`, and one checked `mailto:` when contact is on, under a content security policy with no `script-src`. Everything the writer wrote is escaped with `@drafter/render-html-file`'s `escapeHtml`. Dark on screen, light in print; under 400 KB for 120 pages, never over 1 MB.

**Fonts.** `fonts/` holds Anton, Archivo (400 and 600), and Courier Prime Regular, subsetted to Latin, Latin-1, and Latin Extended-A as WOFF2 (66,860 bytes), each with its SIL Open Font License; `fonts/README.md` has the sources, the commands, and the checksums. Pass their bytes as `fonts` (`STORY_MAP_FONT_FILES` names them; `@drafter/story-map/fonts/*` resolves them).

**The metadata block.** `storyMapMeta(doc.meta)` reads `storyMap.plannedPages` (1–999) and `storyMap.hooks` (strings of 200 characters at most) strictly, for the app and the command line alike.

The command line: `drafter build script.fountain --story-map map.html [--status in-progress|finished]`. The design is `docs/drafter-story-map-design.md`; the choices as built are in `docs/DECISIONS.md`.
