# @drafter/render-html-file

Drafter's HTML export, for [Drafter](https://github.com/cschweda/drafter): a script or a Markdown document as one `.html` file that someone can open in any current browser, from an email attachment or a USB stick, with no connection. Everything is inside the file: one stylesheet, one small script, and the fonts. It opens dark, has a light switch, and prints light. It touches no DOM and reads no files, so it runs in Node, in a browser, and in a worker; it returns a string.

This release builds it in steps. So far it has the frame every file shares, a script's whole file (its Pages and Reading views, the header, and the scene band), and a Markdown document's whole file.

```ts
import { markdownTitle, parseMarkdown } from '@drafter/markdown';
import { renderDocumentHtml, renderScriptHtml } from '@drafter/render-html-file';

const doc = parse(source); // with the export's title page applied
const html = renderScriptHtml({
  doc,
  layout: paginate(doc, template, { sceneNumbers }),
  template,
  notes: 'leave-out', // or 'include': [[notes]] as asides, in Reading only
  fonts: courierPrime, // { regular, bold, italic, boldItalic } as bytes
  title: 'The Long Way',
  lang: 'en',
  generator: 'Drafter 0.22.0',
  kindLine: 'Screenplay · 94 pages · About 1 h 35 min',
});

// A Markdown document, from the tree the Preview draws.
const page = renderDocumentHtml({
  tree: parseMarkdown(text), // throws NestedTooDeeply for a document nested too deeply
  title: markdownTitle(text) ?? 'Untitled',
  lang: 'en',
  generator: 'Drafter 0.22.0',
});
```

## API

| Export | What it does |
|---|---|
| `renderScriptHtml(input)` | A script's whole file: the header (the caller's `kindLine`, the title, and the title page's credit and author, source, and draft date), the band, the Pages view with the band's targets, and the hidden Reading view, with Courier Prime in the styles the pages use and every part's generated rules in the one style. |
| `renderDocumentHtml(input)` | A Markdown document's whole file, from `@drafter/markdown`'s tree (the one the Preview draws): the header ("Document · 1,240 words · 6 min read": `countWords`, at `WORDS_PER_MINUTE`, 230, rounded up, at least 1), a `nav.sections` row of links to each root `##` heading (or `#` when there is none), and the document as the Preview draws it. A first `#` heading whose words are the title (where the title came from) isn't drawn again under the header and has no section link; it is left out before the headings are numbered. Headings carry generated ids (`h-<n>`) and the writer's levels, but never skip one under the header's h1 (a document that starts at `###` starts at h2). A link is a link (`target="_blank"`, `rel="noopener noreferrer"`, the address as `new URL` normalizes it) only for `http:`, `https:`, and `mailto:`; any other address, relative path, or `#heading` (the file's ids are its own) is its text, and so is a reference whose definition is unsafe. An image is "[Image: description]" and nothing is fetched; raw HTML is text. Footnotes are numbered by `@drafter/markdown`'s walk, as the Preview numbers them: each reference is `sup > a[href=#fn-n]`, the first one `id="fnref-n"` (inside a link, a plain `sup` with that id), and the notes are a `section.footnotes` at the end (a rule, an h2 "Notes", an `ol` of `li#fn-n`), each with a link back. No font is embedded. A tree deeper than `MAX_TREE_DEPTH` (1000 levels, which only a hostile text reaches: the parser nests emphasis as deep as it is written) throws a RangeError saying "nested too deeply", as the export says a document the parser refuses. |
| `renderScriptEpub(input)` | A script's EPUB 3 (design §10a), as bytes: `ScriptHtmlInput` without `kindLine`, plus `author` (`dc:creator`, none when empty), `modified` (`dcterms:modified`, UTC to the second), and `id` (`dc:identifier`). Its Reading view, cut into one XHTML document (`EPUB/part-N.xhtml`) per act (its shallowest sections; what comes before the first is the title's part; with none, one part), the first opening with the title and the title page's lines; `nav.xhtml` lists the parts and, under each, its scene headings and deeper sections. Character names in their light shades; Courier Prime in the styles `epubStylesUsed` finds, as files in `EPUB/fonts/`. |
| `renderDocumentEpub(input)` | A Markdown document's EPUB 3: `DocumentHtmlInput` plus the same three. One part per root `#` heading (the title's own first heading excepted), the document drawn as `renderDocumentHtml` draws it; each part's footnotes at its end as `<aside epub:type="footnote">`, references `epub:type="noteref"` (to another part's file when the note is there), back links to the first reference. No font. |
| `epubIdentifier(title, text)`, `scriptAuthor(doc)`, `epubStylesUsed(doc, layout)` | A stable `urn:uuid` for an export (the SHA-256 of the title and the text, in a version-5 UUID's shape); the title page's Author; the Courier Prime styles the reflowed text uses (a lyric's runs italic). |
| `readingHtml(doc, layout, notes)` | The Reading view: `{ html, rules }`. `html` is `<section class="reading" hidden="">` holding the blocks the layout prints (and every section), each by its Fountain kind: a section as a heading a level under the nearest shallower open section's (levels never skip, up to h6), a scene heading as `h.sh` (with `.sn`, the number, when the layout prints one), both with `id="r-b-<block>"`; a speech as `div.speech` (`p.who.kN` with `span.ext`, then `div.said`), a `^` pair in `div.dual`; action, `.tr`, `.ct`, `.ly`, and any other kind as `p`. With `'include'`, each `[[note]]` is an `aside.note` at its place, except Drafter's own keyed notes (scene fields, setups and payoffs, card text, as `@drafter/notes`' `readNote` reads them); boneyard never. `rules` are the color rules for the characters who speak. |
| `characterKey(cue)`, `CHARACTER_COLORS` | The one name a cue's character goes by (capitals; no extensions, `@`, or `^`; spaces collapsed), and the characters' colors, a dark and a light shade each, handed out in order of first speech and repeated past the end. |
| `bandHtml(doc, template, layout)` | The scene band: `{ html, rules, blocks }`. From `@drafter/outline`'s `structureStrip`, its top row (sections if any, else scenes) as `nav.band` links to `#b-<block>`, each `li` as wide as its share (`gN`) and edged in its `SCENE_SWATCH` color (`sN`), labelled "ACT ONE, pages 1 to 32". '' (and no blocks) with no sections and no scenes. |
| `htmlShell(input)` | The whole file around a body: `<html data-theme="dark">`, the CSP, the stylesheet (after `fontFaces`), the script, the bar with its switches, the header, the band or section links (`nav`), and `<main id="main">`. A script's `<main>` has `data-view="pages"` and holds `section.pages` and then `section.reading` (hidden); a document's has neither view nor the view switch. `header`, `nav`, and `body` are markup the caller has escaped; `title` and `generator` are text it escapes; `lang` is used when it is a BCP 47 tag, else `en`. `fontFaces` (before the stylesheet) and `rules` (after it) may not hold `<` or a carriage return. |
| `headerHtml(kind, title, lines)` | The header's content: the small kind line (left out when empty), the title as the one `<h1>`, and a line each for the rest. All escaped. |
| `escapeHtml(text)` | Text safe as content or as a quoted attribute value: `&`, `<`, `>`, `"`, `'` as references; a control character other than a tab or a line feed as a space; a lone surrogate, U+FFFE, or U+FFFF as U+FFFD. One pass. |
| `el(name, attributes, content?)` | One element, in markup HTML and XHTML both read (values escaped and double-quoted, void elements closed with ` />`, a `true` `aria-…` written as "true"). Throws on a name of an unexpected shape; on `style`, `srcdoc`, `formaction`, `srcset`, `ping`, and event handlers; on a URL attribute `safeHref` refuses; and on `</` in a `<script>` or `<style>`. |
| `safeHref(url, image?)` | `url` if the file may point at it (`#…`, or `http:`, `https:`, `mailto:` as `new URL` reads it; with `image`, `data:image/…` too), else undefined. |
| `pagesHtml(layout, template, targets?)` | A script's Pages view: `{ html, rules }`. `html` is `<section class="pages">` with a `div.page` card per layout page (one blank page for an empty layout), each starting with a visually hidden "Page N" ("Title page"), then its lines at their rows and columns (`div.ln.rN.cN`, runs as `span.b`, `.i`, `.u`), read in order with dual dialogue's left speech first and a heading role's lines in one `role="heading"`, then the page number, scene numbers, header, and footer where `renderPdf` puts them. `(MORE)` and that furniture are `aria-hidden`. `rules` are the grid and page rules for the classes used, for `ShellInput.rules`. Each block in `targets` (the band's) gets `id="b-<block>"` on its first printed line, or on an empty marker at that row when the line is another block's. |
| `stylesUsed(layout)`, `fontFaces(fonts, used)` | The Courier Prime styles the pages draw in (Regular always), and an `@font-face` for each, the font file as base64 in a `data:` URL (TrueType, or WOFF/WOFF2 if given one). Throws on a used style with no bytes, or bytes that are not a font. |
| `gridRules(rows, cols)`, `rowClass`, `colClass` | Rules for the rows and columns a file uses (`.r12{top:12em}`, `.c15{left:15ch}`: 1em of the page's 12pt type is 1in/6), and their class names. |
| `paperRule(width, height)` | `@page card{size:…pt …pt}`: the sheet a printed card goes on, the template's paper in points. `pagesHtml` includes it in its rules. |
| `pageRules(sizes)`, `pageClass(cols, rows)` | Rules for the page sizes a file uses (`.p85x66{width:85ch;height:66em;font-size:min(12pt, calc(100cqw / 51))}`): on a screen narrower than the page, the type, and with it the whole page, shrinks to fit. |
| `bandRules(lengths)` | A class for each band block (`gN`, its share in thousandths, at least 1) and their rules. |
| `colorRules(colors, prefix?)` | `.k0{--c:#…}` and so on, with a light palette's color (also the printed one) when a pair gives one. |
| `STYLESHEET`, `CLIENT_SCRIPT` | The fixed stylesheet and script, the same text in every file. |
| `PALETTES` | The dark and light palettes' colors; `test/palette.test.ts` measures each text pair against WCAG AA. |

## The file's guarantees

- **No network.** The CSP is `default-src 'none'`, with the style and the script allowed by their SHA-256, fonts and images from `data:` only, and no style attribute or inline handler at all: what varies from file to file (a line's place, a page's size, a block's share, a character's color) is a class whose rule the file generates into its one `<style>`. Nothing in the file names a URL but `data:` and `#` anchors, apart from a document's own links.
- **Dark unless asked.** With nothing remembered, the file opens dark whatever the system prefers. The reader's choices (palette, and a script's view) are kept in `localStorage`, and every use of it is inside `try`, so a browser that refuses storage still switches, for the visit.
- **Works with JavaScript off.** The defaults are in the markup: dark, Pages. The switches start hidden, and the script shows them.
- **Prints light**, without the bar. A script in Pages prints its cards alone, one to a sheet of the template's paper (`paperRule`), each from the sheet's top left with no margin, as the PDF's pages are; Reading and a document print as a flow, header kept.
- **The band works without the script.** A band link is a plain `#b-<block>` anchor into Pages; while Reading shows, the script sends it to the same block's `r-b-<block>` there.
- **A document never loads the parser.** It is built from the tree the caller parsed; the footnote walk and the word count come from `@drafter/markdown`'s parser-free subpaths, so importing this package loads no `mdast` or `micromark` module (`test/no-parser.test.ts`).
- **Reading is built from Fountain's kinds**, not the template's role names, so a stage play reads as a screenplay does, and a kind it doesn't know is a paragraph: nothing printed is dropped. Notes appear only there, only when asked for.
- **An EPUB is XHTML, with no script and no network.** Every content document parses as XML in the XHTML namespace with `xmlns:epub`; it has no CSP, switches, or script (an e-reader runs none and sets the theme), and names no URL but its own files and a document's own links. The zip is `@drafter/archive`'s `zipStored`: `mimetype` first, stored, `application/epub+zip`. Its package carries EPUB Accessibility 1.1 metadata (textual, with structural navigation, a table of contents, reading order, and display transformability; no hazards; a summary), and makes no conformance claim. Where `epubcheck` is on the PATH, `test/epub.test.ts` runs it on a screenplay, a stage play, a script with no scenes, a document, and a novel-like document, and expects no error and no warning.
- **Pages are on the grid, in Courier Prime.** A character Courier Prime lacks (CJK, emoji) is drawn from the reader's monospace or another fallback font, glyph by glyph, and that font's width can shift the rest of its line off the grid, as on the Script tab. The text is all there; only those lines' alignment differs from the PDF.

## License

MIT
