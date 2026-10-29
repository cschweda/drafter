# @drafter/compare

Compare for [Drafter](https://github.com/cschweda/drafter): what changed between two versions of a script. It diffs the two texts by lines, with a Myers diff written for Drafter, and gives each change with its lines in both versions and its place in the newer text. It also places each change on the newer version's laid-out pages, by the source span of each printed line. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { changesOf, diffLines, markPages, stepChange } from '@drafter/compare';

diffLines(['a', 'b', 'c'], ['a', 'B', 'c']);
// [ { kind: 'same', old: [0, 1], new: [0, 1] },
//   { kind: 'removed', old: [1, 2], new: [1, 1] },
//   { kind: 'added', old: [2, 2], new: [1, 2] },
//   { kind: 'same', old: [2, 3], new: [2, 3] } ]

changesOf('Sam waits.\nAnn leaves.\n', 'Sam waits.\nAnn stays.\n');
// [ { kind: 'changed', old: [1, 2], new: [1, 2],
//     span: { from: 11, to: 21 }, removed: ['Ann leaves.'], added: ['Ann stays.'] } ]

// With `layout = paginate(parse(newer), template)` from @drafter/layout:
const { lines, gaps, stops } = markPages(layout, changesOf(older, newer));
// lines: each printed line a change added or changed, by page and span
// gaps:  removed lines, and new lines that don't print, by page and the line they sit before
// stops: one per change, in order, for a Changes list
stepChange(stops, null, 1); // 0: the first change; wraps at either end
```

Line ranges are half-open; `\r\n` and `\n` read the same. The diff is a shortest one, and a moved scene reads as removed where it was and added where it is. A change that prints nothing, such as a note, still gets a gap of its own on the page, so Next change reaches it. See the [Phase 2 design](../../docs/drafter-phase2-design.md), §11.2.

## License

MIT
