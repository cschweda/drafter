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

## Rows for a diff view

A diff view draws rows, not changes. `diffRows` gives each unchanged line once and each change's removed lines then its added lines, with both line numbers (from 0), the change it belongs to, and, in a change that replaces lines, the row it is paired with: removed line i with added line i, when their words are alike (`lineSimilarity`, Dice over words, at least `PAIR_MIN` = 0.4).

```ts
import { diffRows, diffWords, foldRows, groupRows, markdownAnchors, openFold, pairRows } from '@drafter/compare';

const { rows, changes } = diffRows(older, newer);
// rows[i]: { kind: 'same' | 'added' | 'removed', old, new, text, change, pair }

diffWords('Ann leaves the hall.', 'Ann crosses the hall.');
// { removed: [ { text: 'Ann ', kind: 'same' }, { text: 'leaves', kind: 'removed' }, { text: ' the hall.', kind: 'same' } ],
//   added:   [ { text: 'Ann ', kind: 'same' }, { text: 'crosses', kind: 'added' },  { text: ' the hall.', kind: 'same' } ] }
diffWords('the cat sat', 'a dog stood'); // one change a side: the spaces between fold in

// Anchors are the lines that start a scene: scene headings, or for Markdown, headings 1 to 3.
const groups = groupRows(rows, oldAnchors, newAnchors);
// { from, to, title, tag: 'same' | 'new' | 'deleted' | 'renamed' | 'opening', renamedFrom, added, removed, changes }
markdownAnchors('# Act One\n```\n# not this\n```\n## Scene 1'); // lines 0 and 4

foldRows(rows, group.from, group.to); // [{ kind: 'rows' | 'fold', from, to }, ...]
openFold(fold); // the first 200 rows of a fold, and a fold of the rest
pairRows(rows, group.from, group.to); // [{ left, right }, ...]: row indices, null for a blank cell
```

- `diffWords` splits a line into tokens (a run of letters, digits, `'` and `’`; a run of whitespace; any other character), diffs them with `diffLines`, and folds an unchanged run of only whitespace, or of one or two characters, between two changes into them. A side of more than `MAX_TOKENS` (2,000) tokens gives `null`: no word marks.
- `foldRows` folds an unchanged stretch longer than 2 × `CONTEXT` (3) lines, keeping `CONTEXT` lines next to each change in the range. A fold longer than `FOLD_STEP` (200) opens that many at a time. A group with more than `LARGE_GROUP` (400) changed lines is for the view to start collapsed.
- `groupRows` cuts at each row whose line is an anchor of its side (the older for a removed row, the newer otherwise). A removed heading paired with an added one is one `renamed` group; rows before the first anchor are the `opening`. The groups tile the rows, changed or not; a group with no added or removed rows has nothing to show. Each change is listed in the group its first row is in.

See the [version history design](../../docs/drafter-version-history-design.md), §5.

## License

MIT
