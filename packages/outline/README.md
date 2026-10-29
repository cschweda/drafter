# @drafter/outline

Structure for [Drafter](https://github.com/cschweda/drafter): the scene index of a parsed Fountain script, and the edits that work on its structure (moving scenes and sections, synopses, scene colors and the rest of a scene's header, treatments, and outlines turned into scene stubs), each returned as text changes. It reads a parsed document, a template, and a layout when there is one, and touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

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
