# Drafter: the manuscript exports (v0.26.1)

**Status:** approved by the maintainer 2026-11-05 ("yes sounds good"), with choice 1 below: one `PAGE` field in the Word file's header. Written straight from the approved Novel design (`drafter-novel-design.md`, goal 8) at the maintainer's request ("just begin with the design doc… see something first, and then tweak"), so every choice not already in that design is marked **my call** and is open to change.

## One decision for you first: page numbers in the Word file

A manuscript's running header carries the page number on every page. In a `.docx`, Word can only number pages by itself with a **page-number field** (`PAGE`). Your global rule is "never leave Word field codes in a generated `.docx`", because field codes can make Word ask *"This document contains links that may refer to other files. Do you want to update…"*. The Novel design hoped plain header text would do; it can't, because the header is one piece of text repeated on every page, so plain text would print the same number on all of them.

The choices:

1. **Recommended: allow exactly one `PAGE` field, in the header, and nothing else.** The dialog comes from fields that point outside the document (`TOC`, `LINK`, `INCLUDETEXT`, `INCLUDEPICTURE`, OLE objects) and from `updateFields` in the settings, as your rule itself lists. A `PAGE` field points at nothing outside and needs no update: Word, Pages, LibreOffice, and Google Docs all show the right number on open, with no prompt. The test would check for exactly one `PAGE` field, in the header, no other field anywhere, and no `updateFields`, and the maintainer opens one in Word on a Mac before the release.
2. **No page numbers in the Word file.** The header has the surname and short title only, and the Help says to add numbers with Insert → Page Number. This keeps the rule to the letter, but it sends out a manuscript that agents' guidelines would call incomplete.
3. **Word file without a header at all.** The same, plainer.

**Chosen: 1** (the maintainer, 2026-11-05). The test allows exactly one `PAGE` field, in the header, and no other field anywhere.

## Why

A novelist drafting in Drafter has to send the book out: to an agent, an editor, a contest, or a writing group. Every one of them expects **standard manuscript format**, and most now ask for a Word file, some for a PDF. Today a novelist would have to copy the text into Word and format it by hand, and redo that after every revision. These exports make the finished file one click from the draft, from the same Markdown, every time.

## Goals

1. **Export → Manuscript (PDF)…** and **Export → Manuscript (Word)…**, for a novel only (a Markdown document whose template is `novel`), in the Export menu, the Drafter menu's exports, the palette, and the desktop app's File → Export.
2. **Standard manuscript format, the common modern form:**
   - US Letter or A4 (the setting Markdown PDFs already use), 1-inch margins on every side.
   - **Font:** Times-style serif by default, Courier as the choice; 12 pt either way.
   - **Double-spaced body**; every paragraph's first line indented half an inch; no extra space between paragraphs; left-aligned, never justified.
   - **A title page:** the writer's legal name and contact lines at the top left, the word count at the top right ("about 87,000 words"), and the title centered halfway down with "by" and the byline under it. No header on the title page.
   - **A running header on every other page, at the top right:** `Surname / SHORT TITLE / 12`.
   - **Each chapter starts on a new page, a third of the way down,** with its title centered (a chapter that is only a number, "Chapter 3" or "3", is printed as written).
   - **A scene break is a centered `#`,** on its own double-spaced line.
   - **`END`,** centered, after the last line (**my call**: an old convention that many guides still give, and harmless).
3. **The details come from the writer once and stay with the book.** A **Manuscript details** dialog opens before either export, the way the Story map's does: title, byline (the name on the cover), legal name, contact lines, short title, surname for the header, and the font. They're kept in the book's metadata comment, so the next export asks nothing new and opens on the same answers.
4. **The same book, two files, the same layout.** The PDF and the Word file come from one layout description, so a page break in one is a page break in the other wherever Word's own line breaking allows.
5. **Private, like everything else.** Nothing is fetched; the fonts are in the app, and both files are made in the export worker, in the browser or the desktop app.

## Non-goals

- **Other manuscript conventions** (Shunn's classic Courier-only form with underlines for italics, screenplay-style headers, a contest's anonymous format). The two fonts cover the common asks; a contest's "no name in the header" is the next most likely request, and the header line is built so that it's a small change later.
- **A synopsis, a query letter, or a chapter outline as a document.** The synopses in the Outline stay notes for the writer.
- **The CLI** (`drafter build --manuscript`). The command line already exports HTML; the manuscript can follow when someone asks (**my call**).
- **Editing the manuscript inside Drafter.** The Word file is for sending; changes go back into the Markdown.
- **Images, tables, and footnotes as a designer would set them.** A novel rarely has them. What happens to each is listed under Layout, so nothing is dropped silently.

## Anti-goals (what would make this a failure even if it works)

- **Word asks a question on opening the file**, or shows a "compatibility mode" banner, or shows red squiggles because the language is wrong. The file opens clean, in Word's normal view, with the language the spellcheck setting names.
- **A writer's text changes** on the way out: a word missing, a quote straightened, italics lost. The export is the text as written, laid out.
- **Contact details leave the device** or end up anywhere but the writer's own file and their own exports.
- **The PDF and the Word file disagree** about what a chapter, a scene break, or the word count is.

## The Manuscript details dialog

Opened by either export, with **Export PDF** or **Export Word file** as its main button (whichever was chosen) and **Cancel**. Every field is optional; a blank one is left off the page, never printed as a placeholder.

| Field | Prefilled with | Prints as |
|---|---|---|
| Title | the book's first heading that isn't a part or a chapter number, else the file name (**my call**) | the title page, centered |
| Byline | empty | "by …" under the title; and the default for the legal name |
| Legal name | the byline | the first contact line (agents pay the legal name) |
| Contact | empty; a few lines (address, phone, email) | under the legal name, top left |
| Surname for the header | the last word of the byline | the header's first part |
| Short title | the title, cut to its first three words, in capitals (**my call**) | the header's second part |
| Font | Times-style | the whole manuscript |
| Word count | counted, not editable | top right: "about 87,000 words" |

- **Kept in the book.** The answers are stored in the trailing metadata comment, under `novel.manuscript`, with the other facts; `readFacts` and `writeFacts` gain the key, as hostile-input-safe as the rest (each string capped, the contact at 10 lines of 200 characters). One undo step, like a status change. The dialog says plainly that the details are saved in the book's file, so anyone the writer gives the Markdown file to can read them.
- **Word count** is the book's prose: the words of every paragraph, heading, and quote, the same count the Outline totals, not counting the metadata comment. Rounded to the nearest thousand from 1,000 up ("about 87,000 words") and to the nearest hundred below (**my call**: the common guidance).
- It passes axe in both themes, is reached and left by keyboard, and says what it is to a screen reader, like the Story map's dialog.

## Layout

One description of the manuscript, built from the novel's structure (`@drafter/novel`) and the Markdown tree, drives both writers. The parts:

- **Parts** (`# Part One`): a page of their own, the part's title centered halfway down; the next chapter starts on the following page (**my call**).
- **Chapters** (`#`): a new page; the title a third of the way down, centered, in the body font, not bold (**my call**: plain is the convention); the text starts two double-spaced lines below it.
- **Sections** (`##` or `***`): a scene break, a centered `#`, between two sections; a section's heading text is not printed (**my call**: manuscripts don't title scenes; the writer's section titles are their own navigation). No `#` before a chapter's first section.
- **Paragraphs:** first-line indent half an inch, every paragraph, including the first after a heading or a break (**my call**: the common manuscript rule; book typesetting's flush first paragraph is the publisher's job).
- **Italic and bold** stay italic and bold. **Links** print as their text. **Inline code** prints in the body font.
- **Block quotes** (letters, epigraphs): indented half an inch on both sides, still double-spaced.
- **Lists:** each item its own paragraph, with its bullet or number, indented.
- **Footnotes:** collected as endnotes on a page headed "Notes" after `END` (**my call**: footnotes in a manuscript are rare and Word's footnote parts add risk).
- **Tables and code blocks:** each row or line its own paragraph, in the body font (Courier for a code block); no grid.
- **Images:** never fetched; the description is printed in brackets, "[Image: the lighthouse at dusk]".
- **The metadata comment and HTML comments** never print.
- **Widows and orphans:** at least two lines of a paragraph on each side of a page break, as the document PDF already does (`MIN_LINES`); a chapter title is never the last thing on a page.
- **Characters the font lacks** print as `?` in the PDF, and the toast names them, as the Markdown PDF already does. The Word file keeps every character and leaves it to Word's own font fallback.

## The PDF

- Laid out by `@drafter/render-pdf`'s document path (`layoutDocument`, `paginate`), extended with a manuscript style: fixed 12 pt, double leading (24 pt), the indents and positions above, the header on every page after the title page, and page numbers counting the title page as page 1 (**my call**: so the first chapter's first page is page 2, as Word numbers it too).
- **Fonts:** Courier Prime (already bundled, all four styles) for Courier, and **Liberation Serif** (SIL Open Font License, metrically compatible with Times New Roman) for the Times-style choice: four faces, about 1.5 MB, fetched by the export worker only when a manuscript is exported, and added to the offline cache like the other fonts (**my call**: Times New Roman itself can't be shipped, and pdf-lib's built-in Times can't print anything outside Western European characters). Its licence goes beside it, as Courier Prime's and Inter Tight's do.
- Title and author in the PDF's metadata; the language from the spellcheck setting, as the Markdown PDF does.
- The export progress bar the Markdown PDF has, for a long book; a 120,000-word novel exports within a few seconds on an ordinary laptop.

## The Word file

- A new package, **`@drafter/render-docx`**, writes the few parts a `.docx` needs, by hand, with no docx library (as the Novel design said): `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/styles.xml`, `word/settings.xml`, `word/header1.xml`, `word/_rels/document.xml.rels`, `docProps/core.xml` (title, creator) and `docProps/app.xml`, zipped with `@drafter/archive`'s writer.
- **Styles, not direct formatting:** `Normal` (12 pt, double, first-line indent), `Title`, `Chapter Title` (page break before, space before for the third-down position), `Scene Break` (centered), `Block Quote`, `Part Title`. A writer or editor who changes a style in Word changes the whole book, as editors expect.
- **The title page** is its own section with no header (`w:titlePg`), so the header starts on page 2.
- **The header:** right-aligned `Surname / SHORT TITLE / ` followed by the page number, which depends on your decision above.
- **Settings:** compatibility mode for Word 2013 and later (`w:compatSetting` 15), no `updateFields`, the document language set, track changes off, no protection.
- **Checks in the tests:** the zip opens; every part is well-formed XML; the content types and relationships name every part; there is no `w:instrText`, no `w:fldChar`, no `updateFields`, no external relationship, and fields only as the decision allows. Before the release, the maintainer opens one in Word on a Mac and in Pages, and one goes through LibreOffice headless to PDF on the build machine, to see it lay out.

## Where it sits in the app

- **Export menu:** after the Markdown items, a novel shows **Manuscript (PDF)…** and **Manuscript (Word)…**; a plain Markdown document and a script don't. Both commands are in the palette (with keywords "submission", "agent", "standard manuscript format", "docx") and in the desktop File → Export menu.
- **File names:** `The Salt Road – manuscript.pdf` and `.docx` (**my call**, like the Story map's "– story map.html").
- **Export options** don't apply: the manuscript has its own dialog. A book's notes never go into a manuscript.
- **Help:** the Novel help page gains "Sending it out", with what the format is, what each detail is for, and the page-number answer for Word. What's new gets an entry, and the README's formats list a row.

## Testing

- **Unit, in `@drafter/novel` and the layout:** the details' reading and writing (hostile input, caps, one undo); the word count and its rounding; the title fallbacks; the description of a book with parts, chapters, sections, `***` breaks, quotes, lists, footnotes, images, and a chapter that is only a number.
- **The PDF:** page count and positions on a fixed book (the title page, a chapter a third down, the header's text on page 2, no header on page 1, `END` last), widows and orphans, both fonts, both papers, a character the font lacks.
- **The Word file:** the structural checks above, on the same fixed book, and the same page-break and style choices as the PDF's description.
- **Browser tests:** the dialog's fields, prefills, and memory across a reload; both exports from the Export menu, the Drafter menu, and the palette; a plain Markdown document and a script not offering them; the dialog passing axe in both themes; the desktop app exporting both.
- **Trap documents:** a book of 20,000 chapters, a 50,000-character title, contact lines full of XML-looking text (`<w:fldChar/>`, `]]>`), and right-to-left text, each exporting both files without throwing or breaking the XML.
- **A timed test** in the release gates: a 120,000-word novel to both files, each within a budget set from a measured run.

## Decided before this document

From the approved Novel design: the two exports, the format's main rules, no Word field codes, a hand-written `.docx` in `@drafter/render-docx`, the PDF through `@drafter/render-pdf`, and the release, v0.26.1.

## Left to the builder

The exact shape of the shared layout description; how the manuscript style plugs into `layoutDocument` (a style object, or a separate layout over the same measure); the order of XML attributes; and test fixture text, written fresh and original.
