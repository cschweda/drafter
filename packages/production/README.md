# @drafter/production

Production for [Drafter](https://github.com/cschweda/drafter): a script locked for production keeps its page numbers and scene numbers, and each round of changes after that is a colored revision set. Everything it needs lives in the script's own file, in the `production` key of the `/* drafter */` block, so the file alone reproduces the pages and the marks on any computer. It touches no file and no DOM, so it runs in Node, in a browser, and in a worker.

```ts
import { nextSetName, productionMeta, readProduction } from '@drafter/production';

const production = readProduction(doc.meta); // null when absent or malformed, never throws
nextSetName(production.sets); // 'Pink' after Blue: the industry order, counted by position
const meta = productionMeta(doc.meta, production); // give this to setMeta; null removes the key
```

`readProduction` is defensive: wrong types, arrays past their caps (`CAPS`), and a missing baseline all give `null`, so a hostile or truncated block leaves the script open and unlocked. In the block, a locked page is a tuple `[label, line, printed]`; in TypeScript it is a `LockedPage`.

The revision names run White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, then Double White and so on (`REVISION_NAMES`). Each has a screen swatch (`REVISION_COLORS`) chosen to keep 3:1 contrast against both themes' pages; the mark itself is always drawn in the text color.

## License

MIT
