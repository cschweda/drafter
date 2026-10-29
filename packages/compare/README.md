# @drafter/compare

Compare for [Drafter](https://github.com/cschweda/drafter): what changed between two versions of a script. It diffs the two texts by lines, with a Myers diff written for Drafter, and gives each change with its lines in both versions and its place in the newer text. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { changesOf, diffLines } from '@drafter/compare';

diffLines(['a', 'b', 'c'], ['a', 'B', 'c']);
// [ { kind: 'same', old: [0, 1], new: [0, 1] },
//   { kind: 'removed', old: [1, 2], new: [1, 1] },
//   { kind: 'added', old: [2, 2], new: [1, 2] },
//   { kind: 'same', old: [2, 3], new: [2, 3] } ]

changesOf('Sam waits.\nAnn leaves.\n', 'Sam waits.\nAnn stays.\n');
// [ { kind: 'changed', old: [1, 2], new: [1, 2],
//     span: { from: 11, to: 21 }, removed: ['Ann leaves.'] } ]
```

Line ranges are half-open; `\r\n` and `\n` read the same. The diff is a shortest one, and a moved scene reads as removed where it was and added where it is. See the [Phase 2 design](../../docs/drafter-phase2-design.md), §11.2.

## License

MIT
