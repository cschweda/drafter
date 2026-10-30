# @drafter/outline

Structure for [Drafter](https://github.com/cschweda/drafter): the scene index of a parsed Fountain script, and the edits that work on its structure (moving scenes and sections, synopses, scene colors and the rest of a scene's header, treatments, and outlines turned into scene stubs), each returned as text changes, the whole script as Markdown, and the geometry of the Structure strip, the band of sections and scenes Drafter draws above its panes. It reads a parsed document, a template, and a layout when there is one, and touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { parse } from '@drafter/fountain';
import { downTarget, moveItem, sceneIndex } from '@drafter/outline';
import { builtins } from '@drafter/templates';

const doc = parse('INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n');
const index = sceneIndex(doc, builtins['us-screenplay']);
index.scenes.map((s) => s.heading); // ['INT. A - DAY', 'INT. B - DAY']

const first = index.scenes[0].block;
const move = moveItem(doc, index, first, downTarget(index, first));
move.changes; // a delete and an insert, for one editor transaction
```

Each scene in the index also carries what its notes say: `fields` (the first `[[Goal: …]]`, `Conflict`, `Outcome`, `Shift`, `Storyline`, and `Color` note, typed anywhere in the scene, in any case), `storylines`, and its `[[Setup: …]]` and `[[Payoff: …]]` marks. `setSceneDetails` writes a scene's whole header at once, in the design's order:

```ts
import { setSceneDetails } from '@drafter/outline';

const changes = setSceneDetails(doc, index.scenes[0], {
  synopsis: 'Margaret waits for a call.',
  color: 'blue',
  goal: 'Make Tom admit he lied.',
  shift: '', // cleared: the note and its line go
});
// INT. A - DAY
//
// = Margaret waits for a call.
// [[Color: blue]]
// [[Goal: Make Tom admit he lied.]]
```

Everything Drafter writes is ordinary Fountain: synopses (`= …`), sections, and notes (`[[Color: blue]]`), which never print. See the [Phase 2 design](../../docs/drafter-phase2-design.md), §5, §6, §9, and §10.

## Timing

Each scene and section in the index also carries `timing`: the words spoken in it (dialogue and lyrics that print) and its printed lines of action, each source line wrapped at the width of the role the template gives action. `blockTiming` gives the same for one block; `TimingTally` adds blocks up in order, counting a dual-dialogue pair (`^`) once, as its longer speech, since both are said at the same time. A speech is what the layout groups as one: its cue and the parentheticals, dialogue, and lyrics right after it; a note, boneyard, or synopsis block ends it. `estimateSeconds` turns a timing into an estimate of the running time at a speaking pace, with 1.5 seconds for each line of action (`ACTION_SECONDS_PER_LINE`). Each scene also has `spokenBy`, the words each of its speakers says.

```ts
import { estimateSeconds, TimingTally } from '@drafter/outline';

index.scenes[0].timing; // { spoken: 42, actionLines: 6 }
index.scenes[0].spokenBy; // { MARGARET: 30, DANNY: 12 }
const tally = new TimingTally(template);
for (const block of doc.blocks) tally.add(block);
estimateSeconds(tally.timing(), 150); // seconds, at 150 words a minute
```

See the [out-the-door design](../../docs/drafter-out-the-door-design.md), §3.

## The script as Markdown

`scriptMarkdown` writes the whole script, not only its outline, as CommonMark that reads well in any Markdown viewer and pastes cleanly into a website, a notes app, or an AI chat. The title page's Title is `#` and its other printed lines are paragraphs; sections are headings one level below the title, and scene headings one level below the deepest section, numbered as the PDF numbers them (`sceneNumbersFor` in `@drafter/layout`); a level past 6 is a bold paragraph. A speech is one paragraph: the name in bold, a parenthetical in italics, then the dialogue, line under line. A play's stage directions and lyrics are italic, centered text keeps its marks (`\>THE END\<`), a page break is `* * *`, and the second speech of dual dialogue says *(at the same time)*. Bold, italics, and underlining come through as `**`, `*`, and `<u>…</u>`. Notes and synopses are left out unless `notes: 'include'`, when they are quotes where they stand; the boneyard never is. Cut the title page first with `titlePageFor`, as the PDF does.

```ts
import { parse } from '@drafter/fountain';
import { titlePageFor } from '@drafter/layout';
import { sceneIndex, scriptMarkdown } from '@drafter/outline';
import { builtins } from '@drafter/templates';

const template = builtins['us-screenplay'];
const parsed = parse('Title: The Call\n\nINT. KITCHEN - NIGHT #12#\n\nMARGARET\n(quietly)\nYou said you\'d call.\n');
const doc = { ...parsed, titlePage: titlePageFor(parsed.titlePage, 'full') };
scriptMarkdown(doc, sceneIndex(doc, template), template, { sceneNumbers: 'written', notes: 'leave-out' });
// # The Call
//
// ## 12. INT. KITCHEN - NIGHT
//
// **MARGARET**\
// *(quietly)*\
// You said you'd call.
```

`markdownText` is the escaper it and `treatment` share: the writer's text, escaped so a CommonMark parser reads back exactly that text in one paragraph, each line's ends trimmed and the lines joined by hard breaks.

## The Structure strip

`structureStrip` turns the scene index into the geometry of Drafter's Structure strip: a row for each section depth from 1 to 3 the script uses (`STRIP_DEPTHS`), then a row of every scene, each block placed along one axis of pages. A scene starts at its page and line and ends where the next one starts (the last one by its eighths), so the scenes tile the axis; a section spans its scenes, and a section with no scenes is a tick. Without a layout the blocks are sized by printed words. `rulerMarks` gives the page ruler's marks for a width in pixels.

```ts
import { paginate } from '@drafter/layout';
import { linesPerPage, rulerMarks, sceneIndex, structureStrip } from '@drafter/outline';

const layout = paginate(doc, template);
const strip = structureStrip(sceneIndex(doc, template, layout), linesPerPage(layout));
strip.rows.map((row) => row.depth); // a script with # and ### sections: [1, 3, null]
strip.rows.at(-1)?.blocks[0]; // { kind: 'scene', block, from, to, label: '1 INT. HALL - DAY', color: 'blue' }
rulerMarks(strip, 1200); // 120 pages: page 1, then every 5th numbered, and a tick at every page
```

See the [Structure strip design](../../docs/drafter-structure-strip-design.md).

## License

MIT
