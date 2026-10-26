# @drafter/fountain

A lossless parser and printer for [Fountain](https://fountain.io), the plain-text screenplay format. It turns any string into a concrete syntax tree (CST) that keeps every character, so `print(parse(text)) === text` for every input, well-formed or not.

It's the one parser behind [Drafter](https://github.com/cschweda/drafter): the editor's highlighting, the pagination engine, and the linter all read the same tree.

```ts
import { parse, print } from '@drafter/fountain';

const doc = parse('INT. KITCHEN - NIGHT\n\nMARGARET\n(quietly)\nYou said you\'d call.\n');

doc.blocks.map((b) => b.kind);
// ['scene_heading', 'character', 'parenthetical', 'dialogue']

doc.blocks[0].sem; // { text: 'INT. KITCHEN - NIGHT', prefix: 'INT.', location: 'KITCHEN', time: 'NIGHT', number: null }
print(doc) === doc.source; // always true
```

## API

| Export | What it does |
|---|---|
| `parse(source)` | Parses any string into a `Doc`. Never throws. |
| `reparse(doc, changes)` | Applies `{ from, to, insert }` changes (old-document offsets, sorted, non-overlapping, the shape of a CodeMirror ChangeSet) and parses the result. Throws `RangeError` on invalid changes. |
| `print(doc)` | Writes the document back out, byte for byte. |
| `toJSON(doc)` | The CST as plain data, with every semantic field filled in. |
| `blockAt(doc, offset)` | The block containing an offset, and its index. |
| `characters(doc)` | Character names in order of appearance, with cue counts. |
| `locations(doc)` | Scene-heading locations in order of appearance, with counts. |

A `Doc` holds the title page, the blocks, any `trailing` text after the last block, the parsed `/* drafter … */` metadata block, diagnostics, and `regions`, its notes and boneyard with their spans. Each block keeps its `kind`, its `span` in the source, the `leading` blank lines before it, and its raw `lines`. `block.sem` (semantic data) and `line.inline` (styled text runs) are computed on first read and cached.

## How it reads Fountain

The rules follow the [Fountain spec](https://fountain.io/syntax), as recorded in the [technical design](../../docs/drafter-technical-design.md) §2. A few points worth knowing:

- **Lenient where strict would garble.** A scene heading or transition followed directly by text, with no blank line between, still reads as a heading; so does a parenthetical wrapped across lines. Each lenient reading adds an `info` diagnostic marked `portability`, so a linter can offer to rewrite the file into strict Fountain.
- **Notes end at a blank line, as the spec says.** An unclosed `[[` stays literal text and gets a warning. A boneyard (`/* … */`) may span anything; an unclosed one runs to the end of the file and is an error.
- **A lone uppercase line is action**, never a character cue: a cue needs speech under it.
- **Diagnostics** cover unclosed notes and boneyards, invalid metadata, and the lenient readings above.

## Performance

`reparse` runs a full parse; it's one linear pass. In the benchmark, parsing a 200 KB script (about 120 pages) takes about 1.5 ms, well under the design's 5 ms budget. `pnpm bench` at the repository root measures it on your machine.

## License

MIT
