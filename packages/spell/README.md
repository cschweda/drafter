# @drafter/spell

Spellcheck for [Drafter](https://github.com/cschweda/drafter): the dictionaries Drafter bundles, and the words of a script or a Markdown document worth checking. The dictionaries are US English and British English, each a Hunspell dictionary from SCOWL that the app serves as static files, with its licence beside it.

```ts
import { DICTIONARIES, SPELL_LANGUAGES } from '@drafter/spell';

SPELL_LANGUAGES; // ['en-US', 'en-GB']
DICTIONARIES['en-GB'];
// { language: 'en-GB', label: 'British English', package: 'dictionary-en-gb', version: '3.0.0',
//   licence: '(MIT AND BSD)', folder: '/dictionaries/en-GB/', licenceFile: '/licenses/dictionary-en-gb.txt' }
```

`folder` holds `index.aff` and `index.dic`. The checker itself uses [nspell](https://github.com/wooorm/nspell), a general-purpose Hunspell-compatible spellchecker. Every dependency is pinned exactly, and `test/licences.test.ts` fails if a version or a licence changes, or if a dictionary's licence mentions the GPL or LGPL. See the [Phase 2 design](../../docs/drafter-phase2-design.md), §12, and [DEPENDENCIES.md](../../docs/DEPENDENCIES.md).

## What's checked

```ts
import { parse } from '@drafter/fountain';
import { fountainUnits, harvestedWords, isKnown, knownSet, scriptDictionary, tokenize } from '@drafter/spell';

const doc = parse(source);
const known = knownSet(harvestedWords(doc), scriptDictionary(doc));
for (const unit of fountainUnits(doc, { notes: false })) {
  for (const token of tokenize(unit.text, unit.from)) {
    if (!isKnown(token.word, known)) {
      // check token.word; token.from and token.to are offsets in `source`
    }
  }
}
```

- `fountainUnits(doc, { notes })` gives one unit per checked block: action, dialogue, parentheticals, centered text, lyrics, sections, synopses, and a scene heading's time (`NIGHT`). Cues, transitions, page breaks, the title page, scene numbers, forcing marks, and the metadata block are never checked. A unit's `text` is its source from `from`, the same length, with the parts not checked as spaces, so offsets in it are offsets in the source. Notes and boneyard are blanked unless `notes` is true; then each is a unit of its own, without a keyed note's head (`[[TODO: …]]`). Equal blocks share a `key`.
- `markdownUnits(source)` gives one unit per paragraph or heading of a Markdown document, blanking front matter, fenced and indented code, inline code, HTML, autolinks, and link destinations. It's a small scanner, not a Markdown parser.
- `tokenize(text, offset)` gives the words to check, leaving out words with digits, web and e-mail addresses, all-capital words of three letters or fewer (`INT`, `TV`), and words with no Latin letter; a hyphenated word is its parts, and `’` reads as `'`.
- `harvestedWords(doc)` is every word of every character name and scene heading location, lowercased: never flagged. `isKnown(word, known)` matches in any case, and without a final `'s`, so the cue `MARGARET` knows `Margaret’s`.
- `scriptDictionary(doc)` reads the script's own words, `dictionary` in the metadata block; `addToScriptDictionary(doc, word)` gives the change that adds one, sorted and once, through `setMeta` from `@drafter/fountain`.

## Checking

```ts
import en from 'dictionary-en'; // in Node; the app's worker fetches the same two files
import { createChecker, createSpellSession } from '@drafter/spell';

const session = createSpellSession(createChecker(en));
session.check({ source, kind: 'fountain', notes: false, mine: ['Odalys'] });
// [{ from, to, word: 'recieve' }, …]: offsets in `source`, in order
session.suggest('recieve'); // ['receive', 'relieve']
```

- `createChecker({ aff, dic })` loads a Hunspell dictionary into nspell (text, a `Uint8Array`, or a Buffer). Make one per language and keep it. `correct(word)` is also true when the word without its accents is correct (`café` as `cafe`, since the dictionaries are built without them); `suggest(word, limit)` gives at most `SUGGESTION_LIMIT` (five), in nspell's order.
- `createSpellSession(checker)` parses a Fountain script itself (or scans a Markdown document) and gives every misspelling, in order. It caches each unit's words by its key and each word's verdict, so a second check tokenizes only the blocks that changed and asks the checker only about new words. The known words (the script's names and locations, its dictionary, and `mine`, My dictionary) are rebuilt on every check and filter the cached verdicts, so adding a word never checks anything again. A word of one or two letters is never marked (`e.g.`, `'n'`, `'em`). The caches keep at most 20,000 units and 200,000 words, dropping the least recently used. `work()` says how many units were tokenized and words checked since it was last called, for tests.

## License

MIT. The dictionaries are `(MIT AND BSD)`, under SCOWL's and Ispell's notices; see each package's `license` file.
