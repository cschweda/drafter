# @drafter/outline

Structure for [Drafter](https://github.com/cschweda/drafter): the scene index of a parsed Fountain script, and the edits that work on its structure (moving scenes and sections, synopses, scene colors, treatments, and outlines turned into scene stubs), each returned as text changes. It reads a parsed document, a template, and a layout when there is one, and touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

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

Everything Drafter writes is ordinary Fountain: synopses (`= …`), sections, and notes (`[[Color: blue]]`), which never print. See the [Phase 2 design](../../docs/drafter-phase2-design.md), §5 and §6.

## License

MIT
