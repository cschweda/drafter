# @drafter/markdown

Markdown documents for [Drafter](https://github.com/cschweda/drafter): reads a document into a CommonMark syntax tree with GitHub's footnotes, numbers its footnotes, finds its title, and counts its words. The app's Preview, its word count, and the Markdown PDF all read a document through it, so they agree. It touches no DOM and reads no files, so it runs in Node, in a browser, and in a worker; drawing the tree is the caller's.

```ts
import { countWords, footnotes, markdownTitle, parseMarkdown } from '@drafter/markdown';

const source = '# The Long Way\n\nMargaret waits up.[^1]\n\n[^1]: The clock is ten minutes fast.\n';
markdownTitle(source); // 'The Long Way'
const tree = parseMarkdown(source);
countWords(tree); // 12: a note's words count with the document's
footnotes(tree).numbers; // Map { '1' => 1 }
```

## API

| Export | What it does |
|---|---|
| `parseMarkdown(source)` | The syntax tree (`MdNode`), read by `mdast-util-from-markdown` with GitHub's footnotes and nothing else of GFM. Raw HTML stays an `html` node, to be shown as text. One byte-order mark first is taken off. A document nested deeper than `MAX_NESTING` throws `NestedTooDeeply` (a `RangeError`) at once, before it is parsed. |
| `containerDepth(source, limit)`, `MAX_NESTING` | The nesting scan `parseMarkdown` runs first: one linear pass, never fewer containers than the parser opens, stopping past `limit`. `MAX_NESTING` is 48. |
| `footnotes(tree)` | The notes a document prints, numbered as GitHub numbers them (1, 2, 3 by first reference), each note's definition, and the last number among a note and the notes first referenced inside it. Generic over any node with `type`, `identifier`, and `children`, so the PDF numbers its own tree type with it. |
| `markdownTitle(source)` | The first heading's text without its markup, or undefined. A line scan, not a parse, linear in the text. |
| `retitleMarkdown(source, title)` | The text with its first ATX heading's words replaced, or a `# title` heading put in front. |
| `countWords(tree)`, `wordsIn(text)`, `isSpace(code)` | Words as they're read: runs of characters between what `/\s/` calls a space, footnotes included once, markup not at all. |
| `MdNode` | The fields of an mdast node Drafter reads, a structural type. |

`@drafter/markdown/notes` exports `footnotes` and its types alone: the walk without the parser, for a reader that never parses (`@drafter/render-pdf`), so importing it loads no `mdast` or `micromark` module.

`micromark-extension-gfm-footnote` is pinned exactly: `parseMarkdown` hands it a label list backed by a set, through one field of the parser's, so many footnotes parse in linear time (see [DEPENDENCIES](../../docs/DEPENDENCIES.md)).

## License

MIT
