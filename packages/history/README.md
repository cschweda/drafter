# @drafter/history

Version history for [Drafter](https://github.com/cschweda/drafter): which scenes of past versions of a script are gone now, every version of one scene, and where a deleted scene goes back. It parses each version with `@drafter/fountain`, reads its scenes with `@drafter/outline`'s scene index (with the template the text names), and reduces each scene to a **print**: a 53-bit hash of its text, its heading folded for matching, and a bottom-k sketch of its three-word shingles. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import {
  deletedScenes,
  putBackChanges,
  coveredBy,
  putBackPlace,
  sameScene,
  sceneAnchors,
  scenePrints,
  sceneVersions,
} from '@drafter/history';

// Each version's scenes in order (slots), and a print of each distinct scene version. Pass the
// hashes already printed, and they aren't shingled again.
const { slots, prints } = scenePrints(text, (hash) => cache.has(hash));

// Snapshots newest first, as { id, at, slots }; `cache` maps each hash to its print.
deletedScenes(snapshots, cache, nowPrints); // one entry per deleted scene, newest deleted first
sceneVersions(nowPrint, snapshots, cache); // the scene's versions, consecutive equal ones merged,
// newest first, each with its snapshots, heading, and printed words, and a gap row for a run of
// snapshots without it

// Put back the scene at `index` of a snapshot: after its old previous scene, or before its old
// next one when it opened an act (or right after the act's heading, with that one gone); then
// the nearest neighbour left; else at the end. `sections` is `scenePrints(nowText).sections`.
const place = putBackPlace(snapshot.slots, index, cache, nowScenes, nowText.length, sections);
const changes = putBackChanges(nowText, place, sceneTextFromSnapshot); // one insertion

sceneAnchors(text); // [{ line, title }]: each scene heading's line, for Compare's groups
```

A scene's wording is its three-word shingles; one under five words adds its word pairs, and a scene of one word is that word. Two versions are the same scene (`sameScene`) when their hashes are equal; or their headings are the same and they share at least a quarter of the smaller one's wording and two shingles of it (all of it, for a one-shingle scene), or either has no words, as a heading written first; or they share at least half of all their wording; or most (three quarters) of the smaller one's wording is in the other, as in a merge or a split (`MATCH`). A scene is deleted when no scene now covers it (`coveredBy`): the same scene, except that a scene now with no words never covers one that had them, so a bare heading left behind doesn't hide a cut. `sceneVersions` and `putBackPlace` use `sameScene` both ways. Prints are made by `PRINT_VERSION` 2; a cache keeps it beside them and drops prints of another. In Drafter, a worker of its own (`apps/web/app/workers/history.worker.ts`) reads the snapshots and keeps the prints in a `drafter-cache` database, for Deleted scenes and History of this scene. See the [version-history design](../../docs/drafter-version-history-design.md), §3 and §6.

## License

MIT
