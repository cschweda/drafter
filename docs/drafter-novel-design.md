# Novel: a design

**Status:** approved by the maintainer 2026-11-03, with the three answers below. The drafting place ships in **v0.26.0**, and the manuscript exports in **v0.26.1**.

## Why

The maintainer, 2026-10-30:
- "I want novel writers to feel like they can select something — like a play writer or a screen writer."
- "More about a comfortable place to draft one — sections within a chapter, a full chapter, etc."

Drafter can already hold prose: a **Markdown document** has a Preview, word counts, a daily word goal, and PDF, HTML, EPUB, `.md`, and `.txt` exports. But it is a plain text box. It has no way to see the book's shape, move a chapter, or work on one passage at a time. A novelist has nowhere to stand.

**Novel** gives them that, as a first-class choice beside Screenplay and Stage play. Underneath it stays one plain Markdown file, so nothing is locked in: Fountain for scripts, Markdown for prose.

## Goals

1. **A choice of its own.** "Novel" sits in every New chooser and in the template chip, after Stage play and before "Markdown (plain text)". A sample novel (original, invented) shows what it does.
2. **Chapters and sections, in plain Markdown.**
   - A chapter is a `#` heading. A section within it is a `##` heading.
   - A scene break (`***` or `* * *`) also starts a section, an untitled one.
   - A part is optional: a `#` heading that begins with "Part" (`# Part One`) groups the chapters under it.
3. **The Outline for a novel.** It lists parts, chapters, and sections, and drag (or keyboard Move up/down) reorders them, carrying their text along. It is the same Outline tab scripts use, and the same keys.
4. **Focus on one chapter, or one section.** The editor shows only that passage; the rest of the book is folded away, not deleted. One key or one click returns to the whole book. It joins focus mode, which hides the app around the editor.
5. **Counts for each chapter and section.**
   - Each part, chapter, and section shows its word count in the Outline.
   - Each can have a word target and a progress bar.
   - The book can have a total target ("90,000 words").
   - The daily word goal and sprints work as they already do.
6. **A synopsis and a status for each.** Status is one of To do, Draft, Revised, or Done; synopses work as cards do for scenes. Both are kept in the file and shown in the Outline and on Cards.
7. **Cards for a novel.** Chapters and sections as cards, in order, with their synopsis, status, and count. Drag a card to reorder, as with scenes.
8. **Manuscript format, second in the release.**
   - **Export → Manuscript (PDF).** The standard submission format: 12 pt Courier or Times; double-spaced; 1-inch margins; indented paragraphs; a running header of the surname, the short title, and the page number; a title page with contact details and the word count rounded to the nearest thousand; each chapter a third of the way down a new page; scene breaks as a centred `#`.
   - **Export → Manuscript (Word .docx)**, the same layout, with **no Word field codes**: no TOC, page or date fields, so Word never asks to "update links". The page number is plain header text in Word's own footer and header parts, which aren't field codes. It is checked as the global rule asks: no `w:instrText` or `w:fldChar` in the document, and no `updateFields` in the settings.

## Non-goals (not in v0.26.0)

- **One file per chapter.** It stays one Markdown file per novel (recommended 2026-10-30). Focusing on a chapter gives the separate-file feel, and Drafts and Cuts already work on one file.
- **A character and place bible.** That is the Workbook (v0.29.0).
- **Rich-text formatting beyond Markdown's** (fonts, colours, sizes). Italic, bold, and scene breaks are enough for a manuscript.
- **Classic Mode for prose.** Classic Mode is for scripts.
- **AI of any kind.** Drafter still calls none.

## Anti-goals: what would make this a failure even if it works

- **A file that's no longer plain Markdown.** Another Markdown app opens a Novel and sees a normal Markdown document. The statuses, targets, and synopses live in the existing trailing comment, which another app shows as nothing.
- **Focus losing text.** Focusing on a section must never cut, hide from a save, or reorder anything. A save writes the whole book, always.
- **A slow editor on a long book.** 120,000 words must type as smoothly as a 120-page script; the existing long-task budget applies.
- **A novelist feeling they're in a screenwriting app.** No "scene heading", "INT.", or page counts in a novel's own views. Words, chapters, and sections only.

## How the pieces fit (calls made in this design; the builder may refine them)

- **The kind.** A Novel is a Markdown document whose metadata says `"template": "novel"`. My call: not a new DocumentKind, so every Markdown path keeps working, and choosing Novel is choosing a template, as with Screenplay. "Markdown (plain text)" stays as it is, for notes and treatments.
- **Structure.** Structure comes from the Markdown parse that already exists (`packages/markdown`):
  - The headings and the thematic breaks build a tree of parts, chapters, and sections, with their offsets in the text.
  - A new package, `@drafter/novel`, holds it, beside `@drafter/outline` for scripts.
- **Reordering.** A move is one change to the text, in one undo step, exactly as moving a scene is. It moves the heading and everything under it to just before the next sibling.
- **Kept facts.** Status, synopsis, and target live in the trailing `<!-- drafter {…} -->` comment, keyed by each heading's text plus its position among same-named siblings. My call: if a heading is renamed in the editor, its facts follow it in the same transaction; a rename made in another app loses them, and says so in Problems.
- **Focus.**
  - It folds everything outside the chosen passage, using CodeMirror's folding: the Markdown mode gets heading folds.
  - A thin bar at the top says "Chapter 3 · The Lighthouse — showing this chapter. Show the whole book".
  - My call: the Script pane's Preview follows the focus, showing only that passage.
- **Counts.** A section's count is its words; a chapter's count is its own words plus its sections'. Words are counted as the Markdown document already counts them (`countWords`), so totals agree with the status bar.
- **Manuscript PDF.** Rendered through the document PDF path `@drafter/render-pdf` already has, with a manuscript layout. The fonts are already bundled: Courier Prime, plus a serif chosen from what the app ships.
- **Manuscript .docx.** Built in a new package, `@drafter/render-docx`, which writes the minimal parts of an Office Open XML package directly (`document.xml`, `styles.xml`, header and footer parts, `settings.xml` without `updateFields`) and zips them with `@drafter/archive`. My call: no docx library, to keep the dependency count low and the field-code rule easy to keep. A test unzips each export and checks there are no field codes.

## Release order

1. **v0.26.0:** goals 1 to 7, the drafting place.
2. **v0.26.1:** goal 8, the manuscript exports, as the 2026-10-30 note made them secondary.

## Left to the builder

The Outline's look for parts, chapters, and sections; the focus bar's design; the sample novel's text (original, short, three chapters with sections); the target dialog; keyboard shortcuts for focus and move, in line with the existing ones; tests, including the trap documents for Novel (hostile headings, huge chapters, a metadata comment that's broken or deliberately hostile); and the accessibility of every new control.

## Settled by the maintainer (2026-11-03)

1. **Statuses:** To do, Draft, Revised, Done to start; renamable later.
2. **Parts:** a `#` heading that begins with "Part".
3. **Manuscript exports:** in v0.26.1, after the drafting place.
