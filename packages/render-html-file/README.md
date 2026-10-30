# @drafter/render-html-file

Drafter's HTML export, for [Drafter](https://github.com/cschweda/drafter): a script or a Markdown document as one `.html` file that someone can open in any current browser, from an email attachment or a USB stick, with no connection. Everything is inside the file: one stylesheet, one small script, and the fonts. It opens dark, has a light switch, and prints light. It touches no DOM and reads no files, so it runs in Node, in a browser, and in a worker; it returns a string.

This release builds it in steps. So far it has the frame every file shares, and a script's Pages view:

```ts
import { fontFaces, headerHtml, htmlShell, pagesHtml, stylesUsed } from '@drafter/render-html-file';

const layout = paginate(parse(source), template);
const pages = pagesHtml(layout, template); // { html, rules }

const html = htmlShell({
  title: 'The Long Way',
  lang: 'en',
  generator: 'Drafter 0.22.0',
  kind: 'script',
  header: headerHtml('Screenplay · 94 pages', 'The Long Way', ['by Ada Quill']),
  nav: '',
  body: `${pages.html}<section class="reading" hidden="">…</section>`,
  fontFaces: fontFaces(courierPrime, stylesUsed(layout)),
  rules: pages.rules,
});
```

## API

| Export | What it does |
|---|---|
| `htmlShell(input)` | The whole file around a body: `<html data-theme="dark">`, the CSP, the stylesheet (after `fontFaces`), the script, the bar with its switches, the header, the band or section links (`nav`), and `<main id="main">`. A script's `<main>` has `data-view="pages"` and holds `section.pages` and then `section.reading` (hidden); a document's has neither view nor the view switch. `header`, `nav`, and `body` are markup the caller has escaped; `title` and `generator` are text it escapes; `lang` is used when it is a BCP 47 tag, else `en`. `fontFaces` (before the stylesheet) and `rules` (after it) may not hold `<` or a carriage return. |
| `headerHtml(kind, title, lines)` | The header's content: the small kind line (left out when empty), the title as the one `<h1>`, and a line each for the rest. All escaped. |
| `escapeHtml(text)` | Text safe as content or as a quoted attribute value: `&`, `<`, `>`, `"`, `'` as references; a control character other than a tab or a line feed as a space; a lone surrogate, U+FFFE, or U+FFFF as U+FFFD. One pass. |
| `el(name, attributes, content?)` | One element, in markup HTML and XHTML both read (values escaped and double-quoted, void elements closed with ` />`, a `true` `aria-…` written as "true"). Throws on a name of an unexpected shape; on `style`, `srcdoc`, `formaction`, `srcset`, `ping`, and event handlers; on a URL attribute `safeHref` refuses; and on `</` in a `<script>` or `<style>`. |
| `safeHref(url, image?)` | `url` if the file may point at it (`#…`, or `http:`, `https:`, `mailto:` as `new URL` reads it; with `image`, `data:image/…` too), else undefined. |
| `pagesHtml(layout, template)` | A script's Pages view: `{ html, rules }`. `html` is `<section class="pages">` with a `div.page` card per layout page (one blank page for an empty layout), each starting with a visually hidden "Page N" ("Title page"), then its lines at their rows and columns (`div.ln.rN.cN`, runs as `span.b`, `.i`, `.u`), read in order with dual dialogue's left speech first and a heading role's lines in one `role="heading"`, then the page number, scene numbers, header, and footer where `renderPdf` puts them. `(MORE)` and that furniture are `aria-hidden`. `rules` are the grid and page rules for the classes used, for `ShellInput.rules`. |
| `stylesUsed(layout)`, `fontFaces(fonts, used)` | The Courier Prime styles the pages draw in (Regular always), and an `@font-face` for each, the font file as base64 in a `data:` URL (TrueType, or WOFF/WOFF2 if given one). Throws on a used style with no bytes, or bytes that are not a font. |
| `gridRules(rows, cols)`, `rowClass`, `colClass` | Rules for the rows and columns a file uses (`.r12{top:12em}`, `.c15{left:15ch}`: 1em of the page's 12pt type is 1in/6), and their class names. |
| `pageRules(sizes)`, `pageClass(cols, rows)` | Rules for the page sizes a file uses (`.p85x66{width:85ch;height:66em;font-size:min(12pt, calc(100cqw / 51))}`): on a screen narrower than the page, the type, and with it the whole page, shrinks to fit. |
| `bandRules(lengths)` | A class for each band block (`gN`, its share in thousandths, at least 1) and their rules. |
| `colorRules(colors, prefix?)` | `.k0{--c:#…}` and so on, with a light palette's color (also the printed one) when a pair gives one. |
| `STYLESHEET`, `CLIENT_SCRIPT` | The fixed stylesheet and script, the same text in every file. |
| `PALETTES` | The dark and light palettes' colors; `test/palette.test.ts` measures each text pair against WCAG AA. |

## The file's guarantees

- **No network.** The CSP is `default-src 'none'`, with the style and the script allowed by their SHA-256, fonts and images from `data:` only, and no style attribute or inline handler at all: what varies from file to file (a line's place, a page's size, a block's share, a character's color) is a class whose rule the file generates into its one `<style>`. Nothing in the file names a URL but `data:` and `#` anchors, apart from a document's own links.
- **Dark unless asked.** With nothing remembered, the file opens dark whatever the system prefers. The reader's choices (palette, and a script's view) are kept in `localStorage`, and every use of it is inside `try`, so a browser that refuses storage still switches, for the visit.
- **Works with JavaScript off.** The defaults are in the markup: dark, Pages. The switches start hidden, and the script shows them.
- **Prints light**, without the bar, a script page to a sheet.

## License

MIT
