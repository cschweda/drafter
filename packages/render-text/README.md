# @drafter/render-text

Plain-text output for [Drafter](https://github.com/cschweda/drafter): writes the pages `@drafter/layout` produces as fixed-width text, exactly what `drafter build --txt` writes. It lives in a package of its own so the app can use it without depending on the command line. It reads no files and touches no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { renderText } from '@drafter/render-text';
import { builtins } from '@drafter/templates';

const template = builtins['us-screenplay'];
const layout = paginate(parse(source), template);
const text = renderText(layout, template); // a string; a form feed ends each page
```

## API

| Export | What it does |
|---|---|
| `renderText(layout, template)` | Writes a layout as fixed-width text and returns it. Pure and deterministic: the same layout and template always give the same string. |

## What it prints

- **One grid per page,** the full width and height of the template's character grid, margins included: US letter is 85 columns by 66 lines. Each line sits at its column inside the margins, and a row with two parts, such as dual dialogue, prints both.
- **The page's furniture** at its own columns: the page number, scene numbers in both margins, and the template's header and footer, the header on the page number's line and the footer as far from the bottom edge.
- **Pages stop at their last printed line.** Trailing spaces and the blank rows at the foot of a page are left off, every row ends with a newline, and a form feed (`\f`) separates one page from the next.
- **Type styles are dropped,** since plain text has no bold, italic, or underline.
- **Nothing that could drive a terminal.** Control characters (C0, DEL, and C1) and the Unicode line and paragraph separators print as spaces, each keeping its column, so the grid stays aligned and a script can't send escape sequences.
- **One code point takes one column,** so an emoji or a rare CJK character is never split in two.
- A script with nothing to print gives an empty string.

## License

MIT
