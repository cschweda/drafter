# Definitions: look a word up in the 1913 Webster's (design)

Status: drafted 2026-11-27 from the maintainer's choices (below); **awaiting approval**. Nothing is built yet.

W1913 ([w1913.com](https://w1913.com), [github.com/cschweda/w1913](https://github.com/cschweda/w1913)) is the maintainer's edition of *Webster's Revised Unabridged Dictionary* (1913), made for writers. Its text is in the US public domain and the edition is CC0. It publishes its data to be carried by other programs, not called as an API: a lookup build (one gzipped JSON file, 8.1 MB) and the [`w1913`](https://www.npmjs.com/package/w1913) npm package (MIT, no dependencies) that reads it with the same answers as the site. W1913's own design (its DESIGN.md §4b) was written with Drafter in mind.

## 1. Intent

The maintainer: "start on drafter", choosing (2026-11-27):

- **Where:** desktop and drafter.dev, both in this release.
- **Data:** an optional download the writer asks for once, not bundled with the app.
- **How:** right-click a word → **Look up "saunter"**, which opens a side panel with the definition.

So: a writer in the middle of a scene wonders whether *saunter* means what they think, or wants the 1913 sense of a word for a period piece, and gets the answer beside the script, offline, without leaving Drafter and without anything they typed leaving the device.

## 2. Goals

1. **Look up** the word under the pointer or cursor, or one typed into the panel, and see its entries: part of speech, numbered senses and lettered sub-senses, and the phrases defined in it (*bill of fare* under *bill*).
2. **Inflections and phrases find their word**, as on w1913.com: *walked* → *walk* ("from *walked*"), *bill of fare* → the phrase.
3. **Offline after one download**, on both apps, and nothing typed is ever sent anywhere: lookups run on the device.
4. **Optional:** nothing is downloaded until the writer asks; the writer can remove it again.
5. **Keyboard, screen reader, both themes, phone**, like every other panel.

## 3. Non-goals (this release)

- Synonyms, rhymes, etymologies, quotations, pronunciation. The lookup build carries senses and phrases only; the rest stays on w1913.com, one link away.
- Other dictionaries or languages (the "downloadable dictionary packs" in DEFERRED are for spelling; this is not one, though it reuses the idea).
- Underlining "archaic" words in the script, or any lint rule from the dictionary.
- Drafter for Claude (the MCP server) answering definitions.

## 4. Anti-goals (failure even if it works)

- **A word leaves the device.** No lookup ever touches the network. The only request is the one download the writer starts, and it carries nothing about the writer or their script.
- **The privacy promise quietly changes.** Every page that lists what Drafter sends over the network says, before this ships, exactly what the download is and when it happens.
- **Typing gets slower, or memory stays high.** The dictionary (about 90 MB once loaded) lives in a worker, is loaded on the first lookup, and is let go after a while unused.
- **The browser's own menu is taken away on drafter.dev.** Right-click keeps Cut, Copy, Paste and the rest.
- **A nag.** No prompt to download; a writer who never looks a word up never sees the feature except as one menu item and one Settings row.

## 5. Constraints

- **Desktop network rule** (`apps/desktop/src/network.ts`): pages may not make http(s) requests; the main process's own requests pass. The update check uses its own session partition, a timeout and a size cap (`updates-main.ts`). The download must do the same, from the main process.
- **drafter.dev's CSP** is `connect-src 'self'` (`apps/web/scripts/csp.mjs`): the page can fetch the file only from drafter.dev itself.
- **The service worker precaches** only the listed patterns, under Workbox's 2 MiB limit, and `check-build.mjs` fails on anything else (`PRECACHED`, `NOT_PRECACHED`). The file must stay out of the precache and be fetched when asked.
- **Supply chain:** `minimumReleaseAge: 10080` (one week). `w1913` 0.2.0 was published 2026-11-28 (UTC); see §9.
- **Dependencies get an entry in `docs/DEPENDENCIES.md` before they are added**, and the licences page lists what ships.

## 6. Approaches considered

1. **Call w1913.com.** Refused by both apps' rules (CSP, `network.ts`), and it would send every looked-up word to a server. Rejected.
2. **Bundle the file in the app and the site.** Simplest, works at once, but every install and every drafter.dev visitor's precache carries 8 MB most never use, and the maintainer chose a download. Rejected.
3. **Static shards** (w1913.com/data/0.7/<prefix>.json, small files per two letters). Same-origin only if drafter.dev mirrors 380 files; offline only for the shards already fetched. Rejected.
4. **One optional download, stored locally, read in a worker** (chosen). One file, one checksum, one place it is kept, the same code on both apps.

## 7. The design

### 7.1 Words

- The feature is **Definitions**: the panel is "Definitions", the menu item **Look up "saunter"**. ("Dictionary" is already the spelling dictionary: *Add to Dictionary*, *My dictionary*.)
- Settings → Spelling gains a **Definitions** row: "Webster's 1913 dictionary, for Look up. 8.1 MB, downloaded once; lookups never use the network." **Download** / **Remove**.
- The source is always named: "Webster's Revised Unabridged Dictionary (1913), from W1913".

### 7.2 The data, and where it is kept

- **The file:** `w1913-lookup-0.7.json.gz` (8,116,098 bytes) from the W1913 release v0.17.2. Its **SHA-256 is pinned in Drafter's source**, with the edition and URL, in one place (`definitions/source.ts`). A new edition is a code change, reviewed like any dependency bump.
- **drafter.dev:** the build copies the file into `.output/public/definitions/` (as `sync-assets.mjs` does for the spelling dictionaries), from a cache that `scripts/` fills by downloading the pinned release asset and checking its SHA-256 (the build fails on a mismatch). It is **not committed** and **not precached**. `_headers` serves it as `application/octet-stream`, cached for a year (the name carries the edition).
- **Desktop:** the main process downloads it from GitHub's release URL (§7.4); nothing is added to the app.
- **Both:** the bytes, as downloaded (still gzipped), go into IndexedDB: Dexie `version(3)` adds a `definitions` table, one row `{ edition, sha256, bytes: Blob, added }`. Remove deletes the row. Same storage, same code path, after the download.

### 7.3 Looking up (both apps)

- A module worker, `workers/definitions.worker.ts`, receives `lookup(word)` and `suggest(prefix)`. On the first call it reads the Blob from IndexedDB, checks its SHA-256 again, decompresses it (`DecompressionStream('gzip')`), parses it, and calls `createLookup(build)` from `w1913`. Measured in Node: about 120 ms to load, about 0.1 ms per lookup, about 90 MB held.
- **The worker ends after 5 minutes unused** (as the spare words worker ends when no view needs it), so the memory goes back.
- A missing or corrupt file answers "not downloaded", never an error page.

### 7.4 The desktop download

- `apps/desktop/src/definitions-main.ts`: on `drafterDesktop.definitions.download()`, the main process fetches the pinned URL with `net.fetch` on its own partition (`drafter-definitions`), no cookies, a 60-second timeout, a **9 MB cap** on the body, following GitHub's redirect to its asset host only, and checks the SHA-256. Only then does it hand the bytes to the page (an `ArrayBuffer` over IPC), which stores them as on the web.
- The page cannot name the URL: the bridge's `download()` takes no arguments.
- Progress (bytes so far) is reported to the Settings row; Cancel aborts.

### 7.5 Right-click and the panel

- **Desktop:** the native menu (`context-menu.ts`) gains **Look up "<word>"** above Cut/Copy/Paste, when the click is on a word: Electron's `selectionText` when one word is selected, else the word at the click, asked of the page the way Story Atlas's speech is asked (`speechAsker`, at most 200 ms). It sends `drafter:editor:look-up` with the word; the preload's `bridge.editor.onLookUp` validates it (a string, at most 64 characters).
- **drafter.dev:** the browser's menu cannot be added to and is not replaced. Instead:
  - the spelling menu (`SpellMenu.vue`, shown on a misspelled word) gains **Look up "<word>"**;
  - a command and shortcut, **Look up word** (proposed `Ctrl/Cmd+Shift+L`, checked against the existing keys), looks up the word at the cursor or the selection, on both apps;
  - the panel's own search box.
- **The panel** is an Inspector tab that exists only while open, like Compare (`COMPARE_TAB` in `utils/panes.ts`), labelled **Definitions**, with a close button; on a phone it is a bottom-sheet tab the same way. It shows:
  - a search field (with suggestions from `suggest()`), the headword, "from *walked*" when an inflection led there;
  - each entry: part of speech, numbered senses, lettered sub-senses; its phrases as a list; a phrase lookup opens at that phrase;
  - "More on w1913.com" (synonyms, quotations, etymology), an external link opened in the system browser on desktop (`protocol.ts` trusts that one host for links, and only for links);
  - when the file is not downloaded: one sentence and the **Download** button (8.1 MB), never automatic.
- Keyboard: the shortcut focuses the panel's heading; Escape closes it and returns focus to the editor; the results are a heading and lists a screen reader reads in order; the search is announced politely ("Saunter, 2 entries").

### 7.6 What the privacy pages say

Before release, each place that lists Drafter's network use gains the download, worded the same:

- README "What does use the network, all of it", and the desktop line "Its only network requests are to GitHub, for updates" → "…for updates, and for the Webster's 1913 dictionary if you download it";
- `docs/web-and-desktop.md` (Network row), `pages/docs/privacy.vue` (the table, `#offline`), the three desktop install guides;
- drafter.dev: the file comes from drafter.dev itself, so the web column changes only to say that the dictionary, once downloaded, is kept in the browser's storage with the scripts.

### 7.7 Licences and dependencies

- `docs/DEPENDENCIES.md`, "The app (`apps/web`)": `w1913` (MIT, no dependencies, the maintainer's own package): reads the lookup build. Pinned exactly.
- The licences page gains a `#definitions` section: the code's MIT licence, and the data's CC0 1.0 dedication (shipped with the build as `licenses/w1913-*.txt`).

## 8. Left to the builder (decide, and record in DECISIONS)

- The exact shortcut, after checking the keymap and the browsers' own keys.
- How the word at a desktop click is found (the page answering for the click point, or `selectionText` alone).
- Whether the Definitions row belongs under Spelling or a new Settings section.
- The worker's idle time (5 minutes proposed).

## 9. Decided with the maintainer

- Desktop and drafter.dev; an optional download; right-click and a side panel (2026-11-27).
- **Open — the one-week rule:** `w1913` is newer than `minimumReleaseAge` allows. Either add it to `minimumReleaseAgeExclude` (it is the maintainer's own package, with no dependencies) or build after 2026-12-05. Proposed: the exclusion, with a comment and a DECISIONS line.

## 10. My calls (check while reading)

- The name **Definitions**, to stay clear of the spelling dictionary.
- The file stored as a Blob in IndexedDB on both apps, rather than a file in the desktop's profile, so one code path serves both.
- A keyboard command on drafter.dev instead of a custom right-click menu, so the browser's menu stays whole.
- The phrases and senses only, with a link for the rest (§3).
