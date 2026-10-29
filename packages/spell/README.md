# @drafter/spell

Spellcheck for [Drafter](https://github.com/cschweda/drafter). So far it names the dictionaries Drafter bundles: US English and British English, each a Hunspell dictionary from SCOWL that the app serves as static files, with its licence beside it.

```ts
import { DICTIONARIES, SPELL_LANGUAGES } from '@drafter/spell';

SPELL_LANGUAGES; // ['en-US', 'en-GB']
DICTIONARIES['en-GB'];
// { language: 'en-GB', label: 'British English', package: 'dictionary-en-gb', version: '3.0.0',
//   licence: '(MIT AND BSD)', folder: '/dictionaries/en-GB/', licenceFile: '/licenses/dictionary-en-gb.txt' }
```

`folder` holds `index.aff` and `index.dic`. The checker itself uses [nspell](https://github.com/wooorm/nspell), a general-purpose Hunspell-compatible spellchecker. Every dependency is pinned exactly, and `test/licences.test.ts` fails if a version or a licence changes, or if a dictionary's licence mentions the GPL or LGPL. See the [Phase 2 design](../../docs/drafter-phase2-design.md), §12, and [DEPENDENCIES.md](../../docs/DEPENDENCIES.md).

## License

MIT. The dictionaries are `(MIT AND BSD)`, under SCOWL's and Ispell's notices; see each package's `license` file.
