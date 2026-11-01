import { type Doc, parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { buildStoryMap, type MapInput, type MapOptions, type StoryMap } from '../src';

// Original scripts written for these tests. Nothing here is from a produced script, another app,
// or a converter's test data.

export const screenplay = builtins['us-screenplay'] as Template;
export const stagePlay = builtins['stage-play-standard'] as Template;

/**
 * Fourteen scenes at a harbour, in three acts: a cold open before `# Act One: …`, six scenes in
 * each of the first two acts, and one in the third. NELL only ever speaks over the radio (V.O.); a
 * DOCKHAND has one cue with only a parenthetical, in one scene; JUNO is in one scene and IKE in two.
 */
export const HARBOUR = `Title: Slack Tide
Author: Wren Abernathy
Contact: wren@example.com

EXT. BREAKWATER - DAWN

Grey water, grey sky. MARA (30s), a harbour pilot in a borrowed coat, walks the wall with a lamp.

MARA
Somebody left the light off again.

NELL (V.O.)
Pilot boat, this is the tower. Do you read?

# Act One: The Lamp

INT. LIGHTHOUSE - LAMP ROOM - NIGHT

The lens turns. MARA climbs the last step and finds TEO asleep against the rail.

MARA
You were meant to keep it lit.

TEO
I kept it lit until it went out.

NELL (V.O.)
Tower to lighthouse. The ferry is twenty minutes off.

MARA
Tell them to wait.

INT. HARBOUR OFFICE - CONTINUOUS

ODETTE (60s) files a stack of tide tables. BRAM leans in the doorway.

ODETTE
Nobody waits for a ferry in this town.

BRAM
I would.

ODETTE
You would wait for anything.

EXT. FISH MARKET - DAY

Crates of ice. CALLA weighs a catch while PIM counts coins into a tin.

CALLA
That scale has lied to me since spring.

PIM
Then stop asking it questions.

DOCKHAND
(nods)

NELL (V.O.)
Market, the tower needs a crate of ice by noon.

CALLA
The tower can come and fetch it.

INT. LIGHTHOUSE - KEEPER'S KITCHEN - DAY

RUTH stirs a pot. TEO sits at the table, still in his boots.

RUTH
Your sister was up the stairs before the sun.

TEO
She always is.

RUTH
Eat something before she comes back down.

EXT. BREAKWATER - DUSK

MARA and BRAM sit on the wall, legs over the water.

BRAM
The lamp is older than both of us put together.

MARA
So is the harbour, and it still floats.

NELL (V.O.)
Tower to pilot. Weather turning by midnight.

INT. HARBOUR OFFICE - NIGHT #7A#

ODETTE locks a drawer. MARA watches the clock.

ODETTE
If the light fails tonight, the ferry turns back.

MARA
Then it won't fail.

# Act Two: The Storm

EXT. FERRY DECK - NIGHT

Rain sweeps the deck. IKE grips the wheel and CALLA holds a torch for him.

IKE
I can't see the wall.

CALLA
Keep her straight. The light will come.

INT. LIGHTHOUSE - LAMP ROOM - LATER

MARA works at the dead lamp with a spanner. TEO holds the box of fuses.

TEO
That one, the blue one.

MARA
They are all blue in this dark.

NELL (V.O.)
Pilot, the ferry has lost sight of you. Talk to me.

MARA
Tell them one more minute.

EXT. FISH MARKET - NIGHT

The market is empty. PIM drags a crate of ice under the awning while JUNO watches.

JUNO
Who buys ice in a storm?

PIM
The tower does.

INT. LIGHTHOUSE - KEEPER'S KITCHEN - NIGHT

RUTH lights a candle. ODETTE comes in shaking water off her hat.

ODETTE
The office roof is gone, and the tide tables with it.

RUTH
Sit by the stove. Mara will have it lit.

EXT. BREAKWATER - NIGHT

BRAM runs the wall with a second lamp, waving it at the dark.

BRAM
Over here! Over here!

NELL (V.O.)
Bram, get off the wall before the wave does it for you.

EXT. FERRY DECK - CONTINUOUS

IKE sees the swinging lamp and turns the wheel hard.

IKE
There. There it is.

# Act Three: High Water

INT. LIGHTHOUSE - LAMP ROOM - DAWN

The lens turns again. MARA and TEO sit with their backs to the glass.

TEO
You fixed it.

MARA
We fixed it.

NELL (V.O.)
Tower to lighthouse. Ferry is in. Everyone is in.
`;

/**
 * A two-act play of six `##` scenes in one front room, with no times of day. HESTER and FINCH
 * speak in most scenes; MRS. AUBERT and LEO come and go.
 */
export const BOATHOUSE = `Title: The Boathouse
Author: Sol Varga

# Act One

## Scene 1

The boathouse. HESTER mends a net by the window. FINCH sweeps.

HESTER
Leave the corners. The spiders pay no rent but they keep the flies down.

FINCH
I'll leave the spiders a note.

## Scene 2

MRS. AUBERT enters with a basket of letters.

MRS. AUBERT
These came for your father. All of them in one week.

HESTER
He has been dead three winters.

MRS. AUBERT
The post office is slow, not cruel.

## Scene 3

FINCH reads a letter aloud. HESTER listens.

FINCH
It says the boat is still owed a coat of paint.

HESTER
Then we owe it paint.

# Act Two

## Scene 4

LEO, young and wet from the river, stands in the door.

LEO
Is this where the Kessler boat is kept?

HESTER
It was. Who wants to know?

## Scene 5

FINCH and LEO turn the hull over together.

LEO
She is lighter than she looks.

FINCH
So is everyone in this family.

## Scene 6

All four at the water's edge. HESTER holds the last letter.

HESTER
We paint her blue, and we take her out once.

MRS. AUBERT
Once is enough for a boat that waited this long.

/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`;

/** Three scenes and no sections: a script with no acts. */
export const NO_ACTS = `INT. GARAGE - NIGHT

SILAS tunes a radio.

SILAS
Nothing but rain on every station.

EXT. ROOF - NIGHT

SILAS lifts the aerial.

SILAS
Try now.

INT. GARAGE - DAY

The radio hums.

SILAS
There you are.
`;

/** The options a test starts from: the dialog's defaults. */
export function options(overrides: Partial<MapOptions> = {}): MapOptions {
  return {
    status: null,
    plannedPages: null,
    logline: null,
    greeting: "What I'm writing",
    explain:
      'A picture of my script: its shape, its people, and every scene in order. Just scroll.',
    include: { summaries: true, lines: true, threads: true, contact: false },
    contact: null,
    hooks: {},
    rates: { minutesPerPage: 1, wordsPerMinute: 150 },
    draft: { number: 1, id: 'a3f9c2e7b1d4' },
    updated: null,
    title: 'Slack Tide',
    ...overrides,
  };
}

export interface Built {
  doc: Doc;
  template: Template;
  layout: Layout;
  input: MapInput;
  map: StoryMap;
}

/** The parse, its template (from the metadata block), its pages, and its story map. */
export function build(source: string, overrides: Partial<MapOptions> = {}): Built {
  const doc = parse(source);
  const template = doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay;
  const layout = paginate(doc, template);
  const input: MapInput = { doc, template, layout, options: options(overrides) };
  return { doc, template, layout, input, map: buildStoryMap(input) };
}

const SYLLABLES = ['ka', 'lo', 'mi', 'ren', 'to', 'sa', 'vi', 'dun', 'el', 'ro', 'fa', 'nis'];

/** A made-up name for the `n`th character: two syllables, then a third past the first 144. */
function nameOf(n: number): string {
  const a = SYLLABLES[n % 12] as string;
  const b = SYLLABLES[Math.floor(n / 12) % 12] as string;
  const c = n >= 144 ? (SYLLABLES[Math.floor(n / 144) % 12] as string) : '';
  return `${a}${b}${c}`.toUpperCase();
}

/**
 * A screenplay of about `pages` pages: `scenes` scenes in three acts at `scenes` numbered places
 * (inside and outside, day and night), with `characters` speaking characters taking turns, each
 * scene padded with lines of action to its share of the pages (about 55 lines a page).
 */
export function generated(pages: number, scenes: number, characters: number): string {
  const lines = Math.max(1, Math.round((pages * 55) / scenes) - 12);
  const acts = ['# Act One: Rising', '# Act Two: Turning', '# Act Three: Falling'];
  const out: string[] = ['Title: Long Shore', 'Author: Test Writer', ''];
  for (let s = 0; s < scenes; s++) {
    const act = Math.floor((s * 3) / scenes);
    if (Math.floor(((s - 1) * 3) / scenes) !== act || s === 0) out.push(acts[act] as string, '');
    const inside = s % 3 === 0 ? 'EXT.' : 'INT.';
    const time = s % 4 === 0 ? 'NIGHT' : s % 7 === 0 ? 'DUSK' : 'DAY';
    out.push(`${inside} PLACE NUMBER ${s + 1} - ${time}`, '');
    const a = nameOf(s % characters);
    const b = nameOf((s + 1) % characters);
    out.push(`${a} crosses the room to meet ${b} by the stove.`, '');
    for (let l = 0; l < lines; l++)
      out.push(`The kettle ticks as it cools, a little more, ${l + 1}.`);
    out.push('', a, 'We should have left an hour ago.', '', b, 'Then we leave now.', '');
  }
  return out.join('\n');
}
