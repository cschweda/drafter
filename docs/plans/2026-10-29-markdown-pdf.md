# Export as PDF for Markdown documents (v0.16.0) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Export as PDF for Markdown documents (v0.16.0): a clean, numbered, printable document (headings, paragraphs, emphasis and strong, inline code and code blocks, quotes, ordered, unordered, and nested lists, clickable links, rules, hard line breaks) in Inter Tight and Courier Prime, on US Letter or A4, with widows, orphans, and headings kept in check, from the Export menu, the app menu, the palette, and the desktop app's File menu.

**Architecture:** A new module of `@drafter/render-pdf`, `src/document/`, turns a CommonMark tree (its own structural `DocNode` type, no Markdown library at runtime) into blocks (`blocks.ts`), lines (`lines.ts`), and pages (`paginate.ts`), all pure over a `Measure` (`measure.ts`, built from the font files with fontkit), and draws them with pdf-lib (`render.ts`: `renderDocumentPdf`). The app's export worker parses the text with the app's own `parseMarkdown`, loaded on the first Markdown PDF, fetches Inter Tight's four styles and Courier Prime Regular from its own origin, and answers with the bytes and any characters the fonts lacked. A new setting, `markdownPaper`, picks the paper.

**Tech Stack:** TypeScript, pdf-lib 1.17 + @pdf-lib/fontkit 1.1, mdast-util-from-markdown 2.1 (app runtime; render-pdf tests only), Vue 3.5 / Nuxt 4 / Nuxt UI 4, Vitest with fast-check, pdfjs-dist (tests), Playwright 1.64. No new third-party package; four new font files.

**Spec:** [`docs/drafter-markdown-pdf-design.md`](../drafter-markdown-pdf-design.md) (all of it; its Calls are binding). Context: technical design §5.2 (proportional fonts measure from the font's bytes), `packages/render-pdf/README.md` (what the screenplay renderer promises: deterministic bytes, fonts passed in, no file reads), `docs/DECISIONS.md` 2026-10-29 (growth-based timing tests), Phase 2 design §22 (the plan list, which shifts by one minor).

## Global Constraints

- Branch `markdown-pdf` (worktree `scratchpad/drafter-mp`), from `main` at v0.15.0 (`9695595`).
- **Clean room:** no code, stylesheets, layout values, or fixtures from any other app, word processor, or Markdown-to-PDF converter. The layout's numbers are the design's (§2.2). Every sample document in tests and fixtures is original text written for Drafter; generated documents use invented words.
- **Dependencies:** no new third-party package. `mdast-util-from-markdown` becomes a **development** dependency of `@drafter/render-pdf` (the version `apps/web` pins), with its `docs/DEPENDENCIES.md` row changed **before** it is added. The four Inter Tight TTFs get the Fonts row changed **before** they are added. `@drafter/render-pdf` imports nothing from Markdown at runtime.
- **The renderer reads no files and needs no Node built-ins** at runtime, as `renderPdf` (its existing test `reads no files and needs no Node built-ins at runtime` covers `src/document/` too). The caller passes the fonts in.
- **Deterministic:** the same tree, paper, title, and language give the same bytes. No dates, no random IDs, fixed font names (`customName`).
- **Safety:** only `http:`, `https:`, and `mailto:` addresses become link annotations, after `new URL()` accepts them; the annotation's URI is `URL.href`. Nothing is fetched for a document.
- **Copy (exact):** the toast's missing-glyph sentence is `Some characters aren’t in Drafter’s fonts and print as ?: ` followed by up to five characters joined with `, ` and a full stop; an image is `[Image: <alt>]` or `[Image: no description]`; the setting is **Paper for Markdown PDFs** with "The paper size of a Markdown document’s PDF. Screenplays and stage plays use their template’s paper." and options **US Letter** and **A4**.
- **Budgets:** layout and render grow linearly (growth from n to 4n under 8, `scaling`); a 100-page document exports in the Chromium worker in under 3 s on the maintainer's machine, logged by the e2e test, which fails only past 20 s.
- **Accessibility work waits for the final steps** (maintainer, 2026-10-28): no tagged PDF, no new axe tests; the existing axe tests stay green. Tagged PDF and bookmarks are deferred for both kinds, in `docs/DEFERRED.md`.
- **Personal project.** No employer names anywhere.
- Every task: tests first and watched failing; then `pnpm test`, `pnpm check`, `pnpm -r typecheck` green; `apps/web` e2e (with `E2E_PORT=4175`, after `cd apps/web && rm -rf .output && DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build`) for the specs the task touches; a CHANGELOG entry under `[Unreleased]`; choices in `docs/DECISIONS.md` under a new `## Markdown PDF (`@drafter/render-pdf`, `apps/web`)` section (each Call gets a line when it lands); conventional commits with **no AI co-author trailer and no session link**; the README kept in sync (Task 7 does the status line, roadmap, and features).

## Review Focus

1. **A heading near the foot of a page with a long block after it, and a chain of headings** (`#` then `##` then a paragraph, at the foot): the headings move together and never end a page. Task 4's `moves a chain of headings with the first two lines of what follows` and the property `no page ends with a heading unless the document does`.
2. **A block that can't keep its rules** (a single code line that wraps to more than a page, or a heading followed by one): the layout fills pages as the lines come and ends, never looping or dropping text. Task 4's `fills the page when a block can't keep its rules` and the property `every line of every block is placed exactly once, in order`.
3. **Hostile or odd links:** `javascript:`, `data:`, `file:`, relative and `#` addresses, a reference with no definition, an address with spaces or non-ASCII, link text that wraps over a page break. Task 2's `only http, https, and mailto links get an address` and Task 5's `a link that wraps puts one annotation on each line it covers`, `a link split by a page break is annotated on both pages`.
4. **Characters the fonts lack** (CJK, emoji, a lone surrogate, control characters, a soft hyphen) in text, code, and a heading: the export succeeds, prints `?`, and the toast names them. Task 1's `has() is false for a character Inter Tight lacks`, Task 3's `prints a character its face lacks as ? and reports it once`, and Task 6's e2e `says which characters print as ?`.
5. **Deep nesting and long lines:** a list nested ten deep inside a quote nested five deep, and a code line or a word wider than the remaining width: text never runs past the right margin or below the bottom one. Task 3's `never puts a line past the right margin, however deep the nesting` (the indent stops growing once the text width would fall under a quarter of the page's) and Task 4's property `no item lies outside the text area, except the page number in the bottom margin`.

---

### Task 1: The fonts and the measure (`@drafter/render-pdf`)

**Files:**
- Create: `packages/render-pdf/fonts/inter-tight/{InterTight-Regular.ttf,InterTight-Italic.ttf,InterTight-SemiBold.ttf,InterTight-SemiBoldItalic.ttf,OFL.txt,README.md}`, `packages/render-pdf/src/document/{measure.ts,fonts.ts}`, `packages/render-pdf/test/{document-fonts.test.ts,document-measure.test.ts}`
- Modify: `docs/DEPENDENCIES.md` (first: the Fonts row for Inter Tight, the `@drafter/render-pdf` row's development dependency), `packages/render-pdf/package.json` (`devDependencies`: `mdast-util-from-markdown`, the same range as `apps/web`), `packages/render-pdf/fonts/README.md` (points to `inter-tight/`), `packages/render-pdf/test/helpers.ts` (`documentFonts`, read like `fonts`)

**Interfaces (Produces):**
```ts
// document/fonts.ts
export type Face = 'text' | 'textItalic' | 'textBold' | 'textBoldItalic' | 'code';
export interface DocumentFontSet { text: Uint8Array; textItalic: Uint8Array; textBold: Uint8Array; textBoldItalic: Uint8Array; code: Uint8Array }
/** Paths under this package's `fonts/`, by face. */
export const DOCUMENT_FONT_FILES: Readonly<Record<Face, string>>;
// { text: 'inter-tight/InterTight-Regular.ttf', textItalic: 'inter-tight/InterTight-Italic.ttf',
//   textBold: 'inter-tight/InterTight-SemiBold.ttf', textBoldItalic: 'inter-tight/InterTight-SemiBoldItalic.ttf',
//   code: 'CourierPrime-Regular.ttf' }
// document/measure.ts
export interface Measure {
  /** Width in points of `text` in `face` at `size` pt (no kerning, as pdf-lib draws). */
  width(text: string, face: Face, size: number): number;
  /** Whether `face` has a glyph for the code point. */
  has(codePoint: number, face: Face): boolean;
}
/** A Measure from the font files, through fontkit; widths cached per face and string. */
export function fontMeasure(fonts: DocumentFontSet): Measure;
```

- The fonts: Inter Tight's static Regular 400, Italic 400, SemiBold 600, and SemiBold Italic 600 TTFs from Google Fonts (`fonts.gstatic.com/s/intertight/v9`, the CSS2 API asked for TTF, as the brand files were), unmodified; SemiBold must have the SHA-256 `brand/README.md` gives. `fonts/inter-tight/README.md` follows `fonts/README.md`: source, date, copyright 2022 The Inter Project Authors, OFL 1.1, a SHA-256 table. If the source serves a different version or no static italic, stop and report to the controller.
- `fontMeasure` sums `font.layout(text).glyphs[i].advanceWidth × size / unitsPerEm`, which is what pdf-lib's `widthOfTextAtSize` computes.

- [ ] **Step 1: Update `docs/DEPENDENCIES.md`** (both rows), then add the files and the development dependency, and `pnpm install`.
- [ ] **Step 2: Write the failing tests.** `document-fonts.test.ts`: `each Inter Tight file matches the SHA-256 in its README`, `SemiBold is the brand's file`, `each face opens in fontkit with the family Inter Tight and its weight and style` (400 upright, 400 italic, 600 upright, 600 italic), `OFL.txt is the SIL Open Font License 1.1`. `document-measure.test.ts`: `width matches pdf-lib's widthOfTextAtSize for text in every face` (strings with ligature pairs, accents, and digits, at 9, 11, and 22 pt; within 0.001 pt), `width of a run is the sum of its words and spaces`, `has() is true for Latin, Greek, and Cyrillic letters and false for a character Inter Tight lacks` (U+6F22), `the bullets •, ◦, ▪ are checked` (records which of them Inter Tight has, for Task 3's Call 6 choice), `caches: a second width of the same string doesn't lay it out again` (a counting fontkit stub).
- [ ] **Step 3: Run them.** `pnpm --filter @drafter/render-pdf test` → FAIL.
- [ ] **Step 4: Implement** `fonts.ts` and `measure.ts`.
- [ ] **Step 5: Run them again,** and `pnpm -r typecheck`. → PASS.
- [ ] **Step 6: Commit.** `feat(render-pdf): Inter Tight's four styles and a font measure for documents`

---

### Task 2: From the tree to blocks

**Files:**
- Create: `packages/render-pdf/src/document/{tree.ts,style.ts,blocks.ts}`, `packages/render-pdf/test/{document-blocks.test.ts,document-helpers.ts}`

**Interfaces (Consumes):** `Face` (Task 1). **(Produces):**
```ts
// document/tree.ts: the fields of an mdast node this module reads
export interface DocNode {
  type: string; children?: DocNode[]; value?: string; depth?: number;
  ordered?: boolean | null; start?: number | null; spread?: boolean | null;
  url?: string; alt?: string | null; identifier?: string; label?: string | null;
}
// document/style.ts: the design's §2.2 values, one place
export const STYLE: {
  margin: 72; textSize: 11; textLeading: 16;
  headings: readonly { size: number; leading: number; before: number; muted: boolean }[]; // index 0 = level 1
  afterHeading: 6; between: 8; looseItem: 4;
  quoteIndent: 16; quoteBar: 2; listIndent: 18;
  inlineCodeSize: 10; codeSize: 9.5; codeLeading: 13; codePadding: 8; tabSpaces: 4;
  ruleThickness: 0.5; ruleClear: 12; underline: { thickness: 0.5; drop: 1.5 };
  pageNumber: { size: 9; baselineFromBottom: 36 };
  colors: { text: '#000000'; muted: '#555555'; link: '#1f4e9a'; panel: '#f3f3f3'; rule: '#9a9a9a' };
};
// document/blocks.ts
export interface Run { text: string; face: Face; size: number; color: 'text' | 'muted' | 'link'; underline: boolean; link: string | null }
export interface DocBlock {
  kind: 'heading' | 'text' | 'code' | 'raw' | 'rule';
  level: number | null;          // heading level 1–6
  indent: number;                // pt from the left margin (quotes and lists)
  quoteBars: number[];           // x of each enclosing quote's bar, pt from the left margin
  marker: Run | null;            // a list item's first block: "•" or "3.", right-aligned to indent − 6
  runs: Run[];                   // a hard break is a Run with text '\n'
  size: number; leading: number; // the block's line height
  spaceBefore: number;           // dropped at the top of a page
  keepWithNext: boolean;         // headings
  panel: boolean;                // code blocks
}
/** The blocks of a document, in reading order. Link reference definitions are resolved and print nothing. */
export function documentBlocks(tree: DocNode): DocBlock[];
/** The address a link may carry, or null (Call 10). */
export function safeLink(url: string | undefined): string | null;
```
`document-helpers.ts` gives the tests `md(source)` (`fromMarkdown` as `DocNode`), and `fixedMeasure` (every character `0.5 × size` wide, every code point present except U+6F22).

- Soft breaks (`\n` inside a text node) become spaces; tabs in text become spaces; in code they become four spaces. A list item's later blocks share its indent; the marker goes only on its first. Ordered markers count from `start`. Bullets by depth per Call 6, from Task 1's finding.
- **Call (plan):** the indent stops growing once the text width would fall under a quarter of the text area's width, so deep nesting never pushes text off the page (Review Focus 5).

- [ ] **Step 1: Write the failing tests** (`document-blocks.test.ts`, documents written for Drafter): `a heading's level, size, and space before follow the table`, `headings 5 and 6 are muted`, `emphasis is Italic, strong SemiBold, both SemiBold Italic`, `inline code is Courier Prime at 10 pt`, `a soft break is a space and a hard break a new line`, `a quote indents 16 pt with a bar, and a quote in a quote adds another`, `a quote's text keeps its own styles`, `an ordered list counts from its start`, `nested lists indent 18 pt a level, with •, ◦, ▪` (or Task 1's fallback), `a list item's second paragraph has no marker`, `a loose list puts 4 pt between items, a tight one none`, `a code block keeps every space and turns tabs to four`, `a raw HTML block is code-faced text with no panel, as typed`, `inline HTML prints as typed`, `an image is [Image: alt], muted and Italic, or [Image: no description]`, `a thematic break is a rule`, `a reference link takes its definition's address, and the definition prints nothing`, `a reference with no definition prints as typed`, `only http, https, and mailto links get an address` (`javascript:alert(1)`, `data:…`, `file:///etc/passwd`, `notes.md`, `#top`, `https://exa mple.com` → null; `https://drafter.dev/` and `mailto:a@b.example` kept; `https://例え.jp/パス` → its ASCII `href`), `a link without an address is plain text, not blue or underlined`, `deep nesting stops indenting at a quarter of the width`.
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** `tree.ts`, `style.ts`, `blocks.ts`, and the helpers.
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(render-pdf): read a Markdown tree into document blocks`

---

### Task 3: Breaking lines

**Files:**
- Create: `packages/render-pdf/src/document/lines.ts`, `packages/render-pdf/test/document-lines.test.ts`

**Interfaces (Consumes):** `DocBlock`, `Run`, `STYLE` (Task 2); `Measure` (Task 1). **(Produces):**
```ts
export interface Fragment { x: number; text: string; face: Face; size: number; color: Run['color']; underline: boolean; link: string | null; width: number } // x from the left margin
export interface DocLine { fragments: Fragment[]; height: number; ascent: number } // ascent: baseline below the line's top
/** Wraps a block to `width` (the text area's), Call 13. Characters a face lacks become '?' and are added to `missing`. */
export function wrapBlock(block: DocBlock, width: number, measure: Measure, missing: Set<string>): DocLine[];
```

- First fit at U+0020 and after U+200B; a word wider than the line breaks at the overflowing character; adjacent runs of one style on a line merge into one fragment; a trailing space is not drawn. Code and raw HTML break only at the panel's (or the line's) edge, by character. U+00AD is dropped; U+00A0 never breaks. Control characters become spaces and lone surrogates `?` (as `drawable` in `render.ts`; share it by moving it to a small `src/text.ts` both renderers import).

- [ ] **Step 1: Write the failing tests** (with `fixedMeasure`, plus one with `fontMeasure`): `breaks at spaces, first fit`, `breaks a word wider than the line at the edge`, `breaks after a zero-width space`, `never breaks a no-break space`, `drops a soft hyphen`, `merges runs of one style on a line, spaces included`, `a run that changes style mid-word stays on one line with its word`, `a hard break starts a new line`, `wraps a long code line at the panel's edge, keeping its spaces`, `prints a character its face lacks as ? and reports it once` (U+6F22 twice → one entry), `a lone surrogate prints as ? and a control character as a space`, `never puts a line past the right margin, however deep the nesting` (property, fast-check: random runs and widths → every fragment's `x + width ≤ width` except a single character wider than the line itself), `the text of the lines is the block's text` (property: joining fragments, with breaks as spaces, gives the block's text with spaces collapsed).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again.** → PASS.
- [ ] **Step 5: Commit.** `feat(render-pdf): break a document's lines by the font's widths`

---

### Task 4: Breaking pages, and the whole layout

**Files:**
- Create: `packages/render-pdf/src/document/{paginate.ts,layout.ts}`, `packages/render-pdf/test/{document-paginate.test.ts,document-layout.properties.test.ts,document-scaling.test.ts,scaling.ts}`

**Interfaces (Consumes):** Tasks 1–3; `PAPER_POINTS`, `Paper` (`@drafter/templates`). **(Produces):**
```ts
// layout.ts: everything in PDF points from the page's bottom-left corner
export type DocItem =
  | { kind: 'text'; x: number; y: number; text: string; face: Face; size: number; color: Run['color'] }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; thickness: number; color: 'rule' | 'link' }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; color: 'panel' }
  | { kind: 'link'; x: number; y: number; width: number; height: number; uri: string };
export interface DocPage { items: DocItem[] }
export interface DocLayout { width: number; height: number; pages: DocPage[]; missing: string[] } // ≥ 1 page; missing in first-seen order
export function layoutDocument(tree: DocNode, opts: { paper: Paper; measure: Measure }): DocLayout;
// paginate.ts
export const MIN_LINES = 2;
/** Which page each line of each block goes on (pure; the rules of design §4). */
export function paginate(blocks: readonly { lines: readonly DocLine[]; spaceBefore: number; keepWithNext: boolean }[], pageHeight: number): { block: number; from: number; to: number; top: number }[][]; // per page: slices of blocks, `top` pt below the text area's top
```

- The algorithm (Calls 14–17): walk the blocks once. Before placing block *b*, drop its space before if the page is empty. If *b* keeps with next, gather the chain of headings from *b* and the first `min(MIN_LINES, n)` lines of the block after; if they don't fit on this page and the page isn't empty, start a new page (when they wouldn't fit on an empty page either, place as they come). For a block of *n* lines that doesn't fit: with *n* < 2·`MIN_LINES`, move it whole to a new page unless the page is empty; else place as many as fit, keeping at least `MIN_LINES` here (else move whole) and at least `MIN_LINES` for the next page (pull lines back as needed). Each step looks at most at the next block's first two lines, so the walk is linear.
- `layoutDocument` puts the page number (Call 18) as a `text` item centered at `y = 36`, `muted`, only when there are two or more pages; draws each page's part of a code panel as one `rect` and of each quote bar as one `line` from the top of the quote's first line on the page (or its space, when the previous block on that page is in the same quote) to the bottom of its last; a link's fragment gives a `link` item of its line's height and a `line` item under it.

- [ ] **Step 1: Write the failing tests.** `document-paginate.test.ts` (lines of fixed heights): `fills a page and starts the next`, `drops the space before a block at the top of a page`, `never splits a block of two or three lines`, `leaves at least two lines each side of a split`, `moves a heading with the first two lines of what follows`, `moves a chain of headings with the first two lines of what follows`, `a heading may end the document`, `fills the page when a block can't keep its rules` (a heading and a block taller than a page; a three-line block taller than an empty page), `an empty document is one empty page`. `document-layout.properties.test.ts` (fast-check over random documents built from headings, paragraphs, lists, quotes, code, rules, and links, with `fixedMeasure`, on both papers): `every line of every block is placed exactly once, in order`, `no page ends with a heading unless the document does`, `no item lies outside the text area, except the page number in the bottom margin`, `no two text items on a page overlap`, `page numbers run 1, 2, 3… and only with two or more pages`, `no number is NaN or infinite`. `document-scaling.test.ts`: `layoutDocument grows linearly` (`scaling` over generated documents of n and 4n sections, each a heading, three paragraphs, a list, a quote, and a code block; growth `< MAX_GROWTH`), with `SCALING_TIMEOUT`.
- [ ] **Step 2: Copy `packages/fdx/test/scaling.ts`** to `packages/render-pdf/test/scaling.ts` unchanged except a first line naming its origin, and add `scalingAsync` beside `scaling` (the same procedure for `run: (input: T) => Promise<unknown>`).
- [ ] **Step 3: Run them.** → FAIL.
- [ ] **Step 4: Implement** `paginate.ts` and `layout.ts`.
- [ ] **Step 5: Run them again.** → PASS.
- [ ] **Step 6: Commit.** `feat(render-pdf): lay a document out on pages, keeping headings with their text`

---

### Task 5: Drawing the PDF

**Files:**
- Create: `packages/render-pdf/src/document/render.ts`, `packages/render-pdf/test/{document-render.test.ts,document-budget.test.ts}`
- Modify: `packages/render-pdf/src/index.ts` (exports), `packages/render-pdf/test/helpers.ts` (`annotations(bytes, page)`: pdfjs `getAnnotations()`, each link's `rect` and `url`), `packages/render-pdf/README.md` (a "Documents" section: API, what it draws, fonts), `packages/render-pdf/package.json` (`description`: "PDF output for Drafter: laid-out script pages in Courier Prime, and Markdown documents in Inter Tight.")

**Interfaces (Consumes):** `layoutDocument`, `DocLayout`, `DocItem` (Task 4); `fontMeasure`, `DocumentFontSet`, `DOCUMENT_FONT_FILES` (Task 1). **(Produces):**
```ts
export interface DocumentPdf { bytes: Uint8Array; missing: string[] }
/** Draws a Markdown document as a PDF (design §2–§5). Reads no files: the five font files come in `fonts`; only the faces used are embedded, as subsets. */
export async function renderDocumentPdf(
  tree: DocNode,
  opts: { fonts: DocumentFontSet; paper: Paper; title?: string; lang?: string },
): Promise<DocumentPdf>;
// index.ts adds: renderDocumentPdf, layoutDocument, fontMeasure, DOCUMENT_FONT_FILES,
// and the types DocNode, DocumentFontSet, DocumentPdf, Face, Measure, DocLayout
```

- Fixed font names (`InterTight-Regular`, `InterTight-Italic`, `InterTight-SemiBold`, `InterTight-SemiBoldItalic`, `CourierPrime-Regular`); `setTitle(title, { showInWindowTitleBar: true })` when given; `setLanguage(lang)` when given; creator and producer as `renderPdf`; `updateMetadata: false`. A link is a `/Link` annotation with `/Border [0 0 0]` and a `/URI` action, added to the page's `/Annots`. All five fonts are checked present first, with a `TypeError` naming the missing ones, as `renderPdf` does.

- [ ] **Step 1: Write the failing tests.** `document-render.test.ts` (pdfjs, real fonts, documents written for Drafter): `a page is US Letter or A4 as asked`, `draws the text where the layout puts it, in its fonts` (a heading in `InterTight-SemiBold` at its baseline, a paragraph in `InterTight-Regular` at x = 72, inline code in `CourierPrime-Regular`), `reads back in order, with spaces, so search and copy work` (pdfjs text of a page equals the document's words in order), `a link is an annotation to its address`, `a link that wraps puts one annotation on each line it covers`, `a link split by a page break is annotated on both pages`, `an unsafe link has no annotation`, `numbers pages at the foot from 1 when there are two or more`, `a one-page document has no number`, `sets the title and the language`, `the same document gives the same bytes`, `embeds only the faces used` (a document with no code has no Courier Prime), `reports the characters its fonts lack`, `an empty tree is one blank page`, `asks for all five fonts by name`. `document-budget.test.ts`: `renders linearly` (`scalingAsync` over generated documents, n about 10 pages), and `renders a 100-page document` (asserts at least 100 pages; logs the time; fails only past `HANG_MS`).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement** `render.ts` and the exports, and the README section.
- [ ] **Step 4: Run them again,** plus the existing `render.test.ts` (the no-files test now covers `src/document/`). → PASS.
- [ ] **Step 5: Commit.** `feat(render-pdf): draw a Markdown document as a PDF, with links`

---

### Task 6: Export as PDF for a Markdown document in the app

**Files:**
- Modify: `apps/web/app/workers/export-compute.ts`, `apps/web/app/workers/export.worker.ts` (transfer `data` as now), `apps/web/app/storage/{export.ts,export-client.ts}`, `apps/web/app/settings/settings.ts` (`markdownPaper`), `apps/web/app/components/{SettingsDialog.vue,ExportMenu.vue,AppMenu.vue}`, `apps/web/app/commands/builtin.ts` (`export-pdf` on for both kinds), `apps/web/scripts/{sync-assets.mjs,check-build.mjs}` (the four Inter Tight TTFs to `public/fonts/inter-tight/`, required in the build), `apps/web/app/pages/docs/{saving.vue,licences.vue}`, `apps/web/test/{export-compute.test.ts,export.test.ts,settings.test.ts,desktop-menu.test.ts,check-build.test.ts,sync-assets.test.ts}`, `apps/web/e2e/{export.spec.ts,app-menu.spec.ts,offline.spec.ts,settings.spec.ts}`, `apps/desktop/e2e/files.spec.ts`

**Interfaces (Consumes):** `renderDocumentPdf`, `DOCUMENT_FONT_FILES`, `DocumentFontSet`, `DocNode` (Task 5); `parseMarkdown` (`markdown/parse.ts`); `PAPER_POINTS`'s `Paper`. **(Produces):**
```ts
// workers/export-compute.ts
export type ExportRequest =
  | { kind: 'pdf' | 'txt' | 'fdx'; source: string; template: Template }
  | { kind: 'markdown-pdf'; source: string; paper: Paper; title: string; lang: string };
export type ExportReply = { data: Uint8Array | string; missing?: string[] } | { error: string };
/** The five document fonts from the app's own origin: Inter Tight from /fonts/inter-tight/, Courier Prime Regular from /fonts/courier-prime/. */
export async function fetchDocumentFonts(fetcher?: (url: string) => Promise<Response>): Promise<DocumentFontSet>;
export function createExporter(loadFonts?: () => Promise<FontSet>, loadDocumentFonts?: () => Promise<DocumentFontSet>): (request: ExportRequest) => Promise<ExportReply>;
// storage/export-client.ts
export function renderExport(request: ExportRequest): Promise<{ data: Uint8Array | string; missing: string[] }>;
// storage/export.ts
export const MISSING_GLYPHS = 'Some characters aren’t in Drafter’s fonts and print as ?: ';
// settings.ts
markdownPaper: 'letter' | 'a4' // default 'letter'; PAPERS = ['letter', 'a4']
```

- The worker loads `parseMarkdown` with `await import('../markdown/parse')` on the first `markdown-pdf` (Call 21) and the document fonts once, kept, retried after a failure, as the script fonts are; a script's PDF loads neither.
- `exportScript('pdf')` for Markdown sends `{ kind: 'markdown-pdf', source, paper: settings.markdownPaper, title, lang: settings.spellLanguage }`, with the same `title` it names the file by. The success toast is `Exported <name>.` and, when `missing` is non-empty, ` ` + `MISSING_GLYPHS` + up to five joined with `, ` + `.`. The Markdown refusal for `pdf` goes; `fdx` and `md` refusals stay.
- The Export menu for Markdown: PDF (`data-first`), Markdown (.md), Plain text (.txt). The app menu: `['export-pdf', 'export-md', 'export-txt']`. `export-pdf`'s `enabled` goes (on for both).
- Settings: a select after Spelling language, as the design's copy.
- Help: Saving's row becomes "Export as PDF, plain text, or Final Draft (a Markdown document: PDF, its Markdown file, or plain text)"; Licences: Inter Tight "The interface’s typeface, and the text of a Markdown document’s PDF."; Courier Prime "The script’s typeface, on screen and in a PDF, and the code in a Markdown document’s PDF."

- [ ] **Step 1: Write the failing tests.** `export-compute.test.ts`: `writes a Markdown document's PDF on the paper asked for`, `loads the document fonts once, and not for a script`, `a script's PDF never loads the document fonts or the Markdown parser`, `answers the characters the fonts lack`, `asks the app's own folders for the five document fonts`, `fails with the file's name when a document font is missing`. `export.test.ts`: replace `says a PDF of a Markdown document isn’t available…` with `exports a Markdown document as a PDF, on the paper in Settings and in the spelling language` (the request), `names the PDF after the first heading, as the other exports`, `says which characters print as ?, up to five`. `settings.test.ts`: `paper for Markdown PDFs is US Letter by default, and a stored a4 is kept, and anything else isn't`. `desktop-menu.test.ts`: `File's Export as PDF is on for a Markdown document`. `check-build.test.ts` / `sync-assets.test.ts`: the four Inter Tight files are copied and required. e2e `export.spec.ts`: `exports the sample Markdown document as a PDF` (the sample from Help → Sample scripts; `PDFDocument.load`: one page, Letter; pdfjs text contains "Sample: Markdown" and "Pancake, the cat"; the link annotation is `https://drafter.dev/`; toast `Exported <name>.` with the name `fileNameFor('Sample: Markdown', '.pdf')` gives), `exports on A4 when Settings says so`, `says which characters print as ?` (types `漢字` into a new Markdown document), and, in Chromium, `exports a 100-page document in the worker` (a generated document pasted in; at least 100 pages; logs the time; test timeout 20 s). `app-menu.spec.ts`: `offers a Markdown document the PDF, the Markdown file, and plain text` (replacing `… not a PDF`), and the palette shows Export as PDF in one. `offline.spec.ts`: `exports a Markdown PDF offline: its fonts are cached`. `settings.spec.ts`: `shows the defaults` lists Paper for Markdown PDFs, US Letter. `apps/desktop/e2e/files.spec.ts`: `exports a Markdown document's PDF to a chosen path` (as `exports a PDF to a chosen path`).
- [ ] **Step 2: Run them.** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them again,** plus `markdown.spec.ts`, `palette.spec.ts`, `icons.spec.ts`, `tour.spec.ts`, `docs.spec.ts`, and `a11y.spec.ts` (unchanged and green), and `pnpm --filter @drafter/desktop e2e`. → PASS.
- [ ] **Step 5: Commit.** `feat(web): export a Markdown document as a PDF`

---

### Task 7: The docs and release prep

**Files:**
- Modify: `README.md`, `docs/drafter-phase2-design.md`, `docs/DECISIONS.md`, `docs/DEFERRED.md`, `docs/clean-room-audit.md` (the fonts it lists, if it lists them), `CHANGELOG.md`

- [ ] **Step 1: README.** The status line: "export to PDF and plain text" becomes "export to PDF (scripts and Markdown documents) and plain text", and "Next: PDF export for Markdown, and Highland and Fade In imports" becomes "Next: Highland and Fade In imports"; the roadmap's Phase 2 "Next, after the Structure strip: …" line becomes a built line ("PDF export for Markdown documents (built in v0.16.0): headings, lists, quotes, code, and clickable links on numbered US Letter or A4 pages, in Inter Tight") and a "Next: import from Highland and Fade In (moved up from Phase 3)" line; the Packages table's `@drafter/render-pdf` line says "Pages → PDF, with Courier Prime embedded; Markdown documents in Inter Tight"; the Stack table's PDF row adds fontkit if it isn't there; Design documents gets a line for the Markdown PDF design.
- [ ] **Step 2: The Phase 2 design.** In §22, a section `### Markdown PDF — v0.16.0` after the Structure strip's, pointing to this design, with **Status:** built (tagged PDF deferred); Plans E, F, G, and H become v0.17.0, v0.18.0, v0.19.0, and v0.20.0, the "Decided (2026-10-29)" paragraph saying the Markdown PDF took v0.16.0 and the imports release will move them once more. A line in §26 records the change.
- [ ] **Step 3: DECISIONS, DEFERRED, CHANGELOG.** Every Call of the design (§14) and of this plan in the `## Markdown PDF` section, as each landed, including a line that the 2026-10-26 decisions "The Export section lists only what the document kind exports" and "the PDF is on for a Fountain script" now give a Markdown document the PDF too. DEFERRED: the "PDF for Markdown documents" item goes; a `## Markdown PDF` group gets the design's §12 list, one line each, and "Tagged PDF and PDF/UA, for scripts and documents" with "PDF bookmarks from the headings" (the final accessibility steps). CHANGELOG `[Unreleased]` has the feature under Added, in the writer's words, and the setting.
- [ ] **Step 4: Run the whole suite:** `pnpm -r build`, `pnpm -r typecheck`, `pnpm test`, `pnpm check`, the web e2e (`E2E_PORT=4175`), and `pnpm --filter @drafter/desktop e2e`. → PASS, with the existing axe tests green.
- [ ] **Step 5: Commit.** `docs: Export as PDF for Markdown documents`
- [ ] **Step 6: Push** `markdown-pdf` and watch CI. Don't merge or tag: the controller releases v0.16.0.

---

## Calls in this plan

The design's 29 Calls (its §14) are binding and get their DECISIONS lines as they land. This plan adds:

30. **`mdast-util-from-markdown` is a development dependency of `@drafter/render-pdf`**, at the app's range, so its tests build trees from real Markdown; the runtime takes `DocNode` (Task 1).
31. **The indent stops growing at a quarter of the text width**, so deep nesting never pushes text off the page (Task 2).
32. **`drawable` moves to `src/text.ts`**, shared by both renderers (Task 3).
33. **`scaling.ts` is copied into `@drafter/render-pdf`'s tests**, with an `async` variant, rather than imported across packages (Task 4).
34. **The 100-page budget is logged, not asserted,** by a Node test and a Chromium e2e test; the Node test fails only past `HANG_MS` (30 s, as `scaling.ts` has it), the e2e test past 20 s (Tasks 5, 6).
35. **The request is its own kind, `markdown-pdf`,** carrying paper, title, and language instead of a template, and the reply carries `missing` (Task 6).
36. **If Google Fonts no longer serves Inter Tight v9's static styles**, the implementer stops and reports rather than taking another version or instancing the variable font (Task 1).
