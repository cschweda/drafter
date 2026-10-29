# @drafter/fdx

Final Draft (`.fdx`) files for [Drafter](https://github.com/cschweda/drafter). A `.fdx` file is XML, and this package reads and writes it with a small XML reader and writer of its own: no DOM, no dependency, so it runs in Node, in a browser, and in a worker.

```ts
import { readXml, writeXml } from '@drafter/fdx';

const root = readXml('<?xml version="1.0"?><Doc><Item a="1">Hi &amp; bye</Item></Doc>');
root.children; // [{ name: 'Item', attrs: { a: '1' }, children: ['Hi & bye'] }]
writeXml(root); // the declaration, then the tree, indented two spaces
```

The reader treats its input as untrusted (technical design §11). It accepts no DTD, no entities beyond the five built in and numeric character references to valid XML characters, no processing instruction but a leading XML declaration, and it refuses mismatched tags, duplicate attributes, unclosed elements, text after the root, nesting deeper than 64, and input over 5 MB. It reads in one pass, so its time is linear in the input.

## License

MIT
