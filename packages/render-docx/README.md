# @drafter/render-docx

Word output for [Drafter](https://github.com/cschweda/drafter): writes a novel's standard manuscript as a `.docx` file, by hand, with no docx library. It renders the same format-free description (`Manuscript`, from `@drafter/novel`) that `@drafter/render-pdf` draws as a PDF, so the two files lay out the same. It reads no files and touches no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { parseMarkdown } from '@drafter/markdown';
import { manuscriptOf, resolveDetails } from '@drafter/novel';
import { renderManuscriptDocx } from '@drafter/render-docx';

const ms = manuscriptOf(source, parseMarkdown(source), resolveDetails(source, 'My Novel', kept));
const bytes = renderManuscriptDocx(ms, { paper: 'letter', lang: 'en-US' }); // a Uint8Array
```

## API

| Export | What it does |
|---|---|
| `renderManuscriptDocx(ms, { paper, lang, created? })` | Writes the manuscript as a `.docx` and returns its bytes. `paper` is `'letter'` or `'a4'`, `lang` the document's language, and `created`, if given, the creation date in its properties. Pure and deterministic: the same manuscript and options always give the same bytes. |
| `xmlText(text)` | Escapes text for XML (`& < > " '`) and drops the characters XML 1.0 forbids, keeping tab, line feed, and carriage return. |

## What it writes

- **Nine parts, stored in a zip** by `@drafter/archive`'s writer: `[Content_Types].xml` (first), `_rels/.rels`, `docProps/core.xml`, `docProps/app.xml`, `word/document.xml`, `word/styles.xml`, `word/settings.xml`, `word/header1.xml`, and `word/_rels/document.xml.rels`.
- **Named styles, not direct formatting:** `Normal` (12 pt Times New Roman or Courier New, double-spaced, a half-inch first-line indent, widow control), `Title`, `Byline`, `Contact`, `Part Title`, `Chapter Title`, `Scene Break`, `Block Quote`, `List Paragraph`, `Code`, `End`, `Notes Title`, and `header`. Changing one in Word changes the whole book.
- **The layout the PDF has:** one-inch margins; a title page with the legal name and contact lines at the top left, the word count at the right, and the title and byline halfway down; a part's title halfway down a page of its own; a chapter's title a third of the way down a new page, with the text two lines below; a centred `#` for a scene break; `END`; and the notes on a page headed "Notes".
- **The running header** (`Surname / SHORT TITLE / ` and the page number, right-aligned) on every page but the title page, which counts as page 1.
- **One field, and only one:** the header's page number, `<w:fldSimple w:instr=" PAGE "/>`. There is no other field, no `updateFields`, and no external relationship, so Word never asks to update links when the file opens. The tests check this.
- **Nothing private in the properties:** the title, and the byline as the creator; not the legal name or contact lines.
- **Text stays text:** anything that looks like XML in the book or the details is escaped, and characters XML can't hold are dropped. Every other character is kept, and Word's own font fallback draws it.
- **Settings:** Word 2013 and later's compatibility mode, the document's language, no tracked changes, no protection.

## License

MIT
