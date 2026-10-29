# Export as PDF for Markdown documents — Design

**Status:** designed 2026-10-29, to ship as v0.16.0, right after the Structure strip (v0.15.0). The plan is [`docs/plans/2026-10-29-markdown-pdf.md`](plans/2026-10-29-markdown-pdf.md).

**Asked for (maintainer, 2026-10-29):** "is it possible to export as pdf -- the script (play/screen/markdown)", then "yes please". Screenplays and stage plays already export as PDF. Markdown documents don't: `storage/export.ts` refuses with "A PDF of a Markdown document isn’t available yet", the Export menu and the app menu leave the item out, the palette hides `export-pdf`, and `docs/DEFERRED.md` lists it ("PDF for Markdown documents").

**Clean room (binding).** The page layout is Drafter's own, written for this release from the CommonMark tree Drafter already reads: its sizes, spacing, and rules are chosen here, not traced from another app, word processor, or Markdown-to-PDF converter. No code, stylesheets, or fixtures from any of them. Every sample document in the tests is original text written for Drafter.

Each choice open to the designer is marked **Call:**, and all of them are listed in §14.

## 1. What it is

**Export as PDF** works for a Markdown document as it does for a script: from the toolbar's Export menu, the app menu, the palette, and the desktop app's File menu, with the same picker or download, the same file name (the document's first heading, else its file's name, then `.pdf`), and the same toast. The PDF is a clean, printable document: headings, paragraphs, emphasis, code, quotes, lists, links that can be clicked, and rules, on numbered pages of US Letter or A4.

It's not a screenplay page. A Markdown document in Drafter is a treatment, an outline, notes, or a pitch, and its PDF is set like a document: a proportional typeface, ragged right, and headings that are larger than the text.

Plain text and Markdown file exports are unchanged.

## 2. What prints, and how

The tree is the one the Preview draws: CommonMark only, read by `mdast-util-from-markdown` (§9). So the PDF prints what the Preview shows, element for element, with two differences that paper allows (links work, §2.6; pages break, §4).

### 2.1 The page

- **Call:** margins of 1 inch (72 pt) on all four sides; the text is 468 pt wide on US Letter and 451.28 pt on A4. The page number sits in the bottom margin (§5).
- **Call:** text is ragged right, never justified. pdf-lib places glyphs without kerning, and justified text without hyphenation leaves gaps; ragged right reads well at any width.

### 2.2 Type

- **Call:** **Inter Tight** for the text, as Drafter's interface uses, in four static styles: Regular (400), Italic (400), SemiBold (600), and SemiBold Italic (600). Strong text and headings are SemiBold, as Drafter's headlines are (brand README). Courier Prime Regular for code, the face Drafter's scripts are set in.
- The fonts must be new files. What ships today can't be embedded: the interface's Inter Tight is a variable WOFF2 split into Latin and Latin Extended halves with no italic (`apps/web/app/assets/fonts/inter-tight/`), and `brand/fonts/` holds only SemiBold and ExtraBold. The plan adds four static TTFs from the same source the brand files came from (Google Fonts, `fonts.gstatic.com/s/intertight/v9`, OFL 1.1, copyright 2022 The Inter Project Authors) to `packages/render-pdf/fonts/inter-tight/`, with their licence and SHA-256 sums, and updates the Inter Tight row of `docs/DEPENDENCIES.md` first. SemiBold is the same file as the brand's (same SHA-256). They're fonts, not code, and under the licence Drafter already ships Inter Tight under.
- **Call:** not the 14 standard PDF fonts (Helvetica, Times). They need no file, but pdf-lib can draw only WinAnsi characters with them and throws on anything else, and a viewer substitutes its own face, so the same document prints differently on different machines.

| Element | Face | Size / line |
|---|---|---|
| Text | Inter Tight Regular | 11 / 16 pt |
| Heading 1 | Inter Tight SemiBold | 22 / 28 pt |
| Heading 2 | Inter Tight SemiBold | 17 / 22 pt |
| Heading 3 | Inter Tight SemiBold | 14 / 19 pt |
| Headings 4–6 | Inter Tight SemiBold | 11 / 16 pt (4 in black, 5 and 6 in the muted gray) |
| Inline code | Courier Prime Regular | 10 pt, on the text's line |
| Code block | Courier Prime Regular | 9.5 / 13 pt |
| Page number | Inter Tight Regular | 9 pt, muted gray |

**Call:** these sizes and the spacing below. Space before a block: 8 pt between text blocks; 24, 20, 16, and 12 pt before headings 1, 2, 3, and 4–6; 6 pt between a heading and what follows it. Two colors besides black: muted gray `#555555` and link blue `#1f4e9a`; code panels are filled `#f3f3f3`, rules and quote bars `#9a9a9a`. All of them print legibly in black and white.

### 2.3 Blocks

- **Headings** (`#` to `######`, and Setext headings): as the table.
- **Paragraphs:** a soft line break is a space; a **hard line break** (two spaces or a backslash at the line's end) starts a new line.
- **Block quotes:** indented 16 pt, with a 2 pt bar in the left of the indent, running the full height of the quote on each page it's on (unbroken between the quote's paragraphs). Nested quotes indent again and add a bar. **Call:** the quote's text stays in its own styles, not italic, so emphasis inside a quote still shows.
- **Lists:** each level indents 18 pt, the marker hanging in the indent. Ordered lists number from their `start` (a list starting at 3 prints 3., 4., …), right-aligned so 9. and 10. line up. **Call:** bullets are •, ◦, and ▪ at levels 1, 2, and 3 and deeper, if Inter Tight has those glyphs (a test checks; otherwise •, –, and ·). A tight list has no space between items; a loose one has 4 pt.
- **Code blocks** (fenced or indented): Courier Prime on a light panel with 8 pt padding, tabs as four spaces, every space kept. **Call:** a line wider than the panel wraps at the character that meets the edge, with nothing added; the language after a fence is ignored (no highlighting).
- **Thematic breaks** (`---`): a 0.5 pt rule across the text width, 12 pt clear of the text above and below. A writer's scene break in a treatment prints as a rule.
- **Raw HTML blocks:** printed as typed, in Courier Prime at 9.5 pt with no panel, as the Preview shows them (`.md-raw`: the writer's text, never markup).
- **Link reference definitions** print nothing; they only give their links an address.

### 2.4 Inline

- `*emphasis*` is Italic, `**strong**` SemiBold, both together SemiBold Italic.
- `` `code` `` is Courier Prime at 10 pt; **Call:** no shaded background (the change of face is enough, and a background split across a line break looks broken).
- Inline HTML is printed as typed, as the Preview does.
- Character references (`&amp;`, `&#8212;`) and backslash escapes print as the characters they stand for (the parser resolves them).

### 2.5 Images

**Call:** images are not drawn. An image prints as the Preview shows it, `[Image: <description>]` (`[Image: no description]` without one), in the muted gray and Italic. Drafter never fetches anything for a document, and the export worker can reach only its own origin (`connect-src 'self'`). Drawing images from the writer's own files is deferred (§12).

### 2.6 Links

- A link's text is link blue and underlined (0.5 pt, 1.5 pt under the baseline) and carries a **PDF link annotation** to its address, one rectangle per line the text falls on. Inline links, reference links (`[text][ref]`, `[ref]`), and autolinks (`<https://…>`) all count.
- **Call:** only `http:`, `https:`, and `mailto:` addresses become annotations, after `new URL()` accepts them, written as ASCII (`URL.href`). Any other address (`javascript:`, `file:`, `data:`, a relative path, a `#heading`) prints as plain text, neither blue nor underlined, so nothing on the page looks clickable that isn't, and a PDF never carries an address that could run something. This is the Preview's rule (it makes no `href` at all) loosened only as far as DEFERRED's own note on links already proposed.
- **Call:** the address isn't printed beside the text. On paper the link is just its words. A list of addresses at the end, for a printed copy, is deferred.
- CommonMark has no bare-URL links (that's GitHub's extension), so `https://drafter.dev` written without `<>` prints as text, as the Preview shows it.

### 2.7 What CommonMark doesn't have

Tables, strikethrough, task lists, and footnotes are GitHub extensions the parser doesn't read (`parse.ts`: "Only CommonMark: no extensions"). They print as the Preview shows them today: a table's lines as a paragraph with its pipes, `~~words~~` with its tildes. Reading GitHub's extensions is a change to the parser and the Preview together, deferred (§12).

### 2.8 Characters the fonts don't have

Inter Tight covers Latin (with its extensions), Greek, Cyrillic, and Vietnamese; Courier Prime covers less. pdf-lib doesn't shape text, so right-to-left and joining scripts couldn't print correctly in any case.

- **Call:** a character its face has no glyph for prints as `?`, and the export still succeeds; the toast then says so, naming up to five of them: "Exported Notes.pdf. Some characters aren’t in Drafter’s fonts and print as ?: 漢, 字." Nothing is lost without the writer being told (Drafter's rule for imports, here for exports). Fonts for more scripts are deferred (§12).
- Control characters become spaces and unpaired surrogates `?`, as the screenplay renderer cleans text (`drawable` in `render.ts`); a soft hyphen (U+00AD) is dropped; a no-break space never breaks.

## 3. Breaking lines

- **Call:** the text breaks at spaces (U+0020) and after a zero-width space (U+200B), greedily, first fit. A word wider than the line breaks at the character that would overflow it (long addresses). Each run of one style on one line is drawn with one text operator, spaces included, so a viewer's search and copy read whole words in order.
- Widths come from the font files' own advance widths, through fontkit, the same numbers pdf-lib uses when it draws (it lays out glyphs without kerning, so a run's width is the sum of its words' and spaces' widths). This is what technical design §5.2 asks of proportional fonts: the font's bytes, never `OffscreenCanvas.measureText`, so the layout is the same in Node and every browser.

## 4. Breaking pages

A page holds lines from the top of the text area down; every line is placed once, in order.

- **Call:** **no space at the top of a page.** A block's space before is dropped when the block starts a page.
- **Call:** **widows and orphans:** a block that splits leaves at least 2 lines at the foot of the page and carries at least 2 to the next, so a paragraph of 2 or 3 lines never splits, and one of 4 or more splits only between its second line and its second-to-last. Paragraphs, list items' text, quoted text, code blocks, and raw HTML all follow it.
- **Call:** **a heading stays with what follows it:** a heading (with any headings directly under it, a `##` right after a `#`) moves to the next page unless the first 2 lines of the block after it fit under it on this page (all of it, if it has fewer). A heading never ends a page unless it is the document's last block.
- A list item's marker is on its first line, so the widow and orphan rule keeps the marker with its text.
- A rule and a single-line block move whole.
- **Call:** when a rule can't be kept (a heading with the block after it taller than a page, or a block with too few lines to split taller than the space on an empty page), the lines fill the page as they come. The rules never move text off the end of a document or loop.
- A code panel and a quote bar are drawn for each page's part of the block.
- An empty document can't be exported ("Nothing to export yet.", as today); a document that prints nothing (only definitions) is one blank page, as an empty screenplay layout is.

## 5. Page numbers and metadata

- **Call:** every page is numbered at the foot, centered, the number alone ("3"), its baseline 36 pt above the bottom edge, from 1 on the first page, when the document has two or more pages. A one-page document has no number. No running header.
- **The title** in the PDF's metadata is the document's title as the export names the file (`markdownTitle(source)`, else the file's base name), shown in the viewer's title bar. Creator "Drafter", producer "Drafter, with pdf-lib", and no dates or random IDs, so the same document always gives the same bytes (as `renderPdf` does).
- **Call:** the PDF's language (`/Lang`) is the spellcheck's language, `en-US` or `en-GB`. A screen reader and a viewer's read-aloud use it, and it costs one line.

## 6. Paper size

A screenplay's paper comes from its template (`template.page.paper`; both built-ins are US Letter). A Markdown document has no template.

- **Call:** a new setting, **Paper for Markdown PDFs**, `markdownPaper: 'letter' | 'a4'`, **US Letter by default**, a select in Settings after Spelling language ("The paper size of a Markdown document’s PDF. Screenplays and stage plays use their template’s paper."). Remembered on this device, like every setting. Reason: A4 is the paper everywhere outside the US and Canada, and a document, unlike a screenplay, has no industry page to keep; one select costs little. A setting from the system's locale was considered and dropped: it makes the default differ between machines and test runs. The sizes are `PAPER_POINTS` from `@drafter/templates` (612 × 792 pt and 595.28 × 841.89 pt).
- A screenplay's or a stage play's PDF never reads this setting.

## 7. Where it runs

- In the export worker (`workers/export.worker.ts`), beside the screenplay PDF, so a long document never stops the editor.
- **Call:** the worker parses the text itself, with the app's `parseMarkdown`, imported on the first Markdown PDF (a dynamic `import()`), so a screenplay export doesn't load the Markdown parser. It doesn't reuse the Preview's tree: that tree lags the text by a pause in typing and has its positions stripped, while an export must be of the text as it stands when it starts (`exportScript` takes the text once, with the name).
- The worker fetches the four Inter Tight files and Courier Prime Regular from the app's own origin on the first Markdown PDF and keeps them, as it keeps Courier Prime's four for scripts; a failed load is tried again next time. **Call:** the Inter Tight files are served at `/fonts/inter-tight/` and **precached** by the service worker (about 1.2 MB, compressed in transit), so a Markdown PDF works offline as a screenplay PDF does (`offline.spec.ts` checks one now). `scripts/check-build.mjs` fails a build that lacks them.

## 8. Performance

- Layout is one pass: each block is wrapped once, each line placed once, and a heading's look-ahead reaches only the next block's first two lines. Word widths are cached per face and size for the export.
- **Budget:** a 100-page document (about 50,000 words, in a mix of headings, paragraphs, lists, quotes, and code) exports in the Chromium worker in under 3 seconds on the maintainer's machine, measured by an e2e test that records the time and fails only past 20 seconds (a hang guard, since wall-clock unit budgets fail under load: DECISIONS, 2026-10-29).
- **Scaling:** layout grows linearly with the document, by the growth test `@drafter/fdx` uses (`packages/fdx/test/scaling.ts`: n and 4n, best of five runs each, growth under 8), and so does the whole render, with an `async` variant of the same helper.

## 9. Where the code goes

- **Call:** the layout and drawing are a new module of `@drafter/render-pdf`, `src/document/`, beside the screenplay renderer, exporting `renderDocumentPdf` and the pure `layoutDocument` it's built on. Reasons: it is the PDF package, it already brings pdf-lib and fontkit and owns the embedded fonts, and its tests already read PDFs back with pdfjs; a new package would repeat all of that. The module takes a **structural tree type of its own** (`DocNode`: the fields of an mdast node it reads), so the package depends on no Markdown library at runtime; its tests build trees from real Markdown with `mdast-util-from-markdown` as a **development dependency** (a `docs/DEPENDENCIES.md` row first; the app already depends on it).
- **Call:** layout is a pure function over the tree, the paper, and a `Measure` (a width and a has-glyph check per face), so its tests run with a fixed-width fake and need no fonts; production builds the `Measure` from the font files with fontkit (`fontMeasure`).
- `apps/web` keeps the parse (`markdown/parse.ts`), the request (`workers/export-compute.ts`), the setting, the menus, and the toast.
- **Call:** the command line (`drafter build notes.md --pdf`) is not in this release. It would make the CLI depend on the Markdown parser at runtime; the API is in place for when it's asked for (§12).

## 10. Menus and commands

- **Call:** `export-pdf` is on for both kinds. The toolbar's Export menu lists, for a Markdown document, **PDF**, **Markdown (.md)**, then **Plain text (.txt)**: the PDF first in both kinds, so it is always where the writer last found it. The app menu's Export section gives `export-pdf`, `export-md`, `export-txt` for Markdown. The palette shows Export as PDF in both. The desktop app's File menu already lists every File command and takes `enabled` from the command, so it turns on by itself; a test pins it.
- The refusal "A PDF of a Markdown document isn’t available yet…" goes.
- The Saving help page's row "Export as PDF, plain text, or Final Draft" adds "(a Markdown document: PDF, its Markdown file, or plain text)"; the Third-party licences page says Inter Tight is also the typeface of a Markdown document's PDF, and Courier Prime of its code.

## 11. Accessibility

Accessibility work waits for the final steps (maintainer, 2026-10-28), and the screenplay PDF's own accessibility was left outside the accessibility pass (DECISIONS, 2026-10-28).

- **Call:** the PDF is **not tagged** (no structure tree, no PDF/UA). pdf-lib has no API for one, and a hand-built structure tree with marked content is a project of its own that both kinds of PDF should share. What this release does give: real text in reading order (searchable, selectable, read aloud by viewers that read untagged text), a title shown in the title bar, and a language (§5). Tagged PDF for both kinds goes in `docs/DEFERRED.md`, with PDF bookmarks from the headings.
- The menus change only by an item, so the existing axe tests cover them; no new axe tests.

## 12. Not in v1

Tagged PDF and PDF/UA, for scripts and documents; PDF bookmarks from the headings; links to headings inside the document (`#…`); a list of link addresses for print; drawing images; GitHub's tables, strikethrough, task lists, and footnotes (with the Preview); syntax highlighting in code; fonts for more scripts, and right-to-left and joining scripts; a running header; justified text and hyphenation; `drafter build` for Markdown. Each is a line in `docs/DEFERRED.md`.

## 13. The plan list shifts by one minor

The Markdown PDF takes v0.16.0, so the Phase 2 plans after the Structure strip each move up one minor, as §22 of the Phase 2 design said they would:

| Plan | Was | Now |
|---|---|---|
| Structure strip | v0.15.0 | v0.15.0 |
| **Markdown PDF** | — | **v0.16.0** |
| E — Seeing the script | v0.16.0 | v0.17.0 |
| F — The Beat Board | v0.17.0 | v0.18.0 |
| G — Reader notes | v0.18.0 | v0.19.0 |
| H — Reference | v0.19.0 | v0.20.0 |

The imports release (Highland, Fade In, Markdown), planned as `v0.N.0` after this one, will move them down once more when it lands. The letters stay, so the Phase 2 design still reads.

## 14. Calls

1. Margins of 1 inch all round; ragged right, never justified (§2.1).
2. Inter Tight (Regular, Italic, SemiBold, SemiBold Italic; strong and headings SemiBold) for text, Courier Prime Regular for code; four new static TTFs, with their DEPENDENCIES row first (§2.2).
3. Not the standard PDF fonts (§2.2).
4. The sizes, spacing, and colors of §2.2's table and paragraph (§2.2).
5. Quotes indented with a bar, their text in its own styles (§2.3).
6. Bullets •, ◦, ▪ if Inter Tight has them, else •, –, · ; ordered lists from `start`, right-aligned (§2.3).
7. Code blocks on a panel, wrapped at the edge with nothing added, no highlighting (§2.3).
8. Inline code in Courier Prime with no background (§2.4).
9. Images print as `[Image: …]`, as in the Preview; nothing fetched (§2.5).
10. Link annotations only for `http:`, `https:`, and `mailto:`, checked by `new URL()`; other addresses print as plain text (§2.6).
11. A link's address isn't printed (§2.6).
12. A character the face lacks prints as `?`, and the toast names up to five (§2.8).
13. Lines break at spaces and zero-width spaces, first fit; an overlong word at the edge; one text operator per run per line (§3).
14. No space at the top of a page (§4).
15. Widows and orphans: at least 2 lines each side of a split (§4).
16. A heading (and headings directly under it) stays with the first 2 lines of what follows (§4).
17. When a rule can't be kept, lines fill the page as they come (§4).
18. Page numbers at the foot, centered, alone, from 1, only with two or more pages; no header (§5).
19. The PDF's language is the spellcheck's (§5).
20. A `markdownPaper` setting, US Letter by default, A4 the other choice; scripts keep their template's paper (§6).
21. The worker parses the text itself, loading the parser on the first Markdown PDF (§7).
22. Inter Tight served at `/fonts/inter-tight/` and precached, so it works offline (§7).
23. A 3-second budget for 100 pages, checked with a 20-second hang guard; linear growth by the scaling test (§8).
24. The layout in `@drafter/render-pdf` (`src/document/`), over its own `DocNode` type, with `mdast-util-from-markdown` as a development dependency (§9).
25. Layout pure over a `Measure`; fontkit builds the real one (§9).
26. No `drafter build` for Markdown in v1 (§9).
27. `export-pdf` on for both kinds; PDF first in a Markdown document's Export menu (§10).
28. Untagged; tagged PDF and bookmarks deferred for both kinds (§11).
29. The Markdown PDF is v0.16.0; Plans E–H move to v0.17.0–v0.20.0 (§13).
