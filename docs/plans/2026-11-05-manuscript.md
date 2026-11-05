# Manuscript Exports Implementation Plan (v0.26.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A novel exports as a standard manuscript, as a PDF and as a Word file, after a Manuscript details dialog whose answers are kept in the book.

**Architecture:**
- `@drafter/novel` gains the kept details (`novel.manuscript` in the metadata comment) and `manuscriptOf`, which turns the Markdown tree and the details into one format-free description (`Manuscript`: blocks of parts, chapters, breaks, and paragraphs of styled runs).
- `@drafter/render-pdf` lays that description out on pages and draws it (`renderManuscriptPdf`), with Liberation Serif or Courier Prime.
- A new package, `@drafter/render-docx`, writes the same description as a `.docx` by hand (`renderManuscriptDocx`), zipped with `@drafter/archive`'s `zipStored`.
- The web app adds two export kinds, made in the export worker, and a dialog before them.

**Tech Stack:** TypeScript, pnpm workspace, Vitest and fast-check, pdf-lib with fontkit, Nuxt 4 / Vue 3.5 / Nuxt UI 4, CodeMirror 6, Playwright (five projects, and the desktop app's), Biome.

**Spec:** `docs/drafter-manuscript-design.md` (approved 2026-11-05, choice 1: one `PAGE` field in the Word file's header).

## Global Constraints

- **Only for a novel:** a Markdown document whose meta says `"template": "novel"` (`isNovel`, `apps/web/app/novel/kind.ts`). A script or a plain Markdown document never offers or runs these exports.
- **The format:** 12 pt; double-spaced (PDF line height 24 pt; Word `w:line="480" w:lineRule="auto"`); 1-inch margins (72 pt; 1440 twips); first-line indent half an inch (36 pt; 720 twips) on every paragraph; left-aligned; no space between paragraphs.
- **Paper:** the existing Markdown PDF setting (`settings.markdownPaper`: `letter` or `a4`). Letter 612 × 792 pt (12240 × 15840 twips); A4 595.28 × 841.89 pt (11906 × 16838 twips).
- **Fonts:** `times` (default): Liberation Serif in the PDF, `Times New Roman` named in the Word file. `courier`: Courier Prime in the PDF, `Courier New` named in the Word file.
- **The header:** `Surname / SHORT TITLE / N`, right-aligned, half an inch from the top, on every page but the title page; parts left out when empty (`SHORT TITLE / N`, or `N`). The title page is page 1.
- **The Word file's only field** is one `PAGE` field (`w:fldSimple w:instr=" PAGE "`) in `word/header1.xml`. No `w:instrText`, no `w:fldChar`, no other `w:fldSimple`, no `updateFields` in `word/settings.xml`, no relationship with `TargetMode="External"`.
- **Nothing is fetched** but the app's own font files from its own origin. Images are never loaded.
- **The text is never changed:** every character of a paragraph reaches both files (the PDF prints a character its font lacks as `?` and names it in the toast; the Word file keeps it). Quotes are not straightened.
- **File names:** `<title> – manuscript.pdf` and `<title> – manuscript.docx` (an en dash with a space each side), from `fileNameFor`.
- **Clean room:** fixtures and the sample text are original. No other app's code, templates, or files; Liberation Serif is used under its own licence (SIL OFL 1.1).
- **Process:** every package `src` change has a Vitest test; every UI change a Playwright test in all five projects; browser tests named with "long task", "quickly", "budget", or "within" are skipped on CI; the CHANGELOG is updated with each task's commit; a UI label added or renamed is checked in `apps/web/e2e`, `apps/web/test`, and `apps/desktop/e2e`.

## Review Focus

1. **XML-looking text in a novel or in the details** (`<w:fldChar/>`, `]]>`, `&amp;`, a NUL, U+FFFE) must come out as text in the Word file, never as XML, and never add a field. Test in Task 4: `renderManuscriptDocx` on a manuscript whose title, contact, and a paragraph hold these; every part parses, and the field count stays one.
2. **A huge book** (20,000 chapters, or one 2 MB paragraph) exports both files without throwing and within time. Trap and timed test in Task 7.
3. **A novel with no chapters at all** (prose with no `#`), or a chapter with no text, exports: the first page after the title page holds the prose, and an empty chapter is just its title. Test in Task 2.
4. **Blank details** (no byline, no contact, no surname) leave those lines off the title page and the header, never print "undefined" or a stray `/`. Tests in Tasks 3 and 4.
5. **The dialog saved while the editor can't be changed** (a read-only tab) still exports, with the answers used but not kept, and says why they weren't kept. Browser test in Task 6.

---

### Task 1: The manuscript details, kept in the book

**Files:**
- Modify: `packages/novel/src/facts.ts`, `packages/novel/src/index.ts`
- Test: `packages/novel/test/facts.test.ts` (extend)

**Interfaces:**
- Produces:
  - `export type ManuscriptFont = 'times' | 'courier'`
  - `export interface ManuscriptDetails { title?: string; byline?: string; legalName?: string; contact?: string[]; surname?: string; shortTitle?: string; font?: ManuscriptFont }`
  - `NovelFacts` gains `manuscript?: ManuscriptDetails`, stored as `novel.manuscript` in the comment.
  - `export const MAX_DETAIL = 300` (characters of one field or one contact line), `export const MAX_CONTACT_LINES = 10`.

- [ ] **Step 1: Write the failing tests** in `facts.test.ts`:
  - `reads and writes the manuscript details`: `writeFacts` then `readFacts` round-trips `{ title: 'The Salt Road', byline: 'R. Vale', contact: ['1 Quay Lane', 'r@vale.example'], font: 'courier' }`, and the comment holds `"manuscript":{…}` under `"novel"`.
  - `drops what isn't a detail`: a comment whose `manuscript` is `"x"`, `[]`, or `{ "font": "comic", "contact": "one line", "__proto__": {"x":1}, "title": 7 }` reads as `{}` or with only the valid keys; never throws.
  - `caps the details`: a 10,000-character title reads as its first `MAX_DETAIL` characters (cut on a code-point boundary, as `capSynopsis` does); 50 contact lines read as the first `MAX_CONTACT_LINES`; a contact line holding `\n` is split, not kept with the break.
  - `keeps the details through a carry`: `carryFacts` after a chapter rename keeps `manuscript` unchanged.
  - Empty strings and an empty contact list are dropped, and `writeFacts` with `manuscript: {}` writes no `manuscript` key.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @drafter/novel exec vitest run test/facts.test.ts`
Expected: FAIL on the new tests (`manuscript` is unknown).

- [ ] **Step 3: Implement** the reading (a `manuscript(value: unknown): ManuscriptDetails | undefined` beside `target`), the writing, and the carry in `facts.ts`; export the new names from `index.ts`.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @drafter/novel exec vitest run`
Expected: PASS, every test in the package.

- [ ] **Step 5: Commit** (with a CHANGELOG line under Unreleased, "For contributors").

---

### Task 2: The manuscript, described once

**Files:**
- Create: `packages/novel/src/manuscript.ts`
- Modify: `packages/novel/src/index.ts`
- Test: `packages/novel/test/manuscript.test.ts`, `packages/novel/test/fixtures/manuscript-book.md` (an original short book: a part, three chapters, one chapter titled only "Chapter 2", `##` sections and a `***` break, a block quote, a list, a footnote, an image, italic and bold, a fenced code block, and the metadata comment)

**Interfaces:**
- Consumes: `novelStructure`, `ManuscriptDetails` (Task 1); `parseMarkdown` and `MdNode` from `@drafter/markdown`.
- Produces:
  - `export interface Run { text: string; italic?: boolean; bold?: boolean; code?: boolean }`
  - `export type ManuscriptBlock = { kind: 'part'; title: string } | { kind: 'chapter'; title: string } | { kind: 'break' } | { kind: 'paragraph'; style: 'body' | 'quote' | 'list' | 'code' | 'heading'; runs: Run[]; marker?: string } | { kind: 'end' }`
  - `export interface ResolvedDetails { title: string; byline: string; legalName: string; contact: string[]; surname: string; shortTitle: string; font: ManuscriptFont }`
  - `export interface Manuscript extends ResolvedDetails { words: number; wordsLabel: string; blocks: ManuscriptBlock[]; notes: Run[][] }`
  - `export function resolveDetails(source: string, fileTitle: string, kept: ManuscriptDetails): ResolvedDetails`
  - `export function wordsLabel(words: number): string`
  - `export function manuscriptOf(source: string, tree: MdNode, details: ResolvedDetails): Manuscript`

- [ ] **Step 1: Write the failing tests** in `manuscript.test.ts`:
  - `wordsLabel`: `0` → `'0 words'`; `1` → `'about 100 words'`; `449` → `'about 400 words'`; `450` → `'about 500 words'`; `999` → `'about 1,000 words'`; `87_499` → `'about 87,000 words'`; `87_500` → `'about 88,000 words'` (half rounds up; thousands grouped with commas).
  - `resolveDetails` defaults: title is the first `#` heading that isn't a part and isn't only a chapter number (`/^(?:chapter\s+)?(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)$/i`), else `fileTitle`; legal name defaults to the byline; surname to the last word of the byline, else of the legal name, else `''`; short title to the title's first three words in capitals; font `'times'`. A kept value always wins over its default.
  - `manuscriptOf` on the fixture: blocks are, in order, `part`, `chapter` ("The Salt Road"), body paragraphs, a `break` between its two `##` sections and none before the first, … `chapter` ("Chapter 2", printed as written), …, `end` last; a section's heading text appears in no block; the `***` is a `break`; the quote's paragraph has `style: 'quote'`; list items are `style: 'list'` with `marker` `'•'` or `'1.'`; the code block's lines are `style: 'code'`; italic and bold runs keep their flags; a link prints its text; the image is a body paragraph `[Image: <alt>]`; the footnote reference prints as `[1]` in its run and the note's text is `notes[0]`; nothing from the metadata comment or an HTML comment appears; `###` headings are `style: 'heading'` paragraphs.
  - `words` equals `novelStructure(source).words`.
  - A book with no `#` at all gives `[…body paragraphs, end]` with no `chapter`; an empty chapter gives its `chapter` block and the next.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @drafter/novel exec vitest run test/manuscript.test.ts`
Expected: FAIL (`manuscript.ts` doesn't exist).

- [ ] **Step 3: Implement** `manuscript.ts`. Walk the root's children in order; a top-level heading's kind comes from the `novelStructure` node whose `heading.from` matches its offset (`position.start.offset` or `from`), so the two never disagree about what is a part, chapter, or section. Inline nodes flatten to runs (`emphasis` → italic, `strong` → bold, `inlineCode` → code, `link` → its children, `break` → a space, `footnoteReference` → `[n]` by first appearance).

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @drafter/novel exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit.**

---

### Task 3: The manuscript PDF

**Files:**
- Create: `packages/render-pdf/fonts/liberation-serif/LiberationSerif-{Regular,Italic,Bold,BoldItalic}.ttf` and `OFL.txt` (Liberation Fonts 2.1.5, from the project's GitHub release; its `LICENSE` file copied as `OFL.txt`)
- Create: `packages/render-pdf/src/manuscript/{fonts.ts,layout.ts,render.ts}`
- Modify: `packages/render-pdf/src/index.ts`, `packages/render-pdf/package.json` (`files` includes the new fonts), `packages/render-pdf/fonts/README.md`
- Modify: `apps/web/scripts/sync-assets.mjs` (copy the four faces and `OFL.txt` to `fonts/liberation-serif/`), `apps/web/app/pages/docs/licences.vue` (a Liberation Serif entry, as Courier Prime's)
- Test: `packages/render-pdf/test/manuscript-layout.test.ts`, `packages/render-pdf/test/manuscript-render.test.ts`

**Interfaces:**
- Consumes: `Manuscript`, `ManuscriptBlock`, `Run` (Task 2), `Paper` from `@drafter/templates`, `RenderProgress`.
- Produces:
  - `export type ManuscriptFace = 'regular' | 'italic' | 'bold' | 'boldItalic'`
  - `export const MANUSCRIPT_FONT_FILES: Readonly<Record<ManuscriptFont, Readonly<Record<ManuscriptFace, string>>>>` (paths under `fonts/`: `liberation-serif/LiberationSerif-Regular.ttf`, …, and `CourierPrime-Regular.ttf`, …)
  - `export type ManuscriptFontSet = Record<ManuscriptFace, Uint8Array>`
  - `export function layoutManuscript(ms: Manuscript, opts: { paper: Paper; measure: (text: string, face: ManuscriptFace) => number }): ManuscriptPage[]` where `ManuscriptPage = { number: number; header: string | null; lines: { x: number; y: number; runs: (Run & { face: ManuscriptFace })[] }[] }` (y from the page's top, in points)
  - `export async function renderManuscriptPdf(ms: Manuscript, opts: { fonts: ManuscriptFontSet; paper: Paper; lang?: string; onProgress?: (p: RenderProgress) => void }): Promise<{ bytes: Uint8Array; missing: string[] }>`

- [ ] **Step 1: Write the failing layout tests** in `manuscript-layout.test.ts`, with a fixed-width measure (6 pt a character) and Letter:
  - page 1 has `header: null`; the legal name's line is at the top margin (y 72) and left margin (x 72); the word count is right-aligned to x 540 on that line; the title is centered, its line at y 396 (half of 792); `by <byline>` one line (24 pt) below.
  - page 2 starts the first block; its header is `'Vale / THE SALT ROAD / 2'`, right-aligned to x 540 at y 36.
  - a `chapter` starts a new page with its title centered at y 264 (a third of 792), and its first paragraph line two lines (48 pt) below.
  - a `part` has a page of its own, title centered at y 396; the next chapter starts on the next page.
  - every paragraph's first line starts at x 108 (72 + 36), later lines at x 72; a `quote` paragraph's lines start at x 108 and wrap at 504; consecutive lines are 24 pt apart; the last line on a page is above 720 (792 − 72).
  - a `break` is a centered `#` on its own line; `end` is a centered `END` one blank line after the last paragraph.
  - widows and orphans: a paragraph never leaves one line alone at the foot or the head of a page (at least 2 each side, as `MIN_LINES`); a chapter title is never the last line of a page.
  - blank details: with no legal name or contact, page 1 has no lines at the top left; with `words` 0 the top right reads `'0 words'`; the header with no surname is `'THE SALT ROAD / 2'`, and with neither surname nor short title `'2'`.
  - endnotes: when `notes` isn't empty, a new page after `END` has `Notes` centered at the top margin, then each note as a paragraph starting `1.`, `2.`, …
  - A4: the title at y 420.95, the chapter title at y 280.63.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @drafter/render-pdf exec vitest run test/manuscript-layout.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `layoutManuscript`** in `manuscript/layout.ts`: wrap each paragraph's runs at word boundaries with `measure`, then place lines page by page with the positions above.

- [ ] **Step 4: Write the failing render tests** in `manuscript-render.test.ts`, with the real fonts read from `fonts/`:
  - the PDF opens with pdf.js (as `document-render.test.ts` does); its page count equals `layoutManuscript`'s; page 1's text holds the title and no header; page 2's text holds `Vale / THE SALT ROAD / 2`; the title and author are in the PDF's metadata; the language is set.
  - `times` embeds Liberation Serif and `courier` Courier Prime (font names in the file).
  - a character neither font has (`𓀀`) is drawn as `?` and listed in `missing`.
  - missing fonts throw a clear `Error` naming the absent face, as `renderDocumentPdf` does.
  - `onProgress` reports layout, pages, and saving, in order.

- [ ] **Step 5: Implement `renderManuscriptPdf`** in `manuscript/render.ts`, embedding the four faces with `layoutFeatures()` and the same `measure` the layout used; export the new names from `src/index.ts`.

- [ ] **Step 6: Run the package's tests**

Run: `pnpm --filter @drafter/render-pdf exec vitest run && pnpm --filter @drafter/render-pdf typecheck`
Expected: PASS.

- [ ] **Step 7: Check the assets** — run `node apps/web/scripts/sync-assets.mjs` and confirm `apps/web/public/fonts/liberation-serif/` holds the four faces and `OFL.txt` (they're then precached by the existing `fonts/*/OFL.txt` and `**/*.ttf` globs).

- [ ] **Step 8: Commit.**

---

### Task 4: The manuscript Word file, `@drafter/render-docx`

**Files:**
- Create: `packages/render-docx/{package.json,tsconfig.json,tsdown.config.ts,README.md}`, modelled on `packages/render-text`
- Create: `packages/render-docx/src/{index.ts,xml.ts,parts.ts,render.ts}`
- Test: `packages/render-docx/test/render.test.ts`, `packages/render-docx/test/xml.test.ts`
- Modify: the README's Packages table and `docs/DEVELOPMENT.md`'s package list (a row for `@drafter/render-docx`)

**Interfaces:**
- Consumes: `Manuscript` (Task 2); `zipStored`, `ZipWriteEntry` from `@drafter/archive`.
- Produces:
  - `export function xmlText(text: string): string` (escapes `& < > " '`; drops characters XML 1.0 forbids, keeping tab, LF, CR)
  - `export function renderManuscriptDocx(ms: Manuscript, opts: { paper: Paper; lang: string; created?: Date }): Uint8Array`

- [ ] **Step 1: Write the failing tests.** In `xml.test.ts`: `xmlText('<w:fldChar/> & "x" ]]>')` is `'&lt;w:fldChar/&gt; &amp; &quot;x&quot; ]]&gt;'`; `xmlText('a\u0000b￾c')` is `'abc'`; a lone surrogate is dropped. In `render.test.ts`, on the Task 2 fixture's manuscript, unzipping with `@drafter/archive`'s reader:
  - the parts are exactly `[Content_Types].xml`, `_rels/.rels`, `docProps/core.xml`, `docProps/app.xml`, `word/document.xml`, `word/styles.xml`, `word/settings.xml`, `word/header1.xml`, `word/_rels/document.xml.rels`; `[Content_Types].xml` is first; each parses as XML (a DOMParser with no `parsererror`).
  - the field rule: the string `w:fldSimple` occurs exactly once in all parts together, in `word/header1.xml`, with `w:instr=" PAGE "`; `w:instrText`, `w:fldChar`, and `updateFields` occur nowhere; no relationship has `TargetMode="External"`.
  - `word/settings.xml` has `w:compatSetting w:name="compatibilityMode"` with `w:val="15"`; `word/styles.xml`'s defaults name `Times New Roman` (or `Courier New` for `courier`), `w:sz w:val="24"`, `w:line="480"`, `w:firstLine="720"`, and `w:lang w:val="en-US"` from `lang`.
  - `word/document.xml`: `w:sectPr` has `w:titlePg`, `w:pgMar` 1440 on every side and `w:header="720"`, `w:pgSz` 12240 × 15840 for Letter (11906 × 16838 for A4), and a `w:headerReference w:type="default"`; each chapter's paragraph uses the `ChapterTitle` style, which has `w:pageBreakBefore` and `w:spacing w:before` of 3840 (Letter; 4173 for A4) and is centered; a `break` is a centered `#`; `END` comes after the last chapter's text, followed (when there are notes) by a page break, a centered `Notes`, and each note as a paragraph starting `1.`; italic runs carry `w:i`, bold `w:b`; the title page holds the legal name, the contact lines, `about N words` (right tab), the title, and `by <byline>`.
  - `word/header1.xml` text is `Vale / THE SALT ROAD / ` then the field; with no surname, `THE SALT ROAD / `.
  - the docProps name the title and the byline as the creator, and nothing else about the writer.
  - Review Focus 1: title, contact, and a paragraph holding `<w:fldChar/>`, `]]>`, `&amp;`, NUL, and U+FFFE: every part still parses, `w:fldSimple` still occurs once, and the text survives escaped.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @drafter/render-docx exec vitest run`
Expected: FAIL (the package doesn't exist yet).

- [ ] **Step 3: Implement** the package: `xml.ts` (`xmlText`), `parts.ts` (one function per part, returning a string), `render.ts` (`renderManuscriptDocx`, encoding each part as UTF-8 and calling `zipStored`). Styles: `Normal`, `Title`, `Byline`, `Contact` (single-spaced, no indent), `ChapterTitle`, `PartTitle` (`w:pageBreakBefore`, before 6480 twips Letter / 6979 A4, centered), `SceneBreak`, `Quote` (left and right indent 720), `ListParagraph`, `Code` (`Courier New`, no first-line indent), `End`, `Header` (right-aligned).

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @drafter/render-docx exec vitest run && pnpm --filter @drafter/render-docx typecheck && pnpm check`
Expected: PASS.

- [ ] **Step 5: See it lay out** if LibreOffice is on the machine: `soffice --headless --convert-to pdf <file>.docx` on the fixture's file opens without error and has the same page count as the PDF ±1. Skip, and say so in the commit, if `soffice` isn't installed.

- [ ] **Step 6: Commit.**

---

### Task 5: The two exports in the worker and the commands

**Files:**
- Modify: `apps/web/app/workers/export-compute.ts` (request kinds `manuscript-pdf` and `manuscript-docx`; `fetchManuscriptFonts`)
- Modify: `apps/web/app/storage/export.ts` (`ExportKind` gains `manuscript-pdf` and `manuscript-docx`; MIME `application/pdf` and `application/vnd.openxmlformats-officedocument.wordprocessingml.document`; extensions; `exportName` gives `<title> – manuscript.pdf|.docx`; `notFor` refuses them unless the document is a novel: "Only a novel exports as a manuscript."; neither is in `EXPORTS`, like `story-map`)
- Modify: `apps/web/app/storage/files.ts` (a `docx` picker type for the save picker)
- Modify: `apps/web/app/commands/data.ts`, `apps/web/app/commands/export-commands.ts` (`export-manuscript-pdf`, `export-manuscript-docx`)
- Test: `apps/web/test/export.test.ts`, `apps/web/test/export-compute.test.ts` (or the worker test file that covers `markdown-pdf`), `apps/web/test/command-data.test.ts`, `apps/web/test/desktop-menu.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `ExportRequest` gains `{ kind: 'manuscript-pdf' | 'manuscript-docx'; source: string; fileTitle: string; details: ManuscriptDetails; paper: Paper; lang: string }`.
  - `export function exportManuscript(format: 'pdf' | 'docx', details: ManuscriptDetails): Promise<'saved' | 'cancelled'>` in `storage/export.ts`, which the dialog (Task 6) calls; it builds the request from the open document, as `exportScript` does, and reports through the same toast and progress bar.
  - Commands `export-manuscript-pdf` ("Export as Manuscript (PDF)…") and `export-manuscript-docx` ("Export as Manuscript (Word)…"), group File, keywords `submission`, `agent`, `standard manuscript format`, `docx`, `Word`; `enabled` only for a novel; their `run` opens the dialog (`manuscriptOpen.value = 'pdf' | 'docx'`, from Task 6's `novel/manuscript.ts`, created here as just the ref).

- [ ] **Step 1: Write the failing tests:**
  - `export.test.ts`: on a novel, `exportManuscript('pdf', {…})` picks `The Salt Road – manuscript.pdf` with kind `pdf` and sends the worker `{ kind: 'manuscript-pdf', … }` with the paper and language settings; `'docx'` picks `… – manuscript.docx` with kind `docx`; on a plain Markdown document and on a screenplay both refuse with "Only a novel exports as a manuscript." and pick nothing; the toast says "Exported The Salt Road – manuscript.docx."
  - the worker test: a `manuscript-docx` request returns a zip whose `word/header1.xml` holds the surname; a `manuscript-pdf` request fetches only `/fonts/liberation-serif/…` (times) or `/fonts/courier-prime/…` (courier), each once.
  - `command-data.test.ts`: both commands exist, in group File, after `export-story-map`; `desktop-menu.test.ts`: File → Export lists them after Story map, titled "Manuscript (PDF)…" and "Manuscript (Word)…".

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @drafter/web exec vitest run test/export.test.ts test/command-data.test.ts test/desktop-menu.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the request kinds, `fetchManuscriptFonts(font, fetcher)`, `exportManuscript`, the picker type, and the commands.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @drafter/web exec vitest run && pnpm --filter @drafter/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit.**

---

### Task 6: The Manuscript details dialog, and the menus

**Files:**
- Create: `apps/web/app/novel/manuscript.ts` (`manuscriptOpen`, and `detailsFor(source, fileTitle)` returning the kept details resolved for the form)
- Create: `apps/web/app/components/ManuscriptDialog.vue`, mounted in `apps/web/app/pages/index.vue` beside `StoryMapDialog`
- Modify: `apps/web/app/novel/use-novel.ts` (`NovelSession.setManuscript(details: ManuscriptDetails | null): void`, one undo step, as `setBookTarget`)
- Modify: `apps/web/app/components/ExportMenu.vue` (after Treatment, for a novel only: "Manuscript (PDF)…" and "Manuscript (Word)…"), `apps/web/app/components/AppMenu.vue` and `AppToolbar.vue` (the export lists, for a novel)
- Test: `apps/web/e2e/manuscript.spec.ts`; `apps/desktop/e2e/` (one test exporting both through the desktop save dialog stub, as the other desktop export tests do)

**Interfaces:**
- Consumes: `exportManuscript`, `manuscriptOpen` (Task 5); `resolveDetails` (Task 2); `setManuscript`.
- Produces: the dialog. Its fields, labels, and order: Title, Byline, Legal name, Contact (a textarea, one line each), Surname for the header, Short title, Font (radio: "Times-style serif" / "Courier"), and the read-only "Word count: about 87,000 words". A note under Contact: "Saved in this book’s file, so anyone you send the Markdown file to can read it." Buttons: "Export PDF" or "Export Word file" (whichever opened it), and "Cancel".

- [ ] **Step 1: Write the failing browser tests** in `manuscript.spec.ts` (all five projects):
  - on the Novel sample, Export menu shows both items; on the Screenplay sample and a plain Markdown document it shows neither, and the palette hides both commands.
  - the dialog opens prefilled (title from the book, font Times-style, the word count); typing a byline fills Legal name and Surname until they're edited; Export PDF downloads `… – manuscript.pdf` (`removePickers`) whose bytes start `%PDF`; the details are in the comment afterwards and survive a reload (the dialog reopens with them); one undo removes them.
  - Export Word file downloads `… – manuscript.docx` whose bytes start `PK`.
  - the Drafter menu and the palette open the same dialog.
  - Review Focus 5: in a read-only tab (the two-tab guard), the dialog exports and says "These details weren’t saved: this tab only shows the book." and the comment is unchanged.
  - the dialog passes axe in both themes, takes focus on Title, Escape closes it and gives focus back, and Tab stays inside it.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @drafter/web e2e -g "manuscript" --project=chromium`
Expected: FAIL.

- [ ] **Step 3: Implement** `setManuscript`, `novel/manuscript.ts`, `ManuscriptDialog.vue` (built as `StoryMapDialog.vue` is: `DDialog`, the same focus and close handling), and the menu items.

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @drafter/web e2e -g "manuscript" && pnpm --filter @drafter/desktop e2e`
Expected: PASS in all five projects and the desktop app.

- [ ] **Step 5: Commit.**

---

### Task 7: Traps and the timed test

**Files:**
- Modify: `fixtures/trap/` (new traps and their MANIFEST lines), the trap harness's manuscript entry point
- Create: `apps/web/e2e/manuscript-timing.spec.ts` (named with "within", so CI skips it and the release gates run it)

- [ ] **Step 1: Add the traps:** `novel-manuscript-chapters` (20,000 `#` chapters), `novel-manuscript-title` (a 50,000-character `#` heading and the same in the details), `novel-manuscript-xml` (contact lines and paragraphs of `<w:fldChar/>`, `]]>`, `&`, NUL, U+FFFE), `novel-manuscript-rtl` (Hebrew and Arabic paragraphs), each run through `manuscriptOf` then both renderers in the harness, with the usual time and memory allowances. Expected: no throw; the docx's parts all parse with one field; the PDF opens.
- [ ] **Step 2: Run the traps**

Run: `pnpm vitest run --project trap`
Expected: PASS, with the trap count four higher.

- [ ] **Step 3: Write the timed test:** a 120,000-word generated novel exports to both files within a budget set at twice a measured local run (measure first, write the number into the test with the measurement in a comment).
- [ ] **Step 4: Run it**

Run: `pnpm --filter @drafter/web e2e -g "manuscript.*within" --project=chromium --workers=1`
Expected: PASS.

- [ ] **Step 5: Commit.**

---

### Task 8: Help, docs, and the whole-branch gates

**Files:**
- Modify: `apps/web/app/pages/docs/novel.vue` ("Sending it out": what standard manuscript format is, each detail and why, the two files, page numbers in Word, and that the details are kept in the book's file)
- Modify: `apps/web/app/pages/docs/saving.vue` (the export table and an "Export a manuscript" subsection), `docs/FORMATS.md` (two rows), `README.md` (Features' Novel line drops "come in v0.26.1"; Formats' Out list), `docs/ROADMAP.md`, `docs/DECISIONS.md` (one dated entry: the PAGE field decision, Liberation Serif, section titles not printed, footnotes as endnotes), `docs/DEFERRED.md` (a "Manuscript" section for what was left: the CLI, other conventions, a contest's anonymous header), `CHANGELOG.md`
- Test: `apps/web/e2e/docs.spec.ts` (the Novel page has the "Sending it out" heading and names both exports)

- [ ] **Step 1: Write the docs and the docs test.**
- [ ] **Step 2: Run the release gates** (`docs/DEVELOPMENT.md`, "The release gates") as separate commands, each checked for `failed`, `ERR_`, and `Exit status` in its output, not by a final marker.
- [ ] **Step 3: Open a fixture's Word file in Word on a Mac and in Pages** (the maintainer), and confirm: no question on opening, page numbers right, the title page without a header, chapters a third down.
- [ ] **Step 4: Commit, open the pull request, wait for every check, and merge** (the release itself is v0.26.1's, after the maintainer's go).
