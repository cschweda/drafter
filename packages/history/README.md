# @drafter/history

Version history, drafts, and cuts for [Drafter](https://github.com/cschweda/drafter): every version of one scene, what left a text between two versions (scenes, sections, and passages: Cuts), and the draft and cuts files written beside a work. For scene history, it parses each version with `@drafter/fountain`, reads its scenes with `@drafter/outline`'s scene index (with the template the text names), and reduces each scene to a **print**: a 53-bit hash of its text, its heading folded for matching, and a bottom-k sketch of its three-word shingles. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

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

A scene's wording is its three-word shingles; one under five words adds its word pairs, and a scene of one word is that word. Two versions are the same scene (`sameScene`) when their hashes are equal; or their headings are the same and they share at least a quarter of the smaller one's wording and two shingles of it (all of it, for a one-shingle scene), or either has no words, as a heading written first; or they share at least half of all their wording; or most (three quarters) of the smaller one's wording is in the other, as in a merge or a split (`MATCH`). A scene is deleted when no scene now covers it (`coveredBy`): the same scene, except that a scene now with no words never covers one that had them, so a bare heading left behind doesn't hide a cut. `sceneVersions` and `putBackPlace` use `sameScene` both ways. Prints are made by `PRINT_VERSION` 2; a cache keeps it beside them and drops prints of another. In Drafter, a worker of its own (`apps/web/app/workers/history.worker.ts`) reads the snapshots and keeps the prints in a `drafter-cache` database, for History of this scene and Cuts. See the [version-history design](../../docs/drafter-version-history-design.md), §3 and §6. `deletedScenes` and `putBackPlace` were Deleted scenes' (v0.18.0 to v0.23.2), which Cuts replaced in v0.24.0; they are kept and tested.

## Cuts

```ts
import { CUT_MIN_WORDS, findCuts } from '@drafter/history';

// What left `before` and isn't in `after`, in `before`'s order: whole scenes (a script) or
// chapters and sections (a Markdown document, `#` to `###`), and passages from one still there.
const cuts = findCuts(before, after, 'fountain'); // or 'markdown'
// [{ title, text, where: { after, before, within } }]
```

A scene, chapter, or section is cut when nothing in `after` holds it (scenes as `coveredBy` judges; sections by hash, then by heading and wording, `Candidates` giving each at most `CANDIDATES_MAX` (64) to check). Within one still there, a removal is a cut when it is **a whole element or paragraph** taken out with nothing in its place (a speech, an action paragraph, a transition, a Markdown paragraph or list item), at any length, or **a run of `CUT_MIN_WORDS` (12) or more words** taken out, or replaced by text that keeps under `CUT_KEEP_SHARE` (half) of its word pairs. Typo fixes, rewordings under 12 words, light rewrites, and moved text are not cuts. `text` is an exact slice of `before` with `\n` line breaks, starting on a word; the same text twice is one cut. `where.after` and `where.before` are the neighbours' headings as they are in `after`; `within` is the scene or section a passage left (`{ heading, ordinal }`, null for a whole unit), so a list can group it there. A stored cut's `CutWhere` may also hold `ordinal` (its place among units with the same heading) and `lineAfter` (the line a passage followed), which Drafter's worker adds, so Put back finds the right place. 300 scenes and 200,000 words take well under a second, and every case scales linearly.

## Draft and cuts files

```ts
import {
  cleanWorkName, cutsFile, draftFile, draftFileName, draftName, mergeCuts,
  readCutsFile, readDraftFile, verifyCuts,
} from '@drafter/history';

draftName(3); // 'Draft 03' (two digits; three past 99)
draftFileName('Boca', 3, 'fountain'); // 'Boca – Draft 03.fountain', the name cleaned by cleanWorkName
const file = draftFile(text, { draft: 3, id, frozen: '2026-11-03T10:42:00.000Z', note: 'from Sam' }, 'fountain');
readDraftFile(file, 'fountain'); // { text, facts } exactly as given, or { text: file, facts: null, problem }

const md = cutsFile('Boca.fountain', entries); // the readable cuts file, newest first
const read = readCutsFile(md); // { entries, skipped }: a linear scan, a damaged entry skipped
const checked = await verifyCuts(read.entries); // each entry's id must be the SHA-256 of its text
mergeCuts(stored, checked.entries, { kind: 'fountain', now: new Date() }); // the stored side trusted
```

A draft file is its text, one blank line, then the facts (`draft`, `id` = the SHA-256 of the text, `frozen`, `note`, and `from` for a restored one) in Drafter's `/* drafter … */` metadata block, or for Markdown a trailing `<!-- drafter … -->` comment (`@drafter/markdown`'s `setMarkdownMeta`). A text that ends with its own block has the facts merged in, and the block as it was kept whole (`ownBlock`), so the text comes back byte for byte. Reading never throws: any field that isn't strict (an integer from 1, 64 lower-case hex digits, a canonical ISO date, a one-line note) gives `facts: null` and a plain `problem`.

The cuts file (`Boca.fountain.cuts.md`) has each cut as `## <title>`, a line saying when and in which draft it was cut and where it was, its text (fenced for Fountain; for Markdown as-is with its headings demoted one level), and a `<!-- drafter-cut {json} -->` line that `readCutsFile` reads back. `mergeCuts` keeps one entry per id with every date; for an id on both sides the local entry's title, text, and kind win, and the newest version's place; incoming entries of another kind, far-future dates, and versions past `MAX_VERSIONS_PER_ID` (64) are dropped, and an entry keeps at most `MAX_CUTS_PER_ENTRY` (1,000) dates. See the [Drafts and Cuts design](../../docs/drafter-drafts-and-cuts-design.md), §3 and §4.

## License

MIT
