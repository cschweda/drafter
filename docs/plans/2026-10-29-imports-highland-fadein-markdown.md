# Imports: Highland, Fade In, and Markdown (v0.N.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one small import release, **v0.N.0, after the Structure strip and Markdown PDF** (the next minor after those two): open a Highland file (`.highland`, a zip holding the script as Fountain) and a Fade In file (`.fadein`, a zip holding an Open Screenplay Format XML document) as a new, unsaved Fountain script, never changing the source file; and make Markdown (`.md`, `.markdown`), which already opens as a Markdown document, a first-class, listed import everywhere a file type is named, with tests and help.

**Architecture:** A new engine package, `@drafter/archive`, holds a strict read-only zip reader of Drafter's own (`listZip`, `readEntry`; deflate through the platform's `DecompressionStream('deflate-raw')`, CRC-32 checked) and the two containers: `fromHighland` (the one Fountain entry, decoded as strict UTF-8) and `fromFadeIn` (the one OSF entry, handed to `fromOsf`). The OSF mapping lives in `@drafter/fdx` (Call 1): `fromOsf` translates the OSF tree into the Final Draft tree that `fromFdx`'s importer already reads, so forced markers, escaping, emphasis, speeches, the title page, `[[…]]` notes, and the linear-time guarantees are all reused; the importer gains a note prefix (`fdx` | `osf`) and a capped `ignored` list. `apps/web`'s `openFile` sends an archive past the text checks to `importScript`, which is `importFinalDraft` generalised; `apps/desktop` adds both extensions to `IMPORT_EXTENSIONS` (never written) and to the Open with registrations, offered, never the default.

**Tech Stack:** TypeScript, `DecompressionStream` (a platform API, not a dependency), Vue 3.5 / Nuxt 4 / Nuxt UI 4, Electron 45, Vitest 5 with fast-check, Playwright 1.64. No new third-party dependencies.

**Spec:** the maintainer's approval of 2026-10-29 (the brief this plan was written from: scope, clean room, zip safety, and the 4–6 task shape are binding); [`docs/drafter-technical-design.md`](../drafter-technical-design.md) §6.3 (`fdx`) and §14 (imported content is untrusted); Plan FD's decisions in `docs/DECISIONS.md` (`## Phase 2, Plan FD: Final Draft files`), which the OSF import follows rule for rule; the published **Open Screenplay Format specification** (the maintainer confirms which version, Call 13) and the PKWARE **APPNOTE.TXT** zip specification, both public documents.

## Global Constraints

- Branch `imports` (worktree `scratchpad/drafter-imports`), from `main` once the Structure strip and Markdown PDF export have merged and been released. Every version string in this plan written `v0.N.0` is that next minor; the controller fills it in at release.
- **Clean room (binding):** Highland is built from its archive structure as seen in files the maintainer makes with the app; Fade In from the published OSF specification and files the maintainer makes; the zip reader from APPNOTE.TXT. Never from another program's converter or zip code, and never from another repository's test files. Every fixture is hand-made in the tests, with original text. The maintainer's real `.highland` and `.fadein` files (Call 12) are used locally, through `DRAFTER_REAL_FILES`, and never committed; `.gitignore` gains `*.highland` and `*.fadein` so one can't be added by accident. What a real file showed is recorded in DECISIONS as structure only (entry names, compression methods, element and attribute names), never its text.
- **No new dependencies** (Call 2). `@drafter/archive` depends on `@drafter/fdx` (`fromOsf`, `OsfError`, `FdxImport`) only; `apps/web` adds it. `DecompressionStream('deflate-raw')` is in Chromium 103+ (Chrome, Edge, Playwright's Chromium, and Electron 45's renderer), Firefox 113+, Safari 16.4+, and Node 22 (a global there, so unit tests use the real one). Where it or its `deflate-raw` format is missing, a stored (method 0) entry still reads and a deflated one is refused with `no-inflate` (Call 6); a test stubs it away with `vi.stubGlobal('DecompressionStream', undefined)`. `docs/DEPENDENCIES.md` gets a Runtime row for `@drafter/archive` (and its `fdx` row widens) before the package lands.
- **Zip safety (binding):** at most `maxArchiveBytes` = 32 MiB read; at most `maxEntries` = 1,000 central-directory entries; an entry read only when its declared size is at most `maxEntryBytes` = 5 MiB (the script limit, `MAX_BYTES`), inflation stopped the moment output passes the declared size or the cap, and the output's size and CRC-32 checked; the declared sizes of all entries summed at most `maxTotalBytes` = 256 MiB, or the archive is refused without inflating anything. Refused outright: zip64 and split archives (Call 5), any encrypted entry, any entry name that is empty, absolute, holds `\`, NUL, or a control character, a `..` segment, or a drive letter, two entries with the same name, overlapping entry data, a local header that disagrees with its central record, and data or a directory outside the file. Only the central directory and the one entry needed are read; nothing is ever written, and no entry name is used as a path.
- **An import opens as a NEW unsaved script and never changes the source file**, exactly as a `.fdx` does: `openImported(text, name)` (no `fileName`, handle, saved hash, or baseline), never matched to an open script or a same-titled one, an `imported` snapshot through `useSnapshots().afterImport(text, name)`, and what came in said in the Export toast (`importedMessage`). In the desktop app, `.highland` and `.fadein` join `IMPORT_EXTENSIONS` (so `OPEN_EXTENSIONS`) and never `WRITE_EXTENSIONS`: the main process refuses every write to one, whatever the page asks.
- **Nothing dropped silently** (as Plan FD): an OSF paragraph style or element Drafter has no element for comes in as action with a `[[osf: Name]]` note, counted in `mapped` and listed by a new `osf-note` Problems rule (info); settings and formatting are named once each in `ignored`, which is capped at `MAX_IGNORED` = 50 names for `.fdx` and OSF alike (Call 9).
- **Untrusted input** (technical design §14): the OSF XML goes through `readXml` (strict, 5 MB, depth 64, no DTD or entities); no value can multiply the output (a style reference or a base-style chain costs a lookup, never a copy; the chain is followed at most 8 deep, Call 8); every import is linear in its input, proven by growth tests (time at 4n under 8 × time at n, plus an absolute budget) in the style of `packages/fdx/test/import.test.ts`'s "on a large file" block and the packages' `complexity.test.ts`. (There is no `packages/fdx/test/scaling.ts` yet: this plan creates `packages/fdx/test/scaling.test.ts` and `packages/archive/test/scaling.test.ts`.)
- **Export to Highland, Fade In, or OSF is out of scope** (DEFERRED), as is a bare `.osf` file and Celtx (still Phase 3).
- **Accessibility work waits for the final steps** (maintainer, 2026-10-28): no new axe tests and no accessibility task here; everything new is keyboard-usable through what already is (Open, the file input, drop, the palette); the existing axe tests (`e2e/a11y.spec.ts` and the others, `open.spec.ts`'s drop-zone axe test) stay green.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches, and `pnpm --filter @drafter/desktop e2e` for the desktop specs it touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` under a new `## Imports: Highland, Fade In, and Markdown` section (each Call below gets a line when it lands); conventional commits with **no AI co-author trailer and no session link**.

## Review Focus

1. **A Mac-made archive** carries `__MACOSX/._text.fountain` (AppleDouble) and `.DS_Store` entries beside the real script; they must not count as a second script or make the import fail. Task 2's `ignores __MACOSX and dot-files when finding the script` and Task 3's `ignores __MACOSX and dot-files when finding the document`.
2. **An entry that lies about its size** (declares 1 KB, inflates to gigabytes) stops inflating at the declared size and is refused as damaged, quickly and without the memory. Task 1's `stops inflating past the declared size and refuses the entry` and `refuses a 5 MiB-capped entry whose deflate stream would give 1 GB, in under a second`.
3. **A renamed file** (a plain Fountain text or a `.fdx` saved as `.highland` or `.fadein`, or a `.highland` renamed `.fadein`) is refused with a reason a writer understands, and nothing opens. Task 1's `refuses bytes that aren't a zip archive`; Task 4's `refuses a text file named .highland, says why, and opens nothing` and `refuses a Highland archive named .fadein`.
4. **A real file bigger than a script** because it carries resources (images, a backup) still opens: other entries are listed, not inflated, and only the 32 MiB archive cap and the 256 MiB declared total apply to them. Task 2's `reads the script from an archive whose other entries are 20 MiB stored`.
5. **Windows line breaks and a byte-order mark** in a Highland script come in as `\n` with no U+FEFF at the start, and a Latin-1 script is refused rather than mangled. Task 2's `takes off a BOM and turns CRLF into LF` and `refuses a script that isn't UTF-8`.

---

### Task 1: The zip reader (`@drafter/archive`)

**Files:**
- Create: `packages/archive/{package.json,README.md,tsconfig.json,tsdown.config.ts,vitest.config.ts}` (shaped like `packages/compare`, version 0.13.0 until release), `packages/archive/src/{index.ts,zip.ts,crc32.ts}`, `packages/archive/test/{make-zip.ts,crc32.test.ts,zip.test.ts,zip.properties.test.ts,scaling.test.ts}`
- Modify: `vitest.shared.ts` (`'archive'` in `packages`), `apps/web/nuxt.config.ts` (`archive` in the `@drafter/(…)` source alias), `apps/web/package.json` (`"@drafter/archive": "workspace:*"`), `docs/DEPENDENCIES.md` (the `@drafter/archive` Runtime row: depends on `@drafter/fdx`, from Task 3; `DecompressionStream` is the platform's), `.gitignore` (`*.highland`, `*.fadein`)

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
// test/make-zip.ts (tests only; Node's zlib.deflateRawSync for deflate)
export interface MakeEntry { name: string; data: Uint8Array | string; method?: 0 | 8; flags?: number;
  declaredSize?: number; declaredCrc?: number; localName?: string; extra?: Uint8Array }
export function makeZip(entries: MakeEntry[], options?: { comment?: string; zip64Locator?: boolean;
  disk?: number; prefix?: Uint8Array; overlap?: [number, number] }): Uint8Array;
```

- **Call (Call 2):** the reader is Drafter's own, not a dependency: listing is a few hundred lines over APPNOTE's three records (end of central directory, central file header, local file header), and inflate is the platform's. A library would bring writing, zip64, encryption, and streaming from disk, all of which Drafter refuses anyway.
- **Call (Call 3):** the end record is the last `PK\5\6` in the final 65,557 bytes whose comment runs exactly to the file's end; the central directory must end where the end record starts (no prepended data: a self-extracting archive is `not-zip`), and its record count must equal the end record's.
- **Call (Call 4):** an encrypted entry (flag bit 0 or bit 6) anywhere refuses the whole archive (an app's own file never has one). A name rule broken by any entry refuses the whole archive too, even an entry Drafter would not read.
- **Call (Call 5):** zip64 is refused (`zip64`): any `0xFFFF`/`0xFFFFFFFF` field in the end record or a central record, or a zip64 end locator (`PK\6\7`) before the end record. A script archive is far below 4 GB. A disk number other than 0 is `split`.
- **Call (Call 6):** `readEntry` streams the compressed bytes through `new DecompressionStream('deflate-raw')`, counts output chunk by chunk, and `cancel()`s the reader the moment the count passes `entry.size` (`damaged`) or `maxEntryBytes` (`entry-too-big`); an entry declared over `maxEntryBytes` is refused before anything inflates. A stream error (truncated data, junk after the end) is `damaged`; so is a size or CRC-32 mismatch. Where `DecompressionStream` is undefined or throws for `'deflate-raw'`, a method-8 entry is `no-inflate`. A method other than 0 or 8 is `method`.

- [ ] **Step 1: Write the failing tests.** `crc32.test.ts`: `gives 0xCBF43926 for "123456789"` (the standard check value), `gives 0 for no bytes`. `zip.test.ts` (each archive made by `makeZip`, with text of the tests' own): `lists a stored and a deflated entry with their names and sizes`, `reads a stored entry and a deflated one back exactly`, `reads a UTF-8 name when flag bit 11 is set, and a Latin-1 one when not`, `lists folders as directory entries`, `refuses bytes that aren't a zip archive` (a Fountain text, a `.fdx`, empty bytes, 21 bytes), `refuses an archive over 32 MiB without reading it`, `refuses more than 1,000 entries`, `refuses an archive whose declared sizes sum past 256 MiB`, `refuses zip64` (the locator; a `0xFFFFFFFF` size), `refuses a split archive`, `refuses an archive holding any encrypted entry`, `refuses unsafe names` (each of `/etc/x`, `a/../b`, `..`, `C:x`, `a\\b`, a NUL, a control character, an empty name), `refuses two entries with the same name`, `refuses overlapping entries`, `refuses a local header whose name differs from its central record`, `refuses data that runs past the central directory`, `refuses prepended data`, `finds the end record past a comment, and not one inside the comment`, `refuses an entry declared over 5 MiB before inflating`, `stops inflating past the declared size and refuses the entry`, `refuses a CRC-32 mismatch`, `refuses junk after a deflate stream`, `refuses a method it doesn't read`, `reads a stored entry and refuses a deflated one where DecompressionStream is missing` (`vi.stubGlobal`). `zip.properties.test.ts` (fast-check): `makeZip then listZip and readEntry gives the entries back` (names from a safe alphabet, data up to 4 KB, both methods), `any bytes list or throw a ZipError, never anything else`, `changing any one byte of a valid archive reads the same, or throws a ZipError`. `scaling.test.ts`: `listing grows linearly with the entry count` (250 vs 1,000 entries: time at 4n under 8 × time at n + 20 ms), `finds no end record in 32 MiB of junk in under 100 ms` (the search is bounded), `refuses a 5 MiB-capped entry whose deflate stream would give 1 GB, in under a second`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/archive test` → FAIL (no package).
- [ ] **Step 3: Implement** `crc32`, `listZip`, `readEntry`, and the workspace edges; `ZipError`'s `message` is the reason in plain words (Task 4 reads `reason`, not the message).
- [ ] **Step 4: Run them again,** and `pnpm -r typecheck`. → PASS.
- [ ] **Step 5: Commit.** `feat(archive): a strict read-only zip reader`

---

### Task 2: Highland files (`@drafter/archive`)

**Files:**
- Create: `packages/archive/src/{errors.ts,highland.ts,text.ts}`, `packages/archive/test/{highland.test.ts,real-files.test.ts}`
- Modify: `packages/archive/src/index.ts`, `packages/archive/README.md`

**Interfaces (Consumes):** `listZip`, `readEntry`, `ZipEntry`, `ZipError` (Task 1). **(Produces):**
```ts
// errors.ts
export type ArchiveFormat = 'Highland' | 'Fade In';
export type ArchiveReason = ZipReason | 'no-script' | 'many-scripts' | 'not-utf8' | 'not-osf';
/** message: `This isn’t a ${format} file Drafter can read: ${words for reason}` (Task 4's copy table). */
export class ArchiveError extends Error { readonly format: ArchiveFormat; readonly reason: ArchiveReason; readonly detail?: string }
// text.ts
/** Strict UTF-8 (`not-utf8` otherwise), a leading BOM taken off, `\r\n` and `\r` made `\n`. */
export function scriptText(bytes: Uint8Array, format: ArchiveFormat): string;
/** The entries that can hold the document: not a directory, not under `__MACOSX/`, no segment starting with `.`. */
export function candidates(entries: readonly ZipEntry[], extension: RegExp): ZipEntry[];
/** The one to read: the only candidate, else the only one at the shallowest depth; else throws `no-script` / `many-scripts`. */
export function pickEntry(found: readonly ZipEntry[], format: ArchiveFormat): ZipEntry;
// highland.ts
export interface HighlandImport { text: string; title: null; mapped: []; ignored: [] } // the same shape as FdxImport
export function fromHighland(bytes: Uint8Array): Promise<HighlandImport>;
```

- **Step 0 (before the tests): look at the maintainer's real file** (Call 12). `unzip -l` and `unzip -v` on it, locally; record in DECISIONS only the entry names (with the script's text replaced by its length), their methods, and whether names carry flag bit 11. The provisional rule below is then confirmed or narrowed (for example, to a fixed entry name), and the fixtures in `highland.test.ts` copy that structure with text of their own.
- **Call (Call 10):** the script is the one `.fountain` entry (`/\.fountain$/i`) among `candidates`, by `pickEntry`; nothing else in the archive is read or said (an app's own resources are not the writer's text). `title` is null: `openImported` titles the script from its title page, or after the file.
- **Call (Call 11):** the text comes in exactly as Highland wrote it: it is already Fountain, so it gets no escaping and no notes; Drafter's parser and Problems read it like any opened file.

- [ ] **Step 1: Write the failing tests.** `highland.test.ts` (archives by `makeZip`, shaped as Step 0 found): `reads the Fountain script out of a Highland archive`, `reads it stored or deflated`, `takes off a BOM and turns CRLF into LF`, `refuses a script that isn't UTF-8` (`not-utf8`), `ignores __MACOSX and dot-files when finding the script`, `takes the shallowest script when one sits deeper too`, `refuses an archive with no script` (`no-script`), `refuses two scripts at the same depth` (`many-scripts`), `reads the script from an archive whose other entries are 20 MiB stored`, `never reads an entry but the script` (a spy on `readEntry`), `wraps a ZipError as an ArchiveError naming Highland, with the zip reason`. `real-files.test.ts`: `imports the maintainer's Highland file` and (Task 3) `…Fade In file`, each `it.skipIf(!process.env.DRAFTER_REAL_FILES)`, reading `${DRAFTER_REAL_FILES}/real.highland` and asserting a non-empty text that `parse` reads with at least one scene heading.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again;** then, locally only, `DRAFTER_REAL_FILES=<folder> pnpm --filter @drafter/archive test real-files`. → PASS.
- [ ] **Step 5: Commit.** `feat(archive): read the script out of a Highland file`

---

### Task 3: Open Screenplay Format and Fade In files (`@drafter/fdx`, `@drafter/archive`, `@drafter/lint`)

**Files:**
- Create: `packages/fdx/src/osf.ts`, `packages/fdx/test/{osf.test.ts,osf.properties.test.ts,scaling.test.ts,osf-fixtures.ts}`, `packages/archive/src/fadein.ts`, `packages/archive/test/fadein.test.ts`, `packages/lint/src/rules/osf.ts`
- Modify: `packages/fdx/src/import.ts` (the importer takes a source: note prefix, ignored set; `MAX_IGNORED`), `packages/fdx/src/index.ts`, `packages/fdx/package.json` (description: Final Draft files and Open Screenplay Format import), `packages/fdx/README.md` (an "Open Screenplay Format" section), `packages/fdx/test/import.test.ts` (the cap), `packages/archive/src/index.ts`, `packages/archive/package.json` (`"@drafter/fdx": "workspace:*"`), `packages/lint/src/rules/fdx.ts` (one `importNote(id, prefix, app)` maker for both rules), `packages/lint/src/run.ts` (`osfNote` after `fdxNote`), `packages/lint/test/rules.test.ts`, `packages/lint/test/run.test.ts`

**Interfaces (Consumes):** `readXml`, `XmlElement`, `XmlError`, the importer in `import.ts`; `listZip`, `readEntry`, `candidates`, `pickEntry`, `scriptText`, `ArchiveError` (Tasks 1–2). **(Produces):**
```ts
// import.ts (internal, not exported from index.ts)
interface ImportSource { prefix: 'fdx' | 'osf'; ignored: ReadonlySet<string> }
export function importTree(root: XmlElement, source: ImportSource): FdxImport; // fromFdx = readXml + importTree(…, { prefix: 'fdx', ignored: IGNORED })
export const MAX_IGNORED = 50; // past it, further names are not added
// osf.ts (exported from index.ts)
export type OsfImport = FdxImport;
export class OsfError extends Error { readonly reason: string } // message: `This isn’t an Open Screenplay Format document: ${reason}`
export const OSF_IGNORED: ReadonlySet<string>; // the spec's settings and formatting elements (Step 0)
/** The OSF tree as the Final Draft tree importTree reads; text and the attributes it maps only. */
export function osfToFdxTree(root: XmlElement): { tree: XmlElement; ignored: string[] };
export function fromOsf(xml: string): OsfImport;
// fadein.ts
export function fromFadeIn(bytes: Uint8Array): Promise<OsfImport>; // the one .xml entry, strict UTF-8, fromOsf; OsfError → ArchiveError('Fade In', 'not-osf', detail)
// lint rules/osf.ts
export const osfNote: Rule; // id 'osf-note', info: “This came in from Fade In as ‘X’, which Drafter has no element for. Check it, then delete the note.”
```

- **Step 0 (before the tests): read the published OSF specification** (Call 13) and the maintainer's real `.fadein` (Call 12) locally. Record in DECISIONS the element and attribute names used for: the root and its version, paragraphs, a paragraph's style (and how a named style resolves to a base style), text runs and their bold, italic, and underline, alignment, page breaks, scene numbers, dual dialogue, scene synopses or summaries, notes, and the title page; and which elements hold settings (`OSF_IGNORED`). The archive's entry name and method go in too. The names below are provisional, from the format's public description, and are corrected to the spec before any fixture is written; the fixtures in `osf-fixtures.ts` are hand-written OSF in the spec's shape, with text of the tests' own.
- **Call (Call 1):** OSF lives in `@drafter/fdx`, not a new `@drafter/osf`. `osfToFdxTree` makes the tree `importTree` already reads (`FinalDraft` › `Content` › `Paragraph Type=… StartsNewPage Number Alignment` › `Text Style="Bold+Italic+Underline"`, `DualDialogue`, `SceneProperties Summary`, `TitlePage`), so every rule Plan FD proved (forced markers, escaping, speeches, the title page by order, notes kept whole, linear time) holds for OSF unchanged. A separate package would have to duplicate the ~700-line writer or make it public across a package boundary. The package keeps its name; its README and description say it reads OSF too.
- **Call (Call 7):** the adapter copies **no attribute through**: it writes only the attributes it maps, so an OSF file can't set `DrafterSection`, `DrafterNote`, or any other mark of Drafter's own. An OSF note element (if the spec has one) is the one deliberate `General` + `DrafterNote="Yes"` it writes, its text the note's.
- **Call (Call 8):** a paragraph's style is its base style name, read through `<styles>` (provisional: a named style's `basestylename`), followed at most 8 deep with a seen-set; a cycle, a missing style, or a chain past 8 is the unresolved name, which comes in through the unmapped path. Base styles map by name: Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, and centered text (alignment) to Final Draft's same-named types; anything else (General, Cast List, act breaks, a custom style) is its name as `Type`, so it becomes action with `[[osf: Name]]`, counted in `mapped`.
- **Call (Call 9):** `ignored` is capped at `MAX_IGNORED` = 50 names in the shared importer, so `.fdx` gets the cap too (a real file names well under 20). Run-level formatting the mapping doesn't keep (strikeout, font, color, highlight; provisional names) is named once each in `ignored`, as `text@strikeout` and the like.

- [ ] **Step 1: Write the failing tests.** `osf.test.ts`: `maps every base style of the fixture to its Fountain kind`, `resolves a named style through its base style`, `brings an unknown style in as action with an [[osf: Name]] note, counted`, `brings an element holding text in as a note, and lists settings once in ignored`, `keeps bold, italic, and underline as Fountain emphasis`, `lists strikeout and fonts in ignored`, `writes a page break before its paragraph`, `keeps a scene number Fountain can hold, and notes one it can't`, `keeps dual dialogue with a ^` (if the spec has it; else `writes two speeches one after the other`), `keeps a scene summary as = lines`, `reads the title page by its order`, `never reads a Drafter mark from an OSF attribute`, `forces a paragraph whose plain text would read as another kind` (one per marker, as `import.test.ts` does), `refuses XML the reader refuses, wrapping its error`, `refuses XML that isn't an OSF document`, `follows a base-style chain at most 8 deep and stops at a cycle`. `import.test.ts`: `lists at most 50 ignored names`. `osf.properties.test.ts` (fast-check over generated OSF documents of the fixture's styles and runs): `never throws but OsfError`, `keeps each paragraph in its kind, or counts it as a note` (as `fromFdx: any file`), `the text is at most 4 × the XML's length + 64` (no amplification). `scaling.test.ts`: `fromOsf grows linearly` (1 MB vs 4 MB of paragraphs: under 8 × + 20 ms), `reads 5 MB of unclosed [[ in one paragraph within 3 seconds`, `one style referenced by 100,000 paragraphs costs no more than plain paragraphs` (within 2 × of the same file with no `<styles>`), `a 5 MB file of 1,000-deep style chains stays within 3 seconds`. `fadein.test.ts`: `reads the OSF document out of a Fade In archive`, `ignores __MACOSX and dot-files when finding the document`, `refuses an archive with no document`, `wraps an OsfError as an ArchiveError naming Fade In`, `refuses a Highland archive` (`no-script`: no `.xml`). `rules.test.ts`: `osf-note lists every [[osf: …]] note, and none in a boneyard`, `fdx-note still lists only fdx notes`. `run.test.ts`: `runs osf-note in both templates`.
- [ ] **Step 2: Run them.** `pnpm --filter @drafter/fdx test`, `pnpm --filter @drafter/archive test`, `pnpm --filter @drafter/lint test` → FAIL.
- [ ] **Step 3: Implement:** first the `importTree` / `ImportSource` change with the whole existing `fdx` suite green (the round-trip property included), then `osf.ts`, `fadein.ts`, and the rule.
- [ ] **Step 4: Run them again,** plus `real-files.test.ts` locally with `DRAFTER_REAL_FILES`. → PASS.
- [ ] **Step 5: Commit.** `feat(fdx): import Open Screenplay Format, and Fade In files through it`

---

### Task 4: Opening them in the app and the desktop app

**Files:**
- Modify (web): `apps/web/app/markdown/kind.ts` (`importKindOf`; `isFinalDraftName` becomes `isImportName`), `apps/web/app/storage/open.ts` (`importScript`, the archive branch, the copy table), `apps/web/app/storage/files.ts` (picker types and the file input's `accept`), `apps/web/app/storage/desktop-files.ts` (no "opened as a new script" notice for any import), `apps/web/app/storage/script.ts` and `projects.ts` (doc comments: "the Final Draft, Highland, or Fade In file"), `apps/web/app/components/DropZone.vue` (both strings)
- Modify (desktop): `apps/desktop/src/files.ts` (`IMPORT_EXTENSIONS`), `apps/desktop/src/files-ipc.ts` (`OPEN_FILTERS`), `apps/desktop/src/open-files.ts` (`NOT_A_SCRIPT`), `apps/desktop/electron-builder.config.cjs` (`SCRIPT_TYPES`), `apps/desktop/installer/windows.nsh`, `docs/desktop-install-linux.md` (the Open with sentence names the new types)
- Tests: `apps/web/test/{open.test.ts,files.test.ts,desktop-files.test.ts}`, `apps/web/e2e/imports.spec.ts` (new; zips from `packages/archive/test/make-zip.ts` by relative import, put with `putFile(page, name, number[])`), `apps/desktop/test/{grants.test.ts,files.test.ts,open-files.test.ts,update-feed.test.ts}`, `apps/desktop/e2e/{imports.spec.ts,packaged.spec.ts}`

**Interfaces (Consumes):** `fromHighland`, `fromFadeIn`, `ArchiveError` (Tasks 2–3), `fromFdx`, `FdxError`. **(Produces):**
```ts
// markdown/kind.ts
export type ImportKind = 'fdx' | 'highland' | 'fadein';
export function importKindOf(name: string | undefined): ImportKind | null; // by extension, any case
export function isImportName(name: string | undefined): boolean;
// storage/open.ts (internal)
async function importScript(name: string, run: () => FdxImport | Promise<FdxImport>): Promise<void>; // importFinalDraft generalised: FdxError | ArchiveError → say(openError, message)
```

- **Order in `openFile`** (Call 14): after the read-only check, a `.highland` or `.fadein` goes straight to `importScript` with the file's bytes, skipping `problemWith` (a zip has NUL bytes, and its size cap is the archive's 32 MiB, `listZip`'s `too-big`) and `decodeFile` (the entry is decoded inside, strictly). A `.fdx` keeps its path through both checks.
- **Copy** (Drafter's own words; `ArchiveError.message` builds these): "This isn’t a Highland file Drafter can read: " / "This isn’t a Fade In file Drafter can read: " then — `not-zip` "it isn’t a zip archive." · `too-big` "it is larger than 32 MB." · `too-many-entries` "it holds more than 1,000 files." · `too-big-unpacked` "it unpacks to more than 256 MB." · `zip64` / `split` "it is stored in a form Drafter doesn’t read." · `encrypted` "it is encrypted." · `unsafe-name` "it holds a file with an unsafe name." · `duplicate-name` "it holds two files with the same name." · `damaged` "it is damaged." · `method` "its script is compressed in a way Drafter doesn’t read." · `entry-too-big` "its script is larger than 5 MB." · `no-inflate` "this browser can’t unpack it. Try a current browser, or the Drafter app." · `no-script` "it holds no script." · `many-scripts` "it holds more than one script." · `not-utf8` "its script isn’t UTF-8 text." · `not-osf` "its document isn’t one Drafter can read (" + detail + ")." The toast is `importedMessage` unchanged ("Imported “Lamp.highland”."), with the notes count for Fade In.
- **Picker and input** (Call 15): `showOpenFilePicker`'s one type becomes "Script, Markdown document, or a Final Draft, Highland, or Fade In file", adding `'application/zip': ['.highland', '.fadein']`; the input's `accept` adds `.highland,.fadein`. The drop zone says "Drop a .fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein file to open it" and its refusal "That isn’t a file Drafter can open. Drop a .fountain, .md, .markdown, .txt, .fdx, .highland, or .fadein file." The desktop Open filter is named the same as the picker and lists all seven extensions; `NOT_A_SCRIPT` lists them too.
- **Desktop writes** (binding): `IMPORT_EXTENSIONS = ['.fdx', '.highland', '.fadein']`; `WRITE_EXTENSIONS` is unchanged, so a `.highland` or `.fadein` is refused by its first check and by the imported-file check after it. A script saved under such a name gets `.fountain` after it (`saveTarget`, already).
- **Open with** (Call 16): `SCRIPT_TYPES` gains `{ ext: 'highland', name: 'Highland document', mimeType: 'application/x-highland', role: 'Viewer', rank: 'Alternate' }` and `{ ext: 'fadein', name: 'Fade In document', mimeType: 'application/x-fadein', role: 'Viewer', rank: 'Alternate' }` (one extension per entry, as the `.deb` needs); `windows.nsh` writes and removes `Drafter.highland` and `Drafter.fadein` ProgIDs in `OpenWithProgids` exactly as `Drafter.fdx`; `win.fileAssociations` stays `.fountain` only. Offered everywhere, the default nowhere.

- [ ] **Step 1: Write the failing tests.** `open.test.ts` (`describe('importing a Highland or Fade In file')`, a bytes variant of `t.picked`): `opens a .highland as a new Fountain script with no file, unsaved`, `opens a .fadein the same way and says how many items came in as notes`, `never sniffs an archive for NUL bytes or decodes it as text`, `refuses a damaged archive, says why, and opens nothing`, `imports the same file twice as two scripts`, `takes an imported snapshot named after the file`, `opens nothing in a read-only tab`. `files.test.ts`: `the file input accepts every type Drafter opens` (exactly `.fountain,.txt,.md,.markdown,.fdx,.highland,.fadein,text/plain,text/markdown`). `desktop-files.test.ts`: `says no "opened as a new script" notice for a .highland or .fadein`. `imports.spec.ts` (web): `opens a Highland file from the picker as a new, unsaved script, and Save asks for a .fountain` (and the `.highland` bytes unchanged), `opens a dropped Fade In file, and Problems lists what came in as a note`, `opens one from the file input`, `refuses a text file named .highland, says why, and opens nothing`, `refuses a Highland archive named .fadein`. `grants.test.ts`: `never writes a .highland or .fadein, even one the writer opened`. `files.test.ts` (desktop): `a script saved as x.highland is saved as x.highland.fountain`. `open-files.test.ts`: the `NOT_A_SCRIPT` strings, and `grants a .highland and a .fadein named on the command line`. `update-feed.test.ts`: Linux and macOS list `['fountain', 'md', 'markdown', 'fdx', 'highland', 'fadein']`, both new ones `Viewer`/`Alternate`, Windows still `.fountain` only. `apps/desktop/e2e/imports.spec.ts`: `imports a Highland file named on the command line as a new script, and never writes it`, `imports a dropped Fade In file`. `packaged.spec.ts` (`.deb`): the desktop entry lists `application/x-highland` and `application/x-fadein`; the MIME file has `*.highland` and `*.fadein` globs.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `fdx.spec.ts`, `open.spec.ts` (its drop-zone axe test included), and the desktop `fdx.spec.ts` and `files.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `feat(web,desktop): open Highland and Fade In files as new scripts`

---

### Task 5: Markdown, listed and tested as an import

Markdown already opens as a Markdown document (`kindOfFileName`, `openFile`), is in the picker, the file input, the desktop Open filter, and Open with on all three systems (`SCRIPT_TYPES`, `windows.nsh`), and **New screenplay from this outline** already turns a Markdown outline into a screenplay. Nothing new is built; this task makes every place that names file types name it, pins each with a test, and writes the help.

**Files:**
- Modify: `apps/web/app/pages/docs/saving.vue` (sections, and its description), `apps/web/e2e/markdown.spec.ts`, `apps/desktop/e2e/open-from-system.spec.ts`, `apps/web/test/desktop-files.test.ts`

- **Call (Call 17):** the help stays on **Saving and your browser** (no new page): `Final Draft files` becomes `Files from other apps` (`id="other-apps"`, with `id="final-draft"` kept on its Final Draft paragraph so old links land), with three parts: **Final Draft** (as now), **Highland and Fade In** (opened the same way, a new script, the file never changed; Highland's script comes in as written; Fade In's as Final Draft's does, with `[[osf: …]]` notes Problems lists; Fade In's settings left out), and **Markdown** (a `.md` or `.markdown` opens as a Markdown document and saves back to its file; **New screenplay from this outline** in the palette or File menu makes a screenplay from a Markdown outline, each heading a scene stub Problems lists). The page's description names the imports and stays under 200 characters (`docs.spec.ts`).

- [ ] **Step 1: Write the failing tests.** `markdown.spec.ts`: `opens a dropped .md and a dropped .markdown file as Markdown`, `the picker and the file input offer .md and .markdown`, `turns an opened Markdown outline into a screenplay with New screenplay from this outline` (a `.md` with three `##` headings opened from the input, then the command: a new Fountain script with three scene stubs, and the `.md` script unchanged). `open-from-system.spec.ts`: `opens a .markdown file named on the command line as Markdown`. `desktop-files.test.ts`: `opens a .md and a .markdown in place, with no notice`.
- [ ] **Step 2: Run them.** → the copy and section tests FAIL; the behaviour tests should PASS at once (record which, in the commit body, since this task pins existing behaviour).
- [ ] **Step 3: Write the help sections.**
- [ ] **Step 4: Run them again,** plus `docs.spec.ts`. → PASS.
- [ ] **Step 5: Commit.** `docs(web): help for files from other apps, and Markdown as an import`

---

### Task 6: Docs and release prep

**Files:**
- Modify: `README.md`, `packages/archive/README.md`, `packages/fdx/README.md`, `docs/DECISIONS.md`, `docs/DEFERRED.md`, `docs/drafter-technical-design.md` (§6.3 and §14), `docs/drafter-architecture.md` and `docs/drafter-phase1-design.md` (their Phase 3 lines: Celtx only), `CHANGELOG.md`

- **README:** the status note adds "Highland and Fade In files (open one as a new script)" beside Final Draft files; the Roadmap's Phase 2 Final Draft line or a new line says Highland, Fade In, and Markdown imports are built in v0.N.0; **Phase 3's first line becomes "Import from Celtx."** (Highland and Fade In move out), and its table row's "other apps' imports" becomes "Celtx import"; the Packages table gains `| @drafter/archive | Highland and Fade In files: a strict read-only zip reader, and the script inside each | 2 (built in the imports release) |`, and `@drafter/fdx`'s row reads "Final Draft (`.fdx`) import and export, and Open Screenplay Format import"; the Phase 1 "Builds" line that names Open's formats names the new ones.
- **Technical design:** §6.3 gains "Open Screenplay Format is read by translating its tree into the Final Draft tree (`osfToFdxTree`), so `[[osf: …]]` notes follow the same rules"; §14 gains the zip rules (one sentence: caps, refusals, only the needed entry read, nothing written).
- **DEFERRED** (a new `## Imports: Highland, Fade In, and Markdown` section): export to Highland, Fade In, or OSF (when asked for); a bare `.osf` file (when asked for); zip64 archives (if a real file ever needs one); Highland's other entries are not read or said (Call 10); OSF's revisions, colors, and fonts (as Final Draft's); import on the main thread (as Plan FD); testing against more real files than the maintainer's one of each.

- [ ] **Step 1: Write the docs:** every Call below in DECISIONS (each with the date, and Step 0's structure notes from Tasks 2 and 3); DEFERRED as above; the package READMEs (`@drafter/archive`: its API, its limits, and "refuses, never repairs").
- [ ] **Step 2: Check the CHANGELOG** has one `[Unreleased]` entry per task (Added: `@drafter/archive`; Highland import; OSF and Fade In import; `osf-note`; the desktop's Open with; Changed: the picker, input, drop zone, and filter list the new types; `ignored` is capped at 50; Help: Files from other apps).
- [ ] **Step 3: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with the existing axe tests green; `git status` shows no `.highland` or `.fadein` file.
- [ ] **Step 4: Commit.** `docs: Highland, Fade In, and Markdown imports`
- [ ] **Step 5: Push** `imports` and watch CI. Don't merge or tag: the controller releases v0.N.0.

---

## Calls in this plan

For the maintainer to review; each gets a DECISIONS line when it lands. **Departs from the roadmap:** Highland and Fade In move from Phase 3 into this release (approved 2026-10-29), leaving Celtx in Phase 3 (flagged ◆). **Departs from the brief:** none; Call 9 (the cap on `ignored` reaching `.fdx` too) and Call 14 (archives skip the 5 MB file cap for a 32 MiB archive cap) are the two the maintainer should look at first.

1. **OSF lives in `@drafter/fdx`, not a new `@drafter/osf`,** read by translating its tree into the Final Draft tree the importer reads, so every Plan FD rule and guarantee is reused (Task 3).
2. **The zip reader is Drafter's own,** in a new package `@drafter/archive`, with inflate from the platform's `DecompressionStream('deflate-raw')`; no dependency (Task 1).
3. **The end record must close the file and the central directory must meet it:** no prepended data, counts must agree (Task 1).
4. **An encrypted entry or an unsafe name anywhere refuses the whole archive,** even an entry Drafter wouldn't read (Task 1).
5. **zip64 and split archives are refused** (Task 1; DEFERRED if a real file needs zip64).
6. **Inflation stops at the declared size or 5 MiB,** size and CRC-32 checked; where `deflate-raw` is missing, stored entries read and deflated ones are refused with a message (Task 1).
7. **The OSF adapter copies no attribute through,** so a file can't set a Drafter mark (Task 3).
8. **Base styles resolve at most 8 deep;** a cycle, a missing style, or a deeper chain comes in as an `[[osf: Name]]` note (Task 3).
9. **`ignored` is capped at 50 names, for `.fdx` too** (Task 3).
10. **Highland's script is its one `.fountain` entry** (shallowest wins; `__MACOSX/` and dot-files skipped), confirmed against the maintainer's file; nothing else in the archive is read or said (Task 2).
11. **Highland's text comes in as written,** with no escaping or notes: it is already Fountain (Task 2).
12. **One real `.highland` and one real `.fadein`, made by the maintainer with each app,** used locally through `DRAFTER_REAL_FILES`, never committed (`.gitignore` gains both extensions); DECISIONS records their structure, never their text (Tasks 2, 3). *The maintainer is asked to supply them before Task 2 starts.*
13. **The OSF mapping is built from the published OSF specification,** whose version and link the maintainer confirms before Task 3; element names in this plan are provisional until then (Task 3).
14. **Archives skip the text checks** (NUL sniff, strict decode, 5 MB) and have their own: a 32 MiB archive, a 5 MiB script inside (Task 4).
15. **One picker type and one file input list every format,** and the drop zone names all seven extensions (Task 4).
16. **`.highland` and `.fadein` are offered in Open with, never the default:** macOS `Viewer`/`Alternate`, Windows `OpenWithProgids`, Linux MIME types `application/x-highland` and `application/x-fadein` declared by the `.deb` (Task 4).
17. **The help stays on Saving and your browser,** as one Files from other apps section with Final Draft, Highland and Fade In, and Markdown (Task 5).
18. ◆ **Highland and Fade In leave Phase 3;** Phase 3 keeps Celtx (Task 6).
