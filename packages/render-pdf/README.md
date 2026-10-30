# @drafter/render-pdf

PDF output for [Drafter](https://github.com/cschweda/drafter): draws the pages `@drafter/layout` produces, with [Courier Prime](fonts/README.md) embedded, and lays out and draws Markdown documents in [Inter Tight](fonts/inter-tight/README.md) ([Documents](#documents)). Runs in Node and in a browser worker; it reads no files, and the caller passes the fonts in.

```ts
import { readFile } from 'node:fs/promises';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { FONT_FILES, renderPdf } from '@drafter/render-pdf';
import { builtins } from '@drafter/templates';

const read = (file: string) =>
  readFile(new URL(import.meta.resolve(`@drafter/render-pdf/fonts/${file}`)));
const fonts = {
  regular: await read(FONT_FILES.regular),
  bold: await read(FONT_FILES.bold),
  italic: await read(FONT_FILES.italic),
  boldItalic: await read(FONT_FILES.boldItalic),
};

const template = builtins['us-screenplay'];
const layout = paginate(parse(source), template);
const pdf = await renderPdf(layout, template, { fonts }); // Uint8Array
```

## API

| Export | What it does |
|---|---|
| `renderPdf(layout, template, { fonts })` | Draws a layout as a PDF and returns its bytes. `fonts` must hold all four styles; only the ones the script uses are embedded, as subsets. |
| `FONT_FILES` | The file names in this package's `fonts/` folder, by style. |
| `FontSet` | `{ regular, bold, italic, boldItalic }`, each a `Uint8Array` of a font file. |

## What it draws

- One PDF page per layout page, at the template's paper size: US letter is 612 × 792 pt, A4 595.28 × 841.89 pt. An empty layout still gets one blank page.
- Text on the template's grid. Column `col` of body line `n` puts the baseline at `x = (margin.left + col) × 7.2` and `y = pageHeight − (margin.top + n + 1) × 12`, in points from the bottom-left corner.
- Bold, italic, and bold italic in their own Courier Prime styles; underlines as half-point rules 2 pt below the baseline.
- Page numbers, scene numbers in both margins, and the template's header and footer: the header on the page number's line, the footer as far from the bottom edge.
- The title page's title as the document title. No dates and no random IDs, so the same layout always gives the same bytes.

Leading spaces become position, not glyphs, and characters a PDF line can't hold (control characters, unpaired surrogates) print as a space or U+FFFD in their column, so text stays on the grid.

## Documents

A Markdown document prints in Inter Tight, with Courier Prime for code, on US Letter or A4 (Markdown PDF design §2–§5). The renderer takes a CommonMark tree (the one `mdast-util-from-markdown` gives; any tree with the same fields will do) and imports nothing from Markdown itself.

```ts
import { readFile } from 'node:fs/promises';
import { DOCUMENT_FONT_FILES, renderDocumentPdf } from '@drafter/render-pdf';
import { fromMarkdown } from 'mdast-util-from-markdown';

const read = (file: string) =>
  readFile(new URL(import.meta.resolve(`@drafter/render-pdf/fonts/${file}`)));
const fonts = {
  text: await read(DOCUMENT_FONT_FILES.text),
  textItalic: await read(DOCUMENT_FONT_FILES.textItalic),
  textBold: await read(DOCUMENT_FONT_FILES.textBold),
  textBoldItalic: await read(DOCUMENT_FONT_FILES.textBoldItalic),
  code: await read(DOCUMENT_FONT_FILES.code),
};

const { bytes, missing } = await renderDocumentPdf(fromMarkdown(source), {
  fonts,
  paper: 'letter', // or 'a4'
  title: 'Notes', // optional: the PDF's title, shown in the viewer's title bar
  lang: 'en-US', // optional: the PDF's language
});
// `missing`: characters the fonts lack, printed as ?, in the order first seen.
```

| Export | What it does |
|---|---|
| `renderDocumentPdf(tree, { fonts, paper, title?, lang? })` | Lays a document out and draws it as a PDF: `{ bytes, missing }`. `fonts` must hold all five faces (a `TypeError` names any missing); only the faces used are embedded, as subsets. |
| `layoutDocument(tree, { paper, measure })` | The layout alone, as `DocLayout`: each page's text, lines, panels, and link rectangles, in points from the page's bottom-left corner. |
| `fontMeasure(fonts)` | A `Measure` from the font files: a string's width as pdf-lib draws it, and whether a face has a character. |
| `DOCUMENT_FONT_FILES` | The five faces' paths under `fonts/`: `text`, `textItalic`, `textBold`, `textBoldItalic` (Inter Tight Regular, Italic, SemiBold, SemiBold Italic) and `code` (Courier Prime Regular). |
| `DocNode`, `DocumentFontSet`, `DocumentPdf`, `Face`, `Measure`, `DocLayout`, `DocPage`, `DocItem` | The types these take and give. |

What a document's PDF draws:

- 1 inch margins; text 11 on 16 pt, ragged right; headings in SemiBold at 22, 17, 14, and 11 pt (5 and 6 in gray); emphasis, strong text, and inline code in their faces; code blocks on a light gray panel; quotes with a 2 pt bar for each level; lists with bullets (•, ◦, ▪) or numbers; rules; images as `[Image: …]`.
- Each run of one style on a line is one text operator, spaces included, so a viewer's search and copy read whole words in order.
- Links in blue, underlined, each a link annotation (one per line the link covers) to its address. Only `http:`, `https:`, and `mailto:` addresses become annotations; any other prints as plain text.
- Pages break with no space at a page's top, at least two lines of a split block on each page, and headings kept with what follows them. Pages are numbered at the foot from 1 when there are two or more.
- A character a face lacks prints as `?` and is listed in `missing`. Creator "Drafter", producer "Drafter, with pdf-lib", fixed font names, and no dates or IDs, so the same document always gives the same bytes. An empty tree gives one blank page.

## License

MIT. Courier Prime is under the SIL Open Font License 1.1, in [`fonts/OFL.txt`](fonts/OFL.txt), and so is Inter Tight, in [`fonts/inter-tight/OFL.txt`](fonts/inter-tight/OFL.txt).
