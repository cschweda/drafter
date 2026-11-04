# @drafter/markdown

Markdown documents for [Drafter](https://github.com/cschweda/drafter): reads a document into a CommonMark syntax tree with GitHub's footnotes, numbers its footnotes, finds its title, counts its words, and reads and writes the metadata comment at its end (where a draft file keeps its facts, since v0.24.0). The app's Preview, its word count, and the Markdown PDF all read a document through it, so they agree. It touches no DOM and reads no files, so it runs in Node, in a browser, and in a worker; drawing the tree is the caller's.

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
| `parseMarkdown(source)` | The syntax tree (`MdNode`) of the prose: the trailing drafter comment (`markdownProse`) is left out, so it is never drawn or counted, read by `mdast-util-from-markdown` with GitHub's footnotes and nothing else of GFM. Raw HTML stays an `html` node, to be shown as text. One byte-order mark first is taken off. A document nested deeper than `MAX_NESTING` throws `NestedTooDeeply` (a `RangeError`) at once, before it is parsed. |
| `containerDepth(source, limit)`, `MAX_NESTING` | The nesting scan `parseMarkdown` runs first: one linear pass, never fewer containers than the parser opens, stopping past `limit`. `MAX_NESTING` is 48. |
| `footnotes(tree)` | The notes a document prints, numbered as GitHub numbers them (1, 2, 3 by first reference), each note's definition, and the last number among a note and the notes first referenced inside it. Generic over any node with `type`, `identifier`, and `children`, so the PDF numbers its own tree type with it. |
| `markdownTitle(source)` | The first heading's text without its markup, or undefined. A line scan, not a parse, linear in the text. |
| `retitleMarkdown(source, title)` | The text with its first ATX heading's words replaced, or a `# title` heading put in front. |
| `countWords(tree)`, `wordsIn(text)`, `isSpace(code)` | Words as they're read: runs of characters between what `/\s/` calls a space, footnotes included once, markup not at all (`wordsIn` counts raw text, markup and all). |
| `markdownProse(text)` | The text without its trailing drafter comment (and the blank line before it): what the Preview, the exports, the counts, the cuts, and Compare read. The offsets before it are unchanged. |
| `markdownWordsIn(text)` | `wordsIn(markdownProse(text))`: a document's raw words, never its comment's. Drafts and snapshots count with it. |
| `MdNode` | The fields of an mdast node Drafter reads, a structural type. |
| `readMarkdownMeta(text)`, `findMarkdownMeta(text)` | The document's metadata block: its last line, at the line's start, as `<!-- drafter {json} -->` holding a JSON object. `readMarkdownMeta` gives the body without it (and the one blank line before it) and the object, or the whole text and `null`; `findMarkdownMeta` gives where it is (`MarkdownMetaBlock`). One backwards scan and one parse: linear. |
| `setMarkdownMeta(text, meta)`, `appendMarkdownMeta(text, meta)` | The text with `meta` as its block: replaced where it is, or put at the end after one blank line, with the text's own line break, so the body reads back byte for byte. `appendMarkdownMeta` always adds a new block, leaving one already there as the writer's text. |
| `commentJson(value)` | JSON that can sit inside an HTML comment or a Fountain boneyard without closing it: `/` as `\/`, `<` and `>` as `\u003c` and `\u003e`, and the second `-` of every `--` as `\u002d`. `@drafter/history`'s cuts file writes its entries with it too. |

`@drafter/markdown/notes` exports `footnotes` and its types alone, and `@drafter/markdown/words` exports `countWords`, `wordsIn`, `isSpace`, `markdownWordsIn`, and `markdownProse`: the walk and the word count without the parser, for a reader that never parses (`@drafter/render-pdf`, `@drafter/render-html-file`), so importing them loads no `mdast` or `micromark` module.

`micromark-extension-gfm-footnote` is pinned exactly: `parseMarkdown` hands it a label list backed by a set, through one field of the parser's, so many footnotes parse in linear time (see [DEPENDENCIES](../../docs/DEPENDENCIES.md)).

## License

MIT
