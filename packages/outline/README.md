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

## License

MIT
