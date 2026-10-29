# Phase 2, Plan D: Spellcheck (v0.14.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Spellcheck (v0.14.0): a new engine package, `@drafter/spell`, that says which words of a Fountain script or a Markdown document to check and never flags character names, scene-heading locations, transitions, the script's dictionary, the writer's own dictionary, short all-capital words, words with digits, or addresses; nspell with US and British English dictionaries in a worker of its own that checks only what changed; dotted-underline marks in the Source pane; a menu (right-click, **Spelling suggestions**, or the phone's **Spelling** button) with up to five suggestions, **Add to this script's dictionary**, **Add to my dictionary**, and **Ignore here**; **Next misspelling** and **Previous misspelling**; **Check spelling** listing every flagged word in Problems under **Spelling**, outside the problem count. The browser's own spellcheck is turned off in the Source pane.

**Architecture:** `@drafter/spell` is pure apart from nspell: `tokens.ts` (words and the skip rules), `units.ts` (the checkable text of each block, or of a Markdown document, with skipped parts blanked), `known.ts` (harvested names and locations, the script's dictionary in the metadata block), `checker.ts` (the nspell wrapper), and `session.ts` (an incremental checker that caches each unit's words and each word's verdict, so only changed blocks are tokenized and only new words reach nspell). The worker (`apps/web/app/workers/spell.worker.ts`) holds one session, fetches the dictionary files the app serves from `/dictionaries/<language>/`, parses the text it's sent, and replies with misspellings; the main thread only posts the text after a pause and maps the reply through the edits made since. The marks are a CodeMirror state field in `@drafter/cm-fountain` (`spell.ts`), not lint diagnostics, outside `fountain()` so Markdown documents get them too. `apps/web` draws the menu, the commands, the Spelling group, the Settings, and the phone's button.

**Tech Stack:** TypeScript, Vue 3.5 / Nuxt 4 / Nuxt UI 4, CodeMirror 6, Web Workers, Vitest 5 with fast-check, Playwright 1.64. **New dependencies** (Task 1 approves them): `nspell` 2.1.5 (MIT), `dictionary-en` 4.0.0 and `dictionary-en-gb` 3.0.0 (`(MIT AND BSD)`, SCOWL-derived Hunspell data), `is-buffer` 2.0.5 (MIT, nspell's one dependency), and `@types/nspell` 2.1.6 (MIT, development).

**Spec:** [`docs/drafter-phase2-design.md`](../drafter-phase2-design.md): §22 Plan D (scope and Done-when are binding); §12 (spellcheck), §5.5 (the metadata block's `dictionary`), §5.7 (rules every view follows), §21 (`@drafter/spell`, the dependency table, "a dictionary under the GPL or LGPL is never bundled"); [`docs/drafter-technical-design.md`](../drafter-technical-design.md) §10 (nspell only, native spellcheck off, its own worker on changed blocks, the skip list, `meta.dictionary` and `settings.personalDictionary`, five suggestions, the Spelling group) and §8.6 (the metadata block); [architecture](../drafter-architecture.md) §9; [Phase 1 design](../drafter-phase1-design.md) §5.3 (the browser's spellcheck and its setting, which Plan D replaces). Plans A, FD, B, and C's decisions in `docs/DECISIONS.md` still hold.

## Global Constraints

- Branch `phase2-d` (worktree `scratchpad/drafter-d`), from `main` at v0.13.0 (`f7114ed`).
- **Clean room:** no code, text, or fixtures from any screenwriting app, Fountain library, or spellchecker integration. nspell is used through its public API only; the dictionaries are data. Every fixture is Drafter's own (invented names and places), every label and message Drafter's own words.
- **The only new third-party dependencies** are the five Task 1 approves, each with a `docs/DEPENDENCIES.md` row and its licence shipped, at the exact versions recorded there (pinned, no `^`). `@drafter/spell` depends on `@drafter/fountain`, `nspell`, `dictionary-en`, and `dictionary-en-gb` only (dev: `@types/nspell`, and `fast-check` from the root). Anything else needs a row first, and none is expected. A dictionary under the GPL or LGPL is never bundled (§21): Task 1's guard test fails if a dictionary's declared licence or licence file says otherwise.
- **Typing never waits on the checker:** nothing spell-related runs in a keystroke's transaction except mapping the marks (O(marks), no allocation per word); the text goes to the worker after a 300 ms pause; tokenizing, parsing, checking, and suggesting all happen in the worker. A Chromium e2e test types into a 120-page script with misspellings on screen, and with the dictionary still loading, and sees no long task (Task 4).
- **Never flagged, by fixture** (`packages/spell/test/fixtures/`): character names (every word of every cue's name, anywhere in the script), every word of a scene heading's location (anywhere), transitions, the words in the script's dictionary and in My dictionary, all-capital words of three letters or fewer, words with digits, and web and e-mail addresses. Notes and boneyard are skipped unless the **Check notes and boneyard** setting is on; the metadata block and the title page are never checked (Call 7).
- **Add to this script's dictionary** writes `dictionary` in the metadata block through `setMeta`, as one transaction (`applyTextChanges`: one undo), and the same transaction carries the effect that unmarks every occurrence of the word, so it is unflagged at once, before the worker replies.
- **My dictionary** is the setting `personalDictionary: string[]` in the IndexedDB `settings` table (technical design §10), never in the file (Call 9).
- **The browser's spellcheck is off** in the Source pane (`spellcheck="false"`) whether Drafter's is on or off (Call 18). Other text fields (a synopsis, a note dialog) keep the browser's; the desktop app's bundled Chromium dictionary stays for them.
- **Markdown documents** are checked, skipping code, front matter, addresses, and HTML (Call 16); **Add to this script's dictionary** is disabled there, with the reason, because a Markdown document has no metadata block.
- **Read-only** (another tab has the script, or its file is being checked): marks are shown; **Ignore here** and **Add to my dictionary** work (neither edits the file); a suggestion and **Add to this script's dictionary** are disabled (`aria-disabled`) with the reason, as `useOutline().readOnly` gives it.
- **Keyboard:** every action is a command in the registry (`apps/web/app/commands/data.ts` + `builtin.ts`, so it's in the palette and on the Keyboard shortcuts page). New UI reuses existing patterns: the spelling menu is a `MenuButton` (non-modal, Tab closes it and focus returns to the editor), announcements go through `sayOutline` (`outline/notice.ts`, `OutlineAnnouncer.vue`), the phone's button is an element-bar button.
- **Accessibility work waits for the final steps** (maintainer, 2026-10-28): no new axe tests and no accessibility task; the existing axe tests stay green. The Done-when item "axe passes with misspellings on screen and the menu open" is deferred to those steps and listed in `docs/DEFERRED.md`. §12's own requirements (the 3:1 mark color, `aria-invalid="spelling"`, keyboard access) are built here.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` under a new `## Phase 2, Plan D: Spellcheck (`@drafter/spell`, `@drafter/cm-fountain`, `apps/web`)` section (each Call below gets a line when it lands); conventional commits with **no AI co-author trailer and no session link**.

## Review Focus

1. **The dictionary can't load** (a first visit that goes offline before the precache finishes, a 404, the worker dies): no marks, the status bar says so once per visit ("Spellcheck couldn’t load its dictionary. Typing and saving are unaffected."), the setting stays on, and the next script load tries again. Task 4's `a failed dictionary load is one reply, and the next request tries again` and the e2e `says once that the dictionary couldn't load, and types on`.
2. **A reply that arrives after more typing** never marks the wrong letters: it is mapped through every edit since its request, a mark an edit touches is dropped, and a reply older than the newest request is ignored. Task 4's `maps a late reply through the edits since`, `drops a mark the writer is retyping`, and `ignores a reply older than the newest request`.
3. **A switch of script, kind, or language mid-check** never shows the old script's marks on the new one. Task 4's `clears the marks on a new script and ignores the old script's reply` and `rechecks everything after the language changes`.
4. **The metadata block can't be written** (a stray `/*`, so `setMeta` returns []; or a block that isn't JSON): Add to this script's dictionary changes nothing and says why; an existing `dictionary` that isn't an array of strings is read as empty and replaced cleanly. Task 2's `refuses with a stray /*`, `reads a damaged dictionary entry as empty`, and Task 5's `says why the script's dictionary can't be written`.
5. **Accents, curly apostrophes, and other scripts:** `café`, `naïve`, `Zoë`, `don’t`, and `Margaret’s` are accepted (the dictionaries are built with accents stripped, so an accented word is also tried without them; `’` is read as `'`; a possessive is stripped before the name and dictionary lookups), and a word with no Latin letter (Greek, Cyrillic, CJK) is not checked. Task 2's `normalizes apostrophes and possessives`, `skips words in other scripts`, and Task 3's `accepts accented words the dictionary has without accents`.

---

### Task 1: The dependencies, their licences, and their notices

Before any code: confirm, record, install, and ship the notices.

**Files:**
- Create: `packages/spell/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}` (shaped like `packages/compare`; `src/index.ts` exports nothing yet but `DICTIONARIES`), `packages/spell/src/dictionaries.ts`, `packages/spell/test/licences.test.ts`, `apps/web/app/pages/docs/licences.vue`
- Modify: `docs/DEPENDENCIES.md` (rows below), `vitest.shared.ts` (`'spell'` in `packages`), `apps/web/package.json` (`"@drafter/spell": "workspace:*"`), `apps/web/nuxt.config.ts` (`spell` in the `@drafter/(…)` alias; `aff,dic` in `workbox.globPatterns`), `apps/web/scripts/sync-assets.mjs` (the dictionary and licence files), `apps/web/test/sync-assets.test.ts`, `apps/web/scripts/check-build.mjs` (`aff|dic` in `PRECACHED`; the four dictionary files and the four licence files must be in the build), `apps/web/test/check-build.test.ts`, `apps/web/app/commands/data.ts` (`HELP_PAGES`: `{ id: 'help-licences', path: '/docs/licences', title: 'Third-party licences' }`), `apps/web/e2e/docs.spec.ts`, `pnpm-lock.yaml`

**What was checked (2026-10-29), and the executor checks again at install:**

| Package | Version | Declared licence | Licence file | Unpacked size | Notes |
|---|---|---|---|---|---|
| `nspell` | 2.1.5 (latest) | MIT | `license`, © 2016 Titus Wormer | 42 KB | CommonJS (`lib/index.js`); one dependency, `is-buffer`. |
| `is-buffer` | 2.0.5 | MIT | `LICENSE`, © Feross Aboukhadijeh | 4.6 KB | Brought by nspell. |
| `dictionary-en` | 4.0.0 (latest) | `(MIT AND BSD)` | `license` (15.7 KB): "en_US Hunspell Dictionary", from SCOWL (Kevin Atkinson's permissive notice), the affix file from Ispell (Geoff Kuenning's BSD licence), with the WordNet, UKACD, and VarCon notices; no GPL or LGPL text | 575 KB (`index.dic` 552 KB, gzip 191 KB; `index.aff` 3 KB) | ESM; its `index.js` reads the files with `node:fs`, and `exports` is only `./index.js`. SCOWL size 60, accents stripped. |
| `dictionary-en-gb` | 3.0.0 (latest) | `(MIT AND BSD)` | `license`: the same text, "en_GB-ise Hunspell Dictionary" | 576 KB (`index.dic` 552 KB) | As `dictionary-en`. |
| `@types/nspell` | 2.1.6 (development) | MIT | DefinitelyTyped | 5.5 KB | Brings `@types/node`, already in the root. |

The UKACD notice asks that its copyright notice be "prominently displayed" and its document "included verbatim": the whole `license` file is shipped as it is, and the licences page shows the UKACD copyright line (Call 3).

**Interfaces (Produces):**
```ts
// packages/spell/src/dictionaries.ts
export type SpellLanguage = 'en-US' | 'en-GB';
export interface DictionaryInfo {
  language: SpellLanguage;
  label: string;        // 'US English', 'British English'
  package: string;      // 'dictionary-en', 'dictionary-en-gb'
  version: string;      // '4.0.0', '3.0.0'
  licence: string;      // '(MIT AND BSD)'
  folder: string;       // '/dictionaries/en-US/': holds index.aff and index.dic
  licenceFile: string;  // '/licenses/dictionary-en.txt'
}
export const DICTIONARIES: Readonly<Record<SpellLanguage, DictionaryInfo>>;
export const SPELL_LANGUAGES: readonly SpellLanguage[]; // ['en-US', 'en-GB']
```
- `sync-assets.mjs` gains `packageDir(name, from)`: the folder of the package `name` resolves to from `from` (a `createRequire(from).resolve(name)`, then up to the folder whose `package.json` has that name; `dictionary-en`'s `exports` blocks a subpath, so the files can't be imported or resolved directly), and copies, from `packages/spell`'s view: `dictionary-en/index.{aff,dic}` → `public/dictionaries/en-US/`, `dictionary-en-gb/index.{aff,dic}` → `public/dictionaries/en-GB/`, and the licence files → `public/licenses/{nspell,is-buffer,dictionary-en,dictionary-en-gb}.txt` (`is-buffer` resolved from nspell's folder). The copies are Git-ignored, as the fonts are.
- **Call (Call 4):** the dictionaries are precached with the rest of the app (§12): about 1.1 MB uncompressed, about 0.4 MB over the wire, each file well under Workbox's 2 MiB limit. The licence `.txt` files are not precached (as `OFL.txt` isn't); the licences page itself is, and says each one's terms in a line.
- **Call (Call 3):** a **Third-party licences** help page (`/docs/licences/`, prerendered, in `HELP_PAGES` so the palette has it), listing nspell, is-buffer, and each dictionary with its version, its declared licence, its copyright lines (SCOWL's, Ispell's, UKACD's), and a link to its full licence file; and Courier Prime and Inter Tight under the OFL. Settings links to it (Task 6).

- [ ] **Step 1: Check the packages.** In a scratch folder, `npm view <pkg> license version dist.unpackedSize` for each and `npm pack` the exact versions; read each licence file; confirm no GPL or LGPL text in the dictionaries (`grep -il 'general public'` finds nothing). If either dictionary's licence has changed to a copyleft one, STOP: no permissive alternative is approved by this plan.
- [ ] **Step 2: Write the rows** in `docs/DEPENDENCIES.md`: `@drafter/spell` under Runtime (depends on `@drafter/fountain`, `nspell`, `dictionary-en`, `dictionary-en-gb`, with the table's facts, why each is needed, that nspell is a general-purpose Hunspell-compatible spellchecker and not a screenwriting tool, and that the dictionaries are data served as files); `@drafter/spell` under The app; `@types/nspell` under Development.
- [ ] **Step 3: Write the failing tests.** `licences.test.ts`: `the installed versions are the recorded ones` (each package's `package.json` `version` equals `DICTIONARIES`' and the pinned `nspell`), `every dependency declares a permissive licence` (MIT or `(MIT AND BSD)`), `no dictionary licence file mentions the GPL or LGPL`. `sync-assets.test.ts`: `copies both dictionaries and the four licence files`. `check-build.test.ts`: `reports a dictionary missing from the precache`, `reports a missing licence file`. `docs.spec.ts`: `the licences page lists every dependency and links its licence file`.
- [ ] **Step 4: Run them.** `pnpm --filter @drafter/spell test` and `pnpm --filter @drafter/web test` → FAIL (no package).
- [ ] **Step 5: Install and implement.** `packages/spell/package.json` with the pinned dependencies; `pnpm install`; `dictionaries.ts`; the asset copies, the build check, the page.
- [ ] **Step 6: Run them again,** plus `pnpm -r typecheck` and the web build (the check passes, and `.output/public/dictionaries/en-US/index.dic` exists). → PASS.
- [ ] **Step 7: Commit.** `build(spell): nspell and the English dictionaries, with their licences`

---

### Task 2: What to check, and what never to flag (`@drafter/spell`)

**Files:**
- Create: `packages/spell/src/{tokens.ts,units.ts,known.ts}`, `packages/spell/test/{tokens.test.ts,units.test.ts,markdown-units.test.ts,known.test.ts,units.properties.test.ts}`, `packages/spell/test/fixtures/{names.fountain,locations.fountain,skips.fountain,stage.fountain,notes.fountain,doc.md}` (Drafter's own text)
- Modify: `packages/spell/src/index.ts`, `packages/spell/README.md`

**Interfaces (Produces):**
```ts
// tokens.ts
export interface Token { from: number; to: number; word: string } // `word`: the source text with ’ read as '
/** The words of `text` to check, offset by `offset`. Leaves out: a word with a digit; a whole web or e-mail address
 *  (a whitespace-delimited chunk with `://`, `www.`, a letter@letter, or a dotted domain ending in 2–6 letters);
 *  an all-capital word of 3 letters or fewer; a word with no Latin letter. A hyphenated word is its parts. */
export function tokenize(text: string, offset?: number): Token[];
/** The lowercased forms a known-words set is asked about: the word, then without a final 's (or ’s). */
export function lookupForms(word: string): string[];
// units.ts
export interface Unit { key: string; from: number; text: string } // text: the source from `from`, same length, skipped parts as spaces
export interface UnitOptions { notes: boolean }                   // check notes and boneyard
/** One unit per checked block: action, dialogue, parenthetical, centered, lyric, section, synopsis; a scene heading's time only.
 *  Never: cues, transitions, page breaks, the title page, scene numbers, forcing marks, the metadata block.
 *  Notes and boneyards are blanked unless `notes`; with `notes`, each is its own unit and a keyed note's head is blanked.
 *  `key` is the block kind and its text, so equal blocks share a cache entry. */
export function fountainUnits(doc: Doc, options: UnitOptions): Unit[];
/** One unit per paragraph, blanking fenced and indented code, inline code, front matter, HTML tags, autolinks, and link destinations. */
export function markdownUnits(source: string): Unit[];
// known.ts
/** Lowercased: every word of every cue's name and of every scene heading's location. */
export function harvestedWords(doc: Doc): Set<string>;
/** `meta.dictionary`'s strings; anything else there is ignored. */
export function scriptDictionary(doc: Doc): string[];
/** Adds `word` to `meta.dictionary` (kept sorted case-insensitively, without duplicates) through setMeta; [] when it's there already
 *  or a `/*` is stray. The block's other entries are kept. */
export function addToScriptDictionary(doc: Doc, word: string): TextChange[];
export function knownSet(...lists: Iterable<string>[]): Set<string>;              // lowercased union
export function isKnown(word: string, known: ReadonlySet<string>): boolean;      // any of lookupForms(word)
```

- **Call (Call 6):** the scene heading's prefix and location are never checked (the location's words are harvested and known everywhere); its time (`NIGHT`, `MOMENTS LATER`) is. Hyphenated words are checked part by part. Names and dictionary words match whatever their case, and a possessive is stripped first, so `MARGARET` as a cue knows `Margaret’s` in action.
- **Call (Call 7):** the title page is never checked: it is names, addresses, and contact details. Transitions aren't either (§12).
- **Call (Call 16):** Markdown is read by a small scanner here, not a Markdown parse (`@drafter/spell` takes no Markdown dependency); it knows the CommonMark shapes that hold code or addresses.

- [ ] **Step 1: Write the failing tests.** `tokens.test.ts`: `finds words and their offsets`, `skips words with digits`, `skips web and e-mail addresses`, `skips all-capital words of three letters or fewer` (`INT`, `EXT`, `TV`; but `HOUSE` is a token), `splits hyphenated words`, `normalizes apostrophes and possessives` (`don’t` → `don't`; `lookupForms("Margaret's")` gives `margaret's`, `margaret`), `skips words in other scripts`, `emphasis marks split nothing` (`*did*` is `did`). `units.test.ts` over the fixtures: `names are never units` (`names.fountain`: cues, extensions, and dual cues), `a scene heading gives only its time` (`locations.fountain`), `transitions, page breaks, the title page, scene numbers, and the metadata block are never units` (`skips.fountain`), `notes and boneyard are blanked by default`, `with notes on, a keyed note's head is blanked` (`notes.fountain`: `[[Color: blue]]` checks nothing, `[[TODO: recieve]]` checks `recieve`), `works for a stage play` (`stage.fountain`), `equal blocks share a key`. `markdown-units.test.ts`: `blanks fenced, indented, and inline code`, `blanks front matter, HTML tags, autolinks, and link destinations`, `keeps link text`. `known.test.ts`: `harvests every word of names and locations`, `a harvested word is known in any case and as a possessive`, `adds a word to the script's dictionary, sorted and once`, `keeps the block's other entries`, `refuses with a stray /*`, `reads a damaged dictionary entry as empty` (`"dictionary": "Keokuk"` and `[1, "Keokuk"]`). `units.properties.test.ts` (fast-check, scripts from `fixtures/generators`): `every unit's text has its source's length and offsets`, `a unit never covers a cue, a transition, or the metadata block`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/spell test` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat(spell): what to check, and the words never flagged`

---

### Task 3: The checker and the incremental session (`@drafter/spell`)

**Files:**
- Create: `packages/spell/src/{checker.ts,session.ts}`, `packages/spell/test/{checker.test.ts,session.test.ts,session.properties.test.ts,never-flagged.test.ts,budget.test.ts}`
- Modify: `packages/spell/src/index.ts`, `packages/spell/README.md`

**Interfaces (Consumes):** Task 2's `tokenize`, `fountainUnits`, `markdownUnits`, `harvestedWords`, `scriptDictionary`, `knownSet`, `isKnown`. **(Produces):**
```ts
// checker.ts
export interface Checker {
  correct(word: string): boolean;                  // also true when the word's accent-stripped form (NFD, marks removed) is correct
  suggest(word: string, limit?: number): string[]; // at most `limit` (SUGGESTION_LIMIT), nspell's order
}
export const SUGGESTION_LIMIT = 5;
export function createChecker(dictionary: { aff: Uint8Array | string; dic: Uint8Array | string }): Checker;
// session.ts
export interface Misspelling { from: number; to: number; word: string }
export interface CheckInput { source: string; kind: 'fountain' | 'markdown'; notes: boolean; mine: readonly string[] }
export interface SpellSession {
  /** Every misspelling in `input.source`, in order. Reuses each unit's tokens by key and each word's verdict. */
  check(input: CheckInput): Misspelling[];
  suggest(word: string): string[];
  /** For tests: units tokenized and words sent to the checker since the last call. */
  work(): { units: number; words: number };
}
export function createSpellSession(checker: Checker): SpellSession;
```

- The session parses the source itself (`parse` from `@drafter/fountain`) for a Fountain script, so the worker needs only the text. The known set is `harvestedWords ∪ scriptDictionary ∪ mine`, rebuilt each check (cheap); it filters the cached verdicts, never the cache, so adding a word never re-checks.
- The caches are bounded (Call 5): tokens for at most 20,000 unit keys and verdicts for at most 200,000 words, oldest first out.

- [ ] **Step 1: Write the failing tests.** `checker.test.ts` (the real dictionaries, read in Node with `import en from 'dictionary-en'`): `knows common words in both dictionaries`, `British English knows colour and US English doesn't`, `accepts accented words the dictionary has without accents` (`café`, `naïve`), `suggests at most five, the likely one first` (`recieve` → `receive` first). `never-flagged.test.ts` (a session over each Task 2 fixture, which also holds one planted misspelling each): `names are never flagged`, `locations are never flagged`, `the script's dictionary words are never flagged`, `My dictionary's words are never flagged`, `short capitals, digits, and addresses are never flagged`, `transitions and the title page are never flagged`, `the planted misspelling is flagged`. `session.test.ts`: `a second check of the same text checks nothing new`, `an edit to one block tokenizes one unit`, `a word added to mine is unflagged without checking again`, `checks a Markdown document, skipping code`, `checks notes only when asked`. `session.properties.test.ts` (fast-check: a generated script and a random list of edits): `an incremental check equals a fresh session's`. `budget.test.ts`: `a 120-page script's first check takes under 3 seconds`, `a check after a one-letter edit takes under 50 ms` (both in the worker in the app, so these are ceilings, not the typing path).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(spell): nspell, and a session that checks only what changed`

---

### Task 4: The worker, the marks, and the settings

**Files:**
- Create: `packages/cm-fountain/src/spell.ts`, `packages/cm-fountain/test/spell.test.ts`, `apps/web/app/workers/{spell-compute.ts,spell.worker.ts}`, `apps/web/app/spell/{spell-client.ts,use-spell.ts}`, `apps/web/test/{spell-compute.test.ts,spell-client.test.ts,use-spell.test.ts}`, `apps/web/e2e/spell.spec.ts`
- Modify: `packages/cm-fountain/src/index.ts`, `apps/web/app/editor/extensions.ts` (the `spellcheck` compartment holds `spellMarks()` when on, nothing when off; `spellcheck="false"` always), `apps/web/app/editor/apply-settings.ts`, `apps/web/app/settings/settings.ts` (`spellLanguage`, `spellNotes`, `personalDictionary`, and `isValid` for each), `apps/web/app/settings/apply.ts` (watch the new keys), `apps/web/app/assets/css/main.css` (`--spelling` in both themes; `.cm-misspelled`), `apps/web/test/{settings.test.ts,apply-settings.test.ts,tokens.test.ts}`, `apps/web/app/components/AppStatusBar.vue` (the load-failure line), `apps/web/app/pages/index.vue` (starts `useSpell` after the editor is ready)

**Interfaces (Consumes):** `createSpellSession`, `createChecker`, `DICTIONARIES`, `Misspelling` (Tasks 1–3); `useEditor().view`/`onChange`/`kind`/`load`, `useSettings()`. **(Produces):**
```ts
// packages/cm-fountain/src/spell.ts
export interface SpellMark { from: number; to: number; word: string }
export const setSpellMarks: StateEffectType<readonly SpellMark[]>;    // replaces every mark; positions in the new state
export const unmarkWord: StateEffectType<string>;                     // unmarks every mark of this word, whatever its case
export const ignoreHere: StateEffectType<{ from: number; to: number }>; // for the visit; dropped when an edit touches it
/** The field and its decorations: class `cm-misspelled`, `aria-invalid="spelling"`. A mark an edit touches is dropped; the rest map. */
export function spellMarks(): Extension;
export function spellMarksOf(state: EditorState): readonly SpellMark[];           // in order, ignored ones left out
export function spellMarkAt(state: EditorState, pos: number): SpellMark | null;  // the mark holding or touching pos
export function stepSpellMark(state: EditorState, pos: number, direction: 1 | -1): SpellMark | null; // wraps
/** `marks` mapped through `changes`, dropping each one a change touches. */
export function mapSpellMarks(marks: readonly SpellMark[], changes: ChangeDesc): SpellMark[];
// apps/web/app/workers/spell-compute.ts
export type SpellRequest =
  | { type: 'language'; language: SpellLanguage }
  | { type: 'check'; seq: number; source: string; kind: DocumentKind; notes: boolean; mine: string[] }
  | { type: 'suggest'; seq: number; word: string };
export type SpellReply =
  | { type: 'ready'; language: SpellLanguage }
  | { type: 'failed'; message: string }
  | { type: 'checked'; seq: number; marks: Misspelling[] }
  | { type: 'suggestions'; seq: number; word: string; suggestions: string[] };
/** Fetches `${folder}index.aff` and `index.dic` from the app's own origin. */
export function fetchDictionary(language: SpellLanguage, fetcher?: (url: string) => Promise<Response>): Promise<{ aff: Uint8Array; dic: Uint8Array }>;
/** One session per language; a check or a suggestion before `ready` waits for it; a failed load is one 'failed' reply, tried again on the next request. */
export function createSpellWorker(load?: typeof fetchDictionary): { handle(request: SpellRequest): Promise<SpellReply | null> };
// apps/web/app/spell/spell-client.ts
export const SPELL_DEBOUNCE_MS = 300;
export type SpellState = 'off' | 'loading' | 'ready' | 'failed';
export interface SpellClient {
  language(language: SpellLanguage): void;
  /** Sends the text SPELL_DEBOUNCE_MS after the last call; returns the request's number. */
  check(input: Omit<Extract<SpellRequest, { type: 'check' }>, 'type' | 'seq'>): number;
  suggest(word: string): Promise<string[]>;
  destroy(): void;
}
export function createSpellClient(
  worker: Pick<Worker, 'postMessage' | 'addEventListener' | 'terminate'>,
  onMarks: (marks: Misspelling[], seq: number) => void,  // only the newest request's reply
  onState: (state: SpellState) => void,
): SpellClient;
// apps/web/app/spell/use-spell.ts
export interface SpellSessionApp {
  state: Readonly<Ref<SpellState>>;
  suggest(word: string): Promise<string[]>;
  /** The status bar's line after a failed load, once per visit. */
  problem: Readonly<Ref<string>>;
}
export function useSpell(): SpellSessionApp;
// settings.ts additions
spellLanguage: SpellLanguage;   // 'en-US'
spellNotes: boolean;            // false
personalDictionary: string[];   // []; valid when every entry is a non-empty string without whitespace
```

- `useSpell` makes the worker lazily (`new Worker(new URL('../workers/spell.worker.ts', import.meta.url), { type: 'module' })`) once the settings are read, the spellcheck setting is on, and the editor has its first script; ends it when the setting goes off. It composes every editor change since the newest request into one `ChangeDesc` and dispatches `setSpellMarks(mapSpellMarks(reply, since))`. A new script (`load`), a change of kind, or a change of language clears the marks and sends a fresh check; a reply from before is ignored by `seq`.
- **Call (Call 5):** checking happens in the worker on the whole text, sent after a 300 ms pause, which the session turns into "changed blocks only" with its caches. The main thread does no tokenizing.
- **Call (Call 8):** the language is a setting, US English by default; changing it loads the other dictionary and checks again.
- **Call (Call 17):** the mark color `--spelling` meets 3:1 against `--bg` in both themes (`tokens.test.ts` asserts it, as for the other tokens); the underline is dotted, 2 px, under the word.
- **Call (Call 18):** the Source pane's `spellcheck` attribute is `false` in both states of the setting; the setting's description in Settings changes to "Underline misspelled words in the Source pane, with Drafter’s own dictionary, which works offline."
- **Call (Call 20):** a failed load says it once per visit in the status bar, marks nothing, and leaves the setting on.

- [ ] **Step 1: Write the failing tests.** `spell.test.ts` (cm-fountain, jsdom): `draws a mark with aria-invalid="spelling"`, `maps marks through an edit elsewhere`, `drops a mark the writer is retyping`, `unmarkWord unmarks every case at once`, `ignoreHere hides one occurrence until it is edited`, `stepSpellMark wraps both ways`, `maps 5,000 marks through a keystroke in under 5 ms`. `spell-compute.test.ts` (dictionary from `dictionary-en` in Node, via the `load` parameter): `checks after the dictionary is ready`, `a check sent before ready waits for it`, `a failed dictionary load is one reply, and the next request tries again`, `suggests at most five`, `rechecks everything after the language changes`. `spell-client.test.ts` (a fake worker, fake timers): `sends once after 300 ms of quiet`, `ignores a reply older than the newest request`, `reports loading, ready, and failed`, `a dead worker is failed, not thrown`. `use-spell.test.ts` (editor mocked as in `count-budget.test.ts`): `maps a late reply through the edits since`, `clears the marks on a new script and ignores the old script's reply`, `makes no worker while spellcheck is off`, `a keystroke does no spell work until the pause` (the client's `check` spied: not called inside the transaction). `settings.test.ts`: `keeps the language, the notes setting, and My dictionary`, `ignores a damaged personal dictionary`. `apply-settings.test.ts`: `the Source pane's browser spellcheck is off with the setting on and off`. `spell.spec.ts`: `marks a misspelling with a dotted underline and leaves names, locations, and transitions alone`, `checks British English after the language changes`, `checks notes only with the setting on`, `marks a Markdown document's text and not its code`, `marks nothing with spellcheck off`, `says once that the dictionary couldn't load, and types on` (`page.route` failing `/dictionaries/**`), and, Chromium only, shaped like `script.spec.ts`'s long-task test: `types into a 120-page script with misspellings on screen without a long task` and `types while the dictionary is still loading without a long task` (`page.route` holding the `.dic` for 10 s).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `editor.spec.ts`, `settings.spec.ts`, `script.spec.ts`, and `offline.spec.ts` (the dictionaries work offline after a first visit). → PASS.
- [ ] **Step 5: Commit.** `feat(web): spellcheck in a worker, with marks in the Source pane`

---

### Task 5: The spelling menu, the dictionaries, and the commands

**Files:**
- Create: `apps/web/app/spell/{actions.ts,menu.ts,notice.ts}`, `apps/web/app/components/SpellMenu.vue`, `apps/web/test/{spell-actions.test.ts,spell-menu.test.ts}`
- Modify: `apps/web/app/editor/extensions.ts` (a `contextmenu` handler: on a mark, prevent the browser's menu and open Drafter's; elsewhere, nothing), `apps/web/app/commands/{data.ts,builtin.ts,shortcuts.ts}`, `apps/web/app/pages/index.vue` (the menu), `apps/web/e2e/spell.spec.ts`, `apps/web/e2e/keyboard.spec.ts`

**Interfaces (Consumes):** `spellMarkAt`, `stepSpellMark`, `unmarkWord`, `ignoreHere` (Task 4); `addToScriptDictionary` (Task 2); `useSpell().suggest`; `applyTextChanges`; `useSettings().set`; `sayOutline`. **(Produces):**
```ts
// spell/actions.ts: each false, changing nothing, when it can't (and `whyNot` says why)
export function replaceWord(view: EditorView, mark: SpellMark, suggestion: string): boolean; // one undo; the word's mark goes
export function addToScript(view: EditorView, word: string): boolean;   // addToScriptDictionary + unmarkWord, one transaction
export function addToMine(view: EditorView, word: string): Promise<void>; // the setting, then unmarkWord
export function ignoreWordHere(view: EditorView, mark: SpellMark): void;
/** Why an action is off, or null: 'read-only', 'markdown' (no metadata block), 'stray-boneyard'. */
export function whyNot(view: EditorView, action: 'replace' | 'add-to-script', kind: DocumentKind, readOnly: string | null): string | null;
/** Moves the cursor to the next or previous mark (wrapping), selects it, and says "recieve. Suggestion: receive." or "… No suggestions." */
export function stepMisspelling(view: EditorView, direction: 1 | -1): Promise<boolean>;
// spell/menu.ts
export interface SpellMenuRequest { mark: SpellMark; at: { left: number; top: number } } // where to open: the word's coordinates, or the phone button's
export const spellMenu: Ref<SpellMenuRequest | null>;
export function openSpellMenu(view: EditorView, at?: { left: number; top: number }): boolean; // false when no mark is at the cursor
```

- `SpellMenu.vue` is one `MenuButton` whose 1×1 trigger is placed at `at` (`view.coordsAtPos(mark.from)`), opened as the request arrives: the suggestions ("Finding suggestions…" until they come; "No suggestions" if none), a separator, **Add to this script's dictionary**, **Add to my dictionary**, **Ignore here**. Closing it returns focus to the editor with the cursor where it was; a suggestion leaves the cursor after the replaced word.
- Commands (group **Edit**, except the two moves in **Go**): `spelling-suggestions` "Spelling suggestions", `next-misspelling` "Next misspelling", `previous-misspelling` "Previous misspelling", `add-to-script-dictionary` "Add word to this script's dictionary", `add-to-my-dictionary` "Add word to my dictionary", `ignore-misspelling` "Ignore misspelling here". The last three act on the mark at the cursor, and say "No misspelled word at the cursor." otherwise. All are enabled only while spellcheck is on, with the reason "Spellcheck is off in Settings."
- **Call (Call 11):** **Mod-.** opens Spelling suggestions; **Mod-;** and **Mod-Shift-;** are Next and Previous misspelling. F7, the usual key, turns on caret browsing in Firefox; these clash with nothing in the registry, the browsers, or the systems.
- **Call (Call 10):** Ignore here ignores this one occurrence for the visit, and is not saved: the file keeps no record, and a word to be left alone for good goes in a dictionary.
- **Call (Call 12):** a right-click on a marked word opens Drafter's menu, not the browser's; a right-click anywhere else is untouched, so Cut, Copy, and Paste (and the desktop app's own menu) stay where they were.

- [ ] **Step 1: Write the failing tests.** `spell-actions.test.ts` (an `EditorView` in jsdom with `spellMarks()`, as `apply-changes.test.ts` does): `replaces a word in one undo`, `adds a word to the script's dictionary in one undo, unflagged at once` (the metadata block holds it; the marks of every case of the word are gone in the same transaction; one undo restores both), `says why the script's dictionary can't be written` (stray `/*`; Markdown; read-only), `adds to my dictionary and unflags the word`, `ignores one occurrence, and the next is still marked`, `steps to the next and previous misspelling, wrapping, and says the word and its first suggestion`. `spell-menu.test.ts`: `opens only on a marked word`, `lists at most five suggestions, then the three actions`, `disables a suggestion and the script's dictionary in a read-only tab, with the reason`. `spell.spec.ts`: `right-click on a misspelling opens the menu, and a suggestion replaces it`, `right-click elsewhere leaves the browser's menu`, `Mod-. opens the menu at the cursor, and Escape gives the editor focus back`, `Add to this script's dictionary unflags every occurrence at once and Undo brings them back`, `Add to my dictionary unflags the word in another script too`, `Ignore here unflags one occurrence`, `Next and Previous misspelling move the cursor and say the word`. `keyboard.spec.ts`: `the shortcuts page lists the spelling keys`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `palette.spec.ts` and `editor.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): the spelling menu, the dictionaries, and the spelling commands`

---

### Task 6: Problems' Spelling group, Check spelling, the phone's button, and Settings

**Files:**
- Create: `apps/web/app/spell/rows.ts`, `apps/web/test/spell-rows.test.ts`
- Modify: `apps/web/app/editor/problems.ts` (`spellingRows`, not in `problems` or `count`), `apps/web/app/components/ProblemsPane.vue` (a **Spelling** heading and list after the problems), `apps/web/app/commands/{data.ts,builtin.ts}` (`check-spelling` "Check spelling"), `apps/web/app/editor/element-bar.ts` and `apps/web/app/components/ElementBar.vue` (the **Spelling** button), `apps/web/app/components/SettingsDialog.vue` (the language, **Check notes and boneyard**, **My dictionary** with Remove, and a link to Third-party licences), `apps/web/test/element-bar.test.ts`, `apps/web/e2e/{problems.spec.ts,phone.spec.ts,settings.spec.ts,spell.spec.ts}`

**Interfaces (Consumes):** `spellMarksOf`, `openSpellMenu`, `useSpell().state` (Tasks 4–5); `useWideScreen`; the Problems pane's `goto`. **(Produces):**
```ts
// spell/rows.ts
export interface SpellingRow { key: string; word: string; from: number; to: number; line: number } // key: `${word}:${n}`, as occurrenceKeys does
export function spellingRows(state: EditorState): SpellingRow[];
export function spellingHeading(count: number): string; // "Spelling: 3 words", "Spelling: 1 word", "Spelling: none found"
// editor/problems.ts: useProblems() adds
spelling: Readonly<ComputedRef<readonly SpellingRow[]>>; // empty while spellcheck is off; never counted
// element-bar.ts
export const SPELLING_BUTTON: BarButton; // { label: 'Spelling', mark: '', command: 'spelling-suggestions', tip: 'Suggestions for the misspelled word at the cursor, and adding it to a dictionary.' }
```

- **Call (Call 13):** the Spelling group follows the marks whenever spellcheck is on; **Check spelling** waits for the current check to settle, then shows Problems (in the pane `choose` gives it) with focus on the Spelling heading, and says "3 misspelled words." With spellcheck off it says "Spellcheck is off. Turn it on in Settings." and changes no setting.
- **Call (Call 14):** one row per occurrence: the word and its line, a button that goes to the word and selects it, so Mod-. opens its menu from there. No fix buttons in the row, which keeps it the shape of the other rows.
- **Call (Call 15):** the **Spelling** button shows on the element bar only on a narrow screen (`!useWideScreen()`) while the cursor is on a mark, after the element buttons; it opens the menu at the button. A press keeps the editor's focus, as the bar's other buttons do.
- **Call (Call 9):** Settings' **My dictionary** lists its words with a Remove button each (a word removed is checked again at once); the count shows when the list is long. Words are kept as typed.

- [ ] **Step 1: Write the failing tests.** `spell-rows.test.ts`: `one row per mark, in order, with its line`, `keys survive an edit above`, `names the heading by count`. `element-bar.test.ts`: `the Spelling button runs Spelling suggestions`. `problems.spec.ts`: `lists misspellings under Spelling, outside the problem count`, `Check spelling shows Problems with the Spelling heading focused`, `a Spelling row goes to its word and selects it`, `Check spelling with spellcheck off says so`. `phone.spec.ts`: `the element bar shows Spelling on a misspelled word, and it opens the menu`, `no Spelling button on a correct word or on a wide screen`. `settings.spec.ts`: `chooses British English`, `removes a word from My dictionary and it is marked again`, `links to the licences page`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `element-bar.spec.ts` and the existing `a11y.spec.ts` (green, with nothing added). → PASS.
- [ ] **Step 5: Commit.** `feat(web): Check spelling, the Spelling group, and the phone's Spelling button`

---

### Task 7: The desktop app, the docs, and release prep

**Files:**
- Modify: `apps/web/app/commands/desktop-menu.ts`, `apps/web/test/desktop-menu.test.ts`, `apps/desktop/e2e/` (a spelling test in the existing spec that drives the editor), `packages/spell/README.md`, `README.md` (the status line: Spellcheck built in v0.14.0, Next: Plan E; the Phase 2 roadmap row; the Packages table's `@drafter/spell` row "(built in Plan D)"; the features list; the comparison table's Spellcheck row), `docs/drafter-technical-design.md` §10 (one sentence each for Calls 2, 5, 9, and 18), `docs/drafter-architecture.md` §9 (the two bundled dictionaries; packs in Phase 4), `docs/drafter-phase2-design.md` §22 Plan D (**Status:** built, with the axe item waiting for the final steps), `docs/DECISIONS.md`, `docs/DEFERRED.md`, `CHANGELOG.md`

- [ ] **Step 1: Write the failing tests.** `desktop-menu.test.ts`: `puts Check spelling, Spelling suggestions, Next misspelling, and Previous misspelling in Edit`. Desktop e2e: `a misspelling is marked with no download, and right-click opens Drafter's spelling menu` (the network log shows no request outside the app's files).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement,** and write the docs: every Call below in DECISIONS (Plan D section); in DEFERRED, under a new `## Plan D: Spellcheck`: axe with misspellings on screen and the menu open (the final accessibility steps), screen-reader testing of the marks and the menu (NVDA and VoiceOver), downloadable dictionary packs with their licences shown (Phase 4: `DictionaryInfo` is the shape a pack will take), more languages, a list of the script's dictionary to edit in place (it's in the metadata block, and Undo covers an addition), and licence files for the app's other bundled libraries on the licences page.
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with the existing axe tests green.
- [ ] **Step 5: Commit.** `docs: Spellcheck (Plan D)`
- [ ] **Step 6: Push** `phase2-d` and watch CI. Don't merge or tag: the controller releases v0.14.0.

---

## Calls in this plan

For the maintainer to review; each gets a DECISIONS line when it lands. **Departs from the spec** (flagged ◆): 2 departs from technical design §10 (not from Phase 2 §12, which it follows), and 13 departs from §21's table; the rest choose where the spec is open.

1. **The dependencies:** `nspell` 2.1.5 (MIT; brings `is-buffer` 2.0.5, MIT), `dictionary-en` 4.0.0 and `dictionary-en-gb` 3.0.0 (`(MIT AND BSD)`: SCOWL, Ispell's BSD affix data, and the WordNet, UKACD, and VarCon notices; no copyleft), `@types/nspell` 2.1.6 (MIT, development); pinned exactly, and a guard test fails on a changed version or licence (Task 1).
2. ◆ **Two bundled dictionaries, US and British English, and no download mechanism** (§12: other languages wait for Phase 4's packs). Technical design §10's downloadable packs are not built; `DictionaryInfo` is the shape a pack will take, and DEFERRED says so (Tasks 1, 7).
3. **A Third-party licences help page,** with each licence file served verbatim at `/licenses/` (the UKACD notice requires the text verbatim and its copyright line shown), linked from Settings (Tasks 1, 6).
4. **The dictionaries are static files copied by `sync-assets.mjs` and precached:** about 1.1 MB uncompressed, about 0.4 MB over the wire; the packages' `exports` forbid importing the files, so they can't be Vite assets. The licence `.txt` files aren't precached (Task 1).
5. **The worker gets the whole text after a 300 ms pause** and its session caches tokens per block and verdicts per word, which is "changed blocks only"; the main thread only posts and maps. Caches are bounded (Tasks 3, 4).
6. **Scene headings:** prefix and location never checked, the time checked; hyphenated words part by part; names and dictionary words match in any case and as possessives (Task 2).
7. **Never checked:** the title page, transitions, cues, scene numbers, the metadata block, and keyed notes' heads; notes and boneyard only with **Check notes and boneyard** (off by default) (Task 2).
8. **The language is a setting, US English by default,** chosen in Settings (Task 4).
9. **My dictionary is `personalDictionary` in the settings table** (technical design §10), managed in Settings with Remove; it applies to every script in this browser and never goes in a file (Tasks 4, 6).
10. **Ignore here is one occurrence, for the visit, and not saved** (Task 5).
11. **Keys:** Mod-. for Spelling suggestions, Mod-; and Mod-Shift-; for Next and Previous misspelling (F7 turns on caret browsing in Firefox) (Task 5).
12. **Right-click opens Drafter's menu only on a marked word;** elsewhere the browser's (or the desktop app's) menu is untouched (Task 5).
13. ◆ **The Spelling group is the app's, from the marks, not a `@drafter/lint` rule:** §21's table puts "the Spelling group" in `@drafter/lint`, but §12 says spelling marks are not lint diagnostics, and the lint package would need the worker's results. `@drafter/lint` is unchanged. Check spelling shows Problems on the group; with spellcheck off it says so (Task 6).
14. **One Spelling row per occurrence,** word and line, going to and selecting the word; no fix buttons in the row (Task 6).
15. **The phone's Spelling button** shows on a narrow screen only while the cursor is on a mark (Task 6).
16. **Markdown documents are checked with a small scanner** that skips code, front matter, HTML, and addresses; Add to this script's dictionary is disabled there with the reason (no metadata block) (Tasks 2, 5).
17. **The mark is a dotted 2 px underline in `--spelling`,** 3:1 against both themes' background, with `aria-invalid="spelling"` (Task 4).
18. **The Source pane's browser spellcheck is off whether Drafter's is on or off;** other text fields keep the browser's, and the desktop's bundled Chromium dictionary stays for them (Task 4).
19. **Read-only:** marks, Ignore here, and Add to my dictionary work; a suggestion and Add to this script's dictionary are disabled with the reason (Task 5).
20. **A dictionary that can't load** is said once per visit, marks nothing, and leaves the setting on; the next script load tries again (Task 4).
21. **Accents and other scripts:** an accented word is also tried without its accents (the dictionaries are built with them stripped); a word with no Latin letter isn't checked (Tasks 2, 3).
22. **The Done-when item "axe passes with misspellings on screen and the menu open"** waits for the final accessibility steps (maintainer, 2026-10-28) and is in DEFERRED (Task 7).
