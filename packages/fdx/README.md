# @drafter/fdx

Final Draft (`.fdx`) files for [Drafter](https://github.com/cschweda/drafter): export a parsed Fountain script as Final Draft XML, and import a Final Draft file as Fountain text. A `.fdx` file is XML, and this package reads and writes it with a small XML reader and writer of its own: no DOM, no dependency, so it runs in Node, in a browser, and in a worker.

## Export

```ts
import { parse } from '@drafter/fountain';
import { builtins } from '@drafter/templates';
import { toFdx } from '@drafter/fdx';

const xml = toFdx(parse(source), builtins['us-screenplay']);
```

`toFdx(doc, template)` never throws. Scene headings (with locked numbers and synopses), action, centered text, speeches, dual dialogue, transitions, page breaks, emphasis, the title page, sections, and notes are mapped. What Final Draft has no place for (a section's depth, a note on its own line, a lyric, a title-page key) is kept in `Drafter…` attributes that Final Draft ignores, so it survives a round trip. A boneyard and Drafter's metadata block are left out.

## Import

```ts
import { FdxError, fromFdx } from '@drafter/fdx';

try {
  const { text, title, mapped, ignored } = fromFdx(xml);
} catch (error) {
  if (error instanceof FdxError) console.log(error.message); // "This isn’t a Final Draft file: …"
}
```

`fromFdx(xml)` returns:

- `text`: the script as Fountain text, never a parsed document, so it is parsed and checked like any other script. Each block is read back by the Fountain parser and gets a forced marker (`!`, `@`, `.`, `>`) where its plain text would read as another element, and markup in the text is escaped. Text styled All Caps comes in in capitals; hidden text (`[[fdx: Hidden: …]]`), and the paragraphs of a scene a shooting script omits (`[[fdx: Omitted: …]]`), come in as notes, so they don't print. A heading, cue, parenthetical, dialogue, or transition whose text is all hidden keeps it as its text, so it keeps its kind (and a heading its number), with a `[[fdx: Hidden paragraph: …]]` note after it.
- `title`: the title page's Title as plain text, or `null`.
- `mapped`: what came in as `[[fdx: Type]]` notes, as `{ type, count }` (hidden text is `Hidden`, an omitted scene's blocks `Omitted`). A paragraph type or element Drafter has no element for is brought in as action with that note, so nothing is dropped silently.
- `ignored`: the formatting and settings elements of the file that were left out, each named once. `IGNORED` is the set of element names treated this way (page layout, element settings, header and footer, smart type, and the like).

`FdxError` is thrown when the input isn't XML the reader accepts (the reader's `XmlError` is its `cause`) or isn't a Final Draft document.

## XML

```ts
import { readXml, writeXml } from '@drafter/fdx';

const root = readXml('<?xml version="1.0"?><Doc><Item a="1">Hi &amp; bye</Item></Doc>');
root.children; // [{ name: 'Item', attrs: { a: '1' }, children: ['Hi & bye'] }]
writeXml(root); // the declaration, then the tree, indented two spaces
```

The reader treats its input as untrusted (technical design §11). It accepts no DTD, no entities beyond the five built in and numeric character references to valid XML characters, no processing instruction but a leading XML declaration, and it refuses mismatched tags, duplicate attributes, unclosed elements, text after the root, nesting deeper than 64, and input over 5 MB, with an `XmlError` that gives the offset. It reads in one pass, so its time is linear in the input.

## License

MIT
