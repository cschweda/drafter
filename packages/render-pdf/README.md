# @drafter/render-pdf

PDF output for [Drafter](https://github.com/cschweda/drafter): draws the pages `@drafter/layout` produces, with [Courier Prime](fonts/README.md) embedded. Runs in Node and in a browser worker; it reads no files, and the caller passes the fonts in.

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

## License

MIT. Courier Prime is under the SIL Open Font License 1.1, in [`fonts/OFL.txt`](fonts/OFL.txt).
