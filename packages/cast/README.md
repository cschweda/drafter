# @drafter/cast

Who is in each scene of a [Drafter](https://github.com/cschweda/drafter) script, and where each scene is. From the scene index (`@drafter/outline`), the parse (`@drafter/fountain`), and an answer to whether a name is an ordinary word, it works out the cast, presence, locations, and every per-character and per-location figure that the Stats tab, Scaffold, and the character-by-scene grid show, so all three read one count. It touches no file and no DOM.

```ts
import { castOf, gridModel, placeOf } from '@drafter/cast';
import { linesPerPage, sceneIndex } from '@drafter/outline';

const index = sceneIndex(doc, template, layout);
// isWord(name): true when every word of the name is a dictionary word; undefined until known.
const cast = castOf(index, doc, template, linesPerPage(layout), isWord);

cast.characters; // [{ key: 'TOM', name: 'Tom', order }], most speeches first
cast.byScene[0]; // the first character's scenes: { scene, speaking, speeches, words, firstMention }
cast.figures.get('TOM'); // speaksIn, speeches, words, share, screenEighths, first, last,
// absences, longest, sharedWith (most first; the first three are "most often with"), locations
cast.places[3]; // { location: 'HOUSE - KITCHEN', key, inside: 'inside', time: 'NIGHT' }
cast.locations.get('HOUSE'); // scenes, eighths, inside and outside, times, people
cast.firstIn.get(3); // the keys of everyone first seen in scene 4
gridModel(cast, index); // rows, columns, cell(row, column), shade(speeches), gaps
```

**The cast** is every name with a cue, anywhere in the script, names that differ only in case being one character shown as first typed. A character is **in** a scene when they speak in it, or when their name is in its action (a play's stage directions) as a whole word or phrase: in capitals (`TOM`), with the first letter of each word capitalised (`Tom`), or as the cue spells it (`McCLANE`), a possessive counting (`TOM'S`, `Tom’s`). A name that is also an ordinary word (`WILL`, `THE DRIVER`) counts only in capitals, and so does every name until the dictionary answers. A name of several words counts only whole, the longest first, so `ANN LEE` is never also `ANN`. Dialogue, parentheticals, headings, transitions, notes, synopses, and the boneyard never count. Each action block is split into words once and each word looked up in a map of the names that start with it, so the work is linear in the script.

**Speeches and words** are the scene index's, counted once: the opening's, each section's own, and each scene's. **Dialogue share** is a character's words over everyone's. **Screen time** is the eighths of every scene they are in, and **long absences** are the gaps of `LONG_ABSENCE_PAGES` (20) or more between their scenes on the Structure strip's page axis; both are null until the pages are ready.

**A place** comes from a scene heading: inside (`INT.`), outside (`EXT.`, `EST.`), both (`INT./EXT.`, `EXT./INT.`, `I/E`), or none; the time of day when the last part after a spaced dash is one of `TIMES_OF_DAY`; and the location, the rest, keyed in capitals with its spaces and dashes folded, so `INT.` and `EXT.` of one place are one location. A stage play's scene names a place only when its heading is written as a screenplay's is. `insideOf` and `dayOrNight` are the Stats tab's split of the headings.

See the [seeing-the-script design](../../docs/drafter-seeing-the-script-design.md), §3.

## License

MIT
