# Imports and Markdown out (v0.19.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v0.19.0, the imports release. It does five things:

- **Highland files** (`.highland`, a zip package holding the script as Fountain) open as a new, unsaved Fountain script, and the source file is never changed.
- **Fade In files** (`.fadein`, a zip package holding an Open Screenplay Format XML document) open the same way.
- **Markdown** (`.md`, `.markdown`) already opens as a Markdown document. It becomes a listed import, and a new **Open as screenplay…** command opens one as a Fountain script instead.
- **Export as Markdown** writes a whole screenplay or stage play as readable Markdown, and honours the script's export options.
- **Open refuses files that aren't scripts** (RTF, Word, PDF, OpenDocument, Pages, and other zips) with a clear message, where today it opens garbage or gives a vague one.

**Architecture:**

- **`@drafter/archive`** is a new engine package. It holds a strict, read-only zip reader of Drafter's own (`listZip` and `readEntry`, inflating with the platform's `DecompressionStream('deflate-raw')` and checking each entry's CRC-32), and the two containers: `fromHighland` and `fromFadeIn`.
- **Open Screenplay Format lives in `@drafter/fdx`** (Call 1). `fromOsf` translates the OSF tree into the Final Draft tree that the existing importer (`Importer` in `import.ts`) already reads, so OSF reuses every Plan FD rule and guarantee.
- **Export as Markdown is a pure function** in `@drafter/outline`, beside `treatment` (Call 25): `scriptMarkdown(doc, index, template, options)`. It shares a stronger `markdownText` escaper with the treatment, and takes its scene numbers from a `sceneNumbersFor` helper that `@drafter/layout` extracts from `paginate`, so the PDF and the Markdown file always number scenes alike.
- **In `apps/web`:**
  - `openFile` gains a refusal table for known non-script formats (`storage/formats.ts`).
  - An archive branch sends a `.highland` or `.fadein` past the text checks to `importScript`, which is `importFinalDraft` generalised.
  - An `as: 'fountain'` mode backs **Open as screenplay…**.
  - The export worker renders a script's Markdown, using the progress protocol it already has.
  - Export options gain **Notes in Markdown**.
- **In `apps/desktop`:** both new extensions join `IMPORT_EXTENSIONS` (never `WRITE_EXTENSIONS`) and the Open with registrations, where they are offered but never the default. The File menu also lists **Open as Screenplay…**.

**Tech Stack:** TypeScript, `DecompressionStream` (a platform API, not a dependency), Vue 3.5 / Nuxt 4 / Nuxt UI 4, Electron 45, Vitest 5 with fast-check, and Playwright 1.64. There are no new third-party runtime dependencies. `@drafter/outline` gains `mdast-util-from-markdown` as a **development** dependency only, at the version `apps/web` pins, as `@drafter/render-pdf`'s tests already do.

**Spec:**

- The maintainer's approval of 2026-10-29 for the imports: its scope, clean room, and zip safety are binding.
- The maintainer's two requests of 2026-10-29: **Open as screenplay** ("yes please add that choice") and **Export as Markdown** for scripts ("yes please add the full markdown"). Their wording was appended to the first version of this plan and is folded into Tasks 6 to 8 below.
- [`docs/drafter-technical-design.md`](../drafter-technical-design.md) §6.3 (`fdx`) and §14 (imported content is untrusted).
- Plan FD's decisions in `docs/DECISIONS.md` (`## Phase 2, Plan FD: Final Draft files`). The OSF import follows them rule for rule.
- The out-the-door design's export options (`docs/drafter-out-the-door-design.md` §2, `DECISIONS.md` § Getting a script out the door).
- The controller's v0.18.0 ruling that axe runs by default for every new or changed view.
- The format sources: the public descriptions of the `.highland` and `.fadein` packages, the published **Open Screenplay Format specification**, and the PKWARE **APPNOTE.TXT** zip specification, all public documents (Calls 12 and 13).

**Refreshed 2026-10-30** against `main` at v0.18.0's merge (`587f844`, merged into `imports-plan` as `59493a7`). The first version (2026-10-29) predated v0.16.0 to v0.18.0. Corrections:

- The version is **v0.19.0**, not `v0.N.0`.
- `FdxImport` already caps `ignored` at `MAX_IGNORED` = 50 and has an `ignoredCount`, so the old Call 9 is done and is restated.
- `packages/fdx/test/scaling.ts` exists, and `packages/history/test/scaling.ts` has the `scalingAsync` this plan needs.
- README and architecture §13 already put Highland and Fade In in v0.19.0 and leave Celtx alone in Phase 3. Only the Phase 1 design's line still says otherwise.
- The tech test forbids the words "Highland" and "Fade In" on the Technical details page (Call 22).
- Axe runs by default, so the old "no new axe tests" constraint is replaced.
- The drop zone's copy omits `.markdown` today.
- `ignored` is never shown in the app; only `mapped` is counted in the toast.
- `md` is already an `ExportKind`, with an `export-md` command, for Markdown documents only.
- `storage/gzip.ts` already detects `DecompressionStream` (`canDecompress`).
- The maintainer has supplied **no real `.highland` or `.fadein` files**, so both formats are built from public descriptions and synthetic fixtures, and the check against real files is a DEFERRED step (Call 12), as Final Draft's was before its real samples.

## Global Constraints

- **Branch `imports`** (worktree `scratchpad/drafter-imports`), from `main` once v0.18.0 is released (tag `v0.18.0`), then `pnpm install`.
  - Every version string in this plan is **v0.19.0**.
  - `@drafter/archive`'s `package.json` starts at the version its siblings carry when it is made, and the release bumps it with them.
  - Phase 2's Plans E to H stay **v0.20.0 to v0.23.0**, as `docs/drafter-phase2-design.md` §22 already gives them. Task 10 keeps it so and changes no other plan's number.
- **Clean room (binding):**
  - **Highland** is built from the public descriptions of the `.highland` package.
  - **Fade In** is built from the published OSF specification and the public descriptions of the `.fadein` package.
  - **The zip reader** is built from APPNOTE.TXT.
  - Never from another program's converter, zip, or XML code, and never from another repository's test files or fixtures.
  - Every fixture is synthetic, made in the tests by `makeZip` with original text. A file the maintainer owns may be used later, locally, through `DRAFTER_REAL_FILES`, and is never committed. `.gitignore` gains `*.highland` and `*.fadein` so one can't be added by accident.
  - DECISIONS records the public sources (titles, URLs, and dates read) and, later, what a real file showed: its structure only (entry names, compression methods, element and attribute names), never its text.
  - `docs/clean-room.md`'s table of permitted sources gains a row for these formats (Task 10).
- **No new runtime dependencies** (Call 2).
  - `@drafter/archive` depends on `@drafter/fdx` only. `apps/web` adds it.
  - `docs/DEPENDENCIES.md` gets the `@drafter/archive` Runtime row before the package lands. The `@drafter/fdx` row widens to OSF. The `@drafter/outline` row names its new development dependency and its new runtime edge to `@drafter/layout`'s `sceneNumbersFor` (the edge already exists).
  - **The Technical details data, `apps/web/app/about/tech.ts`,** gets `@drafter/archive` in `PACKAGES`, and in `@drafter/web`'s and its own `uses`, in the same task as the `package.json` edge. `test/tech.test.ts` checks `PACKAGES` against every `package.json` and fails otherwise. `docs/technical-details.md` is regenerated by that test's file snapshot (`pnpm vitest run apps/web/test/tech.test.ts -u`, then the diff reviewed).
  - `DecompressionStream('deflate-raw')` is in Chromium 103+ (Chrome, Edge, Playwright's Chromium, and Electron 45's renderer), Firefox 113+, Safari 16.4+, and Node 22, where it is a global, so the unit tests use the real one. Where it or its `deflate-raw` format is missing, a stored (method 0) entry still reads and a deflated one is refused with `no-inflate` (Call 6). A test stubs it away with `vi.stubGlobal('DecompressionStream', undefined)`.
- **Zip safety (binding):**
  - **Caps:** at most `maxArchiveBytes` = 32 MiB read, and at most `maxEntries` = 1,000 central-directory entries.
  - **One entry:** an entry is read only when its declared size is at most `maxEntryBytes` = 5 MiB (the script limit, `MAX_BYTES`). Inflation stops the moment output passes the declared size or the cap, and the output's size and CRC-32 are checked.
  - **All entries:** the declared sizes summed must be at most `maxTotalBytes` = 256 MiB, or the archive is refused without inflating anything.
  - **Refused outright:**
    - zip64 and split archives (Call 5), and any encrypted entry
    - any entry name that is empty or absolute, or holds `\`, NUL, a control character, a `..` segment, or a drive letter
    - two entries with the same name, and overlapping entry data
    - a local header that disagrees with its central record
    - data or a directory outside the file
  - **What is read and written:** only the central directory and the one entry needed are read. Nothing is ever written, and no entry name is ever used as a path.
- **An import opens as a NEW unsaved script and never changes the source file**, exactly as a `.fdx` does, and **Open as screenplay** does the same for a `.md`:
  - It goes through `openImported(text, name)`: no `fileName`, handle, saved hash, or baseline.
  - It is never matched to an open script or to a same-titled one.
  - It takes an `imported` snapshot through `useSnapshots().afterImport(text, name)`.
  - The Export toast says what came in.
  - In the desktop app, `.highland` and `.fadein` join `IMPORT_EXTENSIONS` (and so `OPEN_EXTENSIONS`) and never `WRITE_EXTENSIONS`, so the main process refuses every write to one, whatever the page asks.
- **Nothing dropped silently** (as Plan FD):
  - An OSF paragraph style or element Drafter has no element for comes in as action with a `[[osf: Name]]` note.
  - A Highland package's other entries, other than app metadata, are named in one `[[highland: …]]` note (Call 19).
  - Both kinds of note are counted in `mapped` and listed by Problems (`osf-note`, `highland-note`, Call 20).
  - Settings and formatting are named once each in `ignored`, capped at the existing `MAX_IGNORED` = 50, with `ignoredCount`.
- **Open refuses what isn't a script.** A file of a known non-script format, by its extension or by its first bytes, is refused with a message naming the format and what to do. Nothing opens, and the open script is unchanged (Call 21).
- **Untrusted input** (technical design §14):
  - The OSF XML goes through `readXml` (strict, 5 MB, depth 64, no DTD or entities).
  - No value can multiply the output. A style reference or a base-style chain costs a lookup, never a copy, and the chain is followed at most 8 deep (Call 8).
  - Every import and the Markdown export are linear in their input, proven by growth tests with each package's `test/scaling.ts`. That is `scaling` (n and 4n, growth under `MAX_GROWTH` = 8, the `HANG_MS` guard), and `scalingAsync` for the archive reader, copied into `packages/archive/test/scaling.ts` from `packages/history/test/scaling.ts` as that one was copied from `render-pdf`'s.
- **Export as Markdown never changes the script.**
  - It runs in the export worker with the existing progress protocol (`progressReporter`, `WEIGHTS.script`: unknown, then 1).
  - It honours the script's export options: **scene numbers** (none, as written, or every scene) and **title page** (full, title and author only, or none), each exactly as the PDF does (Calls 26 and 27).
  - It also honours the new **Notes in Markdown** option (Call 28).
  - The toast names every option that isn't the default, as the PDF's does.
- **Export to Highland, Fade In, or OSF is out of scope** (DEFERRED), as are a bare `.osf` file, Celtx (Phase 3), and `drafter build --md` in the CLI.
- **Accessibility:** the WCAG 2.2 AA approach of the rest.
  - Everything new is reached through what already is: Open, the file input, drop, the palette, the menus, and the Export options dialog.
  - Axe runs by default (controller, v0.18.0): the Export options dialog's axe check covers its new fieldset in both themes, and the help page's check covers the new sections.
  - The existing axe tests, including `open.spec.ts`'s drop-zone check, stay green. The screen-reader listening pass waits for the final steps.
- **Personal project.** No employer names anywhere.
- **Every task:**
  - Tests are written first and watched failing.
  - `pnpm test`, `pnpm check`, and `pnpm -r typecheck` are green.
  - The `apps/web` e2e runs for the specs the task touches, with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`. `pnpm --filter @drafter/desktop e2e` runs for the desktop specs it touches.
  - A CHANGELOG entry goes under `[Unreleased]`, in the writer's words.
  - Choices go in `docs/DECISIONS.md` under a new `## Imports and Markdown out (v0.19.0)` section, each Call a line when it lands.
  - Commits are conventional, with **no AI co-author trailer and no session link**.
  - The README is kept in sync, and Task 10 does its status line, roadmap, packages, and features.

## Review Focus

1. **A Mac-made archive** carries `__MACOSX/._text.fountain` (AppleDouble) and `.DS_Store` entries beside the real script. They must not count as a second script, make the import fail, or appear in the `[[highland: …]]` note. Tests: Task 3's `ignores __MACOSX and dot-files when finding the script` and Task 4's `ignores __MACOSX and dot-files when finding the document`.
2. **An entry that lies about its size** (declares 1 KB, inflates to gigabytes) stops inflating at the declared size and is refused as damaged, quickly and without the memory. Tests: Task 2's `stops inflating past the declared size and refuses the entry` and `refuses a 5 MiB-capped entry whose deflate stream would give 1 GB, in under a second`.
3. **A renamed file is refused with a reason a writer understands, and nothing opens.** The cases:
   - a plain Fountain text or a `.fdx` saved as `.highland` or `.fadein`
   - a `.highland` renamed `.fadein`
   - an RTF or Word file renamed `.txt` or `.fountain`

   Tests: Task 2's `refuses bytes that aren't a zip archive`; Task 5's `refuses a text file named .highland, says why, and opens nothing` and `refuses a Highland archive named .fadein`; Task 1's `refuses an RTF file named .txt by its first bytes`.
4. **Markdown that shows exactly what the writer typed.** Action holding `---`, `# `, `1. `, `+ `, `> `, `&amp;`, `<b>`, a four-space indent, a trailing backslash, `*` and `_` that aren't emphasis, `[[` that isn't a note, and a line that is only `===`. Each must come through Drafter's own CommonMark parser as the same text and the same kind of block, never a heading, list, rule, code block, entity, or HTML. Tests: Task 7's property `every element's text comes through once, in order, as written` and fixture `escapes every character CommonMark would read`.
5. **Export options reach the Markdown file.** "Number every scene" numbers it exactly as the PDF does, written numbers kept, so two scenes can share one. "No title page" leaves out the `#` title and the keys, and the toast says so. Tests: Task 7's `numbers scenes as paginate does, for each option` (a property over generated scripts, against `paginate`'s own numbers) and Task 8's e2e `exports Markdown with every scene numbered and no title page, and the toast says so`.
6. **Open as screenplay never writes the `.md`.** After Open as screenplay, Save asks for a `.fountain`, and the Markdown file's bytes are unchanged, in the browser and the desktop app. Tests: Task 6's `Save asks for a .fountain and the .md is unchanged` (web e2e) and `never writes the .md it opened as a screenplay` (desktop e2e).

---

### Task 1: Open refuses files that aren't scripts (`apps/web`)

The maintainer asked earlier: "What do you do with unrecognized formats?" Today a file with a NUL byte in its first 8 KB is refused with a general message ("it holds more than text"), which covers `.docx`, `.pdf`, `.odt`, and `.pages`. A file that is all text opens as Fountain whatever it is, so an `.rtf` opens as a page of `{\rtf1\ansi…` control words. This task names the format, says what to do, and catches RTF.

**Files:**
- Create: `apps/web/app/storage/formats.ts`, `apps/web/test/formats.test.ts`
- Modify: `apps/web/app/storage/open.ts` (`notAScript` asked first, before `problemWith`), `apps/web/test/open.test.ts`, `apps/web/e2e/open.spec.ts`

**Interfaces (Produces):**
```ts
// storage/formats.ts
export interface Refusal { format: string; advice: string }
/** A known non-script format, by its extension (any case) or, whatever its name, by its first bytes; or null. */
export function notAScript(name: string | undefined, bytes: Uint8Array): Refusal | null;
/** “Drafter can’t open a Word document (Notes.docx). Save it as plain text or Fountain in the app that made it, then open that.” */
export function refusalMessage(name: string, refusal: Refusal): string;
```

- **Call (Call 21):** the table is short and closed:
  - **By extension:** `.rtf` RTF document; `.doc`/`.docx` Word document; `.odt` OpenDocument text; `.pages` Pages document; `.pdf` PDF; `.fdr` older Final Draft file ("Open it in Final Draft and save it as .fdx"); `.celtx` Celtx project; `.zip` zip archive.
  - **By first bytes, whatever the name:** `{\rtf` (RTF), `%PDF-` (PDF), `D0 CF 11 E0` (an older Office or Final Draft file), and `PK\3\4` (a zip: "a Word, OpenDocument, or other packed file") unless the name is `.highland` or `.fadein` (Task 5 adds that exception).
  - **Anything else:** a file Drafter doesn't recognise but that is UTF-8 text opens as Fountain, as now. Fountain reads any text, and a `.txt` from anywhere is the common case.
  - **Where it applies:** to every way in (the picker, the file input, drop, and the desktop's command line and second launch), because all of them go through `openFile`.
  - **Desktop:** `NOT_A_SCRIPT` for command-line arguments outside `OPEN_EXTENSIONS` is unchanged here (Task 5 adds the new extensions to it).

- [ ] **Step 1: Write the failing tests.**
  - `formats.test.ts`:
    - `names each refused extension, in any case`
    - `refuses an RTF file named .txt by its first bytes`
    - `refuses a PDF, an OLE file, and a zip by their first bytes, whatever the name`
    - `lets UTF-8 text with any other name through`
    - `lets a .md, .markdown, .fountain, .txt, and .fdx through`
    - `the message names the format, the file, and what to do`
  - `open.test.ts` (`describe('a file that isn’t a script')`):
    - `refuses a .docx, says it is a Word document, and leaves the open script alone`
    - `refuses an RTF file named Draft.txt`
    - `opens a .csv of text as Fountain, as before`
  - `open.spec.ts`:
    - `dropping a .rtf says it is an RTF document and opens nothing`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `open.spec.ts` (its drop-zone axe check included) and `fdx.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): refuse Word, RTF, PDF, and other files that aren't scripts, and say what they are`

---

### Task 2: The zip reader (`@drafter/archive`)

**Files:**
- Create: `packages/archive/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}` (shaped like `packages/history`), `packages/archive/src/{index.ts,zip.ts,crc32.ts}`, `packages/archive/test/{make-zip.ts,scaling.ts,crc32.test.ts,zip.test.ts,zip.properties.test.ts,scaling.test.ts}`
- Modify:
  - `vitest.shared.ts`: `'archive'` in `packages`
  - `apps/web/nuxt.config.ts`: `archive` in the `@drafter/(…)` source alias
  - `apps/web/package.json`: `"@drafter/archive": "workspace:*"`
  - `apps/web/app/about/tech.ts`:
    - `PACKAGES` gains `{ name: '@drafter/archive', does: 'Files from other screenwriting apps that come packed as a zip: its own strict read-only zip reader, and the script inside each.', uses: [] }`. Its `uses` gain `'@drafter/fdx'` in Task 4.
    - `@drafter/web`'s `uses` gain `'@drafter/archive'`.
  - `docs/technical-details.md` (regenerated)
  - `docs/DEPENDENCIES.md`: the `@drafter/archive` Runtime row. It names `@drafter/fdx` (from Task 4), says `DecompressionStream` is the platform's, and says the tests' `make-zip.ts` uses Node's built-in `zlib`.
  - `.gitignore`: `*.highland`, `*.fadein`

**Interfaces (Produces):**
```ts
// zip.ts
export interface ZipLimits { maxArchiveBytes: number; maxEntries: number; maxEntryBytes: number; maxTotalBytes: number }
export const ZIP_LIMITS: Readonly<ZipLimits>; // 32 MiB, 1_000, 5 MiB, 256 MiB
export interface ZipEntry {
  name: string;           // as stored: UTF-8 when flag bit 11 is set, else each byte as one Latin-1 character
  method: number;         // 0 stored, 8 deflated; any other is listed and refused by readEntry
  size: number;           // declared uncompressed size
  compressedSize: number;
  crc32: number;
  dataOffset: number;     // where the entry's data starts (past its local header)
  directory: boolean;     // name ends in '/'
}
export type ZipReason =
  | 'not-zip' | 'too-big' | 'too-many-entries' | 'too-big-unpacked' | 'zip64' | 'split'
  | 'encrypted' | 'unsafe-name' | 'duplicate-name' | 'damaged' | 'method' | 'entry-too-big' | 'no-inflate';
export class ZipError extends Error { readonly reason: ZipReason }
/** The archive's entries, from its central directory, every safety rule applied; synchronous. */
export function listZip(bytes: Uint8Array, limits?: Partial<ZipLimits>): ZipEntry[];
/** One entry's bytes, inflated if deflated, its size and CRC-32 checked. */
export function readEntry(bytes: Uint8Array, entry: ZipEntry, limits?: Partial<ZipLimits>): Promise<Uint8Array>;
// crc32.ts
export function crc32(bytes: Uint8Array): number; // the standard reflected polynomial 0xEDB88320, table-driven
// test/make-zip.ts (tests only, and Task 5's e2e; Node's zlib.deflateRawSync for deflate)
export interface MakeEntry { name: string; data: Uint8Array | string; method?: 0 | 8; flags?: number;
  declaredSize?: number; declaredCrc?: number; localName?: string; extra?: Uint8Array }
export function makeZip(entries: MakeEntry[], options?: { comment?: string; zip64Locator?: boolean;
  disk?: number; prefix?: Uint8Array; overlap?: [number, number] }): Uint8Array;
```

- **Call (Call 2):** the reader is Drafter's own, not a dependency. Listing is a few hundred lines over APPNOTE's three records (end of central directory, central file header, local file header), and inflating is the platform's. A library would bring writing, zip64, encryption, and streaming from disk, all of which Drafter refuses anyway.
- **Call (Call 3):** the end record is the last `PK\5\6` in the final 65,557 bytes whose comment runs exactly to the file's end. The central directory must end where the end record starts: no prepended data, so a self-extracting archive is `not-zip`. Its record count must equal the end record's.
- **Call (Call 4):** an encrypted entry (flag bit 0 or bit 6) anywhere refuses the whole archive, since an app's own file never has one. A name rule broken by any entry refuses the whole archive too, even an entry Drafter would not read.
- **Call (Call 5):** zip64 is refused (`zip64`): any `0xFFFF`/`0xFFFFFFFF` field in the end record or a central record, or a zip64 end locator (`PK\6\7`) before the end record. A script archive is far below 4 GB. A disk number other than 0 is `split`.
- **Call (Call 6):** how `readEntry` inflates:
  - It streams the compressed bytes through `new DecompressionStream('deflate-raw')`, counting the output chunk by chunk, and `cancel()`s the reader the moment the count passes `entry.size` (`damaged`) or `maxEntryBytes` (`entry-too-big`).
  - An entry declared over `maxEntryBytes` is refused before anything inflates.
  - A stream error (truncated data, junk after the end) is `damaged`, and so is a size or CRC-32 mismatch.
  - Where `DecompressionStream` is undefined or throws for `'deflate-raw'` (tested as `storage/gzip.ts`'s `canDecompress` tests for gzip), a method-8 entry is `no-inflate`.
  - A method other than 0 or 8 is `method`.

- [ ] **Step 1: Write the failing tests.**
  - `crc32.test.ts`:
    - `gives 0xCBF43926 for "123456789"` (the standard check value)
    - `gives 0 for no bytes`
  - `zip.test.ts` (each archive made by `makeZip`, with text of the tests' own):
    - Reading:
      - `lists a stored and a deflated entry with their names and sizes`
      - `reads a stored entry and a deflated one back exactly`
      - `reads a UTF-8 name when flag bit 11 is set, and a Latin-1 one when not`
      - `lists folders as directory entries`
      - `finds the end record past a comment, and not one inside the comment`
    - Refusing the archive:
      - `refuses bytes that aren't a zip archive` (a Fountain text, a `.fdx`, empty bytes, 21 bytes)
      - `refuses an archive over 32 MiB without reading it`
      - `refuses more than 1,000 entries`
      - `refuses an archive whose declared sizes sum past 256 MiB`
      - `refuses zip64` (the locator; a `0xFFFFFFFF` size)
      - `refuses a split archive`
      - `refuses an archive holding any encrypted entry`
      - `refuses unsafe names` (each of `/etc/x`, `a/../b`, `..`, `C:x`, `a\\b`, a NUL, a control character, an empty name)
      - `refuses two entries with the same name`
      - `refuses overlapping entries`
      - `refuses a local header whose name differs from its central record`
      - `refuses data that runs past the central directory`
      - `refuses prepended data`
    - Refusing an entry:
      - `refuses an entry declared over 5 MiB before inflating`
      - `stops inflating past the declared size and refuses the entry`
      - `refuses a CRC-32 mismatch`
      - `refuses junk after a deflate stream`
      - `refuses a method it doesn't read`
      - `reads a stored entry and refuses a deflated one where DecompressionStream is missing` (`vi.stubGlobal`)
  - `zip.properties.test.ts` (fast-check):
    - `makeZip then listZip and readEntry gives the entries back` (names from a safe alphabet, data up to 4 KB, both methods)
    - `any bytes list or throw a ZipError, never anything else`
    - `changing any one byte of a valid archive reads the same, or throws a ZipError`
  - `scaling.test.ts` (with `scaling` and `scalingAsync` from `test/scaling.ts`):
    - `listing grows linearly with the entry count` (250 against 1,000 entries, growth under `MAX_GROWTH`)
    - `reading grows linearly with the entry's size` (`scalingAsync`, 256 KB against 1 MB deflated)
    - `finds no end record in 32 MiB of junk in under 100 ms` (the search is bounded)
    - `refuses a 5 MiB-capped entry whose deflate stream would give 1 GB, in under a second`
  - `apps/web/test/tech.test.ts` already fails until `PACKAGES` lists the new package and `@drafter/web`'s `uses` name it.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/archive test` → FAIL (no package).
- [ ] **Step 3: Implement** `crc32`, `listZip`, `readEntry`, and the workspace edges. `ZipError`'s `message` is the reason in plain words; Task 5 reads `reason`, not the message. Regenerate `docs/technical-details.md`.
- [ ] **Step 4: Run them again,** with `pnpm -r typecheck` and `apps/web/test/tech.test.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(archive): a strict read-only zip reader`

---

### Task 3: Highland files (`@drafter/archive`, `@drafter/lint`)

**Files:**
- Create: `packages/archive/src/{errors.ts,highland.ts,text.ts}`, `packages/archive/test/{highland.test.ts,real-files.test.ts}`, `packages/lint/src/rules/import-notes.ts`
- Modify: `packages/archive/src/index.ts`, `packages/archive/README.md`, `packages/lint/src/rules/fdx.ts` (built by the maker in `import-notes.ts`, its id and messages unchanged), `packages/lint/src/run.ts` (`highlandNote` after `fdxNote`), `packages/lint/test/rules.test.ts`, `packages/lint/test/run.test.ts`

**Interfaces (Consumes):** `listZip`, `readEntry`, `ZipEntry`, `ZipError` (Task 2). **(Produces):**
```ts
// errors.ts
export type ArchiveFormat = 'Highland' | 'Fade In';
export type ArchiveReason = ZipReason | 'no-script' | 'many-scripts' | 'not-utf8' | 'not-osf';
/** message: `This isn’t a ${format} file Drafter can read: ${words for reason}` (Task 5's copy table). */
export class ArchiveError extends Error { readonly format: ArchiveFormat; readonly reason: ArchiveReason; readonly detail?: string }
// text.ts
/** Strict UTF-8 (`not-utf8` otherwise), a leading BOM taken off, `\r\n` and `\r` made `\n`. */
export function scriptText(bytes: Uint8Array, format: ArchiveFormat): string;
/** The entries that can hold the document: not a directory, not under `__MACOSX/`, no segment starting with `.`. */
export function candidates(entries: readonly ZipEntry[], extension: RegExp): ZipEntry[];
/** The one to read: the only candidate, else the only one at the shallowest depth; else throws `no-script` / `many-scripts`. */
export function pickEntry(found: readonly ZipEntry[], format: ArchiveFormat): ZipEntry;
// highland.ts
export const HIGHLAND_METADATA: RegExp; // entries the public description names as the app's own (Step 0); never named in the note
/** The same shape as FdxImport: `mapped` counts the one closing note, if there is one. */
export function fromHighland(bytes: Uint8Array): Promise<FdxImport>;
// lint rules/import-notes.ts
export function importNote(id: string, prefix: string, app: string, extra?: (label: string) => string | null): Rule;
export const highlandNote: Rule; // id 'highland-note', info
```

- **Step 0 (before the tests): read the public descriptions** of the `.highland` package (Call 12): the app's own help and release notes, and any published description of the file. Record in DECISIONS the sources (title, URL, and the date read) and what they say:
  - the package is a zip
  - the name and place of the Fountain entry
  - the other entries a package may carry (resources, settings, a backup)
  - whether names carry flag bit 11

  Where no public source says, the rule below stands as written and the gap is a line in DEFERRED. No real file is looked at in this task. The fixtures in `highland.test.ts` copy the described structure, with entry names of the tests' own where the description gives none, and text of the tests' own.
- **Call (Call 10):** the script is the one `.fountain` entry (`/\.fountain$/i`) among `candidates`, by `pickEntry`. If Step 0's sources name a fixed entry, that name is preferred when present and the rule falls back to `pickEntry`. A real file can therefore narrow the rule later without breaking one that fits it now.
- **Call (Call 11):** the text comes in exactly as Highland wrote it. It is already Fountain, so it gets no escaping, and Drafter's parser and Problems read it like any opened file. `title` is null, so `openImported` titles the script from its title page, or after the file.
- **Call (Call 19), nothing dropped silently:**
  - **What the note names:** every entry not read that is not a directory, not under `__MACOSX/`, not a dot-file, and not matched by `HIGHLAND_METADATA`. They are named, never read, in one note at the end of the script: `[[highland: Also in the file, not brought in: notes.txt, cover.png]]`.
  - **Size and count:** at most 50 names, then "and N more". The note is counted once in `mapped` (`{ type: 'Also in the file', count: 1 }`), so the toast says "1 item came in as a note".
  - **No note:** when there is nothing to name.
  - **Why names only:** an entry's contents are not read, because only the script is the writer's text that Drafter can hold. Names cost nothing and say what was left.
- **Call (Call 20):** `fdx-note`'s matcher becomes `importNote(id, prefix, app, extra)`:
  - `fdx-note` is built by it with its own `Omitted`/`Hidden` messages, unchanged.
  - `highland-note` ("This came in from Highland as “X”. Check it, then delete the note.") is built by it here, and `osf-note` in Task 4.
  - One rule per app keeps each app's advice its own and lets a writer turn one off.

- [ ] **Step 1: Write the failing tests.**
  - `highland.test.ts` (archives by `makeZip`, shaped as Step 0 found):
    - Finding and reading the script:
      - `reads the Fountain script out of a Highland archive`
      - `reads it stored or deflated`
      - `takes off a BOM and turns CRLF into LF`
      - `ignores __MACOSX and dot-files when finding the script`
      - `takes the shallowest script when one sits deeper too`
      - `reads the script from an archive whose other entries are 20 MiB stored`
      - `never reads an entry but the script` (a spy on `readEntry`)
    - The closing note:
      - `names the other entries in one closing note, and counts it`
      - `names no metadata, __MACOSX, or dot-file in the note, and writes no note when nothing is left`
      - `names at most 50 entries, then how many more`
    - Refusals:
      - `refuses a script that isn't UTF-8` (`not-utf8`)
      - `refuses an archive with no script` (`no-script`)
      - `refuses two scripts at the same depth` (`many-scripts`)
      - `wraps a ZipError as an ArchiveError naming Highland, with the zip reason`
  - `real-files.test.ts`:
    - `imports the maintainer's Highland file`, and (Task 4) `…Fade In file`. Each is `it.skipIf(!process.env.DRAFTER_REAL_FILES)`, reads `${DRAFTER_REAL_FILES}/real.highland`, and asserts a non-empty text that `parse` reads with at least one scene heading. It is skipped until a real file exists (DEFERRED).
  - `rules.test.ts`:
    - `highland-note lists every [[highland: …]] note, and none in a boneyard`
    - `fdx-note still lists only fdx notes, with its omitted and hidden advice`
  - `run.test.ts`:
    - `runs highland-note in both templates`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(archive): read the script out of a Highland file`

---

### Task 4: Open Screenplay Format and Fade In files (`@drafter/fdx`, `@drafter/archive`, `@drafter/lint`)

**Files:**
- Create: `packages/fdx/src/osf.ts`, `packages/fdx/test/{osf.test.ts,osf.properties.test.ts,osf-scaling.test.ts,osf-fixtures.ts}`, `packages/archive/src/fadein.ts`, `packages/archive/test/fadein.test.ts`
- Modify:
  - `packages/fdx/src/import.ts`: the `Importer` takes a source, a note prefix and an ignored set; `fromFdx` passes `{ prefix: 'fdx', ignored: IGNORED }` and is unchanged otherwise
  - `packages/fdx/src/index.ts`
  - `packages/fdx/package.json`: its description says "Final Draft files, and Open Screenplay Format import"
  - `packages/fdx/README.md`: an "Open Screenplay Format" section
  - `packages/archive/src/index.ts`
  - `packages/archive/package.json`: `"@drafter/fdx": "workspace:*"`
  - `apps/web/app/about/tech.ts`: `@drafter/archive` uses `@drafter/fdx`; `@drafter/fdx`'s `does` names Open Screenplay Format
  - `docs/technical-details.md` (regenerated)
  - `packages/lint/src/rules/import-notes.ts` (`osfNote`), `packages/lint/src/run.ts`, `packages/lint/test/rules.test.ts`, `packages/lint/test/run.test.ts`

**Interfaces (Consumes):** `readXml`, `XmlElement`, `XmlError`, and the `Importer` in `import.ts`; `listZip`, `readEntry`, `candidates`, `pickEntry`, `scriptText`, and `ArchiveError` (Tasks 2–3). **(Produces):**
```ts
// import.ts (internal, not exported from index.ts)
interface ImportSource { prefix: 'fdx' | 'osf'; ignored: ReadonlySet<string> }
export function importTree(root: XmlElement, source: ImportSource): FdxImport; // new Importer(source).run(root)
// osf.ts (exported from index.ts)
export class OsfError extends Error { readonly reason: string } // message: `This isn’t an Open Screenplay Format document: ${reason}`
export const OSF_IGNORED: ReadonlySet<string>; // the spec's settings and formatting elements (Step 0)
/** The OSF tree as the Final Draft tree importTree reads; text and the attributes it maps only. */
export function osfToFdxTree(root: XmlElement): { tree: XmlElement; ignored: string[] };
export function fromOsf(xml: string): FdxImport;
// fadein.ts
export function fromFadeIn(bytes: Uint8Array): Promise<FdxImport>; // the one .xml entry, strict UTF-8, fromOsf; OsfError → ArchiveError('Fade In', 'not-osf', detail)
// lint rules/import-notes.ts
export const osfNote: Rule; // id 'osf-note', info: “This came in from Fade In as ‘X’, which Drafter has no element for. Check it, then delete the note.”
```

- **Step 0 (before the tests): read the published OSF specification** (Call 13) and the public descriptions of the `.fadein` package.
  - **Record the sources** in DECISIONS: title, version, URL, and the date read.
  - **Record the element and attribute names** used for: the root and its version; paragraphs; a paragraph's style, and how a named style resolves to a base style; text runs and their bold, italic, and underline; alignment; page breaks; scene numbers; dual dialogue; scene synopses or summaries; notes; and the title page.
  - **Record which elements hold settings** (`OSF_IGNORED`), and the package's entry name and compression as described.
  - **Provisional until then:** the names below are from the format's public description, and are corrected to the spec before any fixture is written.
  - **The fixtures:** `osf-fixtures.ts` holds hand-written OSF in the spec's shape, with text of the tests' own. No real `.fadein` is looked at in this task (Call 12).
- **Call (Call 1):** OSF lives in `@drafter/fdx`, not in a new `@drafter/osf`.
  - **The tree:** `osfToFdxTree` makes the tree the `Importer` already reads: `FinalDraft` › `Content` › `Paragraph Type=… StartsNewPage Number Alignment` › `Text Style="Bold+Italic+Underline"`, with `DualDialogue`, `SceneProperties Summary`, and `TitlePage`.
  - **What it reuses:** every rule Plan FD proved holds for OSF unchanged: forced markers, escaping, speeches, the title page by order, notes kept whole, the `ignored` cap and `ignoredCount`, and linear time.
  - **Why not a new package:** it would have to duplicate the ~1,400-line importer or make it public across a package boundary.
  - **The name:** the package keeps it, and its README and description say it reads OSF too.
- **Call (Call 7):** the adapter copies **no attribute through**. It writes only the attributes it maps, so an OSF file can't set `DrafterSection`, `DrafterNote`, or any other mark of Drafter's own. An OSF note element, if the spec has one, is the one deliberate `General` + `DrafterNote="Yes"` it writes, its text the note's.
- **Call (Call 8):** how a paragraph's style resolves:
  - **The chain:** a paragraph's style is its base style name, read through `<styles>` (provisionally, a named style's `basestylename`), and followed at most 8 deep with a seen-set.
  - **When it fails:** a cycle, a missing style, or a chain past 8 gives the unresolved name, which comes in through the unmapped path.
  - **The mapping:** base styles map by name. Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, and centered text (by alignment) map to Final Draft's same-named types.
  - **Anything else** (General, Cast List, act breaks, a custom style) keeps its name as `Type`, so it becomes action with `[[osf: Name]]`, counted in `mapped`.
- **Call (Call 9, restated):** `ignored` is already capped at `MAX_IGNORED` = 50 in the shared importer, with `ignoredCount` (Plan FD's follow-up), so `.fdx` doesn't change. Run-level formatting the mapping doesn't keep (strikeout, font, color, highlight; provisional names) is named once each in `ignored`, as `text@strikeout` and the like.

- [ ] **Step 1: Write the failing tests.**
  - `osf.test.ts`:
    - Styles:
      - `maps every base style of the fixture to its Fountain kind`
      - `resolves a named style through its base style`
      - `follows a base-style chain at most 8 deep and stops at a cycle`
      - `brings an unknown style in as action with an [[osf: Name]] note, counted`
      - `brings an element holding text in as a note, and lists settings once in ignored`
    - Text and formatting:
      - `keeps bold, italic, and underline as Fountain emphasis`
      - `lists strikeout and fonts in ignored`
      - `forces a paragraph whose plain text would read as another kind` (one per marker, as `import.test.ts` does)
    - Structure:
      - `writes a page break before its paragraph`
      - `keeps a scene number Fountain can hold, and notes one it can't`
      - `keeps dual dialogue with a ^` (if the spec has it; else `writes two speeches one after the other`)
      - `keeps a scene summary as = lines`
      - `reads the title page by its order`
    - Safety and refusals:
      - `never reads a Drafter mark from an OSF attribute`
      - `refuses XML the reader refuses, wrapping its error`
      - `refuses XML that isn't an OSF document`
  - `osf.properties.test.ts` (fast-check over generated OSF documents of the fixture's styles and runs):
    - `never throws but OsfError`
    - `keeps each paragraph in its kind, or counts it as a note` (as `fromFdx: any file`)
    - `the text is at most 4 × the XML's length + 64` (no amplification)
  - `osf-scaling.test.ts` (with `scaling` from `packages/fdx/test/scaling.ts`):
    - `fromOsf grows linearly` (1 MB against 4 MB of paragraphs)
    - `reads 5 MB of unclosed [[ in one paragraph within 3 seconds`
    - `one style referenced by 100,000 paragraphs costs no more than plain paragraphs` (within 2 × of the same file with no `<styles>`)
    - `a 5 MB file of 1,000-deep style chains stays within 3 seconds`
  - `fadein.test.ts`:
    - `reads the OSF document out of a Fade In archive`
    - `ignores __MACOSX and dot-files when finding the document`
    - `refuses an archive with no document`
    - `wraps an OsfError as an ArchiveError naming Fade In`
    - `refuses a Highland archive` (`no-script`: no `.xml`)
  - `rules.test.ts`:
    - `osf-note lists every [[osf: …]] note, and none in a boneyard`
  - `run.test.ts`:
    - `runs osf-note in both templates`
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/fdx test`, `pnpm --filter @drafter/archive test`, and `pnpm --filter @drafter/lint test` → FAIL.
- [ ] **Step 3: Implement.** First the `importTree` / `ImportSource` change, with the whole existing `fdx` suite green: the round-trip property, `realistic.test.ts`, and `scaling.ts`'s checks. Then `osf.ts`, `fadein.ts`, and the rule. Regenerate `docs/technical-details.md`.
- [ ] **Step 4: Run them again,** with `apps/web/test/tech.test.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(fdx): import Open Screenplay Format, and Fade In files through it`

---

### Task 5: Opening Highland and Fade In files in the app and the desktop app

**Files:**
- Modify (web):
  - `apps/web/app/markdown/kind.ts`: `importKindOf`; `isFinalDraftName` becomes `isImportName`, and its callers change
  - `apps/web/app/storage/open.ts`: `importScript`, the archive branch, the copy table
  - `apps/web/app/storage/formats.ts`: the zip-signature exception for `.highland` and `.fadein`
  - `apps/web/app/storage/files.ts`: the picker's types and the file input's `accept`
  - `apps/web/app/storage/desktop-files.ts`: no "opened as a new script" notice for any import
  - `apps/web/app/storage/script.ts` and `projects.ts`: doc comments say "the Final Draft, Highland, or Fade In file, or the Markdown file opened as a screenplay"
  - `apps/web/app/components/DropZone.vue`: both strings
- Modify (desktop):
  - `apps/desktop/src/files.ts` (`IMPORT_EXTENSIONS`)
  - `apps/desktop/src/files-ipc.ts` (`OPEN_FILTERS`)
  - `apps/desktop/src/open-files.ts` (`NOT_A_SCRIPT`)
  - `apps/desktop/electron-builder.config.cjs` (`SCRIPT_TYPES`)
  - `apps/desktop/installer/windows.nsh`
  - `docs/desktop-install-linux.md`: the Open with sentence names the new types
- Tests:
  - web unit: `apps/web/test/{open.test.ts,files.test.ts,desktop-files.test.ts,formats.test.ts}`
  - web e2e: `apps/web/e2e/imports.spec.ts` (new). Its zips come from `packages/archive/test/make-zip.ts` by relative import and are put with `putFile(page, name, number[])` from `e2e/fs-stub.ts`.
  - desktop unit: `apps/desktop/test/{grants.test.ts,files.test.ts,open-files.test.ts,update-feed.test.ts}`
  - desktop e2e: `apps/desktop/e2e/{imports.spec.ts,packaged.spec.ts}`

**Interfaces (Consumes):** `fromHighland`, `fromFadeIn`, and `ArchiveError` (Tasks 3–4); `fromFdx` and `FdxError`; `notAScript` (Task 1). **(Produces):**
```ts
// markdown/kind.ts
export type ImportKind = 'fdx' | 'highland' | 'fadein';
export function importKindOf(name: string | undefined): ImportKind | null; // by extension, any case
export function isImportName(name: string | undefined): boolean;
// storage/open.ts (internal)
async function importScript(name: string, run: () => FdxImport | Promise<FdxImport>): Promise<void>; // importFinalDraft generalised: FdxError | ArchiveError → say(openError, message)
```

- **Call (Call 14), the order in `openFile`:**
  1. The read-only check.
  2. `notAScript` (Task 1), which lets a zip through only under `.highland` or `.fadein`.
  3. A `.highland` or `.fadein` goes straight to `importScript` with the file's bytes. It skips `problemWith`, because a zip has NUL bytes and its size cap is the archive's 32 MiB (`listZip`'s `too-big`). It skips `decodeFile`, because the entry is decoded inside, strictly.
  4. A `.fdx` keeps its path through both checks.
- **Copy** (Drafter's own words; `ArchiveError.message` builds these). The message starts "This isn’t a Highland file Drafter can read: " or "This isn’t a Fade In file Drafter can read: ", and the reason follows:

  | Reason | Words |
  |---|---|
  | `not-zip` | it isn’t a zip archive. |
  | `too-big` | it is larger than 32 MB. |
  | `too-many-entries` | it holds more than 1,000 files. |
  | `too-big-unpacked` | it unpacks to more than 256 MB. |
  | `zip64`, `split` | it is stored in a form Drafter doesn’t read. |
  | `encrypted` | it is encrypted. |
  | `unsafe-name` | it holds a file with an unsafe name. |
  | `duplicate-name` | it holds two files with the same name. |
  | `damaged` | it is damaged. |
  | `method` | its script is compressed in a way Drafter doesn’t read. |
  | `entry-too-big` | its script is larger than 5 MB. |
  | `no-inflate` | this browser can’t unpack it. Try a current browser, or the Drafter app. |
  | `no-script` | it holds no script. |
  | `many-scripts` | it holds more than one script. |
  | `not-utf8` | its script isn’t UTF-8 text. |
  | `not-osf` | its document isn’t one Drafter can read (*detail*). |

  The toast is `importedMessage` unchanged ("Imported “Lamp.highland”."), with the count of notes.
- **Call (Call 15), the picker and the input:**
  - `showOpenFilePicker`'s one type becomes "Script, Markdown document, or a Final Draft, Highland, or Fade In file", and adds `'application/zip': ['.highland', '.fadein']`.
  - The input's `accept` adds `.highland,.fadein`.
  - The drop zone says "Drop a .fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein file to open it". Its refusal says "That isn’t a file Drafter can open. Drop a .fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein file." (`.markdown` is missing from both today.)
  - The desktop Open filter is named as the picker is and lists all seven extensions, and `NOT_A_SCRIPT` lists them too.
- **Desktop writes** (binding):
  - `IMPORT_EXTENSIONS = ['.fdx', '.highland', '.fadein']`.
  - `WRITE_EXTENSIONS` is unchanged, so a `.highland` or `.fadein` is refused by its first check and by the imported-file check after it.
  - A script saved under such a name gets `.fountain` after it (`saveTarget` does this already).
- **Call (Call 16), Open with:**
  - **macOS and Linux:** `SCRIPT_TYPES` gains `{ ext: 'highland', name: 'Highland document', mimeType: 'application/x-highland', role: 'Viewer', rank: 'Alternate' }` and `{ ext: 'fadein', name: 'Fade In document', mimeType: 'application/x-fadein', role: 'Viewer', rank: 'Alternate' }`, one extension per entry, as the `.deb` needs.
  - **Windows:** `windows.nsh` writes and removes `Drafter.highland` and `Drafter.fadein` ProgIDs in `OpenWithProgids`, exactly as it does `Drafter.fdx`. `win.fileAssociations` stays `.fountain` only.
  - Offered everywhere, the default nowhere.

- [ ] **Step 1: Write the failing tests.**
  - Web unit:
    - `open.test.ts` (`describe('importing a Highland or Fade In file')`, with a bytes variant of `t.picked`):
      - `opens a .highland as a new Fountain script with no file, unsaved`
      - `opens a .fadein the same way and says how many items came in as notes`
      - `never sniffs an archive for NUL bytes or decodes it as text`
      - `refuses a damaged archive, says why, and opens nothing`
      - `imports the same file twice as two scripts`
      - `takes an imported snapshot named after the file`
      - `opens nothing in a read-only tab`
    - `formats.test.ts`:
      - `lets a zip through when it is named .highland or .fadein, and only then`
    - `files.test.ts`:
      - `the file input accepts every type Drafter opens` (exactly `.fountain,.txt,.md,.markdown,.fdx,.highland,.fadein,text/plain,text/markdown`)
    - `desktop-files.test.ts`:
      - `says no "opened as a new script" notice for a .highland or .fadein`
  - Web e2e, `imports.spec.ts`:
    - `opens a Highland file from the picker as a new, unsaved script, and Save asks for a .fountain` (and the `.highland` bytes unchanged)
    - `opens a dropped Fade In file, and Problems lists what came in as a note`
    - `opens one from the file input`
    - `refuses a text file named .highland, says why, and opens nothing`
    - `refuses a Highland archive named .fadein`
  - Desktop unit:
    - `grants.test.ts`: `never writes a .highland or .fadein, even one the writer opened`
    - `files.test.ts`: `a script saved as x.highland is saved as x.highland.fountain`
    - `open-files.test.ts`: the `NOT_A_SCRIPT` strings, and `grants a .highland and a .fadein named on the command line`
    - `update-feed.test.ts`: Linux and macOS list `['fountain', 'md', 'markdown', 'fdx', 'highland', 'fadein']`, both new ones `Viewer`/`Alternate`; Windows still `.fountain` only
  - Desktop e2e:
    - `imports.spec.ts`:
      - `imports a Highland file named on the command line as a new script, and never writes it`
      - `imports a dropped Fade In file`
    - `packaged.spec.ts` (`.deb`): the desktop entry lists `application/x-highland` and `application/x-fadein`, and the MIME file has `*.highland` and `*.fadein` globs
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `fdx.spec.ts`, `open.spec.ts` (its drop-zone axe test included), and the desktop `fdx.spec.ts` and `files.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web,desktop): open Highland and Fade In files as new scripts`

---

### Task 6: Open as screenplay (`apps/web`, `apps/desktop`)

This is the maintainer's request of 2026-10-29. A `.md` or `.markdown` file still opens as a Markdown document by default. **Open as screenplay…** opens the same file as a new Fountain script instead, for a screenplay someone typed in a Markdown file. Its text is kept exactly as it is, and Fountain reads it as it would any `.fountain` file.

**Files:**
- Modify (web):
  - `apps/web/app/storage/open.ts`: `openFile(file, { as })` and `pickAndOpenAs`
  - `apps/web/app/commands/data.ts`: `{ id: 'open-as-screenplay', title: 'Open as screenplay…', group: 'File' }` after `open`
  - `apps/web/app/commands/builtin.ts`
  - `apps/web/app/components/AppMenu.vue`: the entry after Open, with the `i-lucide-clapperboard` icon or the nearest Lucide icon the build already has
  - `apps/web/app/pages/docs/shortcuts.vue`, if it lists File's commands
- Modify (desktop): `apps/desktop/src/menu.ts` (`{ pick: ['open', 'open-as-screenplay'] }`; `opensWindow` counts it like `open`)
- Tests: `apps/web/test/open.test.ts`, `apps/web/test/command-data.test.ts`, `apps/web/test/desktop-menu.test.ts`, `apps/web/e2e/markdown.spec.ts`, `apps/web/e2e/palette.spec.ts` (if it pins the File list), `apps/desktop/test/menu.test.ts`, `apps/desktop/e2e/menu.spec.ts`, `apps/desktop/e2e/files.spec.ts`

**Interfaces (Produces):**
```ts
// storage/open.ts
export interface OpenAs { as?: 'fountain' }
export async function openFile(file: PickedFile, how?: OpenAs): Promise<void>;
/** Open as screenplay…: the same picker as Open; a .md or .markdown comes in as a new Fountain script. */
export async function pickAndOpenAs(as: 'fountain'): Promise<void>;
```

- **Call (Call 23), what it does:**
  - **The picker:** it uses the same picker, file input, and accepted types as Open. In the desktop app, that is the same Open dialog with its one filter.
  - **A `.md` or `.markdown`:** after the same checks as any text file (`notAScript`, `problemWith`, and a strict `decodeFile`), it opens through `openImported(text, name)` as a new, unsaved Fountain script. It takes an `imported` snapshot (`afterImport`), and the toast says "Opened “notes.md” as a screenplay.".
  - **Anything else** opens exactly as Open opens it, since a `.fountain` is already a screenplay, so the command never fails in a puzzling way.
  - **Never:** it is never matched to an open script or a same-titled one, and the `.md` is never written. Save asks for a `.fountain`.
  - **The template:** the text's own metadata block names it if it has one, else the default screenplay.
  - **Drop:** dropping a `.md` opens it as a document, as now.
  - **A read-only tab:** it says the read-only hint before any picker, as `pickAndOpen` does.

- [ ] **Step 1: Write the failing tests.**
  - `open.test.ts` (`describe('opening a Markdown file as a screenplay')`):
    - `the same .md opens as Markdown with Open and as Fountain with Open as screenplay`
    - `opens it as a new, unsaved Fountain script with its text exactly as it was`
    - `takes an imported snapshot and says so in the toast`
    - `opens a .fountain as Open does`
    - `still refuses a .docx`
    - `says the read-only hint and shows no picker in a read-only tab`
  - `command-data.test.ts`: `Open as screenplay… is a File command after Open`.
  - `desktop-menu.test.ts` and `apps/desktop/test/menu.test.ts`: `File lists Open as Screenplay… after Open`.
  - `markdown.spec.ts`:
    - `Open as screenplay from the palette opens a .md as a screenplay, and Save asks for a .fountain and the .md is unchanged`
    - `the app menu lists Open as screenplay after Open`
  - Desktop `menu.spec.ts`: `the File menu has Open as Screenplay…`. Desktop `files.spec.ts`: `never writes the .md it opened as a screenplay`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `open.spec.ts`, `app-menu.spec.ts`, and `palette.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web,desktop): Open as screenplay, for a script typed in a Markdown file`

---

### Task 7: A script as Markdown (`@drafter/layout`, `@drafter/outline`)

This is the engine half of the maintainer's request for **Export as Markdown** (2026-10-29). It writes the whole script, not only the treatment's headings and synopses. The result has to read well in any Markdown viewer and paste cleanly into a website, a notes app, or an AI chat.

**Files:**
- Create: `packages/layout/src/numbers.ts`, `packages/layout/test/numbers.test.ts`, `packages/outline/src/markdown.ts`, `packages/outline/src/escape.ts`, `packages/outline/test/{markdown.test.ts,markdown.properties.test.ts,markdown-scaling.test.ts,escape.test.ts,escape.properties.test.ts}`
- Modify:
  - `packages/layout/src/paginate.ts`: `Items.build` takes its numbers from `sceneNumbersFor`
  - `packages/layout/src/index.ts`
  - `packages/outline/src/treatment.ts`: uses `escape.ts`'s `markdownText`, which `treatment.ts` re-exports so the public name stays
  - `packages/outline/src/index.ts`
  - `packages/outline/package.json`: devDependency `"mdast-util-from-markdown"`, the version `apps/web` pins
  - `packages/outline/README.md`: a "The script as Markdown" section
  - `docs/DEPENDENCIES.md`: the `@drafter/outline` row names the development dependency, as `@drafter/render-pdf`'s does
  - `packages/outline/test/treatment.test.ts`

**Interfaces (Produces):**
```ts
// layout numbers.ts
/** Each printed scene heading's number, by block index, for the option: what paginate prints, exactly. */
export function sceneNumbersFor(doc: Doc, template: Template, numbering: SceneNumbering): Map<number, string>;
// outline escape.ts
/** The writer's text as CommonMark that shows it exactly: the treatment's escaper, made complete. */
export function markdownText(text: string): string;
// outline markdown.ts
export interface ScriptMarkdownOptions {
  sceneNumbers: SceneNumbering;          // Call 26
  notes: 'leave-out' | 'include';        // Call 28; the title page is cut before (titlePageFor), Call 27
}
export function scriptMarkdown(doc: Doc, index: SceneIndex, template: Template, options: ScriptMarkdownOptions): string;
```

- **Call (Call 25), where it lives:** `@drafter/outline`, beside `treatment`.
  - **Why there:**
    - It already turns a script into Markdown and holds `markdownText`.
    - Its scene index knows the sections' depths, which the heading levels need.
    - It already depends on `@drafter/layout` and `@drafter/templates`.
    - It has `test/scaling.ts`.
  - **The alternative:** `@drafter/render-text` would need a new edge to `@drafter/fountain`, `tech.ts` and DEPENDENCIES changes, and a second escaper.
  - **The escaper:** the stronger one replaces the treatment's (Call 34), so both exports show text alike.
- **Call (Call 26), scene numbers:** they honour the export option, `none`, `written`, or `all`, through `sceneNumbersFor`, which is extracted from `paginate`'s `Items.build` unchanged. The PDF and the Markdown file can't disagree, because both read one function. A numbered heading is `### 12. INT. KITCHEN - NIGHT`, the number and a full stop before the heading's text: `12A.` for a written `#12A#`.
- **Call (Call 27), the title page:**
  - **Which part:** it honours the export option, `full`, `title-author`, or `none`. The worker cuts the title page with `titlePageFor` before `scriptMarkdown` sees it, exactly as it does for the PDF and the `.fdx`.
  - **How it is written:** the Title comes first as `#`. Then each other key that prints, in the title page's order, is one plain paragraph of its value, its lines joined by hard breaks. No key names are written ("Written by" is the Credit's own text).
  - **With `none`:** there is no `#` line.
  - **Heading levels** are fixed either way (Call 29), so the outline of the file doesn't shift with the option.
- **Call (Call 28), notes:**
  - **By default:** notes (`[[…]]`), synopses (`=`), and the boneyard (`/* … */`) are left out, as the PDF leaves them out.
  - **With Include:** the new export option **Notes in Markdown** (Leave out / Include, Task 8) writes each note as a blockquote paragraph, `> **Note:** text`, and each synopsis as `> text`, where they stand.
  - **The boneyard** is always left out: it is text the writer cut.
  - **Keyed notes** are written like any other note, with their key: `> **Note (Writer):** text`.
- **Call (Call 29), the heading levels:**
  - **The title** is `#`.
  - **A section of depth d** is level 1 + d.
  - **Scene headings** are one level below the deepest section in use (2 + the deepest depth), and level 2 when there are no sections.
  - **Past 6:** every level is capped at 6, and a heading past it is written as a bold paragraph, so nothing is lost.
  - **A stage play** gets the same rule. Its acts (`#` sections) and scenes (`##` sections) are its headings, at `##` and `###`, and its scene headings are disabled by the template, so none print.
- **Call (Call 30), the elements:**
  - **Action and stage directions:** action is paragraphs. A stage play's stage directions are paragraphs in italics.
  - **Speeches:** the character name is in bold, then any parenthetical in italics on its own line, then the dialogue as a paragraph. Within a speech, lines are joined by hard breaks.
  - **Dual dialogue:** the second speech's name is followed by ` *(at the same time)*` (Call 31).
  - **Transitions** are a paragraph of their own in capitals, as written.
  - **Centered text** is its own paragraph between Fountain's marks shown as text, `>THE END<` (escaped), so it is kept and marked.
  - **Lyrics** are paragraphs in italics, one line per hard break.
  - **Page breaks** (`===`) are a thematic break, `* * *`.
  - **Line breaks** inside any element are CommonMark hard breaks (a backslash before the newline).
  - **Indentation:** leading spaces are taken off, since Markdown can't hold indentation and four spaces would make a code block (a DECISIONS line).
- **Call (Call 31), dual dialogue:** both speeches are written one after the other. The second's name gets ` *(at the same time)*`, the words every viewer shows. A table or HTML would not paste cleanly into a chat or a notes app.
- **Call (Call 32), emphasis:**
  - **The marks:** Fountain's `*italic*`, `**bold**`, and `_underline_` are written as the maintainer asked: `*italic*`, `**bold**`, and `_underline_`. CommonMark reads `_underline_` as italic, so underlined text shows in italics in most viewers. That is the one loss, and it is flagged for the controller.
  - **The alternative** is `<u>underline</u>`, which GitHub and many viewers show as underlined. Drafter's own preview shows raw HTML as text, and it pastes badly into chats.
  - **Recommendation:** `_underline_`, as asked.
- **Call (Call 33), a cast list:** Drafter has no cast-list element. A stage play's cast list is whatever the writer wrote: title page keys, a section, or action. It is written as what it is, with nothing special.
- **Call (Call 34), escaping:** `markdownText` escapes so that Drafter's own CommonMark parser (`mdast-util-from-markdown`, the app's `parseMarkdown`) reads back exactly the writer's text, in the block it was written as.
  - **Anywhere in a line:** `\ ` `` ` `` `*` `_` `[` `]` `<` `>` `&` `!` `|` `~`.
  - **At a line's start:** `#`, `+`, `-`, `=`, `>`, an ordered-list marker (`1.`/`1)`), and a line that would be a thematic break or a setext underline.
  - **At a line's end:** a trailing backslash or two trailing spaces, which would otherwise make a hard break.
  - **The treatment** uses it too. That fixes the treatment's `---`, `&amp;`, and indented-code gaps, a CHANGELOG Fixed line.
- **Output:** UTF-8, LF line breaks, no BOM, blocks separated by one blank line, and one newline at the end.

- [ ] **Step 1: Write the failing tests.**
  - `numbers.test.ts`:
    - `numbers nothing, the written numbers, or every scene, as paginate prints them`
    - `a written number keeps it under Number every scene, so two scenes can share one`
    - `a disabled scene heading (a stage play's) gets no number`
    - `paginate's layout numbers are sceneNumbersFor's` (a property over generated scripts and all three options)
  - `escape.test.ts`:
    - `escapes every character CommonMark would read` (one case each from Call 34's list)
    - `leaves plain words alone`
  - `escape.properties.test.ts`:
    - `any text, escaped and parsed, gives the same text in one paragraph` (fast-check strings over a Markdown-heavy alphabet, parsed with `mdast-util-from-markdown`)
  - `markdown.test.ts` (a hand-made screenplay and stage play, original text):
    - Title page:
      - `writes the title as #, then the other keys' values, with Full`
      - `writes only the title and author lines with Title and author only`
      - `writes no title or keys with None, and keeps the heading levels`
    - Structure:
      - `writes sections one level below the title, and scenes one below the deepest section`
      - `writes scenes at ## when there are no sections`
      - `caps levels at 6 and writes deeper headings in bold`
      - `numbers scenes for each option, as paginate does`
      - `writes a page break as a thematic break`
    - Elements:
      - `writes a speech as a bold name, an italic parenthetical, and its dialogue`
      - `marks the second speech of dual dialogue`
      - `writes a transition in capitals, centered text between its marks, and lyrics in italics`
      - `keeps bold, italic, and underline as **, *, and _`
      - `writes a stage play's acts and scenes as headings and its stage directions in italics`
      - `takes off leading spaces, and joins an element's lines with hard breaks`
    - Notes:
      - `leaves notes, synopses, and the boneyard out by default`
      - `writes notes and synopses as quotes with Include, and never the boneyard`
  - `markdown.properties.test.ts` (fast-check over generated scripts of every block kind, with emphasis and Markdown-special characters in their text, parsed back with `mdast-util-from-markdown`):
    - `every element's text comes through once, in order, as written` (each printed block's plain text, read from the mdast in order, equals the parsed script's, notes and boneyard excepted)
    - `never makes a heading, list, rule, code block, or HTML the script didn't ask for`
    - `the output is at most 3 × the script's length + 64`
  - `markdown-scaling.test.ts` (with `scaling` from `packages/outline/test/scaling.ts`):
    - `a 120-page script and one four times as long export in linear time` (growth under `MAX_GROWTH`)
  - `treatment.test.ts`:
    - `the treatment escapes as the script's Markdown does` (the `---` and `&amp;` cases)
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/layout test` and `pnpm --filter @drafter/outline test` → FAIL.
- [ ] **Step 3: Implement.** First `sceneNumbersFor`, with the whole `layout` suite and the fixtures green, unchanged. Then `escape.ts`, with `treatment.test.ts` green except the new case. Then `markdown.ts`.
- [ ] **Step 4: Run them again,** with `pnpm -r typecheck` and `pnpm --filter @drafter/cli test` (the CLI's numbers come through `paginate`). → PASS.
- [ ] **Step 5: Commit.** `feat(outline): a whole script as Markdown, numbered as the PDF numbers it`

---

### Task 8: Export as Markdown in the app (`apps/web`, `apps/desktop`)

**Files:**
- Modify:
  - `apps/web/app/workers/export-compute.ts`: `ExportRequest`'s script kinds gain `'md'`, and `ExportOptions` gains `notes`. `exportOne` parses, cuts the title page, builds the scene index, and calls `scriptMarkdown`, reporting unknown, then 1, as plain text and Final Draft do.
  - `apps/web/app/storage/export.ts`:
    - `EXPORTS.fountain` becomes `['pdf', 'txt', 'fdx', 'md']`
    - `notFor` keeps only the `fdx` refusal for Markdown
    - `withOptions` names the notes option
    - a script's `md` goes to the worker, while a Markdown document's `md` stays its own text, as now
    - `Asked` gains `notes`
  - `apps/web/app/storage/export-options.ts`: `notes` in `exportOptionsOf`, `EXPORT_OPTION_LABELS`, `EXPORT_OPTION_HINTS`, and `optionsPhrase` ("with notes")
  - `apps/web/app/components/ExportOptionsDialog.vue`: a third fieldset, **Notes in Markdown**
  - `apps/web/app/components/ExportMenu.vue`: **Markdown (.md)** for both kinds, before **Treatment (.md)…** for a script
  - `apps/web/app/commands/data.ts`: `export-md` keeps its id and title, "Export as Markdown file"
  - `apps/web/app/commands/builtin.ts`
  - `apps/web/app/storage/projects.ts`: the `exportOptions` comment
- Tests: `apps/web/test/{export-compute.test.ts,export.test.ts,export-options.test.ts,command-data.test.ts,desktop-menu.test.ts}`, `apps/web/e2e/export.spec.ts`, `apps/web/e2e/a11y.spec.ts` (if the dialog's axe check lives there), `apps/desktop/e2e/menu.spec.ts`

**Interfaces (Consumes):** `scriptMarkdown` and `sceneIndex` (`@drafter/outline`), and `titlePageFor` (`@drafter/layout`). **(Produces):**
```ts
// workers/export-compute.ts
export interface ExportOptions { sceneNumbers: SceneNumbering; titlePage: TitlePageMode; notes: 'leave-out' | 'include' }
export const DEFAULT_EXPORT_OPTIONS: ExportOptions; // { 'none', 'full', 'leave-out' }
export type ExportRequest =
  | { kind: 'pdf' | 'txt' | 'fdx' | 'md'; source: string; template: Template; options?: ExportOptions }
  | { kind: 'markdown-pdf'; source: string; paper: Paper; title: string; lang: string };
```

- **Call (Call 24), where it appears:**
  - **One command, `export-md`,** for both kinds, keeping its id and title, so the palette, the app menu, the Export menu, and the desktop's File › Export submenu ("Markdown file") need no new entry.
  - **For a script** it is the whole script, rendered in the export worker. **For a Markdown document** it is its own text, as now.
  - **In the Export menu,** a script's list becomes PDF, Plain text, Final Draft, Markdown, Treatment…, with the existing order kept and the two `.md` items side by side.
- **Call (Call 28, the option):** **Notes in Markdown**, Leave out (the default) or Include, is a third export option.
  - **Where it is kept:** per script, on the project like the other two, in the same unindexed `exportOptions` field, so there is no Dexie version bump. An old project reads it as its default (`exportOptionsOf`).
  - **What reads it:** only the Markdown export. The dialog's hint says so ("Only a Markdown export carries notes; a PDF never prints them."), and PDF, text, and Final Draft ignore it.
  - **The toast** adds "with notes" when it is on.
- **The toast:** "Exported The Call.md, with every scene numbered and no title page." It names the options as the PDF's toast does, with every option honoured (Calls 26–28).

- [ ] **Step 1: Write the failing tests.**
  - `export-compute.test.ts`:
    - `exports a script as Markdown with its options`
    - `reports unknown, then 1, for a Markdown export`
    - `an export with no options uses the defaults, notes left out`
  - `export.test.ts`:
    - `a screenplay and a stage play export as md`
    - `a Markdown document's md export is still its own text`
    - `the toast names the Markdown export's options`
    - `the same export asked twice is joined, and one with other notes is its own`
  - `export-options.test.ts`:
    - `reads a missing or unknown notes value as Leave out`
    - `optionsPhrase says with notes`
  - `command-data.test.ts`:
    - `export-md is enabled for every kind`
  - `desktop-menu.test.ts`:
    - `File › Export lists Markdown file for a script`
  - `export.spec.ts`:
    - `exports the sample screenplay as Markdown from the Export menu, the palette, and the app menu`
    - `exports a stage play as Markdown with its acts and scenes as headings`
    - `exports Markdown with every scene numbered and no title page, and the toast says so`
    - `includes notes when Notes in Markdown says Include, and the choice is remembered after a reload`
    - `Notes in Markdown is reached from the keyboard and the dialog passes axe in both themes`
    - `the script is unchanged by exporting Markdown`
  - Desktop `menu.spec.ts`:
    - `File › Export › Markdown file exports a script`
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `export.spec.ts` whole, `a11y.spec.ts`, and `phone.spec.ts`, since the dialog grows. → PASS.
- [ ] **Step 5: Commit.** `feat(web): Export as Markdown for screenplays and stage plays, with export options`

---

### Task 9: Markdown listed as an import, and the help

Markdown already opens as a Markdown document (`kindOfFileName`, `openFile`). It is in the picker, the file input, the desktop Open filter, and Open with on all three systems (`SCRIPT_TYPES`, `windows.nsh`). **New screenplay from this outline** already turns a Markdown outline into a screenplay. This task builds nothing new: it makes every place that names file types name it, pins each with a test, and writes the help for the whole release.

**Files:**
- Modify: `apps/web/app/pages/docs/saving.vue` (sections, and its description), `apps/web/e2e/markdown.spec.ts`, `apps/web/e2e/docs.spec.ts`, `apps/desktop/e2e/open-from-system.spec.ts`, `apps/web/test/desktop-files.test.ts`

- **Call (Call 17):** the help stays on **Saving and your browser**, with no new page.
  - **The section:** `Final Draft files` becomes `Files from other apps` (`id="other-apps"`), with `id="final-draft"` kept on its Final Draft paragraph so old links land. It has four parts:
    - **Final Draft:** as now.
    - **Highland and Fade In:** opened the same way, as a new script, the file never changed. Highland's script comes in as written, with a note naming anything else in the file. Fade In's comes in as Final Draft's does, with `[[osf: …]]` notes that Problems lists, and its settings left out.
    - **Markdown:** a `.md` or `.markdown` opens as a Markdown document and saves back to its file. **Open as screenplay…** opens it as a new screenplay instead. **New screenplay from this outline** makes a screenplay from a Markdown outline, each heading a scene stub that Problems lists.
    - **Files Drafter can't open:** Word, RTF, PDF, and the rest are refused with what they are and what to do.
  - **Export options:** the `#export-options` section gains **Markdown**: what Export as Markdown writes, and the Notes in Markdown option.
  - **The description:** the page's description names the imports and stays under 200 characters (`docs.spec.ts`).

- [ ] **Step 1: Write the failing tests.**
  - `markdown.spec.ts`:
    - `opens a dropped .md and a dropped .markdown file as Markdown`
    - `the picker and the file input offer .md and .markdown`
    - `turns an opened Markdown outline into a screenplay with New screenplay from this outline` (a `.md` with three `##` headings opened from the input, then the command: a new Fountain script with three scene stubs, and the `.md` script unchanged)
  - `docs.spec.ts`:
    - `Saving has Files from other apps, and #final-draft still lands`
    - `the description stays under 200 characters`
  - `open-from-system.spec.ts`:
    - `opens a .markdown file named on the command line as Markdown`
  - `desktop-files.test.ts`:
    - `opens a .md and a .markdown in place, with no notice`
- [ ] **Step 2: Run them.** The copy and section tests FAIL. The behaviour tests should PASS at once; record which in the commit body, since this task pins existing behaviour.
- [ ] **Step 3: Write the help sections.**
- [ ] **Step 4: Run them again,** plus `docs.spec.ts` whole and the help page's axe check. → PASS.
- [ ] **Step 5: Commit.** `docs(web): help for files from other apps, Open as screenplay, and Export as Markdown`

---

### Task 10: Docs and release prep

**Files:**
- Modify:
  - `README.md`
  - `packages/archive/README.md`, `packages/fdx/README.md`, `packages/outline/README.md`, `packages/layout/README.md` (`sceneNumbersFor`)
  - `docs/DECISIONS.md`, `docs/DEFERRED.md`
  - `docs/drafter-technical-design.md` (§6.3 and §14)
  - `docs/drafter-phase2-design.md` (§22 and §26)
  - `docs/drafter-architecture.md` (§13)
  - `docs/drafter-phase1-design.md` (its Phase 3 line, now Celtx only)
  - `docs/clean-room.md` (the permitted sources table)
  - `apps/web/app/about/tech.ts` (the Exporting section names Markdown; the guard, Call 22) and `docs/technical-details.md`
  - `CHANGELOG.md`

- [ ] **Step 1: The README** (stay near 5,000 words; check every place, as the README-in-sync rule asks):
  - **The status line** names the imports and Export as Markdown among what's built, and "Next" names Plans E to H (v0.20.0 to v0.23.0, starting with Scaffold).
  - **The Phase 2 roadmap row** adds "Highland, Fade In, and Markdown imports, Open as screenplay, and Export as Markdown (v0.19.0)" and drops them from **Next**. Phase 3 already reads "Celtx import": check it, and change nothing.
  - **The Packages table** gains `| @drafter/archive | Highland and Fade In files: a strict read-only zip reader, and the script inside each | 2 (built in v0.19.0) |`.
  - **`@drafter/fdx`'s row** reads "Final Draft (`.fdx`) import and export, and Open Screenplay Format import". **`@drafter/outline`'s** adds "and the whole script as Markdown".
  - **The features list and the Phase 1 "Builds" line** that names Open's formats name the new ones, and Export names Markdown for scripts.
- [ ] **Step 2: The Phase 2 design and the architecture.**
  - §22 gains a heading `### Imports and Markdown out — v0.19.0` after v0.18.0's, with **Status:** built, pointing to this plan.
    - It says this release is v0.19.0 and changes no plan's number: Plans E to H stay v0.20.0 to v0.23.0, where v0.17.0 put them.
    - It says the axe checks cover the changed dialog and help.
  - §26 records the change.
  - Architecture §13's v0.19.0 line adds Open as screenplay and Export as Markdown.
  - The Phase 1 design's Phase 3 line becomes "importing Celtx files" (Highland and Fade In moved to v0.19.0).
- [ ] **Step 3: Technical design, clean room, and Technical details.**
  - **Technical design:** §6.3 gains "Open Screenplay Format is read by translating its tree into the Final Draft tree (`osfToFdxTree`), so `[[osf: …]]` notes follow the same rules". §14 gains the zip rules in one sentence: the caps, the refusals, only the needed entry read, and nothing written.
  - **`clean-room.md`:** the permitted sources table gains "Public descriptions of the `.highland` and `.fadein` packages and the published Open Screenplay Format specification, and files a user owns: Highland and Fade In import, built from the descriptions and synthetic fixtures; real files not yet checked". The Final Draft bullet list gains a matching bullet.
  - **`tech.ts`:** the Exporting section says "PDF, plain text, Markdown, or a Final Draft file".
  - **The guard:**
    - **Call 22, if the controller accepts it:** widen `tech.test.ts`'s "names no screenwriting app but Final Draft" to allow Highland and Fade In as file formats Drafter reads, and name them in `@drafter/archive`'s and `@drafter/fdx`'s lines.
    - **Otherwise:** the words stay generic ("files from other screenwriting apps that come packed as a zip").
  - **Regenerate** `docs/technical-details.md`.
- [ ] **Step 4: DECISIONS, DEFERRED, and CHANGELOG.**
  - **DECISIONS:** every Call below in the new section, each with the date, and Step 0's sources from Tasks 3 and 4.
  - **DEFERRED** gets a new `## Imports and Markdown out` section:
    - **Testing against real `.highland` and `.fadein` files**, when the maintainer supplies them (Call 12). Until then, both imports were built from public descriptions and synthetic fixtures only. The harness is ready: `DRAFTER_REAL_FILES=<folder> pnpm --filter @drafter/archive test real-files`. What a real file shows is recorded as structure only, and the rules of Calls 10, 13, and 19 are confirmed or narrowed then.
    - Export to Highland, Fade In, or OSF, and a bare `.osf` file (when asked for).
    - zip64 archives (if a real file ever needs one).
    - OSF's revisions, colors, and fonts (as Final Draft's).
    - Import on the main thread (as Plan FD).
    - `drafter build --md` in the CLI.
    - Underline as `<u>` in Markdown, if Call 32 is ruled the other way later.
  - **CHANGELOG:** one `[Unreleased]` entry per task.
    - **Added:** files that aren't scripts are refused by name; `@drafter/archive`; Highland import; OSF and Fade In import; `highland-note` and `osf-note`; Open with on the desktop; Open as screenplay; Export as Markdown for scripts; Notes in Markdown.
    - **Changed:** the picker, input, drop zone, and filter list the new types; `sceneNumbersFor` is shared by the PDF and Markdown.
    - **Fixed:** the treatment's escaping.
    - **Help:** Files from other apps.
- [ ] **Step 5: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with every axe test green. `git status` shows no `.highland` or `.fadein` file.
- [ ] **Step 6: Commit.** `docs: imports and Markdown out (v0.19.0)`
- [ ] **Step 7: Push** `imports` and watch CI. Don't merge or tag: the controller releases v0.19.0.

---

## Calls in this plan

For the maintainer to review; each gets a DECISIONS line when it lands.

**Departs from the roadmap:** none now. Highland and Fade In moved from Phase 3 into this release on 2026-10-29, and README and architecture §13 already say so; Task 10 fixes the Phase 1 design's line. **Look at these first:**

- Call 12: no real files yet, so the real-file check is DEFERRED.
- Call 22: the Technical details guard.
- Call 28: notes as a third persisted export option.
- Call 32: underline as `_x_`.
- Call 21: unknown text still opens.

1. **OSF lives in `@drafter/fdx`, not in a new `@drafter/osf`.** It is read by translating its tree into the Final Draft tree the importer reads, so every Plan FD rule and guarantee is reused (Task 4).
2. **The zip reader is Drafter's own,** in a new package, `@drafter/archive`, with inflate from the platform's `DecompressionStream('deflate-raw')`, and no dependency (Task 2).
3. **The end record must close the file, and the central directory must meet it:** no prepended data, and the counts must agree (Task 2).
4. **An encrypted entry or an unsafe name anywhere refuses the whole archive,** even an entry Drafter wouldn't read (Task 2).
5. **zip64 and split archives are refused** (Task 2; DEFERRED if a real file needs zip64).
6. **Inflation stops at the declared size or 5 MiB,** and the size and CRC-32 are checked. Where `deflate-raw` is missing, stored entries read and deflated ones are refused with a message (Task 2).
7. **The OSF adapter copies no attribute through,** so a file can't set a Drafter mark (Task 4).
8. **Base styles resolve at most 8 deep.** A cycle, a missing style, or a deeper chain comes in as an `[[osf: Name]]` note (Task 4).
9. **`ignored` keeps the cap it already has,** `MAX_IGNORED` = 50 with `ignoredCount`, which OSF reuses. `.fdx` doesn't change (Task 4).
10. **Highland's script is its one `.fountain` entry,** preferring a fixed name if the public description gives one. The shallowest wins, and `__MACOSX/` and dot-files are skipped (Task 3).
11. **Highland's text comes in as written,** with no escaping or notes, since it is already Fountain (Task 3).
12. **No real files yet.**
    - **How they are built:** both imports are built from the public descriptions of the formats and from synthetic fixtures with original text, never from other converters' code or fixtures.
    - **The real-file check is a DEFERRED step,** as Final Draft's was before its real samples. The `DRAFTER_REAL_FILES` harness and the `.gitignore` lines are ready, and real files are never committed.
    - **Recommendation:** ship v0.19.0 without waiting, and ask the maintainer for one file of each when convenient.
13. **The OSF mapping is built from the published OSF specification,** the newest public version, whose title, version, and URL go in DECISIONS. The element names in this plan are provisional until Step 0 (Task 4).
14. **Archives skip the text checks** (the NUL sniff, the strict decode, and 5 MB) and have their own: a 32 MiB archive and a 5 MiB script inside (Task 5).
15. **One picker type and one file input list every format,** and the drop zone names all seven extensions, `.markdown` included, which it omits today (Task 5).
16. **`.highland` and `.fadein` are offered in Open with, never as the default:** macOS `Viewer`/`Alternate`, Windows `OpenWithProgids`, and the Linux MIME types `application/x-highland` and `application/x-fadein` declared by the `.deb` (Task 5).
17. **The help stays on Saving and your browser,** as one Files from other apps section: Final Draft, Highland and Fade In, Markdown, and files Drafter can't open. Export options gain a Markdown part (Task 9).
18. ◆ **Highland and Fade In left Phase 3,** which keeps Celtx. This is already in README and architecture §13; Task 10 fixes the Phase 1 design.
19. **A Highland package's other entries are named, never read,** in one closing `[[highland: Also in the file, not brought in: …]]` note: at most 50 names, with metadata, `__MACOSX/`, and dot-files left out, and no note when nothing is left. Nothing is dropped silently, and only the script is brought in as text (Task 3).
20. **One `importNote` maker builds one Problems rule per app:** `fdx-note` (unchanged), `highland-note`, and `osf-note`, each with its own advice, and each can be turned off on its own (Tasks 3–4).
21. **Open refuses known non-script formats** by extension (`.rtf`, `.doc`, `.docx`, `.odt`, `.pages`, `.pdf`, `.fdr`, `.celtx`, `.zip`) and, whatever the name, by first bytes (RTF, PDF, OLE, and zip unless `.highland` or `.fadein`). The message names the format and what to do. Any other UTF-8 text still opens as Fountain, as now (Task 1).
    - **Alternative:** refuse every extension Drafter doesn't list. That would refuse a `.text` or a `.log` someone means to open, and recover nothing the table misses.
22. **The Technical details guard.** `tech.test.ts` forbids "Highland" and "Fade In" on the page.
    - **Recommendation:** widen the guard to allow the two as file formats Drafter reads, as it allows Final Draft, and keep forbidding the others (WriterSolo, Celtx, Trelby, Slugline). The package lines then say what they read.
    - **Until ruled:** the lines are worded generically, and the guard is untouched (Tasks 2, 4, 10).
23. **Open as screenplay uses Open's picker.**
    - **A `.md`/`.markdown`** comes in as a new, unsaved Fountain script, through the import path: an imported snapshot, the toast, and Save asking for a `.fountain`.
    - **Any other file** opens as Open opens it.
    - **Drop** is unchanged.
    - **Where it is:** a palette command, an app menu item after Open, and the desktop's File menu (Task 6).
24. **Export as Markdown is the existing `export-md` command,** enabled for every kind. For a script it renders in the export worker with the existing progress protocol, and for a Markdown document it is unchanged. Its title stays "Export as Markdown file" (Task 8).
25. **The script-to-Markdown engine lives in `@drafter/outline`** beside the treatment, sharing one stronger escaper. **Alternative:** `@drafter/render-text`, which would need a new package edge and a second escaper (Task 7).
26. **Scene numbers in Markdown honour the export option** through `sceneNumbersFor`, extracted from `paginate`, so the PDF and the Markdown file always agree. A number is written as `12.` before the heading (Task 7).
27. **The title page in Markdown honours the export option** (Full, Title and author only, None). The title is `#`, and the other keys are plain paragraphs of their values, with no key names (Task 7).
28. **Notes in Markdown** (Leave out, the default, or Include) is a third per-script export option, kept with the other two with no Dexie bump, and read only by the Markdown export. Included notes and synopses are blockquotes, and the boneyard is always left out (Tasks 7–8).
    - **Alternative:** ask each time in a small dialog, like the treatment's. That is one more step on every export, and it isn't remembered.
29. **Heading levels are fixed:** the title `#`, a section of depth d at 1 + d, and scenes one below the deepest section (`##` with none), capped at 6, with deeper headings in bold. A stage play's acts and scenes are its headings (Task 7).
30. **The element mapping:**
    - **Prose:** action is paragraphs, and stage directions are paragraphs in italics.
    - **Speeches:** the name in bold, then the parenthetical in italics, then the dialogue.
    - **Transitions** are in capitals, centered text is between its shown `>…<` marks, and lyrics are in italics.
    - **Page breaks** are `* * *`, and lines within an element are joined by hard breaks.
    - **Leading spaces** are taken off (Task 7).
31. **Dual dialogue:** both speeches are written in order, and the second name gets *(at the same time)*. No table or HTML (Task 7).
32. **Emphasis as asked:** `*italic*`, `**bold**`, `_underline_`.
    - **The loss:** `_underline_` shows as italic in most viewers.
    - **Alternative:** `<u>…</u>`, which shows underlined on GitHub but as text in Drafter's preview and in many chats.
    - **Recommendation:** as asked (Task 7).
33. **No cast-list element:** a stage play's cast list is written as whatever the writer wrote it as (Task 7).
34. **One complete CommonMark escaper,** proven by a round-trip property through Drafter's own Markdown parser. The treatment uses it too, which fixes its `---`, `&amp;`, and indented-code gaps (Task 7).
35. **Ten tasks, in this order:**
    - the refusal first, since Open's later branches build on it
    - then the zip reader, Highland, and OSF/Fade In, pure and tested
    - then opening them
    - then Open as screenplay
    - then the Markdown engine and its export
    - then the help, then the docs

    Packages come before the app in each strand.
36. **Axe:** per the controller's v0.18.0 ruling, the changed Export options dialog and the help page are checked in both themes. There is no new view, so there is no new axe file (Tasks 8–9).

## Controller rulings

