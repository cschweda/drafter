# @drafter/history

Version history for [Drafter](https://github.com/cschweda/drafter): which scenes of past versions of a script are gone now, every version of one scene, and where a deleted scene goes back. It parses each version with `@drafter/fountain`, reads its scenes with `@drafter/outline`'s scene index (with the template the text names), and reduces each scene to a **print**: a 53-bit hash of its text, its heading folded for matching, and a bottom-k sketch of its three-word shingles. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import {
  deletedScenes,
  putBackChanges,
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
sceneVersions(nowPrint, snapshots, cache); // the scene's versions, consecutive equal ones merged

// Put back the scene at `index` of a snapshot: after its old previous scene, or before its old
// next one when it opened an act; then the nearest neighbour left; else at the end.
const place = putBackPlace(snapshot.slots, index, cache, nowScenes, nowText.length);
const changes = putBackChanges(nowText, place, sceneTextFromSnapshot); // one insertion

sceneAnchors(text); // [{ line, title }]: each scene heading's line, for Compare's groups
```

Two versions are the same scene when their hashes are equal; or their headings are the same and they share at least a quarter of the smaller one's wording (or both have none); or they share at least half of all their wording; or most (three quarters) of the smaller one's wording is in the other, as in a merge or a split (`MATCH`). A scene is deleted when no scene now is the same scene. See the [version-history design](../../docs/drafter-version-history-design.md), §3.

## License

MIT
