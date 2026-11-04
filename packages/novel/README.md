# @drafter/novel

Reads the structure of a [Drafter](https://github.com/cschweda/drafter) novel: a Markdown document whose metadata comment says `"template": "novel"`. It touches no file and no DOM.

```ts
import { novelStructure, nodeAt, findNode } from '@drafter/novel';

const tree = novelStructure(text);
tree.nodes[0]; // { id: 'chapter:one:0', kind: 'chapter', title: 'One', words, ownWords, span, children: [...] }
nodeAt(tree, offset); // the deepest part, chapter, or section holding that character
findNode(tree, 'chapter:one:0');
```

A `#` heading is a chapter, or a part when its text starts with "Part". A `##` heading is a section, and so is a scene break (`---`, `***`, `* * *`, `___`), which is untitled. Setext headings (`Title` over `=====` or `-----`) count the same. Headings inside fenced code and the trailing `<!-- drafter {...} -->` comment are not structure. One linear pass.
