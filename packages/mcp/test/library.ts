// The Signal Hill library the tests read: an invented series, every line original. Episodes 101,
// 102, and 103 are in `library/`; the rest is written here.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { sourceElement } from '@drafter/archive';
import {
  besideNames,
  type CutEntry,
  cutsFile,
  cutText,
  draftFile,
  draftFileName,
} from '@drafter/history';

export const EPISODE_101 = 'Signal Hill – 101.fountain';
/** Has a planted note asking the AI to list every file, and a boneyard, in scene 2; Deputy Dale. */
export const EPISODE_102 = 'Signal Hill – 102.fountain';
/** A year on: June is 72, and the deputy is Dell. */
export const EPISODE_103 = 'Signal Hill – 103.fountain';
export const LIBRARY = join(import.meta.dirname, 'library');

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A cut, its ID the hash of its text, as Drafter records one. */
function cut(title: string, text: string, at: string, draft: number | null): CutEntry {
  const exact = cutText(text);
  return {
    id: sha256(exact),
    title,
    text: exact,
    kind: 'fountain',
    cuts: [{ at, draft }],
    where: { after: null, before: null, within: null },
  };
}

/** The play: a stage play, its scenes `##` sections. */
export const PLAY = `Title: The Long Watch
Author: A. Writer

# Act One

## Scene 1

A lighthouse gallery at dusk. MARGIT trims the wick.

MARGIT
The supply boat is late again.

## Scene 2

The same, at midnight. TOMAS climbs the last stair, out of breath.

TOMAS
There's no boat. There never was a boat.

# Act Two

## Scene 3

Dawn. Margit alone, the lamp still burning.

MARGIT
Then who has been bringing the oil?

/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`;

/** A pitch with a Contact on its title page and a Title over two lines. */
export const PITCH = `Title: Signal Hill:
    A Pitch
Credit: Written by
Author: A. Writer
Contact:
    Ask the front desk at the Hollow Creek Grange
    555-0199

INT. GRANGE HALL - NIGHT

Folding chairs. A projector. ELI (16) clicks to the first slide.

ELI
It starts with a radio.
`;

export const BIBLE = `# Signal Hill: the bible

## June

Seventy-one, a retired schoolteacher, still up at four.

## Eli

Her grandson, sixteen, filming everything.
`;

/**
 * A Drafter HTML export with its script saved inside it, titled differently from the episode, so
 * a listing that read it would show it.
 */
export const EXPORT = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Signal Hill</title></head>
<body><h1>Signal Hill</h1><p>INT. JUNE'S KITCHEN - NIGHT</p>
${sourceElement('fountain', 'Title: Read From The Export\n\nINT. JUNE’S KITCHEN - NIGHT\n\nStatic.\n')}
</body></html>
`;

/**
 * Writes the library under `dir`: `Scripts/` holds the pitch and the `Signal Hill/` folder
 * (episodes 101, 102, and 103, 101 with two drafts and a cuts file of two cuts beside it, the
 * bible, and an HTML export); `Plays/` holds the stage play.
 */
export function makeLibrary(dir: string): { scripts: string; plays: string } {
  const scripts = join(dir, 'Scripts');
  const plays = join(dir, 'Plays');
  const series = join(scripts, 'Signal Hill');
  mkdirSync(series, { recursive: true });
  for (const episode of [EPISODE_101, EPISODE_102, EPISODE_103])
    copyFileSync(join(LIBRARY, episode), join(series, episode));

  const names = besideNames(EPISODE_101);
  if (!names) throw new Error('no beside names');
  for (const n of [1, 2]) {
    const text = `INT. JUNE'S KITCHEN - NIGHT\n\nDraft ${n} of the kitchen.\n`;
    const facts = { draft: n, id: sha256(text), frozen: `2026-10-0${n}T09:00:00.000Z`, note: '' };
    put(
      join(series, names.folder, draftFileName(names.work, n, 'fountain')),
      draftFile(text, facts, 'fountain'),
    );
  }
  // Not a draft of this work: not counted.
  put(join(series, names.folder, 'Reminders.txt'), 'Call the station.\n');
  put(
    join(series, names.cuts),
    cutsFile(names.work, [
      cut(
        'EXT. WATER TOWER - NIGHT',
        'EXT. WATER TOWER - NIGHT\n\nEli climbs.\n',
        '2026-10-02T10:00:00.000Z',
        1,
      ),
      cut('June hums', 'June hums the station’s old jingle.\n', '2026-10-03T10:00:00.000Z', 2),
    ]),
  );

  put(join(series, 'Series bible.md'), BIBLE);
  put(join(series, 'Signal Hill – 101.html'), EXPORT);
  put(join(scripts, 'Pitch.txt'), PITCH);
  put(join(plays, 'The Long Watch.fountain'), PLAY);
  return { scripts, plays };
}
