# Export as HTML — Design

**Status:** designed 2026-10-30; not built. To be planned after this document is approved. It is built after the `formats` release (v0.20.0: `drafter convert`, Markdown footnotes, the tour's wording), because it uses that release's footnotes. It ships before the Workbook (a separate design to follow), which will add its own page to the same export.

**Asked for (maintainer, 2026-10-30):** "Can html be one of the exports here for all modes? Dark mode by default, infographic-ish, modern, sleek." Of three mockups (Studio, Wall, Dossier) they chose **Studio**. For scripts, "both, with the switch" (printed pages and a reading view), "and the ability for a light mode. Everything should be in a single, exportable HTML file that I could send to someone." On notes: "have the option to add notes." External dependencies would be at most CDN links, never a site that needs building; this design embeds everything instead (§6, Call).

**Clean room (binding).** The page design is Drafter's own, written for this release: its layout, colors, and type scale are chosen here, not traced from another app, script-sharing site, or HTML template. No code, stylesheets, or fixtures from any of them. Every sample in the tests is original text written for Drafter.

Each choice open to the designer is marked **Call:**; they are listed in §12.

## 1. What it is

**Export → HTML** sits beside PDF, Final Draft, Markdown, and plain text, in every mode: screenplays, stage plays, and Markdown documents. It is in the toolbar's Export menu, the app menu, the palette (`export-html`), and the desktop app's File → Export menu, with the same picker or download, file name (the title, else the file's name, then `.html`), progress bar, and toast as the other exports.

The result is **one `.html` file** that someone can open in any current browser, from an email attachment, a USB stick, or a shared folder, with no internet connection. It looks finished: dark by default, sleek, with a light switch.

## 2. The look: "Studio"

The chosen direction, from the mockups:

- A dark frame (near-black background, slightly lighter panels, thin borders), one readable column, generous spacing.
- A header: a small uppercase kind line (e.g. "Stage play · 94 pages · about 1 h 50 min"), the title large, the author beneath.
- **The scene band** under the header: the acts or sections (or, with none, the scenes) as a band of colored blocks, each as wide as its share of the pages, tinted by its scene color if it has one. Clicking a block scrolls to it. This is the Structure strip, printed.
- A sticky bar at the top holding the **Pages · Reading** switch (scripts only) and the **light/dark** toggle.
- Accent colors: amber for scene headings and the current block; one color per character in the reading view (§3.2).

**Call:** the interface type is the reader's own system sans-serif stack (`system-ui`, …), not an embedded Inter Tight: embedding four Inter Tight styles would add over a megabyte, and the system face looks native everywhere. Courier Prime is embedded for the script (§6).

### 2.1 Light mode

Dark is the default. The toggle switches to a light palette (paper-white background, dark ink, the same accents darkened for contrast). **Call:** the choice is remembered in the reader's browser (`localStorage`, wrapped so a blocked store just means "not remembered"); with nothing remembered, the file opens dark whatever the system setting — the maintainer asked for dark by default.

### 2.2 Printing

**Call:** printing from the browser always uses the light palette, hides the bar and the band's interactivity, and in Pages view breaks one script page per printed page. The PDF export stays the right way to print; this just keeps a printed HTML from wasting ink.

## 3. Scripts (screenplay and stage play)

One file holds both views, and the bar switches between them without reloading. **Call:** the file opens in **Pages** view; the reader's last choice is remembered as in §2.1.

### 3.1 Pages

The exact pages, laid out by the same page model the Script tab and the PDF use (`@drafter/layout`'s `paginate`, with the script's template and export options): Courier Prime 12 pt on paper-white page cards, with page numbers, centered on the dark frame and separated by a gap. Nothing is reflowed; a line breaks where it breaks on paper. Dual dialogue, title page, scene numbers, centered text, and page breaks appear as in the PDF.

On a narrow screen the page cards scale down to fit the width (the whole page stays visible, as a PDF viewer shows it); the Reading view is the comfortable choice there.

### 3.2 Reading

The same script reflowed for a screen, in the Studio type:

- Scene headings as small amber monospace lines, with the scene number if the export options print them.
- Action as paragraphs.
- Dialogue as a two-column row: the character's name in a right-aligned margin, in that character's color, with extensions (V.O., O.S., CONT'D) after it in grey; the speech beside it; parentheticals as a small grey line above the speech.
- Dual dialogue as two such rows side by side, stacking on a narrow screen.
- Transitions right-aligned and grey; centered text centered; lyrics in italics; section headings (acts) as larger headings that the band links to.
- **Call:** character colors come from a fixed palette of distinguishable hues that pass contrast in both palettes, assigned in order of first speech; past the palette's size, colors repeat.

### 3.3 What a script's file carries

- The title page, as the export options say (full, title and author, or none): in Pages as the printed title page; in Reading as the header.
- **Notes**: left out by default. The export option the Markdown export already has ("Notes in Markdown" today) becomes the general **Include notes** option for Markdown and HTML; with it on, `[[notes]]` appear in **Reading only**, as small highlighted asides where they sit. **Call:** Pages never shows notes: the layout prints nothing for a line that holds only a note, and adding them would reflow the pages away from the PDF, which is what Pages promises. **Call:** the option shows in the export options only for Markdown and HTML (PDF, Final Draft, and plain text have no notes to include); the stored setting keeps its key, and its label becomes "Include notes (Markdown and HTML)". Boneyard (`/* … */`) never appears.
- Scene numbers as the export options say.

## 4. Markdown documents

The Studio frame around the document as the Preview draws it, with:

- The header: "Document · 1,240 words · 5 min read" (**Call:** reading time at 230 words a minute), and the title (the first heading, else the file's name).
- A row of links to each top-level heading (`##`, or `#` if the document has no `##`), in place of the band.
- Headings, paragraphs, emphasis, code, quotes, lists, rules, and tables if CommonMark gives them, styled in the Studio type.
- **Links work**, as in the Markdown PDF: an `http:`, `https:`, or `mailto:` link becomes a real link that opens in a new tab; any other scheme is shown as its text. These are the writer's own links and the only way the file reaches outside itself.
- **Footnotes** (built in the `formats` release for the Preview and the PDF, with the GFM `[^1]` syntax, numbered in order of first reference) gathered at the end under a short rule, numbered as the Preview numbers them, each reference linking to its note and back.
- Images: a Markdown image that points at a file Drafter can't read is shown as its description, as the Preview does. **Call:** no image is fetched or embedded in this release; base64 embedding arrives with images in Drafter generally.

### 4.1 What the file is built from

- **Scripts:** the parsed script and the laid-out pages (`@drafter/layout`'s `paginate`), with the template and export options. The scene band's blocks (acts or sections, else scenes; each one's page range, share, and scene color) come from `@drafter/outline`'s `structureStrip(sceneIndex(…), linesPerPage(layout))`, which is already a package. **Call:** the scene-color hex values (`SWATCH`, today in `apps/web/app/outline/labels.ts`) move into `@drafter/notes` beside `SCENE_COLORS`, so the app and the export share them.
- **A script with no sections and no scenes** (a few lines of action) has no band.
- **Reading view roles:** **Call:** Reading is built from each line's Fountain block kind (`doc.blocks[line.blockIndex].kind`: scene heading, action, character, parenthetical, dialogue, transition, centered, lyric, section; dual dialogue from the character block's `sem.dual`), not from the template's own role names (`stage_direction`, `act_heading`, …); anything else falls back to a plain paragraph, so no text is ever dropped. A stage play reads the same way (its act and scene headings are sections and scene headings).
- **Markdown documents:** the same tree the Preview draws. **Call:** `apps/web/app/markdown/parse.ts` (with its footnote extension) moves into a small shared module or package so the DOM-free generator can use it; the CLI's `--html` covers scripts only in this release, as `--pdf` does.

### 4.2 How the pages stay exact

**Call:** Pages draws each page as a fixed-size card (the paper size in points, scaled with the screen) holding the layout's lines at their line and column positions in Courier Prime 12 pt, positioned absolutely as the Script tab draws them, so every line sits where the PDF puts it. A character Courier Prime lacks falls back to the reader's monospace font (per glyph, by the browser). (The script PDF has no fallback font and no missing-character note today; only the Markdown PDF reports missing characters. The HTML export adds no note either.) **Call:** Pages uses the Script tab's character grid (`1ch` columns, `1in/6` rows, `template.page.width × height`), as `@drafter/render-html`'s stylesheet does, rather than paper points.

## 5. The Workbook (later)

When the Workbook ships, its HTML export is a third page type in this frame: the bible, the act band, scenes as cards with Mine / Suggested / Open edges. Nothing here should stand in its way; the page shell (§6) is shared.

## 6. One self-contained file

- Everything is inside the file: HTML, one `<style>`, one small `<script>`, and the fonts. **Call:** no CDN links and no network requests of any kind. The interactive parts (the view switch, the toggle, the band's scrolling) are a few dozen lines of plain JavaScript and need no library. Embedding everything means the file opens offline, looks the same everywhere, never tells a third party who opened it, and can't break when a CDN changes.
- **Courier Prime** (SIL Open Font License, which allows embedding) is embedded as base64 `@font-face` data, only in a script's file and only the styles the script uses (Regular always; Bold, Italic, Bold Italic if any text needs them). **Call:** the builder may convert the fonts to WOFF2 at build time to shrink them, and may subset if a dependency-light way exists; plain TTF base64 (about 100 KB a style) is acceptable.
- A `<meta name="viewport">`, `lang` from the script's or document's language, and a `<title>`.
- **Call:** the file works with JavaScript off: it shows the Pages view (or the document) in the dark palette with everything readable; only the switch and toggle need the script.
- **Size:** a 120-page script should come in well under 2 MB with both views. The builder measures it and records the figure.

## 7. Safety

Every character of the writer's text reaches the file as escaped text, never as markup: the generator builds HTML by escaping (`&`, `<`, `>`, `"`, `'`) at every insertion point, or by a DOM-free builder that only ever emits text nodes and known tags. A script containing `<script>`, `</style>`, `javascript:` links, or `"` in a title does nothing when opened. Attribute values (colors, ids, link targets) are generated or validated, never copied from the text unescaped. The file carries a strict Content-Security-Policy `<meta>` (no network: `default-src 'none'`, inline style and the one inline script allowed by hash, fonts from `data:`) so that even a mistake can't load anything. **Call:** the script and stylesheet are fixed text, so their hashes are computed when the file is generated; files from the web app, the desktop app, and the CLI may differ in bytes (a `<meta name="generator" content="Drafter 0.x.y">` line names the version), and that's fine. Tests feed hostile text through every element type and parse the output.

## 8. Where it's built

- **Call:** a new package, `@drafter/render-html-file` (or a module in an existing package if the builder finds a better home), with no DOM dependency: it takes the parsed script, the laid-out pages, the template, the export options, and the font bytes, and returns a string. That lets the export worker build it off the main thread, and the CLI build it in Node.
- The web app adds `html` to the export kinds (`storage/export.ts`, `workers/export-compute.ts`, the commands, menus, palette, desktop menu, and the `.html` save type).
- The CLI gains `drafter build script.fountain --html script.html`, with the same template and scene-number options as `--pdf`.
- The Script tab's renderer (`@drafter/render-html`) draws pages as live DOM for the app; this export is a separate, static generator, but the two must agree on where every line sits. Tests compare the Pages view's line positions with the layout.

## 9. Accessibility

WCAG 2.2 AA in both palettes, as the app targets: the switch and toggle are real buttons with pressed states; the band is a list of links with accessible names ("Act One, pages 1 to 32"); the Reading view uses headings for scenes and a structure a screen reader can move through; character colors are never the only signal (the name is always printed). axe runs on exported files of each kind in both palettes.

## 10. Testing

- Unit: the escaping rules with hostile text in every element; a sample screenplay, stage play, and Markdown document exported and parsed back (every speech present once, in order, in both views); export options (scene numbers, title page, notes) honored; footnotes numbered as the Preview numbers them.
- Size and speed: a 120-page script exports in under a second in the worker and under the size figure in §6.
- No network: the exported file, opened in Playwright with all requests blocked, renders completely, and no request is attempted.
- e2e: Export → HTML from the toolbar, menu, palette, and the desktop's File menu; the switch, the toggle, and the band work in the opened file; JavaScript off still shows the content.

## 11. Not in this release

- Images embedded as base64 (when Drafter has images).
- Search inside the file, a contents sidebar, or per-reader comments.
- The Workbook's page (its own release, §5).

## 12. The calls

1. System sans-serif for the interface type; only Courier Prime embedded (§2).
2. The palette choice remembered in the reader's browser; dark when nothing is remembered (§2.1).
3. Printing uses the light palette and one page per sheet (§2.2).
4. Opens in Pages view; the last view remembered (§3).
5. Character colors from a fixed contrast-checked palette, in order of first speech (§3.2).
6. Notes left out by default; "Include notes" shared with the Markdown export (§3.3).
7. Reading time at 230 words a minute (§4).
8. No images embedded yet (§4).
9. No CDN, no network requests, CSP meta (§6, §7).
10. Fonts as base64, WOFF2 or subset if cheap (§6).
11. Works with JavaScript off (§6).
12. A DOM-free string generator in its own package, used by the worker and the CLI (§8).
13. Notes in Reading only, never in Pages; "Include notes" shown for Markdown and HTML only (§3.3).
14. The band comes from `@drafter/outline`'s `structureStrip`; the scene-color hex values move into `@drafter/notes` (§4.1).
15. Reading built from the shared element types, with a plain-paragraph fallback (§4.1).
16. The Markdown parser moves where the generator can use it; the CLI's `--html` is scripts only (§4.1).
17. Pages on the Script tab's character grid, positioned absolutely from the layout, with per-glyph monospace fallback and no missing-character note (§4.2).
18. CSP hashes computed at generation; a generator meta line with the version (§7).
